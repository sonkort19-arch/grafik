const CACHE_NAME="ma-grafik-shell-v4";
const APP_SHELL=[
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await Promise.allSettled(APP_SHELL.map(url=>cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name!==CACHE_NAME).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});

async function cachedNavigation(request){
  const cache=await caches.open(CACHE_NAME);
  const cached=
    await cache.match(request,{ignoreSearch:true}) ||
    await cache.match("./index.html") ||
    await cache.match("./");

  const network=fetch(request).then(async response=>{
    if(response && response.ok){
      try{ await cache.put("./index.html",response.clone()); }catch(e){}
    }
    return response;
  }).catch(()=>null);

  if(!cached){
    return (await network) || new Response("Нет соединения",{status:503,statusText:"Offline"});
  }

  return Promise.race([
    network.then(response=>response||cached),
    new Promise(resolve=>setTimeout(()=>resolve(cached),700))
  ]);
}

async function cachedAsset(request){
  const cache=await caches.open(CACHE_NAME);
  const cached=await cache.match(request,{ignoreSearch:true});

  if(cached){
    fetch(request).then(response=>{
      if(response && response.ok){
        cache.put(request,response.clone()).catch(()=>{});
      }
    }).catch(()=>{});

    return cached;
  }

  try{
    const response=await fetch(request);

    if(response && response.ok){
      cache.put(request,response.clone()).catch(()=>{});
    }

    return response;
  }catch(e){
    return new Response("",{
      status:503,
      statusText:"Offline"
    });
  }
}

self.addEventListener("fetch",event=>{
  const request=event.request;

  if(request.method!=="GET") return;

  const url=new URL(request.url);

  if(url.origin!==self.location.origin) return;

  if(request.mode==="navigate"){
    event.respondWith(cachedNavigation(request));
    return;
  }

  if(
    ["style","script","image","manifest","font"]
      .includes(request.destination)
  ){
    event.respondWith(cachedAsset(request));
  }
});

self.addEventListener("push",event=>{
  let data={
    title:"MA График",
    body:"Новое событие",
    url:"./"
  };

  try{
    if(event.data){
      data={
        ...data,
        ...event.data.json()
      };
    }
  }catch(e){
    if(event.data){
      data.body=event.data.text();
    }
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
    data:{
      url:data.url||"./"
    }
  };

  if(employeeReminder){
    options.vibrate=[250,120,250];
  }

  event.waitUntil(
    self.registration.showNotification(
      data.title||"MA График",
      options
    )
  );
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();

  const url=new URL(
    event.notification.data?.url||"./",
    self.location.origin
  ).href;

  event.waitUntil((async()=>{
    const list=await clients.matchAll({
      type:"window",
      includeUncontrolled:true
    });

    for(const c of list){
      if(c.url.startsWith(self.location.origin)){
        await c.focus();

        if("navigate" in c){
          await c.navigate(url);
        }

        return;
      }
    }

    await clients.openWindow(url);
  })());
});
