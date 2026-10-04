// api/gasolineras.js

// Los datos de Redis se consideran válidos durante 3 horas. El workflow de GitHub
// los actualiza cada hora; así, un retraso de Actions no obliga a descargar el
// fichero completo del Ministerio dentro de una petición de usuario.
const CACHE_DURATION = 3 * 60 * 60 * 1000; // 3 horas

// Cada instancia de Vercel vuelve a leer Redis como máximo cada 15 minutos.
const LOCAL_MAX_AGE = 15 * 60 * 1000;

// Si una actualización falla, se siguen sirviendo los datos anteriores.
const REDIS_TTL = 24 * 60 * 60; // 24 horas

const LOCK_TTL = 60; // 60 segundos

// v4: estructura con IDEESS y filtro de venta pública
const REDIS_PREFIX = "ahorrafuel:estaciones:v4:";
const REDIS_LOCK_KEY = "ahorrafuel:estaciones:lock";

// Estaciones excluidas manualmente de AhorraFuel.
// Se identifican por IDEESS para no depender del nombre.
const ESTACIONES_EXCLUIDAS = new Set([
  "9701" // MOEVE-ARROCEROS B.G.
]);

// Caché local de la instancia de Vercel
const localCache = new Map();
const localCargadaEn = new Map();

function guardarLocal(provincia, datos) {
  localCache.set(provincia, datos);
  localCargadaEn.set(provincia, Date.now());
}

function localEsFresca(provincia, datos) {
  return (
    cacheEsValida(datos) &&
    Date.now() - (localCargadaEn.get(provincia) || 0) < LOCAL_MAX_AGE
  );
}

function getRedisBaseUrl() {
  const raw = String(process.env.UPSTASH_REDIS_REST_URL || "").trim();

  if (!raw) {
    throw new Error("Falta UPSTASH_REDIS_REST_URL");
  }

  // Normaliza la URL de Upstash y evita errores de URL mal formada.
  const normalized = raw.replace(/\/+$/, "").replace(/\/pipeline$/, "");

  try {
    const parsed = new URL(normalized);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("El protocolo debe ser http o https");
    }

    return parsed.toString().replace(/\/+$/, "");
  } catch (error) {
    throw new Error(`UPSTASH_REDIS_REST_URL no es válida: ${JSON.stringify(raw)}`);
  }
}

async function redisCommand(command) {
  const url = getRedisBaseUrl();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!token) {
    throw new Error("Falta UPSTASH_REDIS_REST_TOKEN");
  }

  let redisUrl;

  try {
    redisUrl = new URL(url).toString();
  } catch {
    throw new Error(`URL de Upstash no válida: ${JSON.stringify(url)}`);
  }

  const response = await fetch(redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Error de Upstash (HTTP ${response.status}): ${text}`);
  }

  let result;

  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inválida de Upstash: ${text}`);
  }

  if (result.error) {
    throw new Error(result.error);
  }

  return result.result;
}

async function redisPipeline(commands) {
  if (!Array.isArray(commands) || commands.length === 0) {
    return [];
  }

  const baseUrl = getRedisBaseUrl();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!token) {
    throw new Error("Falta UPSTASH_REDIS_REST_TOKEN");
  }

  let pipelineUrl;

  try {
    pipelineUrl = new URL(`${baseUrl}/pipeline`).toString();
  } catch {
    throw new Error(`URL de Pipeline de Upstash no válida: ${JSON.stringify(baseUrl)}`);
  }

  const response = await fetch(pipelineUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commands)
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Error de Upstash Pipeline (HTTP ${response.status}): ${text}`);
  }

  let results;

  try {
    results = JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inválida del Pipeline: ${text}`);
  }

  if (!Array.isArray(results)) {
    throw new Error("Respuesta inesperada del Pipeline de Upstash");
  }

  const error = results.find(item => item && item.error);

  if (error) {
    throw new Error(`Error en Pipeline de Upstash: ${error.error}`);
  }

  return results.map(item => item.result);
}

