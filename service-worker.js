// I have no particular need for a service worker, but it's necessary for a PWA to work at all.
// There's nothing to pre-fetch because the page references all of its resources when
// loaded. But we can still have some fun optimizing the upgrade process.

let logging = true; // Can change in the debugger
let cacheName = location.pathname;  // Segregate caching by worker location

// There SHOULD be a Promise.delay like this.
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
      if (logging) console.log("offline cached response", request.url, cacheResponse.status, cacheResponse);
      return cacheResponse;
    }

    // Issue a fetch request even if we have a cached response
    let fetchResult = (async () => {
      let fetchResponse, clonedRequest = request.clone();
      try {
        if (logging) console.info("request", request.url, request);
        fetchResponse = await fetch(request, { cache: "no-cache" });
      } catch (failureReason) {
        if (logging) console.info("no response", request.url, failureReason);

        // Add request to the deferred queue
        deferredRequests.push(clonedRequest);

        // Return the cached response if there is one; otherwise fake a 404 as the failure response
        // (A failure response won't fulfill the Promise.any below)
        if (cacheResponse)
          return cacheResponse;
        throw new Response(null, { status: 404 , statusText: "Not Found" });
      }

      if (fetchResponse.ok) {
        if (logging) console.info("response cached", request.url, fetchResponse.status, fetchResponse);
        cache.put(request, fetchResponse.clone());
        return fetchResponse;  // succeed with the response
      }

      if (logging) console.info("request rejected", request.url, fetchResponse.status, fetchResponse);

      // Requeue certain failures after a delay
      let status = fetchResponse.status, delaySeconds = 30;
      if (status === 503 || status === 504 || status === 509)
        delay(delaySeconds * 1000).then(() => { deferredRequests.push(clonedRequest) });

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

//
// Just doodling some machinery here that I don't really need.
//
let  _workerEventResolvers = [];

function nextWorkerEvent() {  // Promise for the next online event
  return new Promise(resolve => { _workerEventResolvers = resolve  });
}

function postWorkerEvent(event) {
  while (_workerEventResolvers.size > 0)
    _workerEventResolvers.pop()(event);
}

addEventListener('online', event => postWorkerEvent(event));

let deferredRequests = [];

// Start up the background task after a delay to keep
// from compating with app iniytiation
let _backgroundWork = delay(5000); 

onactivate = event => {
  // This is a good place to schedule some prefetches:
  deferredRequests.push(
    "foo.html",
    "bar.png",
  );
  _backgroundWork.then((async () => {
    let cache = await caches.open(cacheName);
    while (true) {
      while (deferredRequests.size > 0) {
        let request = deferredRequests.shift();
        if (typeof request === 'string')
          request = new Request(request);
        let fetchResponse;
        try {
          if (logging) console.info("background request", request.url, request);
          fetchResponse = await fetch(request, { cache: "no-cache" });
        } catch (error) {
          if (logging) console.info("background request failed", request.url, error);
        }
        if (fetchResponse.ok) {
          if (logging) console.info("background response cached", request.url, fetchResponse.status, fetchResponse);
          cache.put(request, fetchResponse.clone());
        } else {
          if (logging) console.info("background response rejected", request.url, fetchResponse.status, fetchResponse);
        }
        // Pause a bit between requests
        await delay(2000);
      }

      // Wait for a posted event or until a timer expires
      let delayMinutes = 5/60;   // XXX: change back to 30
      let event = await(Promise.any(nextWorkerEvent(), delay(delayMinutes * 60000, "timer")));
      if (event) {
        if (logging) console.info("event recieved", event.type, event);
      }
    }
  })());
}

