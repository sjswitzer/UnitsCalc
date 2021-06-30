// I have no particular need for a service worker, but it's necessary for a PWA.

onfetch = event => {
  console.info("onfetch", event);
  event.respondWith(caches.match(event.request).then(response => {
    // Issue a fetch regardless
    let fetchRequest = fetch(event.request).then(fetchResponse => {
      if (fetchResponse.ok) {
        let clonedResponse = fetchResponse.clone();
        caches.open("UnitsCalc-v1").then(cache => {
          cache.put(event.request, clonedResponse);
          console.info("cached", event, clonedResponse);
        });
      }
      return fetchResponse;
    });
    // If the cache had a response, use it immediately
    if (response) {
      console.info("cached response", event, response)
      return response;
    }
    // Otherwise use the result of the fetch
    console.info("fetched response", event, fetchRequest)
    return fetchRequest;
  }));
};