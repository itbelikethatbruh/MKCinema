"use strict";(()=>{if(typeof Account>"u"||typeof engine>"u"||!Account.merge||!Account.compose||!engine.persist||!engine.mount||Account._addonStay)return;Account._addonStay=1;
const A=Account,E=engine,DAY=864e5,
own=a=>a&&a.baseUrl&&!a.builtin&&!a.virtual&&!a.studio,
norm=u=>{try{return StremioEngine.normalize(u)}catch{return u}},
both=l=>new Set([...l,...l.map(norm)]),
strs=v=>Array.isArray(v)?v.filter(x=>typeof x=="string"&&x):[],
uid=()=>A.user&&A.user.id||"",
hash=u=>{let h=0xcbf29ce4,l=0x84222325;const s=uid()+"|"+norm(u);for(let i=0;i<s.length;i++){l^=s.charCodeAt(i);const a=Math.imul(l,0x1b3),b=Math.imul(h,0x1b3)+Math.imul(l,0x100)+(a/4294967296>>>0);l=a>>>0;h=b>>>0}return h.toString(36)+l.toString(36)},
gk=n=>`mkc:addon${n}:${uid()}`,
load=(n="Gone")=>{try{const o=JSON.parse(localStorage.getItem(gk(n))||"{}");return o&&typeof o=="object"&&!Array.isArray(o)?o:{}}catch{return{}}},
save=(o,n="Gone")=>{const cut=Date.now()-90*DAY,e=Object.entries(o).filter(([k,t])=>typeof k=="string"&&k.length<40&&+t>cut).sort((a,b)=>b[1]-a[1]).slice(0,300);try{localStorage.setItem(gk(n),JSON.stringify(Object.fromEntries(e)))}catch{}return Object.fromEntries(e)},
// removed after it was last added (on any device of the account)
dead=(u,o,ad)=>{const k=hash(u);return(+o[k]||0)>(+ad[k]||0)},
max=(n,g)=>{if(!g||typeof g!="object"||Array.isArray(g))return;const o=load(n);let ch=!1;Object.entries(g).forEach(([k,t])=>{+t>(+o[k]||0)&&(o[k]=+t,ch=!0)});ch&&save(o,n)};
// addons this device has loaded or been told to remove in this session
const seen=new Set,gone=new Set,mark=(s,u)=>{s.add(u);s.add(norm(u))};
E.addons.forEach(a=>a&&a.baseUrl&&mark(seen,a.baseUrl));
let first=!!E.booting||!(typeof S<"u"&&S.booted);
const mt=E.mount;E.mount=function(u){try{mark(seen,u)}catch{}return mt.apply(this,arguments)};
const ph=E.placeholder;E.placeholder&&(E.placeholder=function(u){try{mark(seen,u)}catch{}return ph.apply(this,arguments)});
const rm=E.remove;
E.remove=function(u){try{mark(gone,u);const a=this.addons.find(x=>x.baseUrl===u);if(uid()&&(own(a)||!a&&strs(Store.get("addons",[])).some(x=>x===u||norm(x)===norm(u)))){const o=load();o[hash(u)]=Date.now();save(o)}}catch{}return rm.apply(this,arguments)};
const ins=E.install;
E.install=function(u){try{gone.delete(u);gone.delete(norm(u));if(!this.booting&&!inRemote&&uid()){const ad=load("Add");ad[hash(u)]=Date.now();save(ad,"Add")}}catch{}return ins.apply(this,arguments)};
const ps=E.persist;
E.persist=function(){if(!this.booting)try{const st=strs(Store.get("addons",[]));
 // 1. a sync that landed while this device was still loading its old list wins over that list
 if(first){first=!1;const w=both(st);this.addons=this.addons.filter(a=>!own(a)||w.has(a.baseUrl)||w.has(norm(a.baseUrl)))}
 // 2. an addon from the account that could not load here yet stays in the list instead of being dropped
 const have=both(this.addons.filter(own).map(a=>a.baseUrl));
 st.forEach(u=>{if(!have.has(u)&&!have.has(norm(u))&&!seen.has(u)&&!seen.has(norm(u))&&!gone.has(u)&&!gone.has(norm(u)))this.placeholder(u,u.replace(/^https?:\/\//,""),"Could not load yet",!1)})
}catch{}return ps.apply(this,arguments)};
// 3. removed addons are remembered (hashed, per account) so a device with an old list cannot bring them back
const cp=A.compose;
A.compose=function(){const r=cp.apply(this,arguments),d=r&&r.doc;try{if(d&&d._sync&&uid()){const o=save(load()),ad=save(load("Add"),"Add");Object.keys(o).length&&(d._sync={...d._sync,ag:o,...Object.keys(ad).length?{aa:ad}:{}})}}catch{}return r};
const ar=A.applyRemote;let remote=null,inRemote=0;
ar&&(A.applyRemote=function(n){if(n&&Array.isArray(n.addons)){remote=strs(n.addons);try{const m=both(E.addons.filter(own).map(a=>a.baseUrl));remote.forEach(u=>{m.has(u)||m.has(norm(u))||[u,norm(u)].forEach(x=>{seen.delete(x);gone.delete(x)})})}catch{}}inRemote++;try{return ar.apply(this,arguments)}finally{inRemote--}});
const mg=A.merge;
A.merge=async function(e){
 if(!e||typeof e!="object"||!uid())return mg.apply(this,arguments);
 try{const y=e._sync;y&&(max("Gone",y.ag),max("Add",y.aa))}catch{}
 remote=null;let c=await mg.apply(this,arguments);
 // also when this device's own list won (newer local change): a removal newer than the last add still applies
 try{{const acc=both(remote||[]),o=load(),ad=load("Add"),cur=strs(Store.get("addons",[])),old=cur.filter(u=>!acc.has(u)&&!acc.has(norm(u))&&dead(u,o,ad));
  if(old.length){Store.set("addons",cur.filter(u=>!old.includes(u)));old.forEach(u=>{mark(gone,u);E.addons=E.addons.filter(a=>!(own(a)&&(a.baseUrl===u||a.baseUrl===norm(u))))});E.clearCache&&E.clearCache();E.emit&&E.emit("addons");c=!0;try{A.schedule&&A.schedule()}catch{}}}}catch{}
 remote=null;return c};
})();