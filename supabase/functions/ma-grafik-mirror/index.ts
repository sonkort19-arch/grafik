// MA Grafik static mirror. Public static files only: no database privileges or secrets.
const PREFIX = "/functions/v1/ma-grafik-mirror";
const SOURCE = "https://raw.githubusercontent.com/sonkort19-arch/grafik/main/";
const EXTENSIONS = /^(?:[a-zA-Z0-9_-]+\.(?:html|js|css|svg|png|webmanifest|jpg|jpeg|ico|json|txt)|assets\/[a-zA-Z0-9_-]+\.(?:svg|png|jpg|jpeg|webp)|(?:plugin|oauth)\/[a-zA-Z0-9_-]+\.(?:html|js|css))$/;
const TYPE: Record<string,string> = {
  html:"text/html; charset=utf-8", js:"text/javascript; charset=utf-8",
  css:"text/css; charset=utf-8", json:"application/json; charset=utf-8",
  webmanifest:"application/manifest+json; charset=utf-8",
  svg:"image/svg+xml",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",
  ico:"image/x-icon",webp:"image/webp",txt:"text/plain; charset=utf-8"
};
Deno.serve(async (request: Request): Promise<Response> => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex"
  };
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers});
  if(request.method!=="GET"&&request.method!=="HEAD"){
    return new Response("Method not allowed",{status:405,headers});
  }
  const url=new URL(request.url);
  // Gateway URLs can be absolute or function-relative.
  const slug="ma-grafik-mirror";
  const marker="/"+slug;
  const at=url.pathname.lastIndexOf(marker);
  let relative=at>=0?url.pathname.slice(at+marker.length):url.pathname;
  if(!relative||relative==="/"){
    if(!url.pathname.endsWith("/")){
      const destination=new URL(url.href);
      destination.pathname=PREFIX+"/";
      return Response.redirect(destination.toString(),307);
    }
    relative="/index.html";
  }
  while(relative.startsWith("/"))relative=relative.slice(1);
  let path="";
  try{path=decodeURIComponent(relative);}
  catch(_){return new Response("Invalid path",{status:400,headers});}
  console.log("MA-Grafik mirror path",url.pathname,path);
  if(!path)path="index.html";
  if(path.includes("..")||path.includes("\\")||!EXTENSIONS.test(path)){
    return new Response("Not found",{status:404,headers});
  }
  const ext=path.slice(path.lastIndexOf(".")+1).toLowerCase();
  try{
    const upstream=await fetch(SOURCE+path,{
      method:"GET",
      headers:{"Accept":"*/*","User-Agent":"MA-Grafik-Public-Static-Mirror"},
      signal:AbortSignal.timeout(12000)
    });
    if(!upstream.ok)return new Response("Asset not available",{status:upstream.status===404?404:502,headers});
    const cache=path==="index.html"||path==="lite.html"?"public, max-age=15, s-maxage=30":"public, max-age=30, s-maxage=60";
    return new Response(request.method==="HEAD"?null:upstream.body,{
      status:200,
      headers:{...headers,"Content-Type":TYPE[ext]||"application/octet-stream","Cache-Control":cache}
    });
  }catch(error){
    console.error("MA Grafik static mirror fetch failed",path,String(error));
    return new Response("Temporary mirror error",{status:502,headers:{"Content-Type":"text/plain; charset=utf-8",...headers}});
  }
});