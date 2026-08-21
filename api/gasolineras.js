export default async function handler(req, res) {
  try {

    const response = await fetch(
      "https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/EstacionesTerrestres/"
    );

    if (!response.ok) {
      throw new Error("La API oficial no responde");
    }

    const data = await response.json();

    const estaciones = data.ListaEESSPrecio || [];

    return res.status(200).json({
      fecha: data.Fecha || "",
      total: estaciones.length,
      ejemplo: estaciones.slice(0, 3)
    });

  } catch (error) {

    return res.status(500).json({
      error: error.message
    });

  }
}
