  // I have no particular need for a service worker, but it's needed for a PWA
   self.addEventListener('fetch', event => {
    event.respondWith(caches.match(event.request).then(response => {
      if (response) {
        return response;
      } else {
        return fetch(event.request).then(response => {
          let cloned = response.clone();
          caches.open('v1').then(cache => cache.put(event.request, cloned));
          return response;
        });
      }
    }));
  });