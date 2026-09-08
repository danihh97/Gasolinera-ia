// scripts/actualizar-madrid-seo.js
// Genera el ranking inicial de Madrid dentro del mismo contenedor de estaciones.
// Al cargar JavaScript, este contenido se sustituye por el ranking dinámico normal.

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
  }) + " €/litro";
}

function madridStations(data) {
  return (data.ListaEESSPrecio || [])
    .filter(s => String(s["IDProvincia"] || "").trim().padStart(2, "0") === "28")
    .map(s => ({
      nombre: s["Rótulo"] || "Gasolinera",
      localidad: s["Localidad"] || "",
      direccion: s["Dirección"] || "",
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

function ranking(stations, field) {
  const rows = top(stations, field);

  if (!rows.length) {
    return '<div class="empty">No hay precios disponibles.</div>';
  }

  const medals = ["🥇", "🥈", "🥉"];

  return rows.map((s, i) => {
    const rank = medals[i] || `${i + 1}.`;
    const location = [s.direccion, s.localidad].filter(Boolean).join(" · ");

    const mapsQuery = [
      s.nombre,
      s.direccion,
      s.localidad,
      "Madrid"
    ].filter(Boolean).join(", ");

    const mapsUrl =
      "https://www.google.com/maps/dir/?api=1&destination=" +
      encodeURIComponent(mapsQuery) +
      "&travelmode=driving";

    return `
      <article class="station">
        <div class="station-top">
          <div class="rank">
            <span class="rank-number">${rank}</span>${esc(s.nombre)}
          </div>

          <div class="price">${eur(s[field])}</div>
        </div>

        <div class="address">
          📍 ${esc(location || "Madrid")}
        </div>

        <div class="station-actions">
          <a
            class="maps-btn"
            href="${mapsUrl}"
            target="_blank"
            rel="noopener"
          >
            📍 Cómo llegar
          </a>
        </div>
      </article>`;
  }).join("");
}

async function main() {
  console.log("Descargando datos oficiales para Madrid...");

  const response = await fetch(URL_OFICIAL, {
    headers: {
      "User-Agent": "AhorraFuel/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(
      `La API oficial responde HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (!data || !Array.isArray(data.ListaEESSPrecio)) {
    throw new Error("Formato inesperado de la API oficial.");
  }

  const stations = madridStations(data);

  const content = `
    <div
      class="seo-initial"
      aria-label="Gasolineras más baratas en Madrid"
    >
      <p class="seo-initial-intro">
        Gasolineras más baratas en Madrid · Gasolina 95
      </p>

      <p class="seo-initial-note">
        Precios disponibles en los datos oficiales ·
        ${esc(data.Fecha || "Última actualización disponible")}
      </p>

      ${ranking(stations, "p95")}
    </div>`;

  let html = fs.readFileSync(HTML_PATH, "utf8");

  const start = html.indexOf(
    "  <!-- SEO_SERVER_START -->"
  );

  const end = html.indexOf(
    "  <!-- SEO_SERVER_END -->"
  );

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      "No se encontraron los marcadores SEO del HTML de Madrid."
    );
  }

  const block =
    `  <!-- SEO_SERVER_START -->\n` +
    `  ${content.trim()}\n` +
    `  <!-- SEO_SERVER_END -->`;

  html =
    html.slice(0, start) +
    block +
    html.slice(
      end + "  <!-- SEO_SERVER_END -->".length
    );

  fs.writeFileSync(
    HTML_PATH,
    html,
    "utf8"
  );

  console.log(
    `Madrid actualizado. Estaciones: ${stations.length}. Fecha: ${data.Fecha || "No indicada"}`
  );
}

main().catch(error => {
  console.error(
    "ERROR ACTUALIZANDO SEO DE MADRID:",
    error
  );

  process.exit(1);
});
