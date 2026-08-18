self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("push",event=>{
  let data={title:"MA График",body:"Новое событие смены",url:"./"};
  try{ if(event.data) data={...data,...event.data.json()}; }catch(e){ if(event.data) data.body=event.data.text(); }
  const options={body:data.body,icon:"./icon-192.png",badge:"./icon-192.png",tag:data.tag||"ma-shift",renotify:true,data:{url:data.url||"./"}};
  event.waitUntil(self.registration.showNotification(data.title||"MA График",options));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||"./",self.location.origin).href;
  event.waitUntil((async()=>{
    const list=await clients.matchAll({type:"window",includeUncontrolled:true});
    for(const c of list){ if(c.url.startsWith(self.location.origin)){ await c.focus(); if("navigate" in c) await c.navigate(url); return; } }
    await clients.openWindow(url);
  })());
});
