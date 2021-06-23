// I have no particular need for a service worker, but it's needed for a PWA
let version = "v0.0";

onmessage = e => {
    console.log("onmessage", e);
    if (e.data.version)
      version = e.data.version;
    // the passed-in data is available via e.data
};

onfetch = event => {
  console.log("onfetch", e);
  event.respondWith(caches.match(event.request).then(response => {
  if (response)
    return response;
  return fetch(event.request).then(response => {
    let cloned = response.clone();
    caches.open(version).then(cache => cache.put(event.request, cloned));
    return response;
    });
  }));
};