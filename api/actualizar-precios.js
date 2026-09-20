// api/actualizar-precios.js

const REDIS_PREFIX = "ahorrafuel:estaciones:v3:";

// Estaciones excluidas manualmente por no ser válidas para AhorraFuel.
// Se utiliza IDEESS para no depender del nombre o la dirección.
const ESTACIONES_EXCLUIDAS = new Set([
  "9701" // MOEVE-ARROCEROS B.G.
]);
const REDIS_TTL = 2 * 60 * 60; // 2 horas

function getRedisBaseUrl() {
  const raw = process.env.UPSTASH_REDIS_REST_URL;

  if (!raw) {
    throw new Error("Falta UPSTASH_REDIS_REST_URL");
  }

  return raw
    .replace(/\/+$/, "")
    .replace(/\/pipeline$/, "");
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

  const response = await fetch(`${baseUrl}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commands)
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Error de Upstash Pipeline (HTTP ${response.status}): ${text}`
    );
  }

  let results;

  try {
    results = JSON.parse(text);
  } catch {
    throw new Error(
      `Respuesta inválida de Upstash: ${text}`
    );
  }

  if (!Array.isArray(results)) {
    throw new Error("Respuesta inesperada de Upstash");
  }

  const error = results.find(
    item => item && item.error
  );

  if (error) {
    throw new Error(
      `Error en Pipeline de Upstash: ${error.error}`
    );
  }

  return results;
}

function crearLotes(commands) {
  const MAX_BYTES = 6 * 1024 * 1024;

  const lotes = [];
  let actual = [];
  let tamano = 2;

  for (const command of commands) {
    const commandSize =
      Buffer.byteLength(
        JSON.stringify(command),
        "utf8"
      ) + 1;

    if (
      actual.length > 0 &&
      tamano + commandSize > MAX_BYTES
    ) {
      lotes.push(actual);
      actual = [];
      tamano = 2;
    }

    actual.push(command);
    tamano += commandSize;
  }

  if (actual.length > 0) {
    lotes.push(actual);
  }

  return lotes;
}

/**
 * Agrupa únicamente las estaciones de venta al público.
 *
 * NO elimina estaciones por antigüedad.
 * Guardamos IDEESS y Remisión para poder analizarlas
 * posteriormente.
 */
function agruparPorProvincia(data) {
  const provincias = new Map();

  const estaciones =
    data.ListaEESSPrecio || [];

  let descartadasNoPublicas = 0;
  let descartadasSinIDEESS = 0;
  let duplicadas = 0;

  const idsVistos = new Set();

  for (const estacion of estaciones) {
    // -----------------------------------------
    // 1. SOLO VENTA AL PÚBLICO GENERAL
    // -----------------------------------------
    const tipoVenta = String(
      estacion["Tipo Venta"] || ""
    )
      .trim()
      .toUpperCase();

    if (tipoVenta !== "P") {
      descartadasNoPublicas++;
      continue;
    }

    // -----------------------------------------
    // 2. IDEESS
    // -----------------------------------------
    const ideess = String(
      estacion["IDEESS"] || ""
    ).trim();

    if (ESTACIONES_EXCLUIDAS.has(ideess)) {
      console.log(`Estación excluida manualmente: IDEESS ${ideess}`);
      continue;
    }

    if (!ideess) {
      descartadasSinIDEESS++;
      continue;
    }

    // -----------------------------------------
    // 3. EVITAR DUPLICADOS
    // -----------------------------------------
    if (idsVistos.has(ideess)) {
      duplicadas++;
      continue;
    }

    idsVistos.add(ideess);

    // -----------------------------------------
    // 4. PROVINCIA
    // -----------------------------------------
    const provincia = String(
      estacion["IDProvincia"] || ""
    )
      .trim()
      .padStart(2, "0");

    if (!provincia) {
      continue;
    }

    if (!provincias.has(provincia)) {
      provincias.set(provincia, []);
    }

    // -----------------------------------------
    // 5. PRECIOS
    // -----------------------------------------
    const precio95 = parseFloat(
      String(
        estacion["Precio Gasolina 95 E5"] || ""
      ).replace(",", ".")
    );

    const precio98 = parseFloat(
      String(
        estacion["Precio Gasolina 98 E5"] || ""
      ).replace(",", ".")
    );

    const diesel = parseFloat(
      String(
        estacion["Precio Gasoleo A"] || ""
      ).replace(",", ".")
    );

    // -----------------------------------------
    // 6. DATOS INTERNOS
    // -----------------------------------------
    provincias.get(provincia).push({
      // IDEESS: solo uso interno, no se muestra
      // al usuario en gasolineras.js.
      id: ideess,

      nombre:
        estacion["Rótulo"] ||
        "Gasolinera",

      direccion:
        estacion["Dirección"] ||
        "",

      localidad:
        estacion["Localidad"] ||
        "",

      municipio:
        estacion["Municipio"] ||
        "",

      codigoPostal:
        estacion["C.P."] ||
        "",

      provincia:
        estacion["Provincia"] ||
        "",

      precio95:
        Number.isFinite(precio95)
          ? precio95
          : null,

      precio98:
        Number.isFinite(precio98)
          ? precio98
          : null,

      diesel:
        Number.isFinite(diesel)
          ? diesel
          : null,

      latitud:
        estacion["Latitud"] ||
        "",

      longitud:
        estacion["Longitud (WGS84)"] ||
        "",

      horario:
        estacion["Horario"] ||
        "",

      // Se conserva para futuras comprobaciones.
      tipoVenta,

      remision:
        estacion["Remisión"] ||
        ""
    });
  }

  console.log(
    `Estaciones oficiales recibidas: ${estaciones.length}`
  );

  console.log(
    `Descartadas por venta no pública: ${descartadasNoPublicas}`
  );

  console.log(
    `Descartadas por falta de IDEESS: ${descartadasSinIDEESS}`
  );

  console.log(
    `Duplicadas por IDEESS: ${duplicadas}`
  );

  return provincias;
}

