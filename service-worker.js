// I have no particular need for a service worker, but it's necessary for a PWA.

onfetch = event => {
  console.log("onfetch", event);
  event.respondWith(caches.match(event.request).then(response => {
    if (response)
      return response;
    return fetch(event.request).then(response => {
      let clonedResponse = response.clone();
      caches.open("UnitsCalc-v1").then(cache => cache.put(event.request, clonedResponse));
      return response;
    });
  }));
};