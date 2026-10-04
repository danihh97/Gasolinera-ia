/* AhorraFuel · Eventos GA4 para la PWA */
window.afEsPWA = function () {
  return (
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true
  );
};

window.afEventosPendientes = window.afEventosPendientes || [];

window.afEnviarEvento = function (nombre, parametros = {}) {
  if (window.__afGA && typeof window.gtag === "function") {
    window.gtag("event", nombre, parametros);
    return true;
  }

  // Si GA4 todavía no está cargado, guardamos el evento para enviarlo después.
  window.afEventosPendientes.push({
    nombre: nombre,
    parametros: parametros
  });
  return false;
};

window.afEnviarEventosPendientes = function () {
  if (!window.__afGA || typeof window.gtag !== "function") return;

  const pendientes = window.afEventosPendientes.splice(0);

  pendientes.forEach(function (evento) {
    window.gtag("event", evento.nombre, evento.parametros);
  });
};

window.afRegistrarAperturaPWA = function () {
  if (!window.afEsPWA()) return;
  if (sessionStorage.getItem("af_pwa_apertura_enviada") === "1") return;

  if (window.afEnviarEvento("apertura_pwa", { origen: "pwa" })) {
    sessionStorage.setItem("af_pwa_apertura_enviada", "1");
  }
};

window.addEventListener("appinstalled", function () {
  window.afEnviarEvento("instalacion_pwa", { origen: "navegador" });
});
(function(){
  const KEY='ahorrafuel_cookie_consent_v2';
  const GA_ID='G-WYPKB4XJYZ';
  const overlay=document.getElementById('cookieOverlay');
  const banner=document.getElementById('cookieBanner');
  const settings=document.getElementById('cookieSettings');
  const toggle=document.getElementById('analyticsToggle');
  const manage=document.getElementById('cookieManage');
  function read(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){return null}}
  function write(analytics){localStorage.setItem(KEY,JSON.stringify({analytics:!!analytics,savedAt:new Date().toISOString()}))}
  function toggleSet(on){toggle.classList.toggle('on',!!on);toggle.setAttribute('aria-pressed',String(!!on))}
  function openBanner(){overlay.style.display='flex';banner.style.display='block';settings.style.display='none';manage.style.display='none'}
  function openSettings(value){overlay.style.display='flex';banner.style.display='none';settings.style.display='block';toggleSet(!!value);manage.style.display='none'}
  function close(){overlay.style.display='none';manage.style.display='block'}
  function loadGA(){
    if(window.__afGA)return; window.__afGA=true;
    window.dataLayer=window.dataLayer||[]; function gtag(){dataLayer.push(arguments)} window.gtag=gtag;
    gtag('js',new Date()); gtag('config',GA_ID);
    window.afRegistrarAperturaPWA();
    window.afEnviarEventosPendientes();

    const s=document.createElement('script'); s.async=true; s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(GA_ID); document.head.appendChild(s);
  }
  function save(analytics){write(analytics);if(analytics)loadGA();close()}
  document.getElementById('cookieAccept').onclick=()=>save(true);
  document.getElementById('cookieReject').onclick=()=>save(false);
  document.getElementById('cookieConfig').onclick=()=>openSettings(false);
  document.getElementById('settingsReject').onclick=()=>save(false);
  document.getElementById('settingsSave').onclick=()=>save(toggle.classList.contains('on'));
  toggle.onclick=()=>toggleSet(!toggle.classList.contains('on'));
  manage.onclick=()=>{const c=read();openSettings(c?c.analytics:false)};
  const consent=read();
  if(!consent)openBanner();else{manage.style.display='block';if(consent.analytics)loadGA()}
})();
;
let ubicacionUsuario = null;
let modoBusqueda = "provincia";


/* =========================
   OBTENER UBICACIÓN
========================= */

function usarUbicacion() {
  // Evento GA4: búsqueda usando ubicación
  if (typeof window.afEnviarEvento === "function") {
    window.afEnviarEvento("busqueda_cerca", {
      origen: "boton_cerca"
    });
  }


  modoBusqueda = "cerca";
  const provinceSelect = document.getElementById("province");
  if (provinceSelect) provinceSelect.value = "";

  const button =
    document.getElementById("locationButton");

  const status =
    document.getElementById("locationStatus");


  if (!navigator.geolocation) {

    status.textContent =
      "❌ Tu dispositivo no permite obtener la ubicación.";

    return;
  }


  button.disabled = true;

  button.textContent =
    "📍 Obteniendo ubicación...";

  status.textContent =
    "Permite el acceso a tu ubicación.";


  navigator.geolocation.getCurrentPosition(

    function(position) {

      ubicacionUsuario = {

        lat:
          position.coords.latitude,

        lon:
          position.coords.longitude

      };


      button.disabled = false;

      button.textContent =
        "✅ Ubicación activada";


      status.textContent =
        "Ubicación obtenida. Buscando gasolineras cercanas automáticamente...";

      // Buscar automáticamente al obtener la ubicación.
      buscar();

    },


    function(error) {

      console.error(error);

      ubicacionUsuario = null;
      modoBusqueda = "provincia";

      button.disabled = false;

      button.textContent =
        "📍 Buscar gasolineras cerca de mí";


      status.textContent =
        "❌ No se pudo obtener tu ubicación.";

    },

    {

      enableHighAccuracy: true,

      timeout: 10000,

      maximumAge: 60000

    }

  );

}


