const SW_VERSION = "ma-grafik-2026-08-21-stability-1";

// MA График intentionally does not cache index.html here.
// The browser/network remains the source of truth for app updates.
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));

self.addEventListener("message",event=>{
  if(event.data?.type==="SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push",event=>{
  let data={title:"MA График",body:"Новое событие",url:"./"};
  try{
    if(event.data) data={...data,...event.data.json()};
  }catch(e){
    if(event.data) data.body=event.data.text();
  }

  const employeeReminder=data.employeeReminder===true;
  const options={
    body:data.body,
    icon:"./icon-192.png",
    badge:"./icon-192.png",
    tag:data.tag||"ma-shift",
    renotify:true,
    silent:false,
    requireInteraction:data.sticky===true,
    data:{url:data.url||"./",swVersion:SW_VERSION}
  };

  if(employeeReminder) options.vibrate=[250,120,250];
  event.waitUntil(self.registration.showNotification(data.title||"MA График",options));
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||"./",self.location.origin).href;
  event.waitUntil((async()=>{
    const list=await clients.matchAll({type:"window",includeUncontrolled:true});
    for(const c of list){
      if(c.url.startsWith(self.location.origin)){
        if("navigate" in c) await c.navigate(url);
        await c.focus();
        return;
      }
    }
    if(clients.openWindow) await clients.openWindow(url);
  })());
});
