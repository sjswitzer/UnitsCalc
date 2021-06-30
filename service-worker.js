// I have no particular need for a service worker, but it's necessary for a PWA.

let cacheName = location.pathname;  // Segregate caching by worker location

onfetch = event => {
  console.info("onfetch", event.request); 
  event.respondWith((async () => {
    let cache = await caches.open(cacheName);
    console.info("cache", cache);
    let cacheResponse = await cache.match(event.request);
    console.info("cacheResponse", cacheResponse);
    // Issue a fetch request regardless
    let fetchResult = fetch(event.request).then(fetchResponse => {
      if (fetchResponse.ok) {
        console.info("successful response", fetchResponse);
        let clonedResponse = fetchResponse.clone();
        cache.put(event.request, clonedResponse);
        console.info("cached", event, clonedResponse);
        return fetchResponse;  // succeed with the response
      }
      console.info("failed response", fetchResponse);
      // failed, return the cached response or the failure if none.
      return cacheResponse ?? fetchResponse;
    });
    if (!cacheResponse) {
      console.info("uncached", fetchResult);
      return fetchRequest;
    }
    // Wait for a moment and return the cached value
    let timer = new Promise(resolve => {
      setTimeout(() => {
        console.info("timeout", cacheResponse);
        resolve(cacheResponse);
      }, 500);
    });
    let res = await Promise.any([timer, fetchResult]);
    console.info("resolved with", res);
  })());
};