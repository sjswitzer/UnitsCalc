// I have no particular need for a service worker, but it's needed for a PWA.
// But just for fun, try some things...

let appPrefix = "UnitsCalc-";
let appVersion = "v0.0";

onmessage = event => {
  console.log("onmessage", event);
  if (event.data.version)
    version = event.data.version;
};

onActivate = event => {
  console.log("onActivate", event);
  caches.keys().then(cacheNames => {
    for (cacheName of cacheNames) {
      if (cacheName.startsWith(appPrefix) && cacheName !== appPrefix + appVersion)
      caches.delete(cacheName);
    }
  });
}

onfetch = event => {
  console.log("onfetch", event);
  event.respondWith(caches.match(event.request).then(response => {
    if (response)
      return response;
    return fetch(event.request).then(response => {
      let cloned = response.clone();
      caches.open("TODO-version").then(cache => cache.put(event.request, cloned));
      return response;
    });
  }));
};