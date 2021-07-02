// I have no particular need for a service worker, but it's necessary for a PWA.
// There's nothing to pre-fetch because the page references all of its resources when
// loaded. But we can still have some fun optimizing the upgrade process.

let logging = false; // Can change in the debugger
let cacheName = location.pathname;  // Segregate caching by worker location

// There SHOULD be a Promise.delay like this.
// Note that this can be used with .then() and val is optional
const delay = (ms, val) => new Promise(resolve => setTimeout(() => resolve(val), ms));

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
    let fetchResult = (async () => {
      let fetchResponse;
      try {
        fetchResponse = await fetch(event.request, { cache: "no-cache" });;
        if (fetchResponse.ok) {
          if (logging) console.info("successful response", fetchResponse);
          let clonedResponse = fetchResponse.clone();
          cache.put(event.request, clonedResponse);
          if (logging) console.info("cached", event, clonedResponse);
          return fetchResponse;  // succeed with the response
        }
        if (logging) console.info("failed response", fetchResponse);
        // Failed; return the cached response if there is one
        if (cacheResponse)
          return cacheResponse;
      } catch (fetchError) {
        if (logging) console.info("fetch error", fetchError);
        throw new Response(null, { status: 404 , statusText: "Not Found" });
      }
      // A failure won't fulfill the Promise.any() below unless every promise has failed,
      // but at that point the timer will always succeed since there's a cache result already.       s
      if (logging) console.info("fetch failed", fetchResponse);
      throw fetchResponse;
    })();
    if (!cacheResponse) {
      if (logging) console.info("uncached", fetchResult);
      // Return the fetch result, even if it failed.
      // We don't generally expect failures, but some platforms request favico.ico, which doesn't exist.
      return fetchResult.catch(errorResponse => errorResponse);
    }
    // We won't be using a fetch failure result now, so eat it so the Promise machinery
    // doesn't complain.
    fetchResult.catch(fetchFailure => {
      if (logging) console.info("eat fetch failure", fetchFailure);
    });
    if (navigator.onLine === false) {
      if (logging) console.log("offline cache response", cacheResponse);
      return cacheResponse;
    }
    // Resolve with the fetch result or the cache response delayed moment, whichever is first.
    // If navigator.onLine is false, we will have already returned the cached response, so this
    // is not likely to happen often.
    let resp = await Promise.any([fetchResult, delay(2000 /* ms */, cacheResponse)]);
    if (logging) console.info("resolved with", resp);
    return resp;
  })());
};