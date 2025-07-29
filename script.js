const apiKey = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjVmMmY0NTBiNWEwYzRkMTg5NDcxMjIwYjVlYmFhYWJiIiwiaCI6Im11cm11cjY0In0=";
const corsProxy = "https://cors-anywhere.herokuapp.com/";

// Inicializa mapa Leaflet
let map = L.map("map").setView([-23.5, -46.6], 7);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
let layerGroup = L.layerGroup().addTo(map);

// Botão Instalar PWA
let deferredPrompt;
const btnInstalar = document.getElementById("btnInstalar");
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  btnInstalar.classList.remove("hidden");
});
btnInstalar.addEventListener("click", async () => {
  btnInstalar.classList.add("hidden");
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
});

// Função para mostrar lista autocomplete
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
        `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(
          text
        )}&size=5`
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

// Seleciona endereço da lista autocomplete
window.selecionarEndereco = function (endereco, listaId) {
  const inputId = listaId.replace("lista", "").toLowerCase();
  const inputElem = document.getElementById(inputId);
  if (!inputElem) return;
  inputElem.value = endereco;
  document.getElementById(listaId).classList.add("hidden");
};

// Geocodifica endereço para coordenadas [lat, lon]
window.geocode = async function (endereco) {
  const res = await fetch(
    corsProxy +
      `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(
        endereco
      )}&size=1`
  );
  if (!res.ok) throw new Error("Erro na API de geocodificação");
  const data = await res.json();
  if (!data.features || data.features.length === 0) {
    throw new Error("Endereço não encontrado: " + endereco);
  }
  const [lon, lat] = data.features[0].geometry.coordinates;
  return [lat, lon];
};

// Calcula distância e rota entre 2 coordenadas
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

// Função para mostrar spinner enquanto calcula
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

// Função principal de cálculo
window.calcular = async function () {
  const origem = document.getElementById("origem").value.trim();
  const retirada = document.getElementById("retirada").value.trim();
  const entrega = document.getElementById("entrega").value.trim();
  const valorKm = parseFloat(document.getElementById("valor_km").value);
  const resultado = document.getElementById("resultado");
  const linkWaze = document.getElementById("linkWaze");

  if (!origem || !retirada || !entrega) {
    resultado.innerHTML =
      "<p class='text-red-600 font-semibold'>Preencha todos os endereços antes de calcular.</p>";
    linkWaze.classList.add("hidden");
    return;
  }
  if (isNaN(valorKm) || valorKm <= 0) {
    resultado.innerHTML =
      "<p class='text-red-600 font-semibold'>Informe um valor válido para o valor por KM.</p>";
    linkWaze.classList.add("hidden");
    return;
  }

  setLoading(true);
  linkWaze.classList.add("hidden");
  layerGroup.clearLayers();

  try {
    const coordOrigem = await geocode(origem);
    const coordRetirada = await geocode(retirada);
    const coordEntrega = await geocode(entrega);

    const trecho1 = await calcularDistancia(coordOrigem, coordRetirada);
    const trecho2 = await calcularDistancia(coordRetirada, coordEntrega);

    const totalKm = trecho1.km + trecho2.km;
    const valorTotal = totalKm * valorKm;

    resultado.innerHTML = `
      <p><strong>Trecho 1:</strong> ${trecho1.km.toFixed(2)} km</p>
      <p><strong>Trecho 2:</strong> ${trecho2.km.toFixed(2)} km</p>
      <p><strong>Total:</strong> ${totalKm.toFixed(2)} km</p>
      <p class="text-xl mt-3 font-semibold text-blue-700"><strong>Valor da Rota:</strong> R$ ${valorTotal.toFixed(
        2
      )}</p>
    `;

    const coords1 = polyline.decode(trecho1.geometry).map((c) => [c[0], c[1]]);
    const coords2 = polyline.decode(trecho2.geometry).map((c) => [c[0], c[1]]);

    layerGroup.addLayer(L.polyline(coords1, { color: "blue", weight: 5, opacity: 0.7 }));
    layerGroup.addLayer(L.polyline(coords2, { color: "green", weight: 5, opacity: 0.7 }));
    layerGroup.addLayer(L.marker(coordOrigem).bindPopup("<b>Origem</b>").openPopup());
    layerGroup.addLayer(L.marker(coordRetirada).bindPopup("<b>Retirada</b>"));
    layerGroup.addLayer(L.marker(coordEntrega).bindPopup("<b>Entrega</b>"));

    map.fitBounds(L.latLngBounds([...coords1, ...coords2]), { padding: [50, 50] });

    const wazeUrl = `https://waze.com/ul?ll=${coordEntrega[0]},${coordEntrega[1]}&navigate=yes`;
    linkWaze.href = wazeUrl;
    linkWaze.classList.remove("hidden");
  } catch (e) {
    resultado.innerHTML =
      `<p class='text-red-600 font-semibold'>Erro ao calcular rota: ${e.message || "Verifique os endereços."}</p>`;
    linkWaze.classList.add("hidden");
  } finally {
    setLoading(false);
  }
};

// Eventos de autocomplete e cálculo após carregar a página
window.onload = () => {
  ["origem", "retirada", "entrega"].forEach((id) => {
    const input = document.getElementById(id);
    input.addEventListener("input", (e) => autocomplete(e.target, `lista${id.charAt(0).toUpperCase() + id.slice(1)}`));
  });

  document.getElementById("btnCalcular").addEventListener("click", calcular);

  // Fecha as listas autocomplete se clicar fora
  document.addEventListener("click", (e) => {
    ["listaOrigem", "listaRetirada", "listaEntrega"].forEach((listaId) => {
      const lista = document.getElementById(listaId);
      if (!lista.contains(e.target)) {
        lista.classList.add("hidden");
      }
    });
  });
};
