const apiKey = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjVmMmY0NTBiNWEwYzRkMTg5NDcxMjIwYjVlYmFhYWJiIiwiaCI6Im11cm11cjY0In0=";
const corsProxy = "https://cors-anywhere.herokuapp.com/";

let map = L.map("map").setView([-23.5, -46.6], 7);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
let layerGroup = L.layerGroup().addTo(map);

let paradaCount = 0;
function addParadaField(valor = "") {
  paradaCount++;
  const container = document.getElementById("paradas-container");
  const div = document.createElement("div");
  div.className = "relative flex items-center gap-2 mb-2";
  div.innerHTML = `
    <input type="text" class="parada w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500"
      placeholder="Endereço da parada"
      autocomplete="off"
      id="parada${paradaCount}" value="${valor}">
    <button type="button" class="text-red-500 hover:text-red-700" title="Remover parada" onclick="this.parentElement.remove()">✖</button>
    <ul id="listaParada${paradaCount}" class="autocomplete-list hidden"></ul>
  `;
  container.appendChild(div);

  div.querySelector("input").addEventListener("input", (e) => autocomplete(e.target, `listaParada${paradaCount}`));
}

document.getElementById("btnAddParada").addEventListener("click", () => addParadaField());

window.autocomplete = async function (inputElem, listaId) {
  const text = inputElem.value.trim();
  const lista = document.getElementById(listaId);
  if (text.length < 3) {
    lista.innerHTML = "";
    lista.classList.add("hidden");
    return;
  }
  try {
    const res = await fetch(
      corsProxy +
        `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(text)}&size=5`
    );
    if (!res.ok) throw new Error("Erro na API de geocodificação");
    const data = await res.json();
    if (!data.features || data.features.length === 0) {
      lista.innerHTML = "";
      lista.classList.add("hidden");
      return;
    }
    lista.innerHTML = data.features
      .map(
        (f) =>
          `<li tabindex="0" role="button" aria-label="Selecionar endereço: ${f.properties.label}" onclick="selecionarEndereco('${f.properties.label.replace(/'/g, "\\'")}', '${listaId}')">${f.properties.label}</li>`
      )
      .join("");
    lista.classList.remove("hidden");
  } catch {
    lista.innerHTML = "";
    lista.classList.add("hidden");
  }
};

window.selecionarEndereco = function (endereco, listaId) {
  const inputId = listaId.replace("lista", "");
  const inputElem = document.getElementById(inputId);
  if (!inputElem) return;
  inputElem.value = endereco;
  document.getElementById(listaId).classList.add("hidden");
};

window.geocode = async function (endereco) {
  const res = await fetch(
    corsProxy +
      `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(endereco)}&size=1`
  );
  if (!res.ok) throw new Error("Erro na API de geocodificação");
  const data = await res.json();
  if (!data.features || data.features.length === 0) {
    throw new Error("Endereço não encontrado: " + endereco);
  }
  const [lon, lat] = data.features[0].geometry.coordinates;
  return [lat, lon];
};

