let cache = null;
let cacheTime = 0;

const CACHE_DURATION = 60 * 60 * 1000; // 1 hora

const REDIS_PREFIX = "ahorrafuel:estaciones:";
const REDIS_LOCK_KEY = "ahorrafuel:estaciones:lock";

const REDIS_CACHE_TTL = 2 * 60 * 60; // 2 horas
const REDIS_LOCK_TTL = 60; // 60 segundos

const MINISTERIO_API =
  "https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/EstacionesTerrestres/";


/**
 * Ejecuta un comando Redis mediante la API REST de Upstash.
 */
async function redisCommand(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("Faltan las variables de entorno de Upstash");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    throw new Error(
      `Error de Upstash (HTTP ${response.status})`
    );
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error);
  }

  return result.result;
}


/**
 * Ejecuta varios comandos Redis mediante pipeline.
 */
async function redisPipeline(commands) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("Faltan las variables de entorno de Upstash");
  }

  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commands)
  });

  if (!response.ok) {
    throw new Error(
      `Error de Upstash Pipeline (HTTP ${response.status})`
    );
  }

  const result = await response.json();

  if (!Array.isArray(result)) {
    throw new Error("Respuesta inesperada de Upstash Pipeline");
  }

  return result;
}


/**
 * Convierte una estación del Ministerio
 * al formato que utiliza AhorraFuel.
 */
function prepararEstacion(estacion, campoPrecio) {
  const precioTexto = estacion[campoPrecio];

  const precio = parseFloat(
    String(precioTexto || "").replace(",", ".")
  );

  if (isNaN(precio)) {
    return null;
  }

  return {
    nombre: estacion["Rótulo"] || "Gasolinera",

    direccion: estacion["Dirección"] || "",

    localidad: estacion["Localidad"] || "",

    municipio: estacion["Municipio"] || "",

    codigoPostal: estacion["C.P."] || "",

    provincia: estacion["Provincia"] || "",

    precio: precio,

    latitud: estacion["Latitud"] || "",

    longitud: estacion["Longitud (WGS84)"] || "",

    horario: estacion["Horario"] || ""
  };
}


/**
 * Descarga los datos oficiales y los divide por provincias.
 */
function prepararProvincias(data) {
  const estaciones = data.ListaEESSPrecio || [];

  const provincias = {};

  // Productos que utiliza AhorraFuel
  const camposPrecio = {
    "95": "Precio Gasolina 95 E5",
    "98": "Precio Gasolina 98 E5",
    "diesel": "Precio Gasoleo A"
  };

  for (const estacion of estaciones) {
    const provincia = String(
      estacion["IDProvincia"] || ""
    ).trim().padStart(2, "0");

    if (!provincia) {
      continue;
    }

    if (!provincias[provincia]) {
      provincias[provincia] = [];
    }

    const estacionPreparada = {
      nombre: estacion["Rótulo"] || "Gasolinera",

      direccion: estacion["Dirección"] || "",

      localidad: estacion["Localidad"] || "",

      municipio: estacion["Municipio"] || "",

      codigoPostal: estacion["C.P."] || "",

      provincia: estacion["Provincia"] || "",

      latitud: estacion["Latitud"] || "",

      longitud: estacion["Longitud (WGS84)"] || "",

      horario: estacion["Horario"] || "",

      precios: {
        "95": parseFloat(
          String(
            estacion["Precio Gasolina 95 E5"] || ""
          ).replace(",", ".")
        ) || null,

        "98": parseFloat(
          String(
            estacion["Precio Gasolina 98 E5"] || ""
          ).replace(",", ".")
        ) || null,

        "diesel": parseFloat(
          String(
            estacion["Precio Gasoleo A"] || ""
          ).replace(",", ".")
        ) || null
      }
    };

    provincias[provincia].push(estacionPreparada);
  }

  return {
    fecha: data.Fecha || "",
    provincias
  };
}


