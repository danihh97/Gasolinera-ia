export default async function handler(req, res) {
  try {
    const provincia = "3505";

    const url =
      `https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/${provincia}`;

    const response = await fetch(url);

    const texto = await response.text();

    if (!response.ok) {
      return res.status(500).json({
        error: "La API oficial ha rechazado la consulta",
        estado: response.status,
        respuesta: texto
      });
    }

    const data = JSON.parse(texto);

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
