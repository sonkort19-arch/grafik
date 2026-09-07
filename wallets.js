(function(global){
  "use strict";

  global.MAWallets={
    create(deps){
      if(!deps || typeof deps.moscowParts!=="function") throw new Error("MA Wallets: moscowParts dependency is required");
      const SHIFT_TIMEZONE=String(deps.SHIFT_TIMEZONE||"Europe/Moscow");
      const MONTHS=Array.isArray(deps.MONTHS)?deps.MONTHS:[];
      const WALLET_DATA_VERSION=Number(deps.WALLET_DATA_VERSION||3);
      const WALLET_STORAGE_KEY=String(deps.WALLET_STORAGE_KEY||"ma_personal_wallets_v1");
      const moscowParts=deps.moscowParts;

      function walletCurrentMonthKey(){
        const p=moscowParts();
        return `${p.year}-${String(p.month).padStart(2,"0")}`;
      }

      function walletMonthKeyFromIso(iso){
        try{
          const parts=new Intl.DateTimeFormat("en-CA",{timeZone:SHIFT_TIMEZONE,year:"numeric",month:"2-digit"}).formatToParts(new Date(iso));
          const year=parts.find(x=>x.type==="year")?.value;
          const month=parts.find(x=>x.type==="month")?.value;
          return year&&month?`${year}-${month}`:walletCurrentMonthKey();
        }catch(e){ return walletCurrentMonthKey(); }
      }

      function walletMonthLabel(key){
        const [y,m]=String(key||walletCurrentMonthKey()).split("-").map(Number);
        if(!y || !m) return key||"";
        return `${MONTHS[m-1]||String(m)} ${y}`;
      }

      function walletShiftMonth(key,delta){
        const [y,m]=String(key||walletCurrentMonthKey()).split("-").map(Number);
        const d=new Date(Date.UTC(y,m-1+delta,1));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
      }

      function walletStartOfMonthIso(key){
        const [y,m]=String(key).split("-").map(Number);
        return new Date(Date.UTC(y,m-1,1,21,0,0)-24*60*60*1000).toISOString();
      }

      function walletLegacyDefaults(plans={}){
        const base=[
          {id:"products",name:"Продукты",type:"expense"},
          {id:"pocket",name:"Карманные расходы",type:"expense"},
          {id:"restaurant",name:"Ресторан",type:"expense"},
          {id:"vacation",name:"Отпуск",type:"savings"},
          {id:"savings",name:"Накопления",type:"savings"},
          {id:"clothes",name:"Вещи",type:"expense"},
          {id:"children",name:"Дети",type:"expense"},
          {id:"self",name:"На себя",type:"expense"},
          {id:"insurance",name:"Страховка",type:"savings",systemRole:"insurance"}
        ];
        return base.map((w,index)=>({
          id:w.id,name:w.name,type:w.type,
          monthlyPlanCents:w.systemRole?0:Math.max(0,Math.trunc(Number(plans[w.id])||0)),
          goalCents:0,protected:!!w.systemRole || ["savings"].includes(w.id),archived:false,
          order:index+1,priority:index+1,rollover:"carry",systemRole:w.systemRole||""
        }));
      }

      function emptyWalletState(){
        return {
          version:WALLET_DATA_VERSION,
          wallets:walletLegacyDefaults({}),
          strategy:"proportional",
          configUpdatedAt:"",
          historyClearedAt:"",
          lastRolloverMonth:walletCurrentMonthKey(),
          transactions:[]
        };
      }

      function walletBackupBeforeMigration(raw){
        if(!raw || typeof raw!=="object") return;
        const oldVersion=Number(raw.version||1);
        if(oldVersion>=WALLET_DATA_VERSION) return;
        const flag="ma_personal_wallets_v3_backup_done";
        try{
          if(localStorage.getItem(flag)) return;
          const stamp=new Date().toISOString().replace(/[:.]/g,"-");
          localStorage.setItem(`ma_personal_wallets_backup_v${oldVersion}_${stamp}`,JSON.stringify(raw));
          localStorage.setItem(flag,"1");
        }catch(e){ console.warn("wallet migration backup",e); }
      }

      function normalizeWalletDefinition(raw,index=0){
        if(!raw || typeof raw!=="object") return null;
        const id=String(raw.id||"").trim();
        if(!id || id.length>80) return null;
        const systemRole=raw.systemRole==="insurance"?"insurance":"";
        const type=systemRole?"savings":(raw.type==="savings"?"savings":"expense");
        const plan=Number(raw.monthlyPlanCents ?? raw.planCents ?? 0);
        const goal=Number(raw.goalCents ?? 0);
        return {
          id,
          name:String(raw.name||"Кошелёк").trim().slice(0,60)||"Кошелёк",
          type,
          monthlyPlanCents:systemRole?0:(Number.isSafeInteger(plan)&&plan>=0?plan:0),
          goalCents:Number.isSafeInteger(goal)&&goal>=0?goal:0,
          protected:!!raw.protected || !!systemRole,
          archived:systemRole?false:!!raw.archived,
          order:Number.isFinite(Number(raw.order))?Number(raw.order):index+1,
          priority:Number.isFinite(Number(raw.priority))?Math.max(1,Math.trunc(Number(raw.priority))):index+1,
          rollover:["carry","insurance"].includes(raw.rollover)?raw.rollover:"carry",
          systemRole
        };
      }

      function normalizeWalletTransaction(t){
        if(!t || typeof t!=="object") return null;
        const allowed=["distribution","topup","expense","transfer","reversal","correction","auto_carryover"];
        const amount=Number(t.amountCents);
        if(typeof t.id!=="string" || !t.id || typeof t.operationId!=="string" || !t.operationId) return null;
        if(!String(t.walletId||"").trim() || !Number.isSafeInteger(amount) || amount===0) return null;
        if(!allowed.includes(String(t.type))) return null;
        const createdAt=!Number.isNaN(Date.parse(String(t.createdAt||"")))?String(t.createdAt):new Date().toISOString();
        const effectiveAt=!Number.isNaN(Date.parse(String(t.effectiveAt||"")))?String(t.effectiveAt):createdAt;
        return {
          id:String(t.id),operationId:String(t.operationId),type:String(t.type),walletId:String(t.walletId),
          amountCents:amount,comment:String(t.comment||""),createdAt,effectiveAt,
          reversalOfTransactionId:t.reversalOfTransactionId?String(t.reversalOfTransactionId):"",
          reversesOperationId:t.reversesOperationId?String(t.reversesOperationId):"",
          sourceType:t.sourceType?String(t.sourceType):""
        };
      }

      function normalizeWalletState(raw){
        const base=emptyWalletState();
        if(!raw || typeof raw!=="object") return base;
        walletBackupBeforeMigration(raw);
        const historyClearedAt=raw.historyClearedAt && !Number.isNaN(Date.parse(String(raw.historyClearedAt))) ? String(raw.historyClearedAt) : "";
        const clearedMs=historyClearedAt ? Date.parse(historyClearedAt) : 0;
        const tx=(Array.isArray(raw.transactions)?raw.transactions.map(normalizeWalletTransaction).filter(Boolean):[])
          .filter(t=>!clearedMs || (Date.parse(t.createdAt)||0)>clearedMs);
        let wallets=[];
        if(Array.isArray(raw.wallets)) wallets=raw.wallets.map(normalizeWalletDefinition).filter(Boolean);
        else wallets=walletLegacyDefaults(raw.plans&&typeof raw.plans==="object"?raw.plans:{});

        const known=new Set(wallets.map(w=>w.id));
        tx.forEach(t=>{
          if(known.has(t.walletId)) return;
          wallets.push(normalizeWalletDefinition({id:t.walletId,name:`Кошелёк ${t.walletId}`,type:"expense",archived:true,order:wallets.length+1,priority:wallets.length+1},wallets.length));
          known.add(t.walletId);
        });

        let insurance=wallets.find(w=>w.systemRole==="insurance" || w.id==="insurance");
        if(!insurance){
          insurance=normalizeWalletDefinition({id:"insurance",name:"Страховка",type:"savings",systemRole:"insurance",protected:true,order:wallets.length+1,priority:wallets.length+1},wallets.length);
          wallets.push(insurance);
        }else{
          insurance.id="insurance";insurance.systemRole="insurance";insurance.type="savings";insurance.archived=false;insurance.monthlyPlanCents=0;
        }

        const dedup=[];const ids=new Set();
        wallets.sort((a,b)=>a.order-b.order || a.name.localeCompare(b.name,"ru"));
        wallets.forEach((w,index)=>{ if(ids.has(w.id)) return; ids.add(w.id);w.order=index+1;dedup.push(w); });

        let configUpdatedAt="";
        if(raw.configUpdatedAt && !Number.isNaN(Date.parse(String(raw.configUpdatedAt)))) configUpdatedAt=String(raw.configUpdatedAt);
        else if(raw.plansUpdatedAt && !Number.isNaN(Date.parse(String(raw.plansUpdatedAt)))) configUpdatedAt=String(raw.plansUpdatedAt);
        else if(dedup.some(w=>w.monthlyPlanCents>0)) configUpdatedAt="2000-01-01T00:00:00.000Z";

        return {
          version:WALLET_DATA_VERSION,wallets:dedup,
          strategy:raw.strategy==="priority"?"priority":"proportional",
          configUpdatedAt,historyClearedAt,
          lastRolloverMonth:/^\d{4}-\d{2}$/.test(String(raw.lastRolloverMonth||""))?String(raw.lastRolloverMonth):walletCurrentMonthKey(),
          transactions:tx.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id))
        };
      }

      function loadWalletState(){
        try{
          const raw=JSON.parse(localStorage.getItem(WALLET_STORAGE_KEY)||"null");
          const next=normalizeWalletState(raw);
          try{ localStorage.setItem(WALLET_STORAGE_KEY,JSON.stringify(next)); }catch(_){}
          return next;
        }catch(e){
          console.error("wallet load",e);
          return emptyWalletState();
        }
      }

      function parseMoneyInput(value){
        const normalized=String(value??"").replace(/[\s\u00a0\u202f₽]/g,"").replace(",",".");
        if(!normalized) return null;
        const m=normalized.match(/^(\d+)(?:\.(\d{0,2}))?$/);
        if(!m) return null;
        try{
          const centsBig=BigInt(m[1])*100n+BigInt((m[2]||"").padEnd(2,"0")||"0");
          if(centsBig>BigInt(Number.MAX_SAFE_INTEGER)) return null;
          return Number(centsBig);
        }catch(e){ return null; }
      }

      function moneyInputValue(cents){
        const safe=Math.max(0,Math.trunc(Number(cents)||0));
        const rub=Math.floor(safe/100), kop=safe%100;
        return kop ? `${rub},${String(kop).padStart(2,"0")}` : String(rub);
      }

      function formatMoney(cents,{signed=false}={}){
        const n=Math.trunc(Number(cents)||0);
        const sign=n<0?"−":(signed&&n>0?"+":"");
        const abs=Math.abs(n), rub=Math.floor(abs/100), kop=abs%100;
        const main=rub.toLocaleString("ru-RU");
        return `${sign}${main}${kop?","+String(kop).padStart(2,"0"):""} ₽`;
      }

      function walletTransactionMonth(t){ return walletMonthKeyFromIso(t.effectiveAt||t.createdAt); }

      function walletNewId(){
        try{ return `wallet_${crypto.randomUUID().replace(/-/g,"")}`; }
        catch(e){ return `wallet_${Date.now()}_${Math.random().toString(36).slice(2,10)}`; }
      }
      function walletNewOperationId(){ return `wallet-op-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
      function walletNewTransactionId(index=0){ return `wallet-tx-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`; }

      function buildWalletOperation(type,entries,comment="",extra={}){
        const operationId=extra.operationId||walletNewOperationId();
        const createdAt=extra.createdAt||new Date().toISOString();
        const effectiveAt=extra.effectiveAt||createdAt;
        const items=[];
        entries.forEach((entry,index)=>{
          const amount=Math.trunc(Number(entry.amountCents)||0);
          if(!amount) return;
          items.push({
            id:entry.id||walletNewTransactionId(index),operationId,type,walletId:String(entry.walletId),amountCents:amount,
            comment:String(comment||""),createdAt,effectiveAt,
            reversalOfTransactionId:String(entry.reversalOfTransactionId||""),
            reversesOperationId:String(extra.reversesOperationId||""),sourceType:String(extra.sourceType||"")
          });
        });
        return {operationId,type,comment:String(comment||""),createdAt,effectiveAt,reversesOperationId:String(extra.reversesOperationId||""),sourceType:String(extra.sourceType||""),items};
      }

      return {
        walletCurrentMonthKey,walletMonthKeyFromIso,walletMonthLabel,walletShiftMonth,walletStartOfMonthIso,
        walletLegacyDefaults,emptyWalletState,walletBackupBeforeMigration,normalizeWalletDefinition,
        normalizeWalletTransaction,normalizeWalletState,loadWalletState,
        parseMoneyInput,moneyInputValue,formatMoney,walletTransactionMonth,
        walletNewId,walletNewOperationId,walletNewTransactionId,buildWalletOperation
      };
    }
  };
})(window);