function crearLotesPipeline(commands) {
  const MAX_BYTES = 6 * 1024 * 1024;
  const lotes = [];
  let loteActual = [];
  let tamanoActual = 2;

  for (const command of commands) {
    const commandSize = Buffer.byteLength(JSON.stringify(command), "utf8") + 1;

    if (commandSize > MAX_BYTES) {
      throw new Error("Una provincia contiene demasiados datos para almacenarla en Redis.");
    }

    if (loteActual.length > 0 && tamanoActual + commandSize > MAX_BYTES) {
      lotes.push(loteActual);
      loteActual = [];
      tamanoActual = 2;
    }

    loteActual.push(command);
    tamanoActual += commandSize;
  }

  if (loteActual.length > 0) {
    lotes.push(loteActual);
  }

  return lotes;
}

async function descargarDatosOficiales() {
  console.log("Actualizando datos oficiales del Ministerio...");

  const response = await fetch(
    "https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/EstacionesTerrestres/",
    {
      headers: { "User-Agent": "AhorraFuel/1.0" },
      signal: AbortSignal.timeout(20000)
    }
  );

  if (!response.ok) {
    throw new Error(`La API oficial no responde (HTTP ${response.status})`);
  }

  const data = await response.json();

  if (!data || !Array.isArray(data.ListaEESSPrecio)) {
    throw new Error("La API oficial devolvió un formato inesperado.");
  }

  return data;
}

/**
 * Convierte los datos del Ministerio en datos agrupados por provincia.
 *
 * Solo se incluyen estaciones con Tipo Venta = P.
 *
 * El IDEESS se guarda internamente para identificar la estación,
 * pero NO se envía al usuario en la respuesta pública.
 *
 * No se elimina ninguna estación por antigüedad en esta versión.
 */
function agruparPorProvincia(data) {
  const provincias = new Map();
  const estaciones = data.ListaEESSPrecio || [];

  let descartadasNoPublicas = 0;
  let estacionesSinIDEESS = 0;
  let duplicadas = 0;

  // Evita duplicados del mismo IDEESS dentro de la respuesta oficial.
  const idsVistos = new Set();

  for (const estacion of estaciones) {
    const tipoVenta = String(estacion["Tipo Venta"] || "").trim().toUpperCase();

    // Solo venta al público en general.
    if (tipoVenta !== "P") {
      descartadasNoPublicas++;
      continue;
    }

    const ideess = String(estacion["IDEESS"] || "").trim();

    // Exclusión manual: no almacenar ni servir esta estación.
    if (ESTACIONES_EXCLUIDAS.has(ideess)) {
      console.log(`Estación excluida manualmente: IDEESS ${ideess}`);
      continue;
    }

    // Conservamos las estaciones públicas aunque no tengan IDEESS.
    let idInterno = ideess;

    if (!idInterno) {
      const partesId = [
        estacion["Rótulo"],
        estacion["Dirección"],
        estacion["Localidad"],
        estacion["C.P."],
        estacion["Latitud"],
        estacion["Longitud (WGS84)"]
      ].map(v => String(v || "").trim().toUpperCase());

      idInterno = `SIN_IDEESS_${partesId.join("|")}`;
      estacionesSinIDEESS++;
    }

    if (idsVistos.has(idInterno)) {
      duplicadas++;
      continue;
    }

    idsVistos.add(idInterno);

    const provinciaRaw = String(estacion["IDProvincia"] || "").trim();

    if (!/^\d{1,2}$/.test(provinciaRaw)) {
      console.warn("Estación pública sin provincia válida:", {
        ideess,
        rotulo: estacion["Rótulo"] || "",
        provincia: estacion["IDProvincia"] || ""
      });
      continue;
    }

    const provincia = provinciaRaw.padStart(2, "0");

    if (!provincias.has(provincia)) {
      provincias.set(provincia, []);
    }

    const precio95 = parseFloat(String(estacion["Precio Gasolina 95 E5"] || "").replace(",", "."));
    const precio98 = parseFloat(String(estacion["Precio Gasolina 98 E5"] || "").replace(",", "."));
    const diesel = parseFloat(String(estacion["Precio Gasoleo A"] || "").replace(",", "."));

    provincias.get(provincia).push({
      // Identificador interno. No se expone al frontend.
      id: idInterno,
      nombre: estacion["Rótulo"] || "Gasolinera",
      direccion: estacion["Dirección"] || "",
      localidad: estacion["Localidad"] || "",
      municipio: estacion["Municipio"] || "",
      codigoPostal: estacion["C.P."] || "",
      provincia: estacion["Provincia"] || "",
      precio95: Number.isFinite(precio95) ? precio95 : null,
      precio98: Number.isFinite(precio98) ? precio98 : null,
      diesel: Number.isFinite(diesel) ? diesel : null,
      latitud: estacion["Latitud"] || "",
      longitud: estacion["Longitud (WGS84)"] || "",
      horario: estacion["Horario"] || "",
      // Se conserva para futuras comprobaciones.
      tipoVenta: tipoVenta,
      remision: estacion["Remisión"] || ""
    });
  }

  console.log(`Estaciones oficiales recibidas: ${estaciones.length}`);
  console.log(`Descartadas por venta no pública: ${descartadasNoPublicas}`);
  console.log(`Estaciones públicas sin IDEESS (conservadas): ${estacionesSinIDEESS}`);
  console.log(`Duplicadas por IDEESS: ${duplicadas}`);

  return provincias;
}

