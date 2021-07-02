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
  // just like we once created scopes with (function() { ... })(), hmm...
  event.respondWith((async () => {
    // Use only our specific cache. Most code samples match from the domain-wide
    // cache "caches.match(...)", which seems like a bad idea to me.
    // It's generally better to have each app manage its own cache in peace.
    let cache = await caches.open(cacheName);
    let cacheResponse = await cache.match(request);

    // If we're offline just return the cached value immediately.
    if (cacheResponse && navigator.onLine === false) {
      if (logging) console.log("offline cache response", request.url, cacheResponse.status, cacheResponse);
      return cacheResponse;
    }

    // Issue a fetch request even if we have a cached response
    let fetchResult = (async () => {
      let fetchResponse;
      try {
        fetchResponse = await fetch(request, { cache: "no-cache" });
      } catch (failureReason) {
        if (logging) console.info("no response", request.url, failureReason);
        // Return the cached response if there is one; otherwise fake a 404 as the failure response
        // (A failure response won't fulfill the Promise.any below)
        if (cacheResponse)
          return cacheResponse;
        throw new Response(null, { status: 404 , statusText: "Not Found" });
      }

      if (fetchResponse.ok) {
        if (logging) console.info("successful response cached", request.url, fetchResponse.status, fetchResponse);
        let clonedResponse = fetchResponse.clone();
        cache.put(request, clonedResponse);
        return fetchResponse;  // succeed with the response
      }

      if (logging) console.info("failure response", request.url, fetchResponse.status, fetchResponse);
      if (cacheResponse)
        return cacheResponse;

      // Again, a failure won't fulfill the Promise.any below unless every promise has failed,
      // but by that point the timer will always succeed since there's a cached result already.       s
      throw fetchResponse;
    })();

    if (!cacheResponse) {
      if (logging) console.info("uncached", request.url);
      // Since there's no cache, return the fetch result, even if it failed.
      // We don't generally expect failures, but some platforms request favico.ico, which doesn't exist here.
      return fetchResult.catch(errorResponse => errorResponse);
    }

    // We won't be using any fetch failure result now since we have a cached value,
    // so eat it. Otherwise the Promise machinery will complain that it wasn't handled.
    fetchResult.catch(fetchFailure => {
      if (logging) console.info("eat fetch failure", request.url, fetchFailure.status, fetchFailure);
    });

    // Resolve with the fetch result or the cache response delayed for a moment, whichever is first.
    // If navigator.onLine is false, we will have already returned the cached response, so this
    // is not likely to happen often.
    let resp = await Promise.any([fetchResult, delay(2000 /* ms */, cacheResponse)]);
    if (logging) console.info("resolved with", request.url, resp.status, resp);
    return resp;
  })());
};