export default async function handler(req, res) {
  try {
    const provincia = req.query.provincia || "3505";
    const producto = req.query.producto || "1";

    const url =
      `https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvinciaProducto/${provincia}/${producto}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API oficial: ${response.status}`);
    }

    const data = await response.json();

    const estaciones = (data.ListaEESSPrecio || [])
      .map(estacion => {
        const precio = parseFloat(
          String(estacion["PrecioProducto"] || "")
            .replace(",", ".")
        );

        return {
          nombre: estacion["Rótulo"] || "Gasolinera",
          direccion: estacion["Dirección"] || "",
          localidad: estacion["Localidad"] || "",
          municipio: estacion["Municipio"] || "",
          codigoPostal: estacion["C.P."] || "",
          precio: precio,
          latitud: estacion["Latitud"] || "",
          longitud:
            estacion["Longitud (WGS84)"] || "",
          horario: estacion["Horario"] || ""
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
      error: error.message
    });
  }
}
