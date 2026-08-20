export default async function handler(req, res) {
  try {
    const response = await fetch(
      "https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/EstacionesTerrestres/",
      {
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error("API oficial no disponible");
    }

    const data = await response.json();

    return res.status(200).json({
      fecha: data.Fecha,
      estaciones: data.ListaEESSPrecio || []
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