/* =========================
   BUSCAR GASOLINERAS
========================= */

function mostrarMensajeRecopilando() {
  const bubble = document.getElementById("afMascotBubble");
  if (!bubble) return;

  bubble.innerHTML = `
    ⛽ <strong>Estamos recopilando los precios de las gasolineras...</strong><br>
    🔎 Estamos consultando y comparando los precios disponibles para encontrar las opciones más baratas para ti. Puede tardar unos segundos. 💚<br>
    <strong>¡Gracias por esperar!</strong>
  `;

  bubble.classList.remove("af-bubble-leaving");
}

function mostrarMensajeResultados() {
  const bubble = document.getElementById("afMascotBubble");
  if (!bubble) return;

  bubble.innerHTML = `
    💚 <strong>¡Gracias por confiar en AhorraFuel!</strong><br>
    ⛽ Esperamos que te sea de gran ayuda y que encuentres siempre los mejores precios.<br>
    <strong>¡Ahorra en cada repostaje! 🚗💨</strong>
  `;
}

function normalizarProvincia(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^(provincia|province)\s+(de|of)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buscarOpcionProvincia(nombre) {
  const select = document.getElementById("province");
  if (!select || !nombre) return null;
  const objetivo = normalizarProvincia(nombre);
  const aliases = {
    "araba": "alava",
    "gipuzkoa": "guipuzcoa",
    "bizkaia": "vizcaya",
    "illes balears": "baleares",
    "islas baleares": "baleares",
    "principado de asturias": "asturias",
    "palmas": "las palmas"
  };
  const canon = aliases[objetivo] || objetivo;
  return Array.from(select.options).find(opt => {
    const text = normalizarProvincia(opt.textContent);
    const textCanon = aliases[text] || text;
    return textCanon === canon || textCanon.includes(canon) || canon.includes(textCanon);
  }) || null;
}

function provinciaCanariasPorCoordenadas(lat, lon) {
  // Último respaldo si el servicio de geocodificación solo devuelve "Canarias".
  if (lat >= 27.55 && lat <= 29.45 && lon >= -15.1 && lon <= -13.0) {
    return buscarOpcionProvincia("Las Palmas");
  }
  if (lat >= 27.55 && lat <= 29.5 && lon >= -18.2 && lon < -15.1) {
    return buscarOpcionProvincia("Santa Cruz de Tenerife");
  }
  return null;
}

async function obtenerProvinciaPorUbicacion() {
  if (!ubicacionUsuario) return null;
  const lat = Math.round(ubicacionUsuario.lat * 100) / 100, lon = Math.round(ubicacionUsuario.lon * 100) / 100;

  // Primero BigDataCloud: suele devolver directamente la provincia.
  try {
    const response = await fetch(
      "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" +
      encodeURIComponent(lat) +
      "&longitude=" +
      encodeURIComponent(lon) +
      "&localityLanguage=es",
      { headers: { "Accept": "application/json" } }
    );
    if (response.ok) {
      const data = await response.json();
      const admin = Array.isArray(data?.localityInfo?.administrative)
        ? data.localityInfo.administrative : [];
      const candidatos = [
        data?.principalSubdivision,
        data?.cityInfo?.administrativeArea?.name,
        ...admin.map(x => x?.name)
      ].filter(Boolean);
      for (const candidato of candidatos) {
        const option = buscarOpcionProvincia(candidato);
        if (option) return option;
      }
    }
  } catch (error) {
    console.warn("BigDataCloud no disponible:", error);
  }

  // Respaldo con Nominatim.
  try {
    const response = await fetch(
      "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" +
      encodeURIComponent(lat) +
      "&lon=" + encodeURIComponent(lon) +
      "&zoom=10&addressdetails=1",
      { headers: { "Accept": "application/json", "Accept-Language": "es" } }
    );
    if (response.ok) {
      const data = await response.json();
      const address = data?.address || {};
      for (const candidato of [address.province, address.state, address.region].filter(Boolean)) {
        const option = buscarOpcionProvincia(candidato);
        if (option) return option;
      }
    }
  } catch (error) {
    console.warn("Nominatim no disponible:", error);
  }

  return provinciaCanariasPorCoordenadas(lat, lon);
}

async function buscarCercaDeMi(provinciaActual, producto) {
  // En modo ubicación ignoramos cualquier provincia seleccionada previamente.
  // La posición GPS siempre tiene prioridad.

  const option = await obtenerProvinciaPorUbicacion();
  if (!option) {
    throw new Error("No se pudo determinar automáticamente tu provincia. Vuelve a intentar la búsqueda por ubicación.");
  }
  const select = document.getElementById("province");
  if (select) select.value = option.value;
  return option.value;
}

async function buscar() {
  // Evento GA4: búsqueda de combustible
  if (typeof window.afEnviarEvento === "function") {
    window.afEnviarEvento("busqueda_combustible", {
      modo: (typeof modoBusqueda !== "undefined" && modoBusqueda === "cerca") ? "cerca" : "provincia"
    });
  }


  mostrarMensajeRecopilando();

  let provincia =
    document.getElementById("province").value;

  if (modoBusqueda === "cerca" && ubicacionUsuario) {
    try {
      provincia = await buscarCercaDeMi(provincia, document.getElementById("fuel").value);
    } catch (error) {
      const results = document.getElementById("results");
      results.innerHTML = `<div class="error">📍 ${error.message}</div>`;
      const button = document.getElementById("searchButton");
      button.disabled = false;
      button.textContent = "🔎 Buscar gasolineras";
      return;
    }
  }

  if (!provincia && modoBusqueda !== "cerca") {
    const results = document.getElementById("results");
    results.innerHTML = `
      <div class="af-collecting" role="status" aria-live="polite">
        <span class="af-collecting-icon">⛽</span>
        <div class="af-collecting-title">Estamos recopilando los precios de las gasolineras...</div>
        <div class="af-collecting-text">🔎 Estamos consultando y comparando los precios disponibles para encontrar las opciones más baratas para ti. Puede tardar unos segundos. 💚</div>
        <div class="af-collecting-thanks">¡Gracias por esperar!</div>
      </div>
    `;
    return;
  }

  const producto =
    document.getElementById("fuel").value;

  const button =
    document.getElementById("searchButton");

  const results =
    document.getElementById("results");


  button.disabled = true;

  button.textContent =
      "⏳ Recopilando precios...";


  results.innerHTML = `
    <div class="af-collecting" role="status" aria-live="polite">
      <span class="af-collecting-icon">⛽</span>
      <div class="af-collecting-title">
        Estamos recopilando los precios de las gasolineras...
      </div>
      <div class="af-collecting-text">
        🔎 Estamos consultando y comparando los precios disponibles
        para encontrar las opciones más baratas para ti.
        Puede tardar unos segundos. 💚
      </div>
      <div class="af-collecting-thanks">¡Gracias por esperar!</div>
    </div>
  `;


  try {

    const url =
      "/api/gasolineras" +
      "?provincia=" +
      encodeURIComponent(provincia) +
      "&producto=" +
      encodeURIComponent(producto);


    const response =
      await fetch(url);


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(

        data.error ||
        "Error obteniendo los precios"

      );

    }


    let estaciones =
      data.estaciones || [];


    if (estaciones.length === 0) {

      results.innerHTML = `

        <div class="error">

          ❌ No encontramos gasolineras
          para esta provincia y combustible.

        </div>

      `;

      return;

    }


    /* =========================
       CALCULAR DISTANCIAS
    ========================= */

    if (ubicacionUsuario) {

      estaciones =
        estaciones.map(
          estacion => {

            const lat =
              parseFloat(
                String(
                  estacion.latitud || ""
                )
                .replace(",", ".")
              );


            const lon =
              parseFloat(
                String(
                  estacion.longitud || ""
                )
                .replace(",", ".")
              );


            if (
              isNaN(lat) ||
              isNaN(lon)
            ) {

              return {

                ...estacion,

                distancia: null

              };

            }


            return {

              ...estacion,

              distancia:
                calcularDistancia(
                  ubicacionUsuario.lat,
                  ubicacionUsuario.lon,
                  lat,
                  lon
                )

            };

          }
        );


      /* Ordenar por distancia */

      estaciones.sort(
        (a, b) => {

          if (
            a.distancia === null
          ) return 1;

          if (
            b.distancia === null
          ) return -1;

          return (
            a.distancia -
            b.distancia
          );

        }
      );

      /* Radio máximo de "Cerca de mí": 30 km */

      estaciones = estaciones.filter(
        estacion =>
          estacion.distancia !== null &&
          typeof estacion.distancia === "number" &&
          estacion.distancia <= 30
      );

      if (estaciones.length === 0) {

        results.innerHTML = `

          <div class="error">

            📍 No encontramos gasolineras
            en un radio de 30 km de tu ubicación.

          </div>

        `;

        button.disabled = false;
        button.textContent = "🔎 Buscar";

        return;

      }

    } else {

      /* Ordenar por precio */

      estaciones.sort(
        (a, b) =>
          a.precio - b.precio
      );

    }


    /* =========================
       PRECIO MEDIO
    ========================= */

    const precios =
      estaciones
        .map(
          estacion =>
            estacion.precio
        )
        .filter(
          precio =>
            typeof precio === "number"
        );


    const precioMedio =
      precios.reduce(
        (a, b) => a + b,
        0
      ) / precios.length;


    /* =========================
       RANKING PRECIO + DISTANCIA
    ========================= */

    const estacionesConPrecio =
      estaciones.filter(
        estacion =>
          typeof estacion.precio === "number"
      );

    const mejorPrecio =
      [...estacionesConPrecio]
        .sort(
          (a, b) =>
            a.precio - b.precio
        )[0];

    const masCercana =
      ubicacionUsuario
        ? [...estaciones]
            .filter(
              estacion =>
                estacion.distancia !== null &&
                typeof estacion.distancia === "number"
            )
            .sort(
              (a, b) =>
                a.distancia - b.distancia
            )[0]
        : null;

    /*
      "Más barata cerca" se mantiene como cálculo interno para la
      mejor opción; la tarjeta pública muestra la más barata de todas.
    */

    const diezMasCercanas =
      ubicacionUsuario
        ? [...estaciones]
            .filter(
              estacion =>
                estacion.distancia !== null &&
                typeof estacion.distancia === "number" &&
                typeof estacion.precio === "number"
            )
            .sort(
              (a, b) =>
                a.distancia - b.distancia
            )
            .slice(0, 10)
        : [];

    const masBarataCerca =
      diezMasCercanas.length
        ? [...diezMasCercanas]
            .sort(
              (a, b) =>
                a.precio - b.precio
            )[0]
        : mejorPrecio;

    /*
      "Mejor opción":
      equilibrio entre precio y distancia dentro
      de las 10 más cercanas.
      Se normalizan ambos factores para que
      euros/litro y kilómetros sean comparables.
    */

    let mejorOpcion =
      masBarataCerca || mejorPrecio;

    if (diezMasCercanas.length > 1) {

      const preciosCerca =
        diezMasCercanas.map(
          estacion => estacion.precio
        );

      const distanciasCerca =
        diezMasCercanas.map(
          estacion => estacion.distancia
        );

      const minPrecio =
        Math.min(...preciosCerca);

      const maxPrecio =
        Math.max(...preciosCerca);

      const minDistancia =
        Math.min(...distanciasCerca);

      const maxDistancia =
        Math.max(...distanciasCerca);

      mejorOpcion =
        [...diezMasCercanas]
          .map(estacion => {

            const precioNormalizado =
              maxPrecio === minPrecio
                ? 0
                : (estacion.precio - minPrecio) /
                  (maxPrecio - minPrecio);

            const distanciaNormalizada =
              maxDistancia === minDistancia
                ? 0
                : (estacion.distancia - minDistancia) /
                  (maxDistancia - minDistancia);

            return {
              estacion,
              puntuacion:
                (precioNormalizado * 0.6) +
                (distanciaNormalizada * 0.4)
            };

          })
          .sort(
            (a, b) =>
              a.puntuacion - b.puntuacion
          )[0].estacion;

    }

    const ahorroPorLitro =
      precioMedio -
      mejorPrecio.precio;


    /* =========================
       TARJETAS SUPERIORES
    ========================= */

    if (
      ubicacionUsuario &&
      masCercana
    ) {

      results.innerHTML = `

        <div class="option-grid">

          <div class="option-card">

            <div class="option-label">
              💰 MÁS BARATA
            </div>

            <div class="option-price">
              ${mejorPrecio.precio.toFixed(3)} €/L
            </div>

            <div class="option-name">
              ${escapeHtml(mejorPrecio.nombre)}
            </div>

            <div class="option-distance">
              ${
                mejorPrecio.distancia !== null
                  ? `🚗 ${formatearDistancia(mejorPrecio.distancia)}`
                  : ""
              }
            </div>

          </div>


          <div class="option-card">

            <div class="option-label">
              📍 MÁS CERCANA
            </div>

            <div class="option-price">
              ${masCercana.precio.toFixed(3)} €/L
            </div>

            <div class="option-name">
              ${escapeHtml(masCercana.nombre)}
            </div>

            <div class="option-distance">
              🚗 ${formatearDistancia(masCercana.distancia)}
            </div>

          </div>

        </div>

      `;

    } else {

      results.innerHTML = `

        <div class="best-card">

          <div class="best-label">
            🏆 MEJOR PRECIO
          </div>

          <div class="best-price">
            ${mejorPrecio.precio.toFixed(3)} €/L
          </div>

          <div class="best-name">
            ${escapeHtml(mejorPrecio.nombre)}
          </div>

          <div class="best-location">
            📍 ${escapeHtml(mejorPrecio.localidad)}
          </div>

          <div class="saving">

            ${
              ahorroPorLitro > 0
                ? `Está ${ahorroPorLitro.toFixed(3)} €/L por debajo del precio medio.`
                : `Es el precio más bajo encontrado.`
            }

          </div>

        </div>

      `;

    }


    /* =========================
       RESUMEN
    ========================= */

    results.innerHTML += `

      <div class="summary">

        <div class="summary-main">

          ⛽ ${
            estaciones.length
          }
          gasolineras encontradas

        </div>


        <div class="summary-info">

          Precio medio:
          ${
            precioMedio.toFixed(3)
          } €/L

          <br>

          🕐 Actualizado:
          ${
            data.fecha ||
            "No disponible"
          }

          <br>

          ${
            ubicacionUsuario

              ?

              "📍 Ordenadas por cercanía"

              :

              "💰 Ordenadas por precio"

          }

        </div>

      </div>

    `;


    /* =========================
       LISTA DE GASOLINERAS
    ========================= */

    /*
      Colores de precio:
      25% más baratos = verde
      50% intermedios = amarillo
      25% más caros = rojo
    */

    const preciosOrdenados =
      [...estacionesConPrecio]
        .map(estacion => estacion.precio)
        .sort((a, b) => a - b);

    const indiceVerde =
      Math.max(
        0,
        Math.ceil(preciosOrdenados.length * 0.25) - 1
      );

    const indiceRojo =
      Math.min(
        preciosOrdenados.length - 1,
        Math.floor(preciosOrdenados.length * 0.75)
      );

    const umbralVerde =
      preciosOrdenados.length
        ? preciosOrdenados[indiceVerde]
        : null;

    const umbralRojo =
      preciosOrdenados.length
        ? preciosOrdenados[indiceRojo]
        : null;


    estaciones.forEach(
      (estacion, index) => {

        let mapa = "#";


        if (

          estacion.latitud &&
          estacion.longitud

        ) {

          const latMapa =
            String(
              estacion.latitud
            )
            .replace(",", ".");


          const lonMapa =
            String(
              estacion.longitud
            )
            .replace(",", ".");


          mapa =
            "https://www.google.com/maps/search/?api=1&query=" +

            encodeURIComponent(

              latMapa +
              "," +
              lonMapa

            );

        }


        let posicion;

        if (ubicacionUsuario) {

          posicion =
            index === 0
              ? "📍 MÁS CERCANA"
              : "#" + (index + 1);

        } else {

          if (index === 0) {

            posicion = "🥇 MÁS BARATA";

          } else if (index === 1) {

            posicion = "🥈 SEGUNDA MÁS BARATA";

          } else if (index === 2) {

            posicion = "🥉 TERCERA MÁS BARATA";

          } else {

            posicion = "#" + (index + 1);

          }

        }


        results.innerHTML += `

          <div class="station">

            <div class="station-top">

              <div>

                <div class="position">

                  ${posicion}

                </div>


                <div class="station-name">

                  ${
                    escapeHtml(
                      estacion.nombre
                    )
                  }

                </div>

              </div>


              <div class="price-wrap">

                <div class="price ${
                  umbralVerde !== null &&
                  estacion.precio <= umbralVerde
                    ? "good"
                    : (
                      umbralRojo !== null &&
                      estacion.precio >= umbralRojo
                        ? "bad"
                        : "medium"
                    )
                }">

                  ${
                    estacion.precio.toFixed(3)
                  }

                  <span class="price-unit">

                    €/L

                  </span>

                </div>

                <div>

                  ${
                    mejorPrecio &&
                    estacion.precio === mejorPrecio.precio
                      ?
                      `
                        <span class="price-badge good">
                          💰 MÁS BARATA
                        </span>
                      `
                      :
                      ""
                  }

                  ${
                    preciosOrdenados.length > 1 &&
                    estacion.precio === preciosOrdenados[preciosOrdenados.length - 1]
                      ?
                      `
                        <span class="price-badge bad">
                          💸 MÁS CARA
                        </span>
                      `
                      :
                      ""
                  }

                </div>

              </div>

            </div>


            <div class="station-info">

              📍 ${
                escapeHtml(
                  estacion.direccion
                )
              }

              <br>

              ${
                escapeHtml(
                  estacion.localidad
                )
              }

            </div>


            ${
              ubicacionUsuario &&
              estacion.distancia !== null

              ?

              `

                <div class="distance">

                  🚗 ${
                    formatearDistancia(
                      estacion.distancia
                    )
                  }

                </div>

              `

              :

              ""

            }


            ${
              mapa !== "#"

              ?

              `

                <a

                  class="map-button"

                  href="${mapa}"

                  target="_blank"

                  rel="noopener noreferrer"

                >

                  🗺️ Cómo llegar

                </a>

              `

              :

              ""

            }

          </div>

        `;

      }

    );

    mostrarMensajeResultados();


  } catch (error) {

    console.error(error);


    results.innerHTML = `

      <div class="error">

        ❌ No se ha podido realizar
        la búsqueda.

        <br><br>

        ${
          escapeHtml(
            error.message
          )
        }

      </div>

    `;

  } finally {

    button.disabled = false;

    button.textContent =
      "🔎 Buscar gasolineras";

  }

}


