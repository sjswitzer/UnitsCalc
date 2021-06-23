  // I have no particular need for a service worker, but it's needed for a PWA
  self.addEventListener('fetch', function(event) {
    event.respondWith(caches.match(event.request).then(function(response) {
      if (response !== undefined) {
        return response;
      } else {
        return fetch(event.request).then(function (response) {
          caches.open('v1').then(function (cache) {
            cache.put(event.request, response.clone());
          });
          return response;
        });
      }
    }));
  });