/**
 * Guarda todas las provincias en Redis.
 *
 * Las dividimos en varios pipelines para evitar
 * superar el límite de tamaño de una petición.
 */
async function guardarProvinciasRedis(datos) {
  const provincias = Object.entries(datos.provincias);

  const ahora = Date.now();

  // Procesamos de 5 provincias por petición.
  const TAMANO_LOTE = 5;

  for (
    let i = 0;
    i < provincias.length;
    i += TAMANO_LOTE
  ) {
    const lote = provincias.slice(
      i,
      i + TAMANO_LOTE
    );

    const comandos = lote.map(
      ([provincia, estaciones]) => {
        const valor = JSON.stringify({
          cacheTime: ahora,
          fecha: datos.fecha,
          estaciones: estaciones
        });

        return [
          "SET",
          `${REDIS_PREFIX}${provincia}`,
          valor,
          "EX",
          REDIS_CACHE_TTL
        ];
      }
    );

    const resultados = await redisPipeline(
      comandos
    );

    for (const resultado of resultados) {
      if (resultado && resultado.error) {
        throw new Error(
          resultado.error
        );
      }
    }
  }

  console.log(
    `Datos guardados en Redis: ${provincias.length} provincias.`
  );
}


/**
 * Obtiene los datos de una provincia.
 */
async function obtenerDatosProvincia(provincia) {

  const clave = `${REDIS_PREFIX}${provincia}`;

  const ahora = Date.now();

  // -------------------------------------------------------
  // 1. Intentar Redis
  // -------------------------------------------------------

  let cacheRedis = null;

  try {
    const valor = await redisCommand([
      "GET",
      clave
    ]);

    if (valor) {
      cacheRedis = JSON.parse(valor);
    }

  } catch (error) {

    console.warn(
      "No se pudo leer Redis:",
      error.message
    );
  }


  // -------------------------------------------------------
  // 2. Si la provincia está actualizada,
  //    devolverla directamente.
  // -------------------------------------------------------

  if (
    cacheRedis &&
    cacheRedis.estaciones &&
    cacheRedis.cacheTime &&
    ahora - cacheRedis.cacheTime < CACHE_DURATION
  ) {

    return cacheRedis;
  }


  // -------------------------------------------------------
  // 3. Intentar conseguir bloqueo
  // -------------------------------------------------------

  let bloqueoConseguido = false;

  try {

    const resultadoLock = await redisCommand([
      "SET",
      REDIS_LOCK_KEY,
      String(ahora),
      "EX",
      REDIS_LOCK_TTL,
      "NX"
    ]);

    bloqueoConseguido =
      resultadoLock === "OK";

  } catch (error) {

    console.warn(
      "No se pudo crear el bloqueo:",
      error.message
    );
  }


  // -------------------------------------------------------
  // 4. Si otro proceso está actualizando,
  //    devolver datos antiguos si existen.
  // -------------------------------------------------------

  if (!bloqueoConseguido) {

    if (
      cacheRedis &&
      cacheRedis.estaciones
    ) {

      console.log(
        "Otra petición está actualizando Redis. Usando caché anterior."
      );

      return cacheRedis;
    }

    // Esperar un poco y volver a comprobar.
    await new Promise(
      resolve => setTimeout(resolve, 1000)
    );

    try {

      const valor = await redisCommand([
        "GET",
        clave
      ]);

      if (valor) {

        const segundaCache =
          JSON.parse(valor);

        if (
          segundaCache &&
          segundaCache.estaciones
        ) {

          return segundaCache;
        }
      }

    } catch (error) {

      console.warn(
        "No se pudo recuperar la caché:",
        error.message
      );
    }
  }


  // -------------------------------------------------------
  // 5. Somos nosotros quienes actualizamos.
  // -------------------------------------------------------

  if (bloqueoConseguido) {

    try {

      console.log(
        "Actualizando datos oficiales del Ministerio..."
      );

      const response =
        await fetch(MINISTERIO_API);

      if (!response.ok) {

        throw new Error(
          `La API oficial no responde (HTTP ${response.status})`
        );
      }

      const data =
        await response.json();

      const datosPreparados =
        prepararProvincias(data);

      // Guardar todas las provincias
      await guardarProvinciasRedis(
        datosPreparados
      );

      // Obtener inmediatamente la provincia solicitada
      const provinciaActual =
        datosPreparados.provincias[provincia] || [];

      const resultado = {
        cacheTime: Date.now(),
        fecha: datosPreparados.fecha,
        estaciones: provinciaActual
      };

      // Caché local
      cache = resultado;
      cacheTime = resultado.cacheTime;

      return resultado;

    } catch (error) {

      console.error(
        "Error actualizando Redis:",
        error.message
      );

      // Si teníamos datos anteriores,
      // seguimos funcionando con ellos.
      if (
        cacheRedis &&
        cacheRedis.estaciones
      ) {

        console.warn(
          "Usando caché anterior."
        );

        return cacheRedis;
      }

      throw error;

    } finally {

      // Liberar bloqueo
      try {

        await redisCommand([
          "DEL",
          REDIS_LOCK_KEY
        ]);

      } catch (error) {

        console.warn(
          "No se pudo liberar el bloqueo:",
          error.message
        );
      }
    }
  }


  // -------------------------------------------------------
  // 6. Caché local como último respaldo.
  // -------------------------------------------------------

  if (cache) {

    console.warn(
      "Usando caché local como respaldo."
    );

    return cache;
  }


  // -------------------------------------------------------
  // 7. Último recurso: Ministerio.
  // -------------------------------------------------------

  const response =
    await fetch(MINISTERIO_API);

  if (!response.ok) {

    throw new Error(
      `La API oficial no responde (HTTP ${response.status})`
    );
  }

  const data =
    await response.json();

  const datosPreparados =
    prepararProvincias(data);

  const resultado = {
    cacheTime: Date.now(),
    fecha: datosPreparados.fecha,
    estaciones:
      datosPreparados.provincias[provincia] || []
  };

  cache = resultado;
  cacheTime = resultado.cacheTime;

  return resultado;
}


