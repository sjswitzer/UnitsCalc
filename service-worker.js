// I have no particular need for a service worker, but it's necessary for a PWA.

let cacheName = location.pathname;  // Segregate caching by worker location

onfetch = event => {
  console.info("onfetch", event);
  event.respondWith(caches.open(cacheName).then(cache => {
    cache.match(event.request).then(cacheResponse => {
      // Issue a fetch regardless
      let fetchResponse;
      let fetchRequest = fetch(event.request).then(resp => {
        fetchResponse = resp;
        if (fetchResponse.ok) {
          console.info("successful response", fetchResponse);
          let clonedResponse = fetchResponse.clone();
          cache.put(event.request, clonedResponse);
          console.info("cached", event, clonedResponse);
          return fetchResponse;  // succeed with the response
        }
        // if request failed, return the cache if present, otherwise the failed request
        return cacheResponse ?? fetchResponse;
      });
      if (!cacheResponse)
        return fetchRequest;
      let timer = new Promise(resolve => {
        // Wait for a moment and return the cached value if present,
        // otherwise the response, whether it succeeded or not
        setTimeout(() => {
          let resolution = cacheResponse ?? fetchResponse;
          console.info("timeout", resolution)
          resolve(resolution);
        }, 500);
      });
      // Whichever first succeeds is the result
      return Promise.any([timer, fetchRequest]);
    });
  }));
};