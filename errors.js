(function(global){
  "use strict";

  function create(options={}){
    const storageKey=String(options.storageKey||"ma_error_log_v1");
    const maxEntries=Math.max(10,Math.min(200,Number(options.maxEntries)||50));
    const now=typeof options.now==="function" ? options.now : ()=>new Date();
    const getContext=typeof options.getContext==="function" ? options.getContext : ()=>({});

    function storage(){
      try{ return global.localStorage || globalThis.localStorage || null; }
      catch(_){ return null; }
    }

    function redact(value,depth=0){
      if(depth>4) return "[truncated]";
      if(value===null || value===undefined) return value;
      if(typeof value==="string") return value.length>2000 ? value.slice(0,2000)+"…" : value;
      if(typeof value==="number" || typeof value==="boolean") return value;
      if(Array.isArray(value)) return value.slice(0,30).map(v=>redact(v,depth+1));
      if(typeof value==="object"){
        const out={};
        Object.entries(value).slice(0,50).forEach(([key,val])=>{
          if(/token|authorization|password|passwd|pin|secret|private|key/i.test(key)) out[key]="[REDACTED]";
          else out[key]=redact(val,depth+1);
        });
        return out;
      }
      return String(value);
    }

    function list(){
      try{
        const raw=storage()?.getItem(storageKey);
        if(!raw) return [];
        const parsed=JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      }catch(_){ return []; }
    }

    function write(entries){
      try{
        storage()?.setItem(storageKey,JSON.stringify(entries.slice(0,maxEntries)));
        return true;
      }catch(_){ return false; }
    }

    function errorInfo(error){
      if(error instanceof Error){
        return {
          name:String(error.name||"Error").slice(0,120),
          message:String(error.message||error).slice(0,2000),
          stack:String(error.stack||"").slice(0,6000)
        };
      }
      if(error && typeof error==="object"){
        return {
          name:String(error.name||"Error").slice(0,120),
          message:String(error.message||JSON.stringify(redact(error))).slice(0,2000),
          stack:String(error.stack||"").slice(0,6000)
        };
      }
      return {name:"Error",message:String(error||"Неизвестная ошибка").slice(0,2000),stack:""};
    }

    function log(scope,error,meta={}){
      try{
        const info=errorInfo(error);
        const atDate=now();
        const at=atDate instanceof Date ? atDate.toISOString() : new Date(atDate).toISOString();
        const entries=list();
        const previous=entries[0];
        const same=previous && previous.scope===String(scope||"error") && previous.message===info.message;
        const previousMs=same ? Date.parse(previous.lastAt||previous.at||"") : 0;
        const currentMs=Date.parse(at);

        if(same && previousMs && currentMs-previousMs<5000){
          previous.count=Number(previous.count||1)+1;
          previous.lastAt=at;
          previous.meta=redact(meta);
          write(entries);
          return previous;
        }

        let context={};
        try{ context=redact(getContext()||{}); }catch(_){ context={}; }
        const entry={
          id:`err-${currentMs||Date.now()}-${Math.random().toString(36).slice(2,8)}`,
          at,
          lastAt:at,
          count:1,
          scope:String(scope||"error").slice(0,160),
          name:info.name,
          message:info.message,
          stack:info.stack,
          meta:redact(meta),
          context
        };
        entries.unshift(entry);
        write(entries);
        return entry;
      }catch(_){ return null; }
    }

    function clear(){
      try{ storage()?.removeItem(storageKey); return true; }
      catch(_){ return false; }
    }

    function formatText(entries=list()){
      if(!entries.length) return "MA График — журнал ошибок пуст.";
      const blocks=entries.map((entry,index)=>{
        const count=Number(entry.count||1)>1 ? ` · повторов: ${entry.count}` : "";
        const meta=entry.meta && Object.keys(entry.meta).length ? `\nДанные: ${JSON.stringify(entry.meta)}` : "";
        const context=entry.context && Object.keys(entry.context).length ? `\nКонтекст: ${JSON.stringify(entry.context)}` : "";
        const stack=entry.stack ? `\nСтек: ${entry.stack}` : "";
        return `${index+1}. ${entry.at||"—"} · ${entry.scope||"error"}${count}\n${entry.name||"Error"}: ${entry.message||"—"}${meta}${context}${stack}`;
      });
      return `MA График — журнал ошибок (${entries.length})\n\n${blocks.join("\n\n")}`;
    }

    return {log,list,clear,formatText,redact};
  }

  global.MAErrors={create};
})(typeof window!=="undefined" ? window : globalThis);