export default async function handler(req, res) {

  try {

    const provincia = String(
      req.query.provincia || "35"
    ).padStart(2, "0");

    const producto =
      req.query.producto || "95";


    // -------------------------------------------------------
    // Validar producto
    // -------------------------------------------------------

    if (
      producto !== "95" &&
      producto !== "98" &&
      producto !== "diesel"
    ) {

      return res.status(400).json({
        error: "Producto no válido"
      });
    }


    // -------------------------------------------------------
    // Obtener provincia desde Redis
    // -------------------------------------------------------

    const data =
      await obtenerDatosProvincia(
        provincia
      );


    // -------------------------------------------------------
    // Seleccionar precio
    // -------------------------------------------------------

    const resultados =
      data.estaciones

        .map(estacion => {

          const precio =
            estacion.precios &&
            estacion.precios[producto];

          if (
            precio === null ||
            precio === undefined ||
            isNaN(precio)
          ) {
            return null;
          }

          return {

            nombre:
              estacion.nombre,

            direccion:
              estacion.direccion,

            localidad:
              estacion.localidad,

            municipio:
              estacion.municipio,

            codigoPostal:
              estacion.codigoPostal,

            provincia:
              estacion.provincia,

            precio:
              precio,

            latitud:
              estacion.latitud,

            longitud:
              estacion.longitud,

            horario:
              estacion.horario
          };
        })

        .filter(Boolean)

        .sort(
          (a, b) =>
            a.precio - b.precio
        );


    // -------------------------------------------------------
    // Respuesta
    // -------------------------------------------------------

    return res.status(200).json({

      fecha:
        data.fecha || "",

      provincia:
        provincia,

      producto:
        producto,

      total:
        resultados.length,

      estaciones:
        resultados
    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({

      error:
        error.message

    });
  }
}
