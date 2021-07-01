// I have no particular need for a service worker, but it's necessary for a PWA.
// So let's have some fun...

let logging = false; // Can change in the debugger
let cacheName = location.pathname;  // Segregate caching by worker location
let online = true;

ononline = event => {
  if (logging) console.info("online", event);
  online = true;
};

onoffline = event => {
  if (logging) console.info("offline", event);
  online = false;
};

onfetch = event => {
  if (logging) console.info("onfetch", event.request);
  // There SHOULD be async blocks like this:
  //     async { ... }
  // Instead, I'll use
  //     (async () => { ... })()
  // just like we used to create scopes with (function() { ... })()
  event.respondWith((async () => {
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
    if (!online) {
      if (logging) console.log("ofline cache response", cacheResponse);
      return cacheResponse;
    }
    // Wait for a moment and return the cached value
    //   The hope is that mobile devices will fail requests immediately
    //   when fully offline, but a second is not so long to wait.
    //   The "online" state might help too.
    let timer = new Promise(resolve => {
      setTimeout(() => {
        if (logging) console.info("timeout", cacheResponse);
        resolve(cacheResponse);
      }, 1000);
    });
    let resp = await Promise.any([timer, fetchResult]);
    if (logging) console.info("resolved with", resp);
    return resp;
  })());
};