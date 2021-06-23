// I have no particular need for a service worker, but it's needed for a PWA
let version = "v0.0";

onmessage = event => {
    console.log("onmessage", e);
    if (event.data.version)
      version = event.data.version;
};

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