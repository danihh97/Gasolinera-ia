export default async function handler(req, res) {
  try {
    const url =
      "https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/EstacionesTerrestres/";

    const response = await fetch(url);

    const texto = await response.text();

    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      tipo: response.headers.get("content-type"),
      primerosCaracteres: texto.substring(0, 200)
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      stack: error.stack
    });
  }
}
