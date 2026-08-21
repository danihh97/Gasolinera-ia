export default async function handler(req, res) {
  try {
    const response = await fetch(
      "https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/EstacionesTerrestres/"
    );

    if (!response.ok) {
      throw new Error("La API oficial no responde");
    }

    const data = await response.json();

    const estaciones =
      data.ListaEESSPrecio || [];

    // Las Palmas = código provincial 35
    const lasPalmas =
      estaciones.filter(estacion =>
        String(estacion["IDProvincia"] || "").trim() === "35"
      );

    // Gasolina 95 E5
    const resultados =
      lasPalmas
        .map(estacion => {

          const precio = parseFloat(
            String(
              estacion["Precio Gasolina 95 E5"] || ""
            ).replace(",", ".")
          );

          if (isNaN(precio)) {
            return null;
          }

          return {
            nombre:
              estacion["Rótulo"] || "Gasolinera",

            direccion:
              estacion["Dirección"] || "",

            localidad:
              estacion["Localidad"] || "",

            municipio:
              estacion["Municipio"] || "",

            codigoPostal:
              estacion["C.P."] || "",

            provincia:
              estacion["Provincia"] || "",

            precio: precio,

            latitud:
              estacion["Latitud"] || "",

            longitud:
              estacion["Longitud (WGS84)"] || "",

            horario:
              estacion["Horario"] || ""
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.precio - b.precio);

    return res.status(200).json({
      fecha: data.Fecha || "",
      totalProvincia: lasPalmas.length,
      totalGasolina95: resultados.length,
      estaciones: resultados
    });

  } catch (error) {

    return res.status(500).json({
      error: error.message
    });

  }
}
