//
// I have no particular need for a service worker, but it's necessary for a PWA to work at all.
// There are a few referenced images, but the app is fine without them.
// There's nothing to pre-fetch because the page references all of its resources when
// loaded. But we can still have some fun optimizing the upgrade process.
//
// This is also an experiment to see whether async functions simplify writing service workers.
// Guess what? They do!
//
// Copyright 2021 Stan Switzer
//   This work is licensed under a Creative Commons Attribution-ShareAlike
//   4.0 International License. https://creativecommons.org/licenses/by-sa/4.0/
//

let logging = true;  // You can change this in the debugger
let useNavigatorOnline = false;  // For testing; it should work either way
let cacheName = location.pathname;  // Segregate caching by worker location
const seconds = 1000 /*ms*/, minutes = 60 * seconds;

// There SHOULD be a Promise.delay like this.
const delay = (ms, val) => new Promise(resolve => setTimeout(() => resolve(val), ms));

self.onfetch = event => {
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
    if (cacheResponse && useNavigatorOnline && navigator.onLine === false) {
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
        if (logging) console.info("request failed", request.url, failureReason);

        // Add request to the deferred queue
        deferRequest(clonedRequest);

        // Fake a 404
        fetchResponse = new Response(null, { status: 404 , statusText: "Not Found" });
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
      return fetchResponse;
    })();

    if (!cacheResponse) {
      if (logging) console.info("uncached", request.url);
      // Since there's no cache, return the fetch result
      return fetchResult;
    }

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
  // Encapsulate the background worker and its state
  let _backgroundEvents = [], _backgroundEventResolvers = [];

  function nextBackgroundEvent() {
    if (_backgroundEvents.length > 0)
      return Promise.resolve(_backgroundEvents.shift());
    return new Promise(resolve => _backgroundEventResolvers.push(resolve));
  }

  function postBackgroundEvent(event) {
    if (_backgroundEventResolvers.length > 0)
      return void _backgroundEventResolvers.shift()(event);
    _backgroundEvents.push(event);
  }

  self.onactivate = event => {
    (async () => {
      // Delay a bit to stay out of the app's way while it's starting up.
      await delay(5 * seconds);
      if (logging) console.info("background work started", event)
  
      let cache = await caches.open(cacheName);
      let deferredRequests = [];
  
      // The idea here is to issue deferred requests one at a time at a leisurely pace
      // to keep from competing for network and other resources.
      for (;;) {
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
          // delay(30 * minutes).then(() => new Event("timeout")),
          delay(5 * seconds).then(() => new Event("timeout")),   // XXX
        ]);
  
        if (logging) console.info("event recieved", event.type, event);
        if (event.type === 'deferred-requests')
          deferredRequests.push(...event._requests);
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

// This is a fine place to schedule some prefetches
// (which I don't actually need right now)
deferRequest(
  // "foo.html",
  // "bar.png",
);