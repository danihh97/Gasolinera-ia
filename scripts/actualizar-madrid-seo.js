// scripts/actualizar-madrid-seo.js
// Genera el contenido SEO de Madrid con los datos oficiales.
// Solo modifica el bloque delimitado por SEO_SERVER_START/END.

const fs = require("fs");
const path = require("path");

const URL_OFICIAL =
  "https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/EstacionesTerrestres/";

const HTML_PATH = path.join(
  process.cwd(),
  "gasolineras-baratas",
  "madrid.html"
);

function precio(value) {
  const n = Number.parseFloat(String(value || "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

function eur(value) {
  return Number(value).toLocaleString("es-ES", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  }) + " €/L";
}

function madridStations(data) {
  return (data.ListaEESSPrecio || [])
    .filter(s =>
      String(s["IDProvincia"] || "").trim().padStart(2, "0") === "28"
    )
    .map(s => ({
      nombre: s["Rótulo"] || "Gasolinera",
      localidad: s["Localidad"] || "",
      p95: precio(s["Precio Gasolina 95 E5"]),
      p98: precio(s["Precio Gasolina 98 E5"]),
      diesel: precio(s["Precio Gasoleo A"])
    }));
}

function top(stations, field) {
  return stations
    .filter(s => Number.isFinite(s[field]))
    .sort((a, b) => a[field] - b[field])
    .slice(0, 10);
}

function ranking(title, stations, field) {
  const rows = top(stations, field);

  if (!rows.length) {
    return `
      <div class="seo-fuel">
        <h3>${title}</h3>
        <p>No hay precios disponibles.</p>
      </div>`;
  }

  return `
    <div class="seo-fuel">
      <h3>${title}</h3>
      ${rows.map((s, i) => `
        <div class="seo-row">
          <strong>${i + 1}. ${esc(s.nombre)}${s.localidad ? ` · ${esc(s.localidad)}` : ""}</strong>
          <span>${eur(s[field])}</span>
        </div>
      `).join("")}
    </div>`;
}

async function main() {
  console.log("Descargando datos oficiales para Madrid...");

  const response = await fetch(URL_OFICIAL, {
    headers: { "User-Agent": "AhorraFuel/1.0" }
  });

  if (!response.ok) {
    throw new Error(`La API oficial responde HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data || !Array.isArray(data.ListaEESSPrecio)) {
    throw new Error("Formato inesperado de la API oficial.");
  }

  const stations = madridStations(data);

  const content = `
    <p>Precios consultados en los datos oficiales disponibles. Última actualización: ${esc(data.Fecha || "No indicada")}.</p>
    ${ranking("Gasolina 95 más barata en Madrid", stations, "p95")}
    ${ranking("Gasolina 98 más barata en Madrid", stations, "p98")}
    ${ranking("Diésel más barato en Madrid", stations, "diesel")}
  `;

  let html = fs.readFileSync(HTML_PATH, "utf8");

  const start = html.indexOf("  <!-- SEO_SERVER_START -->");
  const end = html.indexOf("  <!-- SEO_SERVER_END -->");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No se encontraron los marcadores SEO del HTML de Madrid.");
  }

  const block = `  <!-- SEO_SERVER_START -->
  <section class="seo-live" id="seo-live">
    <h2>Gasolineras más baratas en Madrid</h2>
    <p>Ranking actualizado de precios de gasolina 95, gasolina 98 y diésel en Madrid.</p>
    <div id="seo-live-content">${content}
    </div>
  </section>
  <!-- SEO_SERVER_END -->`;

  html = html.slice(0, start) + block + html.slice(end + "  <!-- SEO_SERVER_END -->".length);

  fs.writeFileSync(HTML_PATH, html, "utf8");

  console.log(`Madrid actualizado. Estaciones: ${stations.length}. Fecha: ${data.Fecha || "No indicada"}`);
}

main().catch(error => {
  console.error("ERROR ACTUALIZANDO SEO DE MADRID:", error);
  process.exit(1);
});
