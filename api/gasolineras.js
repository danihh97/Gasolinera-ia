let cache = null;
let cacheTime = 0;

const CACHE_DURATION = 60 * 60 * 1000; // 1 hora

const REDIS_CACHE_KEY = "ahorrafuel:estaciones:v1";
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
 * Obtiene los datos oficiales utilizando Redis como caché compartido.
 */
async function obtenerDatos() {
  const ahora = Date.now();

  // ---------------------------------------------------------
  // 1. Intentar obtener la caché compartida de Redis
  // ---------------------------------------------------------
  let cacheRedis = null;

  try {
    const valor = await redisCommand([
      "GET",
      REDIS_CACHE_KEY
    ]);

    if (valor) {
      cacheRedis = JSON.parse(valor);
    }
  } catch (error) {
    console.warn(
      "No se pudo leer Redis. Se utilizará la caché local:",
      error.message
    );
  }

  // ---------------------------------------------------------
  // 2. Si Redis tiene datos y todavía tienen menos de 1 hora,
  //    utilizamos directamente esos datos.
  // ---------------------------------------------------------
  if (
    cacheRedis &&
    cacheRedis.data &&
    cacheRedis.cacheTime &&
    ahora - cacheRedis.cacheTime < CACHE_DURATION
  ) {
    cache = cacheRedis.data;
    cacheTime = cacheRedis.cacheTime;

    return cacheRedis.data;
  }

  // ---------------------------------------------------------
  // 3. La caché está vacía o ha caducado.
  //    Intentamos conseguir un bloqueo para que solamente
  //    una petición actualice los datos.
  // ---------------------------------------------------------
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

    bloqueoConseguido = resultadoLock === "OK";
  } catch (error) {
    console.warn(
      "No se pudo crear el bloqueo de Redis:",
      error.message
    );
  }

  // ---------------------------------------------------------
  // 4. Si otro usuario ya está actualizando los datos,
  //    utilizamos la caché antigua si existe.
  // ---------------------------------------------------------
  if (!bloqueoConseguido) {
    if (cacheRedis && cacheRedis.data) {
      console.log(
        "Otra petición está actualizando Redis. Usando caché anterior."
      );

      cache = cacheRedis.data;
      cacheTime = cacheRedis.cacheTime || ahora;

      return cacheRedis.data;
    }

    // Si no existe ninguna caché, esperamos un momento y
    // volvemos a comprobar Redis.
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const valor = await redisCommand([
        "GET",
        REDIS_CACHE_KEY
      ]);

      if (valor) {
        const segundaCache = JSON.parse(valor);

        if (segundaCache && segundaCache.data) {
          cache = segundaCache.data;
          cacheTime = segundaCache.cacheTime || ahora;

          return segundaCache.data;
        }
      }
    } catch (error) {
      console.warn(
        "No se pudo recuperar la caché después de esperar:",
        error.message
      );
    }
  }

  // ---------------------------------------------------------
  // 5. Somos nosotros quienes actualizamos los datos.
  //    Descargamos el archivo oficial del Ministerio.
  // ---------------------------------------------------------
  if (bloqueoConseguido) {
    try {
      console.log(
        "Actualizando datos oficiales del Ministerio..."
      );

      const response = await fetch(MINISTERIO_API);

      if (!response.ok) {
        throw new Error(
          `La API oficial no responde (HTTP ${response.status})`
        );
      }

      const data = await response.json();

      const nuevoCache = {
        cacheTime: Date.now(),
        data: data
      };

      // Guardar los datos en Redis.
      try {
        await redisCommand([
          "SET",
          REDIS_CACHE_KEY,
          JSON.stringify(nuevoCache),
          "EX",
          REDIS_CACHE_TTL
        ]);

        console.log(
          "Datos oficiales guardados correctamente en Redis."
        );
      } catch (error) {
        console.warn(
          "No se pudo guardar la caché en Redis:",
          error.message
        );
      }

      // Mantener también la caché local como respaldo.
      cache = data;
      cacheTime = nuevoCache.cacheTime;

      return data;

    } finally {
      // Liberar el bloqueo.
      try {
        await redisCommand([
          "DEL",
          REDIS_LOCK_KEY
        ]);
      } catch (error) {
        console.warn(
          "No se pudo liberar el bloqueo de Redis:",
          error.message
        );
      }
    }
  }

  // ---------------------------------------------------------
  // 6. Si Redis no funciona, utilizamos la caché local
  //    si tenemos una disponible.
  // ---------------------------------------------------------
  if (cache) {
    console.warn(
      "Usando caché local como respaldo."
    );

    return cache;
  }

  // ---------------------------------------------------------
  // 7. Último recurso: descargar directamente del Ministerio.
  // ---------------------------------------------------------
  const response = await fetch(MINISTERIO_API);

  if (!response.ok) {
    throw new Error(
      `La API oficial no responde (HTTP ${response.status})`
    );
  }

  const data = await response.json();

  cache = data;
  cacheTime = Date.now();

  return data;
}


export default async function handler(req, res) {
  try {
    const provincia = String(
      req.query.provincia || "35"
    ).padStart(2, "0");

    const producto = req.query.producto || "95";

    // -------------------------------------------------------
    // Obtener datos desde Redis/caché
    // -------------------------------------------------------
    const data = await obtenerDatos();

    const estaciones = data.ListaEESSPrecio || [];

    // -------------------------------------------------------
    // Campos oficiales de precios
    // -------------------------------------------------------
    let campoPrecio;

    if (producto === "95") {
      campoPrecio = "Precio Gasolina 95 E5";
    } else if (producto === "98") {
      campoPrecio = "Precio Gasolina 98 E5";
    } else if (producto === "diesel") {
      campoPrecio = "Precio Gasoleo A";
    } else {
      return res.status(400).json({
        error: "Producto no válido"
      });
    }

    // -------------------------------------------------------
    // Filtrar provincia y preparar resultados
    // -------------------------------------------------------
    const resultados = estaciones
      .filter(estacion => {
        return (
          String(
            estacion["IDProvincia"] || ""
          ).trim() === provincia
        );
      })
      .map(estacion => {
        const precioTexto =
          estacion[campoPrecio];

        const precio = parseFloat(
          String(precioTexto || "").replace(",", ".")
        );

        if (isNaN(precio)) {
          return null;
        }

        return {
          nombre:
            estacion["Rótulo"] || "Gasolinera",

          direccion:
            estacion["Dirección"] || "",

          localidad:
            estacion["Localidad"] || "",

          municipio:
            estacion["Municipio"] || "",

          codigoPostal:
            estacion["C.P."] || "",

          provincia:
            estacion["Provincia"] || "",

          precio: precio,

          latitud:
            estacion["Latitud"] || "",

          longitud:
            estacion["Longitud (WGS84)"] || "",

          horario:
            estacion["Horario"] || ""
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.precio - b.precio);

    // -------------------------------------------------------
    // Respuesta al frontend
    // -------------------------------------------------------
    return res.status(200).json({
      fecha: data.Fecha || "",
      provincia: provincia,
      producto: producto,
      total: resultados.length,
      estaciones: resultados
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message
    });
  }
}
