export default async function handler(req, res) {
  try {
    const provincia = "3505";
    const producto = "1";

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

    return res.status(200).json({
      fecha: data.Fecha,
      estaciones: data.ListaEESSPrecio || []
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "No se pudieron obtener los precios"
    });
  }
}
