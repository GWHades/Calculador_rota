const CACHE_NAME = "rota-cache-v2";
const MAX_DYNAMIC_CACHE_ITEMS = 50; // Limite para cache dinâmico

const urlsToCache = [
  "/",
  "/index.html",
  "/script.js",
  "/manifest.json",
  "https://unpkg.com/leaflet/dist/leaflet.css",
  "https://unpkg.com/leaflet/dist/leaflet.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

const OFFLINE_URL = "/offline.html";

// Remove os itens mais antigos do cache para manter o limite
async function cleanCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length > maxItems) {
    // Remove o item mais antigo (primeiro da lista)
    await cache.delete(keys[0]);
    console.log(`[SW] Cache limpo: ${keys[0].url}`);
    // Chama recursivamente para garantir que todos os excessos sejam removidos
    await cleanCache(cacheName, maxItems);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Pré-cache dos recursos essenciais
      await cache.addAll([...urlsToCache, OFFLINE_URL]);
      self.skipWaiting();
      console.log("[SW] Instalado e cache inicializado");
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Remove caches antigos que não batem com o CACHE_NAME atual
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      self.clients.claim();
      console.log("[SW] Ativado e caches antigos removidos");
    })()
  );
});

self.addEventListener("fetch", (event) => {
  // Ignora requisições que não sejam GET
  if (event.request.method !== "GET") return;

  event.respondWith(
    (async () => {
      try {
        // Tenta buscar no network primeiro (strategy: network-first)
        const networkResponse = await fetch(event.request);

        // Atualiza cache dinâmico com a resposta recebida
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, networkResponse.clone());

        // Garante que o cache dinâmico não ultrapasse o limite
        await cleanCache(CACHE_NAME, MAX_DYNAMIC_CACHE_ITEMS);

        return networkResponse;
      } catch (error) {
        // Se falhar, tenta servir do cache
        const cacheResponse = await caches.match(event.request);
        if (cacheResponse) return cacheResponse;

        // Se for navegação HTML e não tiver no cache, retorna a página offline
        if (event.request.headers.get("accept")?.includes("text/html")) {
          return caches.match(OFFLINE_URL);
        }

        // Caso contrário, retorna uma resposta simples de erro
        return new Response("Você está offline e o recurso não está em cache.", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "text/plain" },
        });
      }
    })()
  );
});
