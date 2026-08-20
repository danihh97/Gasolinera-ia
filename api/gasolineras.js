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

    const cp = String(req.query.cp || "").trim();
    const producto = String(req.query.producto || "95");

    let campoPrecio;

    if (producto === "95") {
      campoPrecio = "Precio_x0020_Gasolina_x0020_95_x0020_E5";
    } else if (producto === "98") {
      campoPrecio = "Precio_x0020_Gasolina_x0020_98_x0020_E5";
    } else {
      campoPrecio = "Precio_x0020_Gasoleo_x0020_A";
    }

    let resultados = estaciones
      .filter(estacion => {

        if (!cp) return true;

        return String(estacion["C.P."] || "").trim() === cp;
      })
      .map(estacion => {

        const precioTexto =
          estacion[campoPrecio];

        const precio = parseFloat(
          String(precioTexto || "")
            .replace(",", ".")
        );

        if (isNaN(precio)) {
          return null;
        }

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
            estacion[
              "Longitud_x0020__x0028_WGS84_x0029_"
            ] || "",
          horario: estacion["Horario"] || ""
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.precio - b.precio);

    return res.status(200).json({
      fecha: data.Fecha || "",
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