async function guardarProvinciasEnRedis(data) {
  const provincias = agruparPorProvincia(data);
  const ahora = Date.now();
  const commands = [];

  for (const [provincia, estaciones] of provincias.entries()) {
    const valor = {
      cacheTime: ahora,
      fecha: data.Fecha || "",
      provincia,
      estaciones
    };

    commands.push([
      "SET",
      `${REDIS_PREFIX}${provincia}`,
      JSON.stringify(valor),
      "EX",
      REDIS_TTL
    ]);
  }

  console.log(`Preparando ${commands.length} provincias para Redis...`);

  const lotes = crearLotesPipeline(commands);

  console.log(`Se utilizarán ${lotes.length} lotes de Pipeline.`);

  for (let i = 0; i < lotes.length; i++) {
    console.log(`Guardando lote ${i + 1}/${lotes.length}...`);
    await redisPipeline(lotes[i]);
  }

  for (const [provincia, estaciones] of provincias.entries()) {
    guardarLocal(provincia, {
      cacheTime: ahora,
      fecha: data.Fecha || "",
      provincia,
      estaciones
    });
  }

  console.log(`Redis actualizado correctamente. ${provincias.size} provincias guardadas.`);

  return provincias;
}

async function obtenerProvinciaRedis(provincia) {
  const result = await redisCommand(["GET", `${REDIS_PREFIX}${provincia}`]);

  if (!result) {
    return null;
  }

  try {
    return JSON.parse(result);
  } catch {
    console.warn(`Datos inválidos en Redis para provincia ${provincia}`);
    return null;
  }
}

function cacheEsValida(cache) {
  if (!cache) {
    return false;
  }

  return Date.now() - cache.cacheTime < CACHE_DURATION;
}

async function adquirirLock() {
  try {
    const result = await redisCommand([
      "SET",
      REDIS_LOCK_KEY,
      String(Date.now()),
      "NX",
      "EX",
      LOCK_TTL
    ]);

    return result === "OK";
  } catch (error) {
    console.warn("No se pudo adquirir el lock de Redis:", error.message);
    return false;
  }
}

async function liberarLock() {
  try {
    await redisCommand(["DEL", REDIS_LOCK_KEY]);
  } catch (error) {
    console.warn("No se pudo liberar el lock:", error.message);
  }
}

async function actualizarCache() {
  const tieneLock = await adquirirLock();

  if (!tieneLock) {
    console.log("Otra petición ya está actualizando Redis.");
    return false;
  }

  try {
    const data = await descargarDatosOficiales();
    await guardarProvinciasEnRedis(data);
    return true;
  } finally {
    await liberarLock();
  }
}

