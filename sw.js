const CACHE_NAME = 'viltrum-fitness-v3'; // Increment version to force cache refresh
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
  
  // ⚠️ CRITICAL FIX: Skip service worker for ALL navigation requests
  // This prevents redirect mode errors when navigating between pages
  if (event.request.mode === 'navigate') {
    console.log('[Service Worker] Skipping navigation request:', requestUrl.pathname);
    return; // Let browser handle navigation normally
  }
  
  // ⚠️ IMPORTANT: Don't intercept URLs with auth tokens
  const hasAuthParams = requestUrl.hash.includes('access_token') || 
                        requestUrl.hash.includes('refresh_token') ||
                        requestUrl.hash.includes('type=recovery') ||
                        requestUrl.hash.includes('type=signup') ||
                        requestUrl.hash.includes('type=magiclink');
  
  if (hasAuthParams) {
    console.log('[Service Worker] Skipping auth URL:', requestUrl.href);
    return; // Let browser handle auth URLs
  }
  
  // ⚠️ Skip external requests (Supabase, Google APIs, etc)
  if (!requestUrl.origin.includes('viltrumfitness.com') && 
      !requestUrl.origin.includes('localhost') &&
      requestUrl.origin !== self.location.origin) {
    console.log('[Service Worker] Skipping external request:', requestUrl.origin);
    return; // Let browser handle external requests
  }
  
  // Handle the request with cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          console.log('[Service Worker] Serving from cache:', requestUrl.pathname);
          return response;
        }
        
        // Clone the request
        const fetchRequest = event.request.clone();
        
        // ✅ FIX: Explicitly set redirect mode to 'follow'
        const fetchOptions = {
          redirect: 'follow',
          credentials: event.request.credentials,
          cache: event.request.cache
        };
        
        return fetch(fetchRequest, fetchOptions).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            console.log('[Service Worker] Invalid response, not caching');
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          // Cache the new response (async, don't wait)
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        });
      })
      .catch((error) => {
        console.log('[Service Worker] Fetch failed:', error);
        // Return offline page if available
        return caches.match('/index.html');
      })
  );
});