async function actualizarRedis(data) {
  const provincias =
    agruparPorProvincia(data);

  const cacheTime = Date.now();

  const commands = [];

  for (const [
    provincia,
    estaciones
  ] of provincias.entries()) {

    const valor = {
      cacheTime,
      fecha:
        data.Fecha || "",
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

  const lotes =
    crearLotes(commands);

  console.log(
    `Actualizando ${provincias.size} provincias...`
  );

  console.log(
    `Se utilizarán ${lotes.length} lotes.`
  );

  for (
    let i = 0;
    i < lotes.length;
    i++
  ) {
    console.log(
      `Guardando lote ${i + 1}/${lotes.length}...`
    );

    await redisPipeline(
      lotes[i]
    );
  }

  let totalEstaciones = 0;

  for (const estaciones of provincias.values()) {
    totalEstaciones += estaciones.length;
  }

  console.log(
    `Redis actualizado correctamente.`
  );

  console.log(
    `Estaciones públicas válidas: ${totalEstaciones}`
  );

  return {
    provincias:
      provincias.size,

    estaciones:
      totalEstaciones,

    fecha:
      data.Fecha || ""
  };
}

export default async function handler(req, res) {
  try {
    // Solo permitimos POST
    if (req.method !== "POST") {
      return res.status(405).json({
        error: "Método no permitido"
      });
    }

    // Comprobamos el token secreto
    const token =
      process.env.ACTUALIZAR_PRECIOS_TOKEN;

    if (!token) {
      console.error(
        "Falta ACTUALIZAR_PRECIOS_TOKEN en Vercel"
      );

      return res.status(500).json({
        error:
          "Falta configurar el token de actualización"
      });
    }

    const authorization =
      req.headers.authorization || "";

    const esperado =
      `Bearer ${token}`;

    if (authorization !== esperado) {
      return res.status(401).json({
        error: "No autorizado"
      });
    }

    console.log(
      "Iniciando actualización automática..."
    );

    // -----------------------------------------
    // DESCARGAR DATOS OFICIALES
    // -----------------------------------------
    const response = await fetch(
      "https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/EstacionesTerrestres/",
      {
        headers: {
          "User-Agent":
            "AhorraFuel/1.0"
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        `La API oficial no responde (HTTP ${response.status})`
      );
    }

    const data =
      await response.json();

    if (
      !data ||
      !Array.isArray(
        data.ListaEESSPrecio
      )
    ) {
      throw new Error(
        "La API oficial devolvió un formato inesperado."
      );
    }

    console.log(
      `Recibidas ${data.ListaEESSPrecio.length} estaciones.`
    );

    // -----------------------------------------
    // ACTUALIZAR REDIS
    // -----------------------------------------
    const resultado =
      await actualizarRedis(data);

    return res.status(200).json({
      ok: true,

      mensaje:
        "Precios actualizados correctamente",

      fecha:
        resultado.fecha,

      provincias:
        resultado.provincias,

      estaciones:
        resultado.estaciones
    });

  } catch (error) {
    console.error(
      "ERROR ACTUALIZANDO PRECIOS:",
      error
    );

    return res.status(500).json({
      ok: false,

      error:
        error.message ||
        "No se pudieron actualizar los precios."
    });
  }
}
