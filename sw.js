const CACHE_NAME = 'viltrum-fitness-v3';
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
  console.log('[Service Worker] Installing v3...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell v3');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.log('[Service Worker] Cache failed:', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating v3...');
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
  // Skip requests with authentication tokens or recovery parameters
  const url = new URL(event.request.url);
  if (url.searchParams.has('access_token') || 
      url.searchParams.has('refresh_token') || 
      url.searchParams.has('type')) {
    console.log('[Service Worker] Skipping cache for auth request');
    return;
  }

  // Skip navigation requests to avoid redirect issues
  if (event.request.mode === 'navigate') {
    console.log('[Service Worker] Skipping cache for navigation');
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          console.log('[Service Worker] Serving from cache:', event.request.url);
          return response;
        }
        
        console.log('[Service Worker] Fetching from network:', event.request.url);
        return fetch(event.request, {
          redirect: 'follow'
        }).then((response) => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
      .catch((error) => {
        console.log('[Service Worker] Fetch error:', error);
      })
  );
});