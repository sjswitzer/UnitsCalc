//
// I have no particular need for a service worker, but it's necessary for a PWA to work at all.
// There's nothing to pre-fetch because the page references all of its resources when
// loaded. But we can still have some fun optimizing the upgrade process.
//
// It's also an experiment to see whether async functions simplify writing service workers.
// Guess what? They do!
//
// Copyright 2021 Stan Switzer
//   This work is licensed under a Creative Commons Attribution-ShareAlike
//   4.0 International License. https://creativecommons.org/licenses/by-sa/4.0/
//

let logging = true; // You can change this in the debugger
let cacheName = location.pathname;  // Segregate caching by worker location
const seconds = 1000 /*ms*/, minutes = 60 * seconds, hours = 60 * minutes;

// There SHOULD be a Promise.delay like this.
const delay = (ms, val) => new Promise(resolve => setTimeout(() => resolve(val), ms));

onfetch = event => {
  let request = event.request;
  if (logging) console.info("onfetch", request.url, request);

  // There SHOULD be async blocks like this:
  //     async { ... }
  // Instead, I'll use
  //     (async () => { ... })()
  // just like we once created scopes using (function() { ... })(), hmm...
  event.respondWith((async () => {
    // Use only our specific cache. Most service worker samples match from the domain-wide
    // cache, "caches.match(...)", which seems like a bad idea to me.
    // Surely it's better to have each app manage its own cache in peace?
    // This is particularly useful when you serve test and production versions of
    // the app from the same origin.
    let cache = await caches.open(cacheName);
    let cacheResponse = await cache.match(request);

    // If we're offline just return the cached value immediately.
    // Due to "lie-fi" and related causes, "navigator.onLine" is unreliable,
    // but the way it's unreliable is that it can report online even if your network is
    // useless. If it returns false, you've (almost?) definitely got no network.
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
        deferRequest(clonedRequest);

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

      // Requeue certain rejections after a delay
      let status = fetchResponse.status;
      if (status === 503 || status === 504 || status === 509)
        delay(30 * seconds).then(() => { deferRequest(clonedRequest) });

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
    // so eat it. Otherwise the Promise machinery complains that it wasn't handled.
    fetchResult.catch(fetchFailure => {
      if (logging) console.info("eat fetch failure", request.url, fetchFailure.status, fetchFailure);
    });

    // Resolve with the fetch result or the cache response delayed for a moment, whichever is first.
    // If navigator.onLine is false, we will have already returned the cached response, so this
    // is not likely to happen often.
    let resp = await Promise.any([fetchResult, delay(2 * seconds, cacheResponse)]);
    if (logging) console.info("resolved with", request.url, resp.status, resp);
    return resp;
  })());
};

//
// Doodling some machinery here that I don't really need for this app...
//

const postBackgroundEvent = (() => {
  // Encapsulate the worker and its state
  let  _backgroundEvents = [], _backgroundEventResolvers = [];

  function nextBackgroundEvent() {  // Promise for the next online event
    return new Promise(resolve => {
      if (_backgroundEvents.length > 0) {
        let event = _backgroundEvents.shift();
        resolve(event);
        return;
      }
      _backgroundEventResolvers.push(resolve)
    });
  }

  function postBackgroundEvent(event) {
    if (_backgroundEventResolvers.length > 0) {
      let resolver = _backgroundEventResolvers.shift();
      resolver(event);
      return;
    }
    _backgroundEvents.push(event);
  }

  onactivate = event => {
    let deferredRequests = [];
  
    /*_backgroundWork = */ (async () => {
      // Delay a bit to stay out of the app's way while it's starting up.
      await delay(5 * seconds);
      if (logging) console.info("background work started")
  
      let cache = await caches.open(cacheName);
  
      // The idea here is to issue deferred requests one at a time at a leisurely pace
      // to keep from competing for network and other resources.
      while (true) {
        while (deferredRequests.length > 0) {
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
          await delay(2 * seconds);
        }
  
        // Wait for a posted event or timeout
        let event = await Promise.any([
          nextBackgroundEvent(),
          delay(5 * seconds).then(() => postBackgroundEvent(new Event("timeout"))), // XXX change to 30 minutes
        ]);
  
        if (event) {
          if (logging) console.info("event recieved", event.type, event);
          if (event.type === 'deferred-requests')
            deferredRequests.push(...event._requests);
        }
      }
    })();
  };

  // MDN says workers have an "online" event:
  //    https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/ononline
  // But Chrome's ServiceWorkerGlobalScope does not have an "ononline" property
  // and registering this event does nothing. On the other hand it does no harm. 
  self.addEventListener('online', event => postBackgroundEvent(event));
  self.addEventListener('offline', event => postBackgroundEvent(event));
  
  return postBackgroundEvent;
})();

function deferRequest(...requests) {  // or requests
  let event = new Event('deferred-requests');
  event._requests = requests;
  postBackgroundEvent(event);
}

// This is a fine place to schedule some prefetches:
deferRequest(
  "foo.html",
  "bar.png",
);