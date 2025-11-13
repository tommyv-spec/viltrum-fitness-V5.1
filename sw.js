const CACHE_NAME = 'viltrum-fitness-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/workout.html',
  '/nutrition.html',
  '/style.css',
  '/script.js',
  '/auth.js',
  '/viewport.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.log('[Service Worker] Cache failed:', error);
      })
  );
  self.skipWaiting();
});

// Listen per il messaggio SKIP_WAITING (per forzare aggiornamento)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  
  // ⚠️ IMPORTANTE: NON intercettare URL con token di autenticazione
  // Se l'URL contiene access_token, refresh_token, o type (parametri Supabase auth)
  // lascia che il browser gestisca la richiesta normalmente
  const hasAuthParams = requestUrl.hash.includes('access_token') || 
                        requestUrl.hash.includes('refresh_token') ||
                        requestUrl.hash.includes('type=recovery') ||
                        requestUrl.hash.includes('type=signup') ||
                        requestUrl.hash.includes('type=magiclink');
  
  if (hasAuthParams) {
    console.log('[Service Worker] Skipping auth URL:', requestUrl.href);
    // Non intercettare - lascia che il browser gestisca
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Clone the request
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          // Cache the new response
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        });
      })
      .catch(() => {
        // Return offline page if available
        return caches.match('/index.html');
      })
  );
});