window.calcularDistancia = async function (coordA, coordB) {
  const body = {
    coordinates: [
      [coordA[1], coordA[0]],
      [coordB[1], coordB[0]],
    ],
  };
  const res = await fetch(corsProxy + "https://api.openrouteservice.org/v2/directions/driving-car", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Erro ao calcular rota");
  const data = await res.json();
  if (!data.routes || data.routes.length === 0) {
    throw new Error("Rota não encontrada");
  }
  const metros = data.routes[0].summary.distance;
  const geo = data.routes[0].geometry;
  return { km: metros / 1000, geometry: geo };
};

function setLoading(isLoading) {
  const resultado = document.getElementById("resultado");
  if (isLoading) {
    resultado.innerHTML = `
      <div class="flex justify-center items-center space-x-2 text-blue-600 font-semibold">
        <svg class="animate-spin h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
        </svg>
        <span>Calculando...</span>
      </div>`;
  } else {
    resultado.innerHTML = "";
  }
}

window.calcular = async function () {
  const origem = document.getElementById("origem").value.trim();
  const retirada = document.getElementById("retirada").value.trim();
  const entrega = document.getElementById("entrega").value.trim();
  const valorKm = parseFloat(document.getElementById("valor_km").value);
  const resultado = document.getElementById("resultado");
  const linkWaze = document.getElementById("linkWaze");
  const linkMaps = document.getElementById("linkMaps");

  // Coletar paradas intermediárias
  const paradaInputs = document.querySelectorAll(".parada");
  const paradas = Array.from(paradaInputs)
    .map((input) => input.value.trim())
    .filter((v) => v);

  if (!origem || !retirada || !entrega) {
    resultado.innerHTML = "<p class='text-red-600 font-semibold'>Preencha todos os endereços antes de calcular.</p>";
    linkWaze.classList.add("hidden");
    linkMaps.classList.add("hidden");
    return;
  }
  if (isNaN(valorKm) || valorKm <= 0) {
    resultado.innerHTML = "<p class='text-red-600 font-semibold'>Informe um valor válido para o valor por KM.</p>";
    linkWaze.classList.add("hidden");
    linkMaps.classList.add("hidden");
    return;
  }

  setLoading(true);
  linkWaze.classList.add("hidden");
  linkMaps.classList.add("hidden");
  layerGroup.clearLayers();

  try {
    // Geocodificar todos os pontos (origem, retirada, paradas, entrega)
    const pontos = [origem, retirada, ...paradas, entrega];
    const coords = [];
    for (const ponto of pontos) {
      coords.push(await geocode(ponto));
    }

    // Calcular todos os trechos
    let totalKm = 0;
    let coordsPolylines = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const trecho = await calcularDistancia(coords[i], coords[i + 1]);
      totalKm += trecho.km;
      coordsPolylines.push(polyline.decode(trecho.geometry).map((c) => [c[0], c[1]]));
    }

    const valorTotal = totalKm * valorKm;
    resultado.innerHTML = `
      <div class="mb-2">
        <span class="inline-block bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-semibold">Total: ${totalKm.toFixed(2)} km</span>
      </div>
      <p class="text-2xl mt-2 font-extrabold text-green-700">Valor da Rota: R$ ${valorTotal.toFixed(2)}</p>
    `;

    coordsPolylines.forEach((poly) => layerGroup.addLayer(L.polyline(poly, { color: "blue", weight: 5, opacity: 0.7 })));
    layerGroup.addLayer(L.marker(coords[0]).bindPopup("<b>Origem</b>").openPopup());
    layerGroup.addLayer(L.marker(coords[coords.length - 1]).bindPopup("<b>Entrega</b>"));
    coords.slice(1, -1).forEach((c, i) =>
      layerGroup.addLayer(L.marker(c).bindPopup(`<b>Parada ${i + 1}</b>`))
    );
    map.fitBounds(L.latLngBounds(coords), { padding: [50, 50] });

    // Google Maps aceita múltiplos pontos
    const linkGM = "https://www.google.com/maps/dir/" + pontos.map(p => encodeURIComponent(p)).join("/");
    linkMaps.href = linkGM;
    linkMaps.classList.remove("hidden");

    // Waze só aceita início/fim (destino é entrega)
    const [lat, lon] = coords[coords.length - 1];
    const wazeUrl = `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
    linkWaze.href = wazeUrl;
    linkWaze.classList.remove("hidden");
  } catch (e) {
    resultado.innerHTML = `<p class='text-red-600 font-semibold'>Erro ao calcular rota: ${e.message || "Verifique os endereços."}</p>`;
    linkWaze.classList.add("hidden");
    linkMaps.classList.add("hidden");
  } finally {
    setLoading(false);
  }
};

window.onload = () => {
  ["origem", "retirada", "entrega"].forEach((id) => {
    const input = document.getElementById(id);
    input.addEventListener("input", (e) => autocomplete(e.target, `lista${id.charAt(0).toUpperCase() + id.slice(1)}`));
  });
  document.getElementById("btnCalcular").addEventListener("click", calcular);

  // Fecha as listas autocomplete se clicar fora
  document.addEventListener("click", (e) => {
    document.querySelectorAll(".autocomplete-list").forEach((lista) => {
      if (!lista.contains(e.target)) {
        lista.classList.add("hidden");
      }
    });
  });

  // Adiciona um campo de parada por padrão
  addParadaField();
};
