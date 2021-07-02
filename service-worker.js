// I have no particular need for a service worker, but it's necessary for a PWA.
// There's nothing to pre-fetch because the page references all of its resources when
// loaded. But we can still have some fun optimizing the upgrade process.

let logging = false; // Can change in the debugger
let cacheName = location.pathname;  // Segregate caching by worker location

// There SHOULD be a Promise.delay like this.
// Note that this can be used with .then() and val is optional
const delay = (ms, val) => new Promise(resolve => setTimeout(() => resolve(val), ms));

onfetch = event => {
  let request = event.request;
  if (logging) console.info("onfetch", request.url, request);
  // There SHOULD be async blocks like this:
  //     async { ... }
  // Instead, I'll use
  //     (async () => { ... })()
  // just like we used to create scopes with (function() { ... })()
  event.respondWith((async () => {
    // Use only our cache
    let cache = await caches.open(cacheName);
    if (logging) console.info("cache", request.url, cache);
    let cacheResponse = await cache.match(request);
    if (logging) console.info("cacheResponse", request.url, cacheResponse);
    // Issue a fetch request regardless, disregarding "freshness"
    let fetchResult = (async () => {
      let fetchResponse;
      try {
        fetchResponse = await fetch(request, { cache: "no-cache" });
        if (fetchResponse.ok) {
          if (logging) console.info("successful response", request.url, fetchResponse.status, fetchResponse);
          let clonedResponse = fetchResponse.clone();
          cache.put(request, clonedResponse);
          if (logging) console.info("cached", request.url, clonedResponse);
          return fetchResponse;  // succeed with the response
        }
        if (logging) console.info("failed response", request.url, fetchResponse.status, fetchResponse);
        // Failed; return the cached response if there is one
        if (cacheResponse)
          return cacheResponse;
      } catch (fetchError) {
        if (logging) console.info("fetch error", request.url, fetchError);
        throw new Response(null, { status: 404 , statusText: "Not Found" });
      }
      // A failure won't fulfill the Promise.any() below unless every promise has failed,
      // but at that point the timer will always succeed since there's a cache result already.       s
      throw fetchResponse;
    })();
    if (!cacheResponse) {
      if (logging) console.info("uncached", request.url);
      // Return the fetch result, even if it failed.
      // We don't generally expect failures, but some platforms request favico.ico, which doesn't exist.
      return fetchResult.catch(errorResponse => errorResponse);
    }
    // We won't be using a fetch failure result now, so eat it so the Promise machinery
    // doesn't complain.
    fetchResult.catch(fetchFailure => {
      if (logging) console.info("eat fetch failure", request.url, fetchFailure.status, fetchFailure);
    });
    if (navigator.onLine === false) {
      if (logging) console.log("offline cache response", request.url, cacheResponse.status, cacheResponse);
      return cacheResponse;
    }
    // Resolve with the fetch result or the cache response delayed for a moment, whichever is first.
    // If navigator.onLine is false, we will have already returned the cached response, so this
    // is not likely to happen often.
    let resp = await Promise.any([fetchResult, delay(1000 /* ms */, cacheResponse)]);
    if (logging) console.info("resolved with", request.url, resp.status, resp);
    return resp;
  })());
};