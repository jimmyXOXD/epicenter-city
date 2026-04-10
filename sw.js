const CACHE_NAME = 'epicentra-v1';
const ASSETS = [
  './',
  './index.html',
  './main.js',
  './GameScene.js',
  './StatsManager.js',
  './Player.js',
  './Config.js',
  './Building.js',
  './BuildingRegistry.js',
  './Business.js',
  './rosie/controls/rosieControls.js',
  './rosie/controls/rosieMobileControls.js',
  './all_jobs.json',
  './houses.json',
  './social_places.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});