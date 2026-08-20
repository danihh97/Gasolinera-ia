export default async function handler(req, res) {
  try {
    const provincia = req.query.provincia || "3505";
    const producto = req.query.producto || "1";
    const cp = req.query.cp || "";

    const url =
      `https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvinciaProducto/${provincia}/${producto}`;

    const response = await fetch(url);

    if (!response.ok) {
      const texto = await response.text();

      return res.status(500).json({
        error: "La API oficial ha rechazado la consulta",
        estado: response.status,
        detalle: texto
      });
    }

    const data = await response.json();

    let estaciones = data.ListaEESSPrecio || [];

    if (cp) {
      estaciones = estaciones.filter(estacion =>
        String(estacion["C.P."] || "").trim() === cp
      );
    }

    estaciones = estaciones
      .map(estacion => {

        const precio = parseFloat(
          String(estacion["PrecioProducto"] || "")
            .replace(",", ".")
        );

        return {
          nombre: estacion["Rótulo"] || "Gasolinera",
          direccion: estacion["Dirección"] || "",
          codigoPostal: estacion["C.P."] || "",
          localidad: estacion["Localidad"] || "",
          municipio: estacion["Municipio"] || "",
          provincia: estacion["Provincia"] || "",
          precio: precio,
          latitud: estacion["Latitud"] || "",
          longitud:
            estacion["Longitud_x0020__x0028_WGS84_x0029_"] || "",
          horario: estacion["Horario"] || "",
          fecha: data.Fecha || ""
        };
      })
      .filter(estacion => !isNaN(estacion.precio))
      .sort((a, b) => a.precio - b.precio);

    return res.status(200).json({
      fecha: data.Fecha || "",
      total: estaciones.length,
      estaciones
    });

  } catch (error) {

    return res.status(500).json({
      error: "Error conectando con la API oficial",
      detalle: error.message
    });
  }
}
