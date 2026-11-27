"use strict";(()=>{if(typeof Account>"u"||typeof engine>"u"||!Account.merge||!Account.compose||!engine.persist||!engine.mount||Account._addonStay)return;Account._addonStay=1;
const A=Account,E=engine,DAY=864e5,
own=a=>a&&a.baseUrl&&!a.builtin&&!a.virtual&&!a.studio,
norm=u=>{try{return StremioEngine.normalize(u)}catch{return u}},
both=l=>new Set([...l,...l.map(norm)]),
strs=v=>Array.isArray(v)?v.filter(x=>typeof x=="string"&&x):[],
uid=()=>A.user&&A.user.id||"",
hash=u=>{let h=0xcbf29ce4,l=0x84222325;const s=uid()+"|"+norm(u);for(let i=0;i<s.length;i++){l^=s.charCodeAt(i);const a=Math.imul(l,0x1b3),b=Math.imul(h,0x1b3)+Math.imul(l,0x100)+(a/4294967296>>>0);l=a>>>0;h=b>>>0}return h.toString(36)+l.toString(36)},
gk=()=>`mkc:addonGone:${uid()}`,
load=()=>{try{const o=JSON.parse(localStorage.getItem(gk())||"{}");return o&&typeof o=="object"&&!Array.isArray(o)?o:{}}catch{return{}}},
save=o=>{const cut=Date.now()-90*DAY,e=Object.entries(o).filter(([k,t])=>typeof k=="string"&&k.length<40&&+t>cut).sort((a,b)=>b[1]-a[1]).slice(0,300);try{localStorage.setItem(gk(),JSON.stringify(Object.fromEntries(e)))}catch{}return Object.fromEntries(e)};
// addons this device has loaded or been told to remove in this session
const seen=new Set,gone=new Set,mark=(s,u)=>{s.add(u);s.add(norm(u))};
E.addons.forEach(a=>a&&a.baseUrl&&mark(seen,a.baseUrl));
let first=!!E.booting||!(typeof S<"u"&&S.booted);
const mt=E.mount;E.mount=function(u){try{mark(seen,u)}catch{}return mt.apply(this,arguments)};
const ph=E.placeholder;E.placeholder&&(E.placeholder=function(u){try{mark(seen,u)}catch{}return ph.apply(this,arguments)});
const rm=E.remove;
E.remove=function(u){try{mark(gone,u);const a=this.addons.find(x=>x.baseUrl===u);if(uid()&&own(a)){const o=load();o[hash(u)]=Date.now();save(o)}}catch{}return rm.apply(this,arguments)};
const ins=E.install;
E.install=function(u){try{gone.delete(u);gone.delete(norm(u));if(!this.booting&&uid()){const o=load(),k=hash(u);k in o&&(delete o[k],save(o))}}catch{}return ins.apply(this,arguments)};
const ps=E.persist;
E.persist=function(){if(!this.booting)try{const st=strs(Store.get("addons",[]));
 // 1. a sync that landed while this device was still loading its old list wins over that list
 if(first){first=!1;const w=both(st);this.addons=this.addons.filter(a=>!own(a)||w.has(a.baseUrl)||w.has(norm(a.baseUrl)))}
 // 2. an addon from the account that could not load here yet stays in the list instead of being dropped
 const have=both(this.addons.filter(own).map(a=>a.baseUrl));
 st.forEach(u=>{if(!have.has(u)&&!have.has(norm(u))&&!seen.has(u)&&!seen.has(norm(u))&&!gone.has(u)&&!gone.has(norm(u)))this.placeholder(u,u.replace(/^https?:\/\//,""),"Could not load yet",!0)})
}catch{}return ps.apply(this,arguments)};
// 3. removed addons are remembered (hashed, per account) so a device with an old list cannot bring them back
const cp=A.compose;
A.compose=function(){const r=cp.apply(this,arguments),d=r&&r.doc;try{if(d&&d._sync&&uid()){const o=save(load());Object.keys(o).length&&(d._sync={...d._sync,ag:o})}}catch{}return r};
const ar=A.applyRemote;let remote=null;
ar&&(A.applyRemote=function(n){n&&Array.isArray(n.addons)&&(remote=strs(n.addons));return ar.apply(this,arguments)});
const mg=A.merge;
A.merge=async function(e){
 if(!e||typeof e!="object"||!uid())return mg.apply(this,arguments);
 try{const g=e._sync&&e._sync.ag;if(g&&typeof g=="object"){const o=load();Object.entries(g).forEach(([k,t])=>{+t>(+o[k]||0)&&(o[k]=+t)});save(o)}}catch{}
 remote=null;let c=await mg.apply(this,arguments);
 try{if(remote){const acc=both(remote),o=load(),cur=strs(Store.get("addons",[])),old=cur.filter(u=>!acc.has(u)&&!acc.has(norm(u))&&hash(u)in o);
  if(old.length){Store.set("addons",cur.filter(u=>!old.includes(u)));old.forEach(u=>{mark(gone,u);E.addons=E.addons.filter(a=>!(own(a)&&(a.baseUrl===u||a.baseUrl===norm(u))))});E.clearCache&&E.clearCache();E.emit&&E.emit("addons");c=!0;try{A.schedule&&A.schedule()}catch{}}}}catch{}
 remote=null;return c};
})();