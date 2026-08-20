export default async function handler(req, res) {
  try {
    const provincia = req.query.provincia || "3505";
    const producto = req.query.producto || "1";
    const cp = (req.query.cp || "").trim();

    if (!/^\d{5}$/.test(cp)) {
      return res.status(400).json({
        error: "Código postal no válido"
      });
    }

    // 1. Obtener municipios de la provincia
    const municipiosUrl =
      `https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/Listados/MunicipiosPorProvincia/${provincia}`;

    const municipiosResponse = await fetch(municipiosUrl);

    if (!municipiosResponse.ok) {
      throw new Error(
        `Error obteniendo municipios: ${municipiosResponse.status}`
      );
    }

    const municipiosData = await municipiosResponse.json();

    const municipios =
      municipiosData || [];

    /*
     * Buscamos el municipio mediante el código postal
     * consultando las estaciones de la provincia.
     *
     * Primero usamos la consulta de provincia + producto,
     * que la API oficial documenta.
     */

    const estacionesUrl =
      `https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvinciaProducto/${provincia}/${producto}`;

    const estacionesResponse =
      await fetch(estacionesUrl);

    if (!estacionesResponse.ok) {
      throw new Error(
        `Error obteniendo estaciones: ${estacionesResponse.status}`
      );
    }

    const estacionesData =
      await estacionesResponse.json();

    let estaciones =
      estacionesData.ListaEESSPrecio || [];

    /*
     * Filtramos directamente por código postal.
     * Al consultar solo una provincia, la cantidad
     * de datos es mucho menor que consultar toda España.
     */

    estaciones = estaciones
      .filter(estacion =>
        String(estacion["C.P."] || "").trim() === cp
      )
      .map(estacion => {

        const precioTexto =
          estacion["PrecioProducto"];

        const precio =
          parseFloat(
            String(precioTexto || "")
              .replace(",", ".")
          );

        return {
          id:
            estacion["IDEESS"] || "",

          nombre:
            estacion["Rótulo"] ||
            "Gasolinera",

          direccion:
            estacion["Dirección"] || "",

          codigoPostal:
            estacion["C.P."] || "",

          localidad:
            estacion["Localidad"] || "",

          municipio:
            estacion["Municipio"] || "",

          provincia:
            estacion["Provincia"] || "",

          precio:
            isNaN(precio)
              ? null
              : precio,

          latitud:
            estacion["Latitud"] || "",

          longitud:
            estacion[
              "Longitud_x0020__x0028_WGS84_x0029_"
            ] || "",

          horario:
            estacion["Horario"] || ""
        };
      })
      .filter(estacion =>
        estacion.precio !== null
      )
      .sort(
        (a, b) =>
          a.precio - b.precio
      );

    return res.status(200).json({

      fecha:
        estacionesData.Fecha || "",

      total:
        estaciones.length,

      estaciones:
        estaciones

    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({

      error:
        "No se pudieron obtener los precios",

      detalle:
        error.message

    });
  }
}
