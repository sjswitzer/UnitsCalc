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

let logging = false;  // You can change this in the debugger
let useNavigatorOnline = true;  // For testing; it should work either way
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
    // Use only our specific cache. Most service worker examples match from the domain-wide
    // cache, "caches.match(...)", which seems like a bad idea to me.
    // Surely it's better to have each app manage its own cache in peace?
    // This is particularly useful when you serve test and production versions of
    // the app from the same origin.
    let cache = await caches.open(cacheName);
    let cacheResponse = await cache.match(request);
    if (logging) console.info("cache response", cacheResponse);

    // If we're offline just return the cached value immediately.
    // Due to "lie-fi" and related causes, "navigator.onLine" is unreliable,
    // but the way it's unreliable is that it can report online even if your network is
    // useless. If it returns false, you've (almost?) definitely got no network.
    // BUT, in that case the request is very likely to fail immediately and you have
    // to handle that anyway. HOWEVER, testing "navigator.onLine" before calling fetch MIGHT
    // prevent annoying browser popups asking to enable the network. So there's that.
    if (useNavigatorOnline && navigator.onLine === false) {
      if (cacheResponse) {
        if (logging) console.log("offline cached response", request.url, cacheResponse.status, cacheResponse);
        return cacheResponse;
      }
      if (logging) console.log("offline no-cache response", request.url);
      // Add request to the deferred queue after a delay and fake a 502 Bad Gateway response
      deferRequest({ request: request, delay: 5 * minutes });
      return new Response(null, { status: 502, statusText: "Offline" });
    }

    // Issue a fetch request even if we have a cached response
    let fetchResult = (async () => {
      let fetchResponse, clonedRequest = request.clone();
      try {
        if (logging) console.info("request", request.url, request);
        fetchResponse = await fetch(request, { cache: "no-cache" });
        if (logging) console.info("response", request.url, fetchResponse.status, fetchResponse);
      } catch (failureReason) {
        if (logging) console.info("request failed", request.url, failureReason);
        // Add request to the deferred queue after a delay and fake a 502 Bad Gateway response
        deferRequest({ request: clonedRequest, delay: 5 * minutes });
        fetchResponse = new Response(null, { status: 502, statusText: "Network Failed" });
      }

      if (fetchResponse.ok) {
        if (logging) console.info("response cached", request.url, fetchResponse.status, fetchResponse);
        cache.put(request, fetchResponse.clone());
        return fetchResponse;
      }

      // Requeue certain rejections after a delay
      let status = fetchResponse.status;
      if ((status === 503 || status === 504 || status === 509))
        deferRequest({ request: clonedRequest, delay: 2 * seconds });

      if (cacheResponse)
        return cacheResponse;
      return fetchResponse;
    })();

    if (!cacheResponse) {
      if (logging) console.info("uncached response", request.url);
      return fetchResult;
    }

    // Resolve with the fetch result or the cache response delayed for a moment, whichever is first.
    // If navigator.onLine is false, we will have already returned the cached response, so this
    // is not likely to happen often.
    if (logging) console.info("awaiting response", request.url)
    let resp = await Promise.any([fetchResult, delay(2 * seconds, cacheResponse)]);
    if (logging) console.info("resolved with", request.url, resp.status,
        resp === cacheResponse ? "cached" : "network", resp);
    return resp;
  })());
};

//
// Doodling some machinery here that I don't really need for this app...
// It's all kindof a lark but why not?
//

const postBackgroundMessage = (() => {
  // Encapsulate the background worker and its state
  let _backgroundEvents = [], _backgroundMessageResolvers = [];

  function nextBackgroundMessage() {
    if (_backgroundEvents.length > 0)
      return Promise.resolve(_backgroundEvents.shift());
    return new Promise(resolve => _backgroundMessageResolvers.push(resolve));
  }

  function postBackgroundMessage(event) {
    if (_backgroundMessageResolvers.length > 0)
      return void _backgroundMessageResolvers.shift()(event);
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
        while (deferredRequests.length > 0 && !(useNavigatorOnline && navigator.onLine === false)) {
          // request is either Request or string or { request: request, ...opts }
          let request = deferredRequests.shift(), opts = {};
          if (typeof request === 'object' && !(request instanceof Request))
            opts = request, request = opts.request;
          if (typeof request === 'string')
            request = new Request(request);
          if (!(request instanceof Request)) {
            if (logging) console.error("request options contains no request", request, opts);
            continue;
          }
          if (opts.delay) {
            delay(opts.delay).then(() => deferredRequests.push({...opts, request, delay: 0 }));
            continue;
          }
          let fetchResponse, clonedRequest = request.clone();
          try {
            if (logging) console.info("background request", request.url, request);
            fetchResponse = await fetch(request, { cache: "no-cache" });
            if (logging) console.info("background response", request.url, fetchResponse.status, fetchResponse);
          } catch (error) {
            if (logging) console.info("background request failed", request.url, error);
          }
          if (fetchResponse?.ok) {  // ?. because we might have come from the catch block
            if (logging) console.info("background response cached", request.url, fetchResponse.status, fetchResponse);
            cache.put(request, fetchResponse.clone());
          } else {
            if (fetchResponse && opts.retry !== 0) {
              let status = fetchResponse.status;
              if (status === 503 || status === 504 || status === 509) {
                opts.retry ||= 10;
                opts.retryDelay ||= 2 * seconds;
              }
            }
            if (opts?.retry > 0) {
              opts.request = clonedRequest;
              opts.retryDelay ||= 1 * seconds;  // ??= still spottily-supported
              opts.retryDelayFactor ||= 2;
              opts.delay = opts.retryDelay;
              opts.retryDelay = retryDelayFactor * opts.retryDelay;
              opts.retry = opts.retry ? opts.retry - 1 : 0;
              if (logging) console.info("background request failed", request.url, opts);
              deferredRequests.push(opts);
            }
          }
          // Pause a bit between requests
          await delay(2 * seconds);
        }
  
        let message;
        if (deferredRequests.length === 0) {
         // If there's no work to do, just wait for a posted message
          message = await nextBackgroundMessage();
        } else {
          // Otherwise, wait for a message or a timeout
          message = await Promise.any([
            nextBackgroundMessage(),
            delay(5 * minutes).then(() => "timer"),
          ]);
        }
  
        if (logging) console.info("background message recieved", message);
        if (message.deferredRequests)
          deferredRequests.push(...message.deferredRequests);
      }
    })();
  };

  // MDN says workers have an "online" event:
  //    https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/ononline
  // But Chrome's ServiceWorkerGlobalScope does not have an "ononline" property
  // and registering this event does nothing. On the other hand it does no harm. 
  self.addEventListener('online', event => postBackgroundMessage(event));
  self.addEventListener('offline', event => postBackgroundMessage(event));
  
  return postBackgroundMessage;
})();

function deferRequest(...requests) {  // ... or requests
  postBackgroundMessage({ deferredRequests: requests });
}

// This is a fine place to schedule some prefetches
// (which I don't actually need right now)
deferRequest(
  // "foo.html",
  // "bar.png",
);