async function obtenerEstacionesProvincia(provincia) {
  const local = localCache.get(provincia);

  if (local && localEsFresca(provincia, local)) {
    console.log(`Provincia ${provincia} servida desde caché local.`);
    return local;
  }

  try {
    const redisData = await obtenerProvinciaRedis(provincia);

    if (redisData && cacheEsValida(redisData)) {
      guardarLocal(provincia, redisData);
      console.log(`Provincia ${provincia} servida desde Redis.`);
      return redisData;
    }
  } catch (error) {
    console.warn("No se pudo leer Redis:", error.message);
  }

  try {
    await actualizarCache();
  } catch (error) {
    console.error("No se pudo actualizar Redis:", error.message);

    if (local) {
      console.warn("Usando caché local antigua como respaldo.");
      return local;
    }

    try {
      const redisAntiguo = await obtenerProvinciaRedis(provincia);

      if (redisAntiguo) {
        console.warn("Usando datos antiguos de Redis como respaldo.");
        guardarLocal(provincia, redisAntiguo);
        return redisAntiguo;
      }
    } catch (redisError) {
      console.warn("Tampoco se pudo recuperar Redis:", redisError.message);
    }

    throw error;
  }

  try {
    const actualizada = await obtenerProvinciaRedis(provincia);

    if (actualizada) {
      guardarLocal(provincia, actualizada);
      return actualizada;
    }
  } catch (error) {
    console.warn("No se pudo leer la provincia después de actualizar:", error.message);
  }

  if (local) {
    return local;
  }

  throw new Error("No se han podido obtener los datos de la provincia.");
}

/**
 * Convierte los datos internos al formato que utiliza la web.
 *
 * IMPORTANTE: el IDEESS NO se devuelve al navegador.
 */
function prepararRespuesta(data, producto) {
  let campoPrecio;

  if (producto === "95") {
    campoPrecio = "precio95";
  } else if (producto === "98") {
    campoPrecio = "precio98";
  } else if (producto === "diesel") {
    campoPrecio = "diesel";
  } else {
    throw new Error("Producto no válido");
  }

  const estaciones = (data.estaciones || [])
    .filter(estacion => !ESTACIONES_EXCLUIDAS.has(String(estacion.id || "").trim()))
    .map(estacion => {
      const precio = estacion[campoPrecio];

      if (typeof precio !== "number" || !Number.isFinite(precio)) {
        return null;
      }

      return {
        nombre: estacion.nombre || "Gasolinera",
        direccion: estacion.direccion || "",
        localidad: estacion.localidad || "",
        municipio: estacion.municipio || "",
        codigoPostal: estacion.codigoPostal || "",
        provincia: estacion.provincia || "",
        precio,
        latitud: estacion.latitud || "",
        longitud: estacion.longitud || "",
        horario: estacion.horario || ""
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.precio - b.precio);

  return {
    fecha: data.fecha || "",
    provincia: data.provincia || "",
    producto: producto,
    total: estaciones.length,
    estaciones
  };
}

export default async function handler(req, res) {
  try {
    const provincia = String(req.query.provincia || "35").trim().padStart(2, "0");
    const producto = String(req.query.producto || "95").trim().toLowerCase();

    if (!/^\d{2}$/.test(provincia)) {
      return res.status(400).json({ error: "Provincia no válida" });
    }

    if (!["95", "98", "diesel"].includes(producto)) {
      return res.status(400).json({ error: "Producto no válido" });
    }

    console.log(`Buscando provincia ${provincia} - producto ${producto}`);

    const data = await obtenerEstacionesProvincia(provincia);
    const respuesta = prepararRespuesta(data, producto);

    // Vercel guarda la respuesta 5 minutos y la sirve ya hecha, sin ejecutar la función.
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");

    return res.status(200).json(respuesta);
  } catch (error) {
    console.error("ERROR API GASOLINERAS:", error);

    res.setHeader("Cache-Control", "no-store");

    return res.status(500).json({
      error: error.message || "No se ha podido realizar la búsqueda."
    });
  }
}
