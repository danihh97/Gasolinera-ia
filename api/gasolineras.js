export default async function handler(req, res) {
  try {
    const provincia = String(req.query.provincia || "35").padStart(2, "0");
    const producto = req.query.producto || "95";

    const response = await fetch(
      "https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/EstacionesTerrestres/"
    );

    if (!response.ok) {
      throw new Error("La API oficial no responde");
    }

    const data = await response.json();
    const estaciones = data.ListaEESSPrecio || [];

    // Campos oficiales de precios
    let campoPrecio;

    if (producto === "95") {
      campoPrecio = "Precio Gasolina 95 E5";
    }

    if (producto === "98") {
      campoPrecio = "Precio Gasolina 98 E5";
    }

    if (producto === "diesel") {
      campoPrecio = "Precio Gasoleo A";
    }

    const resultados = estaciones
      .filter(estacion => {
        return String(estacion["IDProvincia"] || "").trim() === provincia;
      })
      .map(estacion => {

        const precioTexto = estacion[campoPrecio];

        const precio = parseFloat(
          String(precioTexto || "").replace(",", ".")
        );

        if (isNaN(precio)) {
          return null;
        }

        return {
          nombre: estacion["Rótulo"] || "Gasolinera",
          direccion: estacion["Dirección"] || "",
          localidad: estacion["Localidad"] || "",
          municipio: estacion["Municipio"] || "",
          codigoPostal: estacion["C.P."] || "",
          provincia: estacion["Provincia"] || "",
          precio: precio,
          latitud: estacion["Latitud"] || "",
          longitud: estacion["Longitud (WGS84)"] || "",
          horario: estacion["Horario"] || ""
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.precio - b.precio);

    return res.status(200).json({
      fecha: data.Fecha || "",
      provincia: provincia,
      producto: producto,
      total: resultados.length,
      estaciones: resultados
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: error.message
    });
  }
}
