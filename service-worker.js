// I have no particular need for a service worker, but it's necessary for a PWA.

onfetch = event => {
  console.log("onfetch", event);
  event.respondWith(caches.match(event.request).then(response => {
    // Issue a fetch regardless
    let fetchRequest = fetch(event.request).then(fetchResponse => {
      let clonedResponse = fetchResponse.clone();
      caches.open("UnitsCalc-v1").then(cache => cache.put(event.request, clonedResponse));
      return fetchResponse;
    });
    // If the cache had a response, use it immediately
    if (response)
      return response;
    // Otherwise use the result of the fetch
    return fetchRequest;
  }));
};