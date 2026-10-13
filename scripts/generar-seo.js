#!/usr/bin/env node
// scripts/generar-seo.mjs
// Genera páginas estáticas con precios reales para Google:
//   /gasolineras-baratas.html                      (índice de provincias)
//   /gasolineras-baratas/<provincia>.html          (52 provincias)
//   /gasolineras-baratas/<provincia>/<ciudad>.html (ciudades con suficientes gasolineras)
//   /precio-gasolina-hoy.html                      (resumen nacional)
//   /sitemap.xml
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SITE = "https://ahorrafuel.es";
const API = "https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes/EstacionesTerrestres/";
const OUT = process.env.SEO_OUT || ".";
const MIN_CIUDAD = Number(process.env.SEO_MIN_CIUDAD || 5);
const MIN_TOTAL = Number(process.env.SEO_MIN_TOTAL || 3000);
const EXCLUIDAS = new Set(["9701"]);

const PROVINCIAS = [["01","Álava"],["02","Albacete"],["03","Alicante"],["04","Almería"],["05","Ávila"],["06","Badajoz"],["07","Baleares"],["08","Barcelona"],["09","Burgos"],["10","Cáceres"],["11","Cádiz"],["12","Castellón"],["13","Ciudad Real"],["14","Córdoba"],["15","A Coruña"],["16","Cuenca"],["17","Girona"],["18","Granada"],["19","Guadalajara"],["20","Guipúzcoa"],["21","Huelva"],["22","Huesca"],["23","Jaén"],["24","León"],["25","Lleida"],["26","La Rioja"],["27","Lugo"],["28","Madrid"],["29","Málaga"],["30","Murcia"],["31","Navarra"],["32","Ourense"],["33","Asturias"],["34","Palencia"],["35","Las Palmas"],["36","Pontevedra"],["37","Salamanca"],["38","Santa Cruz de Tenerife"],["39","Cantabria"],["40","Segovia"],["41","Sevilla"],["42","Soria"],["43","Tarragona"],["44","Teruel"],["45","Toledo"],["46","Valencia"],["47","Valladolid"],["48","Vizcaya"],["49","Zamora"],["50","Zaragoza"],["51","Ceuta"],["52","Melilla"]];

const COMB = [
  { k: "95", campo: "Precio Gasolina 95 E5", nombre: "Gasolina 95" },
  { k: "98", campo: "Precio Gasolina 98 E5", nombre: "Gasolina 98" },
  { k: "diesel", campo: "Precio Gasoleo A", nombre: "Diésel" }
];

// Ciudades que ya existían con URL plana: se mantienen para no perder posiciones.
const LEGADO = [
  { slug: "bilbao", prov: "48", ok: k => k === "bilbao" },
  { slug: "gijon", prov: "33", ok: k => k === "gijon" },
  { slug: "palma", prov: "07", ok: k => k.startsWith("palma") },
  { slug: "pamplona", prov: "31", ok: k => k.includes("pamplona") },
  { slug: "vigo", prov: "36", ok: k => k === "vigo" }
];