/* =========================
   DISTANCIA
========================= */

function calcularDistancia(
  lat1,
  lon1,
  lat2,
  lon2
) {

  const R = 6371;


  const dLat =
    gradosARadianes(
      lat2 - lat1
    );


  const dLon =
    gradosARadianes(
      lon2 - lon1
    );


  const a =

    Math.sin(dLat / 2) *
    Math.sin(dLat / 2)

    +

    Math.cos(
      gradosARadianes(lat1)
    )

    *

    Math.cos(
      gradosARadianes(lat2)
    )

    *

    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);


  const c =
    2 *

    Math.atan2(

      Math.sqrt(a),

      Math.sqrt(1 - a)

    );


  return R * c;

}


function gradosARadianes(
  grados
) {

  return grados *
    Math.PI /
    180;

}


/* =========================
   DISTANCIA BONITA
========================= */

function formatearDistancia(
  distancia
) {

  if (
    distancia < 1
  ) {

    return (

      Math.round(
        distancia * 1000
      )

      +

      " m"

    );

  }


  return (

    distancia.toFixed(1)

    +

    " km"

  );

}


/* =========================
   SEGURIDAD
========================= */

function escapeHtml(
  text
) {

  return String(
    text || ""
  )

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );

}
;
function ensureAfMenuOnlyInicio(){
  const menu=document.getElementById('afMenu');
  if(!menu)return;
  menu.innerHTML='<a href="/">Inicio</a>';
}
ensureAfMenuOnlyInicio();

