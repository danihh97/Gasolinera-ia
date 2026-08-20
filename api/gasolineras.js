export default async function handler(req, res) {
  try {
    const response = await fetch(
      "https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/EstacionesTerrestres/",
      {
        headers: {
          "Accept": "application/json"
        }
      }
    );

    if (!response.ok) {
      return res.status(500).json({
        error: "No se pudieron obtener los precios"
      });
    }

    const data = await response.json();

    const estaciones = data.ListaEESSPrecio || [];

    return res.status(200).json(estaciones);

  } catch (error) {
    return res.status(500).json({
      error: "Error conectando con la API oficial"
    });
  }
}