const POPULARES = ["28","08","46","41","29","03","50","30","35","38","07","15"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const slug = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = (n, d = 3) => n.toFixed(d).replace(".", ",");
const num = s => parseFloat(String(s || "").replace(",", "."));
const SMALL = new Set(["de","del","la","las","los","el","y","i","en","da","do","das","dos","a","al"]);
function bonito(s) {
  s = String(s || "").trim();
  const m = s.match(/^(.*?)\s*\((el|la|las|los|a|o|os|as|l'|els|les|es|sa)\)$/i);
  if (m) s = m[2] + (m[2].slice(-1) === "'" ? "" : " ") + m[1];
  return s.toLowerCase().split(/(\s+|-|\/)/).map((w, i) => (/^(\s+|-|\/)$/.test(w) || w === "") ? w : ((i > 0 && SMALL.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join("");
}

/* ---------- datos ---------- */
async function cargar() {
  if (process.env.SEO_DATA_FILE) return JSON.parse(readFileSync(process.env.SEO_DATA_FILE, "utf8"));
  const r = await fetch(API, { headers: { "User-Agent": "AhorraFuel/1.0" }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`El Ministerio no responde (HTTP ${r.status})`);
  return r.json();
}

function fechaInfo(txt) {
  const m = String(txt || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) { const h = new Date(); return { iso: h.toISOString().slice(0, 10), largo: "hoy" }; }
  const [, d, mo, y, h, mi] = m;
  return { iso: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`, largo: `${+d} de ${MESES[+mo - 1]} de ${y}, ${+h}:${mi} h` };
}

function agrupar(data) {
  const provs = new Map(PROVINCIAS.map(([c, n]) => [c, { code: c, name: n, slug: slug(n), est: [] }]));
  const vistos = new Set();
  let total = 0;
  for (const e of data.ListaEESSPrecio || []) {
    if (String(e["Tipo Venta"] || "").trim().toUpperCase() !== "P") continue;
    const id = String(e["IDEESS"] || "").trim();
    if (EXCLUIDAS.has(id)) continue;
    const clave = id || [e["Rótulo"], e["Dirección"], e["Localidad"], e["C.P."]].join("|");
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const p = provs.get(String(e["IDProvincia"] || "").trim().padStart(2, "0"));
    if (!p) continue;
    const mun = bonito(e["Municipio"] || e["Localidad"]);
    const p_ = {};
    for (const c of COMB) { const v = num(e[c.campo]); p_[c.k] = Number.isFinite(v) && v > 0.8 && v < 3.5 ? v : null; }
    p.est.push({
      nombre: String(e["Rótulo"] || "Gasolinera").trim(), dir: bonito(e["Dirección"]), mun, mkey: norm(mun),
      cp: String(e["C.P."] || "").trim(), horario: String(e["Horario"] || ""), lat: num(e["Latitud"]), lon: num(e["Longitud (WGS84)"]), p: p_
    });
    total++;
  }
  return { provs: [...provs.values()], total };
}

/* ---------- estadísticas ---------- */
const valores = (l, k) => l.map(e => e.p[k]).filter(Number.isFinite);
function resumen(l, k) {
  const v = valores(l, k).sort((a, b) => a - b);
  if (!v.length) return null;
  return { n: v.length, min: v[0], max: v[v.length - 1], avg: v.reduce((a, b) => a + b, 0) / v.length };
}
const top = (l, k, n = 10) => l.filter(e => Number.isFinite(e.p[k])).sort((a, b) => a.p[k] - b.p[k] || a.nombre.localeCompare(b.nombre)).slice(0, n);
const elige = (...t) => t.find(x => x.length <= 66) || t[t.length - 1];
const mapa = e => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.nombre} ${e.dir} ${e.mun}`)}`;

/* ---------- plantilla ---------- */
function pagina({ title, desc, path, h1, lead, upd, body, ld }) {
  const url = SITE + path;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#061713">
<link rel="manifest" href="/manifest.json">
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192x192.png">
<link rel="apple-touch-icon" href="/favicon-192x192.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="AhorraFuel">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/seo.css">
<link rel="stylesheet" href="/ranking.css">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": ld }).replace(/</g, "\\u003c")}</script>
</head>
<body>
<header><div class="wrap"><a class="logo" href="/" aria-label="AhorraFuel inicio"><img class="lg" src="/IMG_6106.png" alt="AhorraFuel" width="48" height="48"><span class="wm">Ahorra<span>Fuel</span></span></a><a class="btn p sm" href="/#buscar" aria-label="Buscar gasolineras">Buscar</a></div></header>
<main class="wrap seo">
${body.crumbs}
<h1>${esc(h1)}</h1>
<p class="lead">${lead}</p>
<p class="upd">Datos oficiales actualizados el ${esc(upd)}</p>
${body.html}
</main>
<footer><div class="wrap"><div><a class="logo" href="/" style="padding:0"><span class="wm">Ahorra<span>Fuel</span></span></a><p>Compara los precios de la gasolina y el diésel en toda España.</p></div><div><h4>Explorar</h4><a href="/gasolineras-baratas.html">Gasolineras por provincia</a><a href="/precio-gasolina-hoy.html">Precio de la gasolina hoy</a></div><div><h4>Legal</h4><a href="/privacidad.html">Privacidad</a><a href="/cookies.html">Cookies</a><a href="/informacion-legal.html">Información legal</a><a href="/condiciones-de-uso.html">Condiciones de uso</a></div><div class="cp">© ${new Date().getFullYear()} AhorraFuel. Los precios pueden variar en la gasolinera; confírmalos antes de repostar.</div></div></footer>
</body>
</html>
`;
}

const migas = items => ({
  html: `<nav class="crumbs" aria-label="Migas de pan">${items.map((x, i) => x.url ? `<a href="${x.url}">${esc(x.nombre)}</a>` : `<span>${esc(x.nombre)}</span>`).join(" › ")}</nav>`,
  ld: { "@type": "BreadcrumbList", itemListElement: items.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.nombre, item: SITE + (x.url || x.self) })) }
});

/* Ranking en tarjetas compactas: top 20, con las 5 primeras visibles y el resto en "Ver más" */
function tabla(l, c, titulo) {
  const filas = top(l, c.k, 20);
  if (!filas.length) return "";
  const medalla = ["🥇", "🥈", "🥉"];
  const etiqueta = i => i === 0 ? "🥇 Más barata" : (medalla[i] ? `${medalla[i]} #${i + 1}` : `#${i + 1}`);
  const tarjeta = (e, i) => `<li class="rc${i === 0 ? " top" : ""}"><div class="rc-h"><span class="rc-b">${etiqueta(i)}</span><span class="rc-p">${eur(e.p[c.k])}<small>€/L</small></span></div><h3 class="rc-n">${esc(e.nombre)}</h3><p class="rc-a">📍 ${esc(e.dir)}${e.cp ? ", " + esc(e.cp) : ""}</p><p class="rc-m">${esc(e.mun)}${/24\s*H/i.test(e.horario) ? " · 🕐 24 h" : ""}</p><a class="rc-go" href="${esc(mapa(e))}" target="_blank" rel="nofollow noopener">🗺️ Cómo llegar</a></li>`;
  const visibles = filas.slice(0, 5), resto = filas.slice(5);
  return `<h2>${esc(titulo)}</h2>
<ol class="rank" aria-label="${esc(titulo)}">
${visibles.map((e, i) => tarjeta(e, i)).join("\n")}
</ol>${resto.length ? `
<details class="more"><summary>Ver las otras ${resto.length} gasolineras</summary>
<ol class="rank" start="6">
${resto.map((e, i) => tarjeta(e, i + 5)).join("\n")}
</ol></details>` : ""}`;
}

const itemList = (l, c) => ({ "@type": "ItemList", name: `${c.nombre}: gasolineras más baratas`, itemListElement: top(l, c.k, 20).map((e, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "GasStation", name: e.nombre, address: { "@type": "PostalAddress", streetAddress: e.dir, addressLocality: e.mun, postalCode: e.cp, addressCountry: "ES" } } })) });
const faqLd = faqs => ({ "@type": "FAQPage", mainEntity: faqs.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
const faqHtml = faqs => `<h2>Preguntas frecuentes</h2><div class="faq">${faqs.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>`;
const cards = (l) => `<div class="sumg">${COMB.map(c => { const r = resumen(l, c.k); return r ? `<div class="sumc"><span>${c.nombre}</span><b>desde ${eur(r.min)} €/L</b><small>Media ${eur(r.avg)} €/L · ${r.n} gasolineras</small></div>` : ""; }).join("")}</div>`;

function faqsZona(nombre, l, fecha, et) {
  const f = [], r95 = resumen(l, "95"), rd = resumen(l, "diesel"), t95 = top(l, "95", 1)[0], td = top(l, "diesel", 1)[0];
  if (t95) f.push({ q: `¿Cuál es la gasolina 95 más barata ${et}?`, a: `Según los datos oficiales actualizados el ${fecha}, la gasolina 95 más barata ${et} está en ${t95.nombre} (${t95.dir}, ${t95.mun}) a ${eur(t95.p["95"])} €/L.` });
  if (td) f.push({ q: `¿Dónde está el diésel más barato ${et}?`, a: `El diésel más barato ${et} figura en ${td.nombre} (${td.dir}, ${td.mun}) a ${eur(td.p.diesel)} €/L, según los datos del ${fecha}.` });
  if (r95) f.push({ q: `¿Cuál es el precio medio de la gasolina 95 ${et}?`, a: `El precio medio de la gasolina 95 ${et} es de ${eur(r95.avg)} €/L, calculado con ${r95.n} gasolineras. Entre la más barata y la más cara hay ${eur(r95.max - r95.min)} €/L: en un depósito de 50 litros pueden ser unos ${eur((r95.max - r95.min) * 50, 2)} €.` });
  if (rd) f.push({ q: `¿Cuánto cuesta de media el diésel ${et}?`, a: `El gasóleo A cuesta de media ${eur(rd.avg)} €/L ${et}, con precios entre ${eur(rd.min)} y ${eur(rd.max)} €/L según la gasolinera.` });
  f.push({ q: "¿Cada cuánto se actualizan los precios?", a: "AhorraFuel actualiza esta página cada día con los datos oficiales publicados por el Ministerio. Los precios pueden cambiar durante el día, así que conviene confirmarlos en la gasolinera antes de repostar." });
  return f;
}

/* ---------- contenido propio por zona ---------- */
const NAC = {};
const pct = (a, b) => ((a - b) / b) * 100;
function analisis(l, ref, refNombre, et) {
  const r95 = resumen(l, "95"), rd = resumen(l, "diesel"), t95 = top(l, "95", 1)[0];
  if (!r95) return "";
  const h24 = l.filter(e => /24\s*H/i.test(e.horario)).length;
  const p = [];
  let a = `Hoy la gasolina 95 ${et} cuesta de media ${eur(r95.avg)} €/L, con precios entre ${eur(r95.min)} y ${eur(r95.max)} €/L.`;
  const dif = r95.max - r95.min;
  if (r95.n >= 2 && dif >= 0.005) a += ` Repostar en la gasolinera más barata en lugar de la más cara supone ahorrar unos ${eur(dif * 50, 2)} € en un depósito de 50 litros.`;
  p.push(a);
  if (ref && ref.avg) {
    const d = pct(r95.avg, ref.avg);
    p.push(Math.abs(d) >= 0.3
      ? `El precio medio de la gasolina 95 ${et} está un ${eur(Math.abs(d), 1)} % ${d < 0 ? "por debajo" : "por encima"} de la media de ${refNombre} (${eur(ref.avg)} €/L).`
      : `El precio medio de la gasolina 95 ${et} está en línea con la media de ${refNombre} (${eur(ref.avg)} €/L).`);
  }
  if (rd) p.push(`El diésel cuesta de media ${eur(rd.avg)} €/L y el más barato está a ${eur(rd.min)} €/L.`);
  if (t95) p.push(`La gasolina 95 más barata ${et} es la de ${t95.nombre} (${t95.dir}), a ${eur(t95.p["95"])} €/L.`);
  if (h24) p.push(h24 === l.length ? `Todas las gasolineras ${et} abren las 24 horas.` : `${h24} de las ${l.length} gasolineras ${et} abren las 24 horas.`);
  return `<p class="ana">${esc(p.join(" "))}</p>`;
}
const kmEntre = (a, b) => { const dy = (a.lat - b.lat) * 111, dx = (a.lon - b.lon) * 111 * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180); return Math.sqrt(dx * dx + dy * dy); };
const MARCAS = ["REPSOL","CEPSA","MOEVE","BP","SHELL","GALP","DISA","PLENERGY","BALLENOIL","PETROPRIX","AVIA","ESCLATOIL","Q8","TAMOIL","PETRONOR","ALCAMPO","CARREFOUR","EROSKI","LECLERC","COSTCO","BONAREA","GASEXPRESS","NEXTGAS","ANDAMUR","VALCARCE","MEROIL","CAMPSA","PCAN","HAM"];
const MARCAS_RE = MARCAS.map(m => [m, new RegExp(`(^|[^a-z0-9])${m.toLowerCase()}([^a-z0-9]|$)`)]);
const marca = nombre => { const n = norm(nombre); const f = MARCAS_RE.find(([, r]) => r.test(n)); return f ? f[0] : null; };
const marcaBonita = m => m.length <= 3 ? m : m[0] + m.slice(1).toLowerCase();
const media = v => v.reduce((a, b) => a + b, 0) / v.length;

function porMarca(l) {
  const m = new Map();
  for (const e of l) { const k = marca(e.nombre), v = e.p["95"]; if (!k || !Number.isFinite(v)) continue; const x = m.get(k) || []; x.push(v); m.set(k, x); }
  return [...m].filter(([, v]) => v.length >= 2).map(([k, v]) => ({ m: marcaBonita(k), n: v.length, avg: media(v), min: Math.min(...v) })).sort((a, b) => a.avg - b.avg);
}
function tablaMarcas(l, et) {
  const r = porMarca(l);
  if (r.length < 2) return "";
  return `<h2>Precio de la gasolina 95 por marca ${esc(et)}</h2>
<div class="tw"><table><thead><tr><th>Marca</th><th>Gasolineras</th><th>Media €/L</th><th>Desde €/L</th></tr></thead><tbody>
${r.slice(0, 8).map(x => `<tr><td>${esc(x.m)}</td><td>${x.n}</td><td class="pr">${eur(x.avg)}</td><td class="pr">${eur(x.min)}</td></tr>`).join("\n")}
</tbody></table></div>
<p class="nota">Solo se incluyen las marcas con al menos 2 gasolineras ${esc(et)}.</p>`;
}
function tablaCP(c) {
  const m = new Map();
  for (const e of c.est) { if (!/^\d{5}$/.test(e.cp) || !Number.isFinite(e.p["95"])) continue; const x = m.get(e.cp) || []; x.push(e.p["95"]); m.set(e.cp, x); }
  const f = [...m].filter(([, v]) => v.length >= 2).map(([cp, v]) => ({ cp, n: v.length, avg: media(v), min: Math.min(...v) })).sort((a, b) => a.avg - b.avg).slice(0, 12);
  if (f.length < 2) return "";
  return `<h2>Precio de la gasolina 95 por código postal en ${esc(c.nombre)}</h2>
<div class="tw"><table><thead><tr><th>C. postal</th><th>Gasolineras</th><th>Media €/L</th><th>Desde €/L</th></tr></thead><tbody>
${f.map(x => `<tr><td>${x.cp}</td><td>${x.n}</td><td class="pr">${eur(x.avg)}</td><td class="pr">${eur(x.min)}</td></tr>`).join("\n")}
</tbody></table></div>`;
}
function vecinas(c, cs) {
  if (!Number.isFinite(c.lat)) return [];
  return cs.filter(x => x !== c && Number.isFinite(x.lat)).map(x => ({ x, d: kmEntre(c, x), r: resumen(x.est, "95") })).filter(v => v.r).sort((a, b) => a.d - b.d).slice(0, 6);
}
function tablaCercanas(c, v) {
  const mio = resumen(c.est, "95");
  if (!v.length || !mio) return "";
  return `<h2>¿Y en las ciudades cercanas a ${esc(c.nombre)}?</h2>
<div class="tw"><table><thead><tr><th>Ciudad</th><th>Distancia</th><th>95 desde</th><th>Frente a ${esc(c.nombre)}</th></tr></thead><tbody>
${v.map(({ x, d, r }) => { const dif = r.min - mio.min; return `<tr><td><a href="${x.url}">${esc(x.nombre)}</a></td><td>${Math.max(1, Math.round(d))} km</td><td class="pr">${eur(r.min)}</td><td class="pr">${Math.abs(dif) < 0.0005 ? "igual" : (dif < 0 ? "−" : "+") + eur(Math.abs(dif))}</td></tr>`; }).join("\n")}
</tbody></table></div>
<p class="nota">Precio mínimo de la gasolina 95 (€/L) en cada ciudad y diferencia con el de ${esc(c.nombre)}.</p>`;
}
function parrafo2(c, v, et) {
  const l = c.est, mio = resumen(l, "95");
  if (!mio) return "";
  const p = [];
  const mk = porMarca(l);
  if (mk.length >= 2) { const a = mk[0], b = mk[mk.length - 1]; p.push(`Por marcas, la gasolina 95 sale más barata de media en ${a.m} (${eur(a.avg)} €/L, ${a.n} gasolineras) y más cara en ${b.m} (${eur(b.avg)} €/L).`); }
  const t95 = top(l, "95", 1)[0];
  const t24 = top(l.filter(e => /24\s*H/i.test(e.horario)), "95", 1)[0];
  if (t24 && t95 && t24 !== t95) p.push(`Entre las gasolineras que abren 24 horas, la más barata es ${t24.nombre} (${t24.dir}), a ${eur(t24.p["95"])} €/L.`);
  if (v.length) {
    const mejor = v.filter(({ d, r }) => d <= 20 && r.min < mio.min - 0.015).sort((a, b) => a.r.min - b.r.min)[0];
    if (mejor) { const dif = mio.min - mejor.r.min; p.push(`Si te desplazas a ${mejor.x.nombre}, a ${Math.max(1, Math.round(mejor.d))} km, la gasolina 95 más barata sale a ${eur(mejor.r.min)} €/L: ${eur(dif)} €/L menos, unos ${eur(dif * 50, 2)} € por depósito de 50 litros.`); }
    else if (v.every(({ r }) => r.min >= mio.min - 0.015)) p.push(`${c.nombre} tiene la gasolina 95 más barata de su entorno: entre las ${v.length} ciudades más cercanas ninguna compensa el desplazamiento.`);
  }
  return p.length ? `<p class="ana">${esc(p.join(" "))}</p>` : "";
}
function rankCiudades(p, cs) {
  const l = cs.map(c => ({ c, r: resumen(c.est, "95") })).filter(x => x.r && x.r.n >= 3).sort((a, b) => a.r.avg - b.r.avg);
  if (l.length < 6) return "";
  const li = arr => `<ol class="rk">${arr.map(x => `<li><a href="${x.c.url}">${esc(x.c.nombre)}</a><b>${eur(x.r.avg)} €/L</b></li>`).join("")}</ol>`;
  return `<h2>Ciudades con la gasolina 95 más barata en ${esc(p.name)}</h2>${li(l.slice(0, 5))}<h2>Ciudades con la gasolina 95 más cara en ${esc(p.name)}</h2>${li(l.slice(-5).reverse())}<p class="nota">Precio medio de la gasolina 95 por ciudad, entre las ciudades con más gasolineras de la provincia.</p>`;
}

/* ---------- páginas ---------- */
const urlProv = p => `/gasolineras-baratas/${p.slug}.html`;

function ciudades(p) {
  const m = new Map();
  for (const e of p.est) { if (!e.mkey) continue; const x = m.get(e.mkey) || { key: e.mkey, nombre: e.mun, slug: slug(e.mun), est: [] }; x.est.push(e); m.set(e.mkey, x); }
  const out = [];
  for (const c of m.values()) {
    const leg = LEGADO.find(l => l.prov === p.code && l.ok(c.key));
    if (!leg && c.est.length < MIN_CIUDAD) continue;
    c.url = leg ? `/gasolineras-baratas/${leg.slug}.html` : `/gasolineras-baratas/${p.slug}/${c.slug}.html`;
    const co = c.est.filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lon) && e.lat > 25 && e.lat < 45);
    if (co.length) { c.lat = co.reduce((a, e) => a + e.lat, 0) / co.length; c.lon = co.reduce((a, e) => a + e.lon, 0) / co.length; }
    out.push(c);
  }
  return out.sort((a, b) => b.est.length - a.est.length);
}

function paginaProvincia(p, cs, fecha) {
  const r95 = resumen(p.est, "95"), t95 = top(p.est, "95", 1)[0];
  const et = `en ${p.name}`;
  const title = r95 ? elige(`Gasolineras más baratas hoy en ${p.name}: 95 desde ${eur(r95.min)} €/L`, `Gasolineras baratas hoy en ${p.name}: 95 desde ${eur(r95.min)} €/L`, `Gasolineras baratas hoy en ${p.name}`) : `Gasolineras más baratas hoy en ${p.name}`;
  const desc = `Precios hoy de gasolina 95, 98 y diésel ${et}, actualizados el ${fecha.largo}.${t95 ? ` La gasolina 95 más barata está en ${t95.mun} a ${eur(t95.p["95"])} €/L.` : ""} Compara ${p.est.length} gasolineras.`;
  const faqs = faqsZona(p.name, p.est, fecha.largo, et);
  const mg = migas([{ nombre: "Inicio", url: "/" }, { nombre: "Gasolineras baratas", url: "/gasolineras-baratas.html" }, { nombre: p.name, self: urlProv(p) }]);
  const lista = cs.length ? `<h2>Gasolineras por ciudad en ${esc(p.name)}</h2><ul class="cities">${cs.slice(0, 60).map(c => { const r = resumen(c.est, "95"); return `<li><a href="${c.url}"><span>${esc(c.nombre)}</span><small>${c.est.length} gasolineras${r ? ` · 95 desde ${eur(r.min)}` : ""}</small></a></li>`; }).join("")}</ul>` : "";
  const pop = POPULARES.filter(c => c !== p.code).slice(0, 8).map(c => PROV[c]).map(q => `<a href="${urlProv(q)}">${esc(q.name)}</a>`).join("");
  const html = `${cards(p.est)}
${analisis(p.est, NAC["95"], "España", et)}
${COMB.map(c => tabla(p.est, c, `${c.nombre} ${c.k === "diesel" ? "más barato" : "más barata"} ${et}`)).join("\n")}
${rankCiudades(p, cs)}
${tablaMarcas(p.est, et)}
${lista}
${faqHtml(faqs)}
<div class="cta-s"><h2>Busca por ciudad o cerca de ti</h2><p>Usa el buscador de AhorraFuel para ordenar las gasolineras de ${esc(p.name)} por precio o por distancia.</p><a class="btn p" href="/?provincia=${p.code}&amp;combustible=95#buscar">Buscar gasolineras en ${esc(p.name)}</a></div>
<h2>Otras provincias</h2><div class="chips">${pop}<a href="/gasolineras-baratas.html">Ver todas →</a><a href="/precio-gasolina-hoy.html">Precio hoy en España →</a></div>`;
  return pagina({
    title, desc, path: urlProv(p), h1: `Gasolineras más baratas hoy ${et}`,
    lead: `Ranking de las gasolineras más baratas ${et} para gasolina 95, gasolina 98 y diésel, con datos oficiales de ${p.est.length} estaciones de servicio.`,
    upd: fecha.largo, body: { crumbs: mg.html, html },
    ld: [mg.ld, { "@type": "WebPage", name: title, url: SITE + urlProv(p), dateModified: fecha.iso }, itemList(p.est, COMB[0]), faqLd(faqs)]
  });
}

function paginaCiudad(p, c, cs, fecha) {
  const r95 = resumen(c.est, "95"), t95 = top(c.est, "95", 1)[0];
  const et = `en ${c.nombre}`;
  const zona = c.key === norm(p.name) ? c.nombre : `${c.nombre} (${p.name})`;
  const title = r95 ? elige(`Gasolineras más baratas hoy en ${zona}: 95 desde ${eur(r95.min)} €/L`, `Gasolineras baratas hoy en ${zona}: 95 desde ${eur(r95.min)} €/L`, `Gasolineras baratas hoy en ${c.nombre}: 95 desde ${eur(r95.min)} €/L`) : `Gasolineras más baratas hoy en ${zona}`;
  const desc = `Compara los precios de hoy de gasolina 95, 98 y diésel ${et} (${p.name}), actualizados el ${fecha.largo}.${t95 ? ` La gasolina 95 más barata está a ${eur(t95.p["95"])} €/L.` : ""} ${c.est.length} gasolineras.`;
  const faqs = faqsZona(c.nombre, c.est, fecha.largo, et);
  const mg = migas([{ nombre: "Inicio", url: "/" }, { nombre: "Gasolineras baratas", url: "/gasolineras-baratas.html" }, { nombre: p.name, url: urlProv(p) }, { nombre: c.nombre, self: c.url }]);
  const otras = cs.filter(x => x !== c).slice(0, 8).map(x => `<a href="${x.url}">${esc(x.nombre)}</a>`).join("");
  const rProv = resumen(p.est, "95");
  const v = vecinas(c, cs);
  const html = `${cards(c.est)}
${analisis(c.est, rProv, `la provincia de ${p.name}`, et)}
${parrafo2(c, v, et)}
${COMB.map(k => tabla(c.est, k, `${k.nombre} ${k.k === "diesel" ? "más barato" : "más barata"} ${et}`)).join("\n")}
${tablaMarcas(c.est, et)}
${tablaCP(c)}
${tablaCercanas(c, v)}
${faqHtml(faqs)}
<div class="cta-s"><h2>Busca cerca de ti</h2><p>Ordena las gasolineras por precio o por distancia con el buscador de AhorraFuel.</p><a class="btn p" href="/?provincia=${p.code}&amp;combustible=95#buscar">Buscar gasolineras</a></div>
<h2>Más gasolineras en ${esc(p.name)}</h2><div class="chips"><a href="${urlProv(p)}">Toda la provincia de ${esc(p.name)} →</a>${otras}</div>`;
  return pagina({
    title, desc, path: c.url, h1: `Gasolineras más baratas hoy ${et}`,
    lead: `Precios de gasolina 95, gasolina 98 y diésel ${et}, en la provincia de ${esc(p.name)}, con datos oficiales de ${c.est.length} estaciones de servicio.`,
    upd: fecha.largo, body: { crumbs: mg.html, html },
    ld: [mg.ld, { "@type": "WebPage", name: title, url: SITE + c.url, dateModified: fecha.iso }, itemList(c.est, COMB[0]), faqLd(faqs)]
  });
}

function paginaIndice(provs, fecha) {
  const filas = provs.map(p => { const a = resumen(p.est, "95"), d = resumen(p.est, "diesel"); return `<tr><td><a href="${urlProv(p)}">${esc(p.name)}</a></td><td class="pr">${a ? eur(a.avg) : "–"}</td><td class="pr">${d ? eur(d.avg) : "–"}</td><td>${p.est.length}</td></tr>`; }).join("\n");
  const mg = migas([{ nombre: "Inicio", url: "/" }, { nombre: "Gasolineras baratas", self: "/gasolineras-baratas.html" }]);
  const html = `<h2>Precio medio por provincia</h2>
<div class="tw"><table><thead><tr><th>Provincia</th><th>Gasolina 95 (€/L)</th><th>Diésel (€/L)</th><th>Gasolineras</th></tr></thead><tbody>
${filas}
</tbody></table></div>
<p class="nota">Precios medios calculados con las gasolineras de venta al público de cada provincia. Consulta la ficha de tu provincia para ver el ranking completo y las ciudades.</p>
<div class="cta-s"><h2>¿Prefieres buscar cerca de ti?</h2><p>El buscador de AhorraFuel ordena las gasolineras por precio o por distancia.</p><a class="btn p" href="/#buscar">Abrir el buscador</a></div>
<div class="chips"><a href="/precio-gasolina-hoy.html">Precio de la gasolina hoy en España →</a></div>`;
  return pagina({
    title: "Gasolineras más baratas por provincia | AhorraFuel",
    desc: `Precio medio de la gasolina 95 y el diésel en las 52 provincias de España, actualizado el ${fecha.largo}. Elige tu provincia y compara las gasolineras más baratas.`,
    path: "/gasolineras-baratas.html", h1: "Gasolineras más baratas por provincia",
    lead: "Elige tu provincia para ver el ranking de gasolineras más baratas en gasolina 95, gasolina 98 y diésel, y las ciudades con más estaciones.",
    upd: fecha.largo, body: { crumbs: mg.html, html }, ld: [mg.ld]
  });
}

function paginaNacional(provs, todas, fecha) {
  const mg = migas([{ nombre: "Inicio", url: "/" }, { nombre: "Precio de la gasolina hoy", self: "/precio-gasolina-hoy.html" }]);
  const r95 = resumen(todas, "95"), rd = resumen(todas, "diesel"), r98 = resumen(todas, "98");
  const rank = (k, asc) => provs.map(p => ({ p, r: resumen(p.est, k) })).filter(x => x.r && x.r.n >= 3).sort((a, b) => asc ? a.r.avg - b.r.avg : b.r.avg - a.r.avg).slice(0, 5);
  const lista = (k, asc) => `<ol class="rk">${rank(k, asc).map(x => `<li><a href="${urlProv(x.p)}">${esc(x.p.name)}</a><b>${eur(x.r.avg)} €/L</b></li>`).join("")}</ol>`;
  const faqs = [
    r95 && { q: "¿Cuál es el precio medio de la gasolina 95 hoy en España?", a: `Con los datos oficiales del ${fecha.largo}, la gasolina 95 cuesta de media ${eur(r95.avg)} €/L en España, con precios entre ${eur(r95.min)} y ${eur(r95.max)} €/L.` },
    rd && { q: "¿Cuál es el precio medio del diésel hoy?", a: `El gasóleo A cuesta de media ${eur(rd.avg)} €/L en España según los datos del ${fecha.largo}.` },
    { q: "¿Cómo encuentro la gasolinera más barata de mi zona?", a: "Elige tu provincia o ciudad en AhorraFuel, o usa la opción «Cerca de mí», y ordena las gasolineras por precio o por distancia." }
  ].filter(Boolean);
  const html = `<div class="sumg">${[["Gasolina 95", r95], ["Gasolina 98", r98], ["Diésel", rd]].map(([n, r]) => r ? `<div class="sumc"><span>${n}</span><b>Media ${eur(r.avg)} €/L</b><small>de ${eur(r.min)} a ${eur(r.max)} €/L · ${r.n} gasolineras</small></div>` : "").join("")}</div>
<h2>Provincias con la gasolina 95 más barata</h2>${lista("95", true)}
<h2>Provincias con el diésel más barato</h2>${lista("diesel", true)}
<h2>Provincias con la gasolina 95 más cara</h2>${lista("95", false)}
${COMB.map(c => tabla(todas, c, `${c.nombre}: las gasolineras más baratas de España`)).join("\n")}
${faqHtml(faqs)}
<div class="chips"><a href="/gasolineras-baratas.html">Ver todas las provincias →</a><a href="/#buscar">Abrir el buscador →</a></div>`;
  return pagina({
    title: "Precio de la gasolina y el diésel hoy en España | AhorraFuel",
    desc: `Precio medio hoy de la gasolina 95 (${r95 ? eur(r95.avg) : "–"} €/L) y el diésel (${rd ? eur(rd.avg) : "–"} €/L) en España, con las provincias más baratas. Datos oficiales del ${fecha.largo}.`,
    path: "/precio-gasolina-hoy.html", h1: "Precio de la gasolina y el diésel hoy en España",
    lead: "Precio medio de los combustibles, provincias más baratas y gasolineras con el precio más bajo del país, con datos oficiales actualizados.",
    upd: fecha.largo, body: { crumbs: mg.html, html }, ld: [mg.ld, faqLd(faqs)]
  });
}

const sitemap = (urls, iso) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => ` <url><loc>${SITE}${u}</loc>${u.startsWith("/privacidad") || u.startsWith("/cookies") || u.startsWith("/informacion") || u.startsWith("/condiciones") ? "" : `<lastmod>${iso}</lastmod>`}</url>`).join("\n")}
</urlset>
`;

/* ---------- ejecución ---------- */
const PROV = {};
const data = await cargar();
const fecha = fechaInfo(data.Fecha);
const { provs, total } = agrupar(data);
if (total < MIN_TOTAL) throw new Error(`Solo ${total} gasolineras públicas: no se generan las páginas para no publicar datos incompletos.`);
for (const p of provs) PROV[p.code] = p;
const TODAS = provs.flatMap(p => p.est);
for (const c of COMB) NAC[c.k] = resumen(TODAS, c.k);

const escribir = async (ruta, txt) => { const f = join(OUT, ruta.replace(/^\//, "")); await mkdir(dirname(f), { recursive: true }); await writeFile(f, txt, "utf8"); };
const urls = ["/", "/gasolineras-baratas.html", "/precio-gasolina-hoy.html"];
let nCiudades = 0;
for (const p of provs) {
  if (!p.est.length) continue;
  const cs = ciudades(p);
  await escribir(urlProv(p), paginaProvincia(p, cs, fecha)); urls.push(urlProv(p));
  for (const c of cs) { await escribir(c.url, paginaCiudad(p, c, cs, fecha)); urls.push(c.url); nCiudades++; }
}
await escribir("/gasolineras-baratas.html", paginaIndice(provs.filter(p => p.est.length), fecha));
await escribir("/precio-gasolina-hoy.html", paginaNacional(provs.filter(p => p.est.length), provs.flatMap(p => p.est), fecha));
urls.push("/privacidad.html", "/cookies.html", "/informacion-legal.html", "/condiciones-de-uso.html");
await escribir("/sitemap.xml", sitemap(urls, fecha.iso));
console.log(`OK: ${total} gasolineras · ${provs.filter(p => p.est.length).length} provincias · ${nCiudades} ciudades · ${urls.length} URLs en el sitemap · datos del ${fecha.largo}`);