function toggleAfMenu(){
  const menu=document.getElementById('afMenu');
  const btn=document.querySelector('.af-menu-button');
  if(!menu||!btn)return;
  ensureAfMenuOnlyInicio();
  const open=menu.classList.toggle('open');
  btn.setAttribute('aria-expanded',String(open));
}
document.addEventListener('click',function(e){
  const menu=document.getElementById('afMenu');
  const btn=document.querySelector('.af-menu-button');
  if(menu && btn && menu.classList.contains('open') && !menu.contains(e.target) && !btn.contains(e.target)){
    menu.classList.remove('open'); btn.setAttribute('aria-expanded','false');
  }
});
;
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then(() => {
        console.log("AhorraFuel PWA: Service Worker registrado");
      })
      .catch((error) => {
        console.error("AhorraFuel PWA: error registrando Service Worker", error);
      });
  });
}
;
(function(){
  function placePwaAfterResults(){
    const results = document.getElementById("results");
    const pwaWrap = document.querySelector(".af-pwa-install-wrap");
    if(!results || !pwaWrap) return;
    if(results.nextElementSibling !== pwaWrap){
      results.parentNode.insertBefore(pwaWrap, results.nextSibling);
    }
  }
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", placePwaAfterResults);
  }else{
    placePwaAfterResults();
  }
})();
;
(function(){
  const card=document.getElementById("afPwaInstallCard");
  const button=document.getElementById("afPwaInstallButton");
  const modal=document.getElementById("afPwaInstallModal");
  const content=document.getElementById("afPwaModalContent");
  const close=document.getElementById("afPwaModalClose");
  if(!card||!button)return;
  let deferredPrompt=null;
  let installEventSent=false;

  function isStandalone(){
    const standaloneModes = [
      "(display-mode: standalone)",
      "(display-mode: fullscreen)",
      "(display-mode: minimal-ui)"
    ];

    const mediaStandalone = standaloneModes.some(function(mode){
      return window.matchMedia && window.matchMedia(mode).matches;
    });

    return mediaStandalone || window.navigator.standalone === true;
  }
  function isIOS(){return /iphone|ipad|ipod/i.test(window.navigator.userAgent||"");}
  function isAndroid(){return /android/i.test(window.navigator.userAgent||"");}
  function isSafari(){
    const ua=window.navigator.userAgent||"";
    return /safari/i.test(ua)&&!/crios|fxios|edgios|chrome|android/i.test(ua);
  }
  function showCard(){
    if(isStandalone()){
      card.style.display="none";
      const wrap=card.closest(".af-pwa-install-wrap");
      if(wrap) wrap.style.display="none";
      return;
    }

    const wrap=card.closest(".af-pwa-install-wrap");
    if(wrap) wrap.style.display="block";
    card.style.display="block";
  }
  function openModal(type){
    if(!modal||!content)return;
    if(type==='ios'){
      content.innerHTML=`
        <h2 id="afPwaModalTitle" class="af-pwa-modal-title">Instala AhorraFuel en tu iPhone</h2>
        <p class="af-pwa-modal-subtitle">No necesitas descargar nada de la App Store. Hazlo desde Safari en unos segundos.</p>
        <div class="af-pwa-step"><div class="af-pwa-step-num">1</div><div><strong>Pulsa Compartir</strong><p>En Safari, toca el botón <b>Compartir</b> de la barra inferior.</p><div class="af-pwa-visual"><span class="af-pwa-share-demo"><span class="share-icon">↑</span> Compartir</span></div></div></div>
        <div class="af-pwa-step"><div class="af-pwa-step-num">2</div><div><strong>Añadir a pantalla de inicio</strong><p>Busca y pulsa <b>“Añadir a pantalla de inicio”</b>.</p><div class="af-pwa-visual"><span class="af-pwa-home-demo"><span class="home-icon"></span> Añadir a pantalla de inicio</span></div></div></div>
        <div class="af-pwa-step"><div class="af-pwa-step-num">3</div><div><strong>Pulsa “Añadir”</strong><p>Confirma y encontrarás AhorraFuel junto a tus aplicaciones.</p></div></div>
        <div class="af-pwa-modal-note">💚 Después podrás abrir AhorraFuel directamente desde el icono, como una aplicación.</div>`;
    }else{
      content.innerHTML=`
        <h2 id="afPwaModalTitle" class="af-pwa-modal-title">Instala AhorraFuel en tu móvil</h2>
        <p class="af-pwa-modal-subtitle">Tu navegador te mostrará la opción para instalar AhorraFuel en la pantalla de inicio.</p>
        <div class="af-pwa-step"><div class="af-pwa-step-num">1</div><div><strong>Pulsa “Instalar”</strong><p>Confirma la instalación cuando aparezca la ventana del navegador.</p></div></div>
        <div class="af-pwa-step"><div class="af-pwa-step-num">2</div><div><strong>Confirma</strong><p>Acepta la instalación de AhorraFuel.</p></div></div>
        <div class="af-pwa-step"><div class="af-pwa-step-num">3</div><div><strong>Ya está</strong><p>Encontrarás AhorraFuel en la pantalla de inicio de tu móvil.</p></div></div>
        <div class="af-pwa-modal-note">Si tu navegador no muestra la ventana automáticamente, abre su menú y busca <b>“Instalar aplicación”</b> o <b>“Añadir a pantalla de inicio”</b>.</div>`;
    }
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
  }
  function closeModal(){if(!modal)return;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');}

  window.addEventListener("beforeinstallprompt",function(event){
    event.preventDefault(); deferredPrompt=event; showCard();
  });

  button.addEventListener("click",async function(){
    if(deferredPrompt){
      deferredPrompt.prompt();
      const result=await deferredPrompt.userChoice;
      if(result&&result.outcome==="accepted"){
        card.style.display="none";
      }
      deferredPrompt=null;
      return;
    }
    if(isIOS()&&isSafari()){
      openModal('ios');
      if(typeof window.afEnviarEvento==="function") window.afEnviarEvento("inicio_instalacion_pwa",{origen:"ios"});
      return;
    }
    openModal(isAndroid()?'android':'generic');
    if(typeof window.afEnviarEvento==="function") window.afEnviarEvento("inicio_instalacion_pwa",{origen:isAndroid()?'android':'otro'});
  });

  if(close)close.addEventListener('click',closeModal);
  if(modal)modal.addEventListener('click',function(e){if(e.target.classList.contains('af-pwa-modal-backdrop'))closeModal();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal();});
  window.addEventListener("appinstalled",function(){
    card.style.display="none";
    closeModal();
    if(!installEventSent&&typeof window.afEnviarEvento==="function"){
      installEventSent=true;
      window.afEnviarEvento("instalacion_pwa",{origen:"navegador"});
    }
  });
  function hideIfPWA(){
    if(!isStandalone()) return false;
    card.style.display="none";
    const wrap=card.closest(".af-pwa-install-wrap");
    if(wrap) wrap.style.display="none";
    if(modal) closeModal();
    return true;
  }

  window.addEventListener("load",function(){
    if(!hideIfPWA()) showCard();
  });

  window.addEventListener("pageshow",function(){
    hideIfPWA();
  });
})();
;
document.querySelectorAll('.seo-keyword[data-fuel],.seo-keyword[data-near]').forEach(function(b){b.addEventListener('click',function(){var c=document.querySelector('.search-card');if(b.dataset.fuel){var f=document.getElementById('fuel');if(f){f.value=b.dataset.fuel;var rr=document.querySelector('input[name="f"][value="'+b.dataset.fuel+'"]');if(rr)rr.checked=true}}if(c)c.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});var x=b.dataset.near?document.querySelector('button[onclick="usarUbicacion()"]'):document.getElementById('province');if(x)setTimeout(function(){x.focus({preventScroll:true})},350)})});
;(function(){var f=document.getElementById("fuel");if(!f)return;document.querySelectorAll('input[name="f"]').forEach(function(r){r.addEventListener("change",function(){f.value=r.value;f.dispatchEvent(new Event("change",{bubbles:true}))})})})();
;(function(){var q=new URLSearchParams(location.search),c=q.get("combustible"),a=q.get("accion");if(!c&&!a)return;window.__afAtajo=true;
function go(){var f=document.getElementById("fuel");if(c&&f&&/^(95|98|diesel)$/.test(c)){f.value=c;var r=document.querySelector('input[name="f"][value="'+c+'"]');if(r)r.checked=true}
if(a==="cerca"&&typeof usarUbicacion==="function")usarUbicacion();history.replaceState(null,"",location.pathname)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",go);else go()})();

;(function(){
if(!document.documentElement.classList.contains("is-app"))return;
var $=function(s,r){return(r||document).querySelector(s)},res=$("#results"),card=$("#buscar"),prov=$("#province"),fuel=$("#fuel");
if(!res||!card||!prov)return;
function vib(){try{navigator.vibrate&&navigator.vibrate(8)}catch(e){}}
function ico(p){return'<svg class="i" viewBox="0 0 24 24" aria-hidden="true">'+p+'</svg>'}
function add(h){var d=document.createElement("div");d.innerHTML=h;var e=d.firstElementChild;document.body.appendChild(e);return e}
function near(){return typeof modoBusqueda!=="undefined"&&modoBusqueda!=="provincia"}
var REF='<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>';
// Barra resumen: sustituye al formulario cuando ya hay resultados
var sum=document.createElement("div");sum.className="app-summary";sum.hidden=true;sum.innerHTML='<div><b></b><span></span></div><button type="button">Cambiar</button>';card.parentNode.insertBefore(sum,card);
function showForm(){card.classList.remove("is-collapsed");sum.hidden=true}
sum.lastChild.onclick=function(){vib();showForm();card.scrollIntoView({behavior:"smooth",block:"start"})};
// Barra de pestañas inferior
var bar=add('<nav class="tabbar" aria-label="Navegación de la app"><button type="button" class="tab">'+ico('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>')+'Buscar</button><button type="button" class="tab">'+ico('<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>')+'Cerca</button><button type="button" class="tab">'+ico('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>')+'Más</button></nav>'),tabs=bar.querySelectorAll(".tab");
function setTab(i){tabs.forEach(function(t,k){k===i?t.setAttribute("aria-current","page"):t.removeAttribute("aria-current")})}
setTab(0);
tabs[0].onclick=function(){vib();setTab(0);showForm();window.scrollTo({top:0,behavior:"smooth"})};
tabs[1].onclick=function(){vib();setTab(1);if(typeof usarUbicacion==="function")usarUbicacion()};
tabs[2].onclick=function(){vib();bg.classList.add("open");sh.classList.add("open")};
// Hoja "Más": enlaces legales y compartir
var legal=[].map.call(document.querySelectorAll("footer .wrap > div:nth-child(3) a"),function(a){return'<a href="'+a.getAttribute("href")+'">'+a.textContent+'</a>'}).join("");
var bg=add('<div class="sheet-bg"></div>'),sh=add('<div class="sheet" role="dialog" aria-modal="true" aria-label="Más opciones">'+(navigator.share?'<button type="button" data-share>Compartir AhorraFuel</button>':"")+legal+'<button type="button" data-cookies>Preferencias de cookies</button><button type="button" data-close>Cerrar</button></div>');
function closeSheet(){bg.classList.remove("open");sh.classList.remove("open")}
bg.onclick=closeSheet;
sh.addEventListener("click",function(e){var t=e.target.closest("button,a");if(!t)return;if(t.hasAttribute("data-close"))closeSheet();if(t.hasAttribute("data-cookies")){closeSheet();var ck=document.getElementById("cookieManage");if(ck)ck.click()}if(t.hasAttribute("data-share"))navigator.share({title:"AhorraFuel",text:"Gasolineras más baratas de España",url:location.origin}).catch(function(){})});
// Botón actualizar en la cabecera y tirar para actualizar
var rb=document.createElement("button");rb.type="button";rb.className="hdr-btn";rb.hidden=true;rb.setAttribute("aria-label","Actualizar precios");rb.innerHTML=ico(REF);$("header .wrap").appendChild(rb);
function refresh(){vib();if(near()){if(typeof usarUbicacion==="function")usarUbicacion()}else if(prov.value&&typeof buscar==="function")buscar()}
rb.onclick=refresh;
var ptr=add('<div class="ptr" aria-hidden="true">'+ico(REF)+'</div>'),sy=0,pl=0,on=false;
function rst(){on=false;pl=0;ptr.style.transform="";ptr.style.opacity=0;ptr.classList.remove("ready")}
document.addEventListener("touchstart",function(e){on=!sum.hidden&&window.scrollY<=0&&e.touches.length===1&&!sh.classList.contains("open");if(on)sy=e.touches[0].clientY},{passive:true});
document.addEventListener("touchmove",function(e){if(!on)return;pl=e.touches[0].clientY-sy;if(pl>0&&window.scrollY<=0){ptr.style.transform="translateY("+(Math.min(pl*.45,64)-60)+"px) rotate("+pl*2+"deg)";ptr.style.opacity=Math.min(pl/90,1);ptr.classList.toggle("ready",pl>110)}else rst()},{passive:true});
document.addEventListener("touchend",function(){var go=on&&pl>110;rst();if(go)refresh()});
// Estado de conexión y aviso de versión nueva
var off=add('<div class="offline-pill" role="status" hidden>Sin conexión · los precios pueden no estar al día</div>');
function net(){off.hidden=navigator.onLine}net();addEventListener("online",net);addEventListener("offline",net);
var toast=add('<div class="toast" role="status" hidden><span>Hay una versión nueva de AhorraFuel</span><button type="button">Actualizar</button></div>');
toast.lastChild.onclick=function(){location.reload()};
if("serviceWorker"in navigator){var had=!!navigator.serviceWorker.controller;navigator.serviceWorker.addEventListener("controllerchange",function(){if(had)toast.hidden=false;had=true})}
// Al aparecer resultados: se pliega el formulario y se guarda la última búsqueda (solo provincia y combustible)
new MutationObserver(function(){
  if(!$(".station",res))return;
  var r=$('input[name="f"]:checked'),o=prov.selectedOptions[0];
  sum.firstChild.firstChild.textContent=r?r.nextElementSibling.textContent:"";
  sum.firstChild.lastChild.textContent=near()?"Cerca de ti":(o?o.text:"");
  sum.hidden=false;card.classList.add("is-collapsed");document.documentElement.classList.add("af-has-results");var bb=document.getElementById("afMascotBubble");if(bb)bb.innerHTML='💚 <strong>¡Gracias por confiar en AhorraFuel!</strong><br>⛽ ¡Ahorra en cada repostaje! 🚗💨';rb.hidden=false;setTab(near()?1:0);
  if(!near()){try{localStorage.setItem("af_last",JSON.stringify({p:prov.value,f:fuel?fuel.value:""}))}catch(e){}}
}).observe(res,{childList:true});
// Al abrir la app: repite la última búsqueda por provincia
if(!window.__afAtajo){try{var L=JSON.parse(localStorage.getItem("af_last")||"null");
  if(L&&L.p){prov.value=L.p;var rr=L.f&&$('input[name="f"][value="'+L.f+'"]');if(rr){rr.checked=true;if(fuel)fuel.value=L.f}
  if(prov.value&&typeof buscar==="function")buscar()}}catch(e){}}
})();
