const CACHE = 'dropzyy-static-v2';
const STATIC = ['/', '/assets/html/index.html', '/assets/css/styles.css', '/assets/css/admin.css', '/assets/js/app.js', '/assets/js/config.js', '/assets/js/modal.js', '/assets/js/auth-lifecycle.js', '/assets/js/app-errors.js', '/manifest.webmanifest', '/images/dropzyy-logo.png', '/images/dropzyy-logo-tight.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('dropzyy-static-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const u = new URL(event.request.url);
  if (event.request.method !== 'GET' || u.origin !== location.origin || u.search || /supabase\.co$/.test(u.hostname) || /^\/(rest|auth|functions|storage)\//.test(u.pathname)) return;
  if (event.request.mode === 'navigate') { event.respondWith(fetch(event.request).catch(() => caches.match('/assets/html/index.html'))); return; }
  if (!/\.(?:css|js|png|jpg|jpeg|svg|webmanifest|ico|woff2?)$/.test(u.pathname)) return;
  if (u.pathname === '/assets/js/app.js') {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(c => c.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => { const copy=response.clone(); caches.open(CACHE).then(c=>c.put(event.request,copy)); return response; })));
});
self.addEventListener('push', event => { let p={}; try { p=event.data?.json()||{}; } catch (_) {} const data=p.data||{}; const target=p.target_url||data.target_url||data.url||p.url||'#/orders'; event.waitUntil(self.registration.showNotification(p.title||'Dropzyy update',{body:p.body||p.message||'You have an order update.',tag:p.tag||data.order_id||p.order_id||'dropzyy',data:{url:target,target_url:target,type:p.type||data.type||'',order_id:p.order_id||data.order_id||null,order_number:p.order_number||data.order_number||null},badge:'/images/dropzyy-logo-tight.png'})); });
self.addEventListener('notificationclick', event => { event.notification.close(); const target=event.notification.data?.target_url||event.notification.data?.url||'/#/orders'; event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list => { const c=list[0]; if(c){ c.focus(); c.navigate(new URL(target,location.origin).href); return; } return clients.openWindow(new URL(target,location.origin).href); })); });
