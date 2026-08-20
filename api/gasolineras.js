export default async function handler(req, res) {
  try {
    const provincia = req.query.provincia || "3505";
    const producto = req.query.producto || "1";
    const codigoPostal = req.query.cp || "";

    const url =
      "https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvinciaProducto/" +
      provincia +
      "/" +
      producto;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error("Error consultando la API oficial");
    }

    const data = await response.json();

    let estaciones = data.ListaEESSPrecio || [];

    // Filtrar por código postal si se ha introducido
    if (codigoPostal) {
      estaciones = estaciones.filter(estacion =>
        String(estacion["C.P."] || "").trim() === codigoPostal
      );
    }

    // Convertir precios y ordenar de más barato a más caro
    estaciones = estaciones
      .map(estacion => {

        const precioTexto =
          estacion["PrecioProducto"] ||
          estacion["Precio_x0020_Gasolina_x0020_95_x0020_E5"] ||
          "";

        const precio = parseFloat(
          String(precioTexto).replace(",", ".")
        );

        return {
          id: estacion["IDEESS"] || "",
          nombre: estacion["Rótulo"] || "Gasolinera",
          direccion: estacion["Dirección"] || "",
          codigoPostal: estacion["C.P."] || "",
          localidad: estacion["Localidad"] || "",
          municipio: estacion["Municipio"] || "",
          provincia: estacion["Provincia"] || "",
          precio: isNaN(precio) ? null : precio,
          latitud: estacion["Latitud"] || "",
          longitud:
            estacion["Longitud_x0020__x0028_WGS84_x0029_"] || "",
          horario: estacion["Horario"] || "",
          remision: estacion["Remisión"] || ""
        };
      })
      .filter(estacion => estacion.precio !== null)
      .sort((a, b) => a.precio - b.precio);

    return res.status(200).json({
      fecha: data.Fecha || "",
      total: estaciones.length,
      estaciones: estaciones
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "No se pudieron obtener los precios",
      detalle: error.message
    });
  }
}
