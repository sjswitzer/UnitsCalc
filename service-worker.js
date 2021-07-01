// I have no particular need for a service worker, but it's necessary for a PWA.
// There's nothing to pre-fetch because the page references all of its resources when
// loaded. But we can still have some fun optimizing the upgrade process.

let logging = false; // Can change in the debugger
let cacheName = location.pathname;  // Segregate caching by worker location

onfetch = event => {
  if (logging) console.info("onfetch", event.request);
  // There SHOULD be async blocks like this:
  //     async { ... }
  // Instead, I'll use
  //     (async () => { ... })()
  // just like we used to create scopes with (function() { ... })()
  event.respondWith((async () => {
    // Use only our cache
    let cache = await caches.open(cacheName);
    if (logging) console.info("cache", cache);
    let cacheResponse = await cache.match(event.request);
    if (logging) console.info("cacheResponse", cacheResponse);
    // Issue a fetch request regardless, disregarding "freshness"
    let fetchResult = fetch(event.request, { cache: "no-cache" }).then(fetchResponse => {
      if (fetchResponse.ok) {
        if (logging) console.info("successful response", fetchResponse);
        let clonedResponse = fetchResponse.clone();
        cache.put(event.request, clonedResponse);
        if (logging) console.info("cached", event, clonedResponse);
        return fetchResponse;  // succeed with the response
      }
      if (logging) console.info("failed response", fetchResponse);
      // Failed; return the cached response or the failure if none.
      return cacheResponse ?? fetchResponse;
    });
    if (!cacheResponse) {
      if (logging) console.info("uncached", fetchResult);
      return fetchResult;
    }
    // ServiceWorkerGlobalScope's self.navigator does not appear to be standard, but use it if it's there
    if (self.navigator && self.navigator.onLine === false) {
      if (logging) console.log("offline cache response", cacheResponse);
      return cacheResponse;
    }
    // Wait for a moment and return the cached value
    //   The hope is that mobile devices will fail requests immediately
    //   when fully offline, but a second is not so long to wait.
    //   The "online" state might help too.
    let waitMs = 1000;
    let timer = new Promise(resolve => {
      setTimeout(() => {
        if (logging) console.info("timeout", cacheResponse);
        resolve(cacheResponse);
      }, waitMs);
    });
    // Whichever happens first is our result
    let resp = await Promise.any([timer, fetchResult]);
    if (logging) console.info("resolved with", resp);
    return resp;
  })());
};