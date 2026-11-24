(()=>{/*padfs v2*/const d=document,u=navigator.userAgent,R=d.documentElement;
if(!(/iPad/.test(u)||/Macintosh/.test(u)&&navigator.maxTouchPoints>1))return;
if(typeof IS_TV!=="undefined"&&IS_TV)return;
const pl=()=>d.getElementById("player"),fsEl=()=>d.fullscreenElement||d.webkitFullscreenElement||null,
can=e=>!!(e&&(e.requestFullscreen||e.webkitRequestFullscreen)),
req=e=>{try{const f=e.requestFullscreen||e.webkitRequestFullscreen;if(!f)return Promise.reject();const r=f.call(e);return r&&r.then?r:new Promise((y,n)=>setTimeout(()=>fsEl()?y():n(),500))}catch(x){return Promise.reject(x)}},
out=()=>{try{const f=d.exitFullscreen||d.webkitExitFullscreen;const r=f&&f.call(d);r&&r.catch&&r.catch(()=>{})}catch{}},
seen=()=>{const t=d.getElementById("trailer");return t&&!t.hidden};
if(!can(R)&&!can(pl()))return;let last=0;{const p=pl();if(p)for(const k of["requestFullscreen","webkitRequestFullscreen"]){const f=p[k];if(f)p[k]=function(){last=Date.now();return f.apply(this,arguments)}}}R.classList.add("mk-padfs");window.MkPadFs=1;
let tr=0,pre=null,failed=false,userOut=false,mine=0,shown=false,hidAt=0,t0=0,tick=0;
const go=e=>{failed=false;req(e).then(()=>{failed=false},()=>{failed=true})};
const watch=()=>{clearInterval(tick);mine=1;tr=0;shown=false;hidAt=0;t0=Date.now();tick=setInterval(()=>{const p=pl();
 if(fsEl()!==R){clearInterval(tick);mine=0;return}
 if(p&&!p.hidden){shown=true;hidAt=0;return}
 if(window.MkKeepFull)return;if(seen()){tr=1;return}if(tr&&!shown){stop();return}
 if(shown){hidAt=hidAt||Date.now();if(Date.now()-hidAt>1500)stop()}else if(Date.now()-t0>20000)stop()},500)};
const stop=()=>{clearInterval(tick);mine=0;if(fsEl()===R)out()};
const after=()=>{if(!pre)return;const w=pre;pre=null;const p=pl();if(!p||fsEl()||Date.now()-last<1200)return;
 const moved=w.q!==null&&typeof playReq==="number"&&playReq!==w.q;
 if(w.h){if(!p.hidden)go(can(p)?p:R);else if(moved&&can(R)){go(R);watch()}}
 else if(!p.hidden&&failed&&!userOut)go(can(p)?p:R)};
addEventListener("click",()=>{const p=pl();pre={h:!p||p.hidden,q:typeof playReq==="number"?playReq:null};setTimeout(after,0)},true);
addEventListener("click",after,false);
addEventListener("touchend",e=>{const p=pl();if(p&&!p.hidden&&p.contains(e.target)&&failed&&!userOut&&!fsEl())go(can(p)?p:R)},true);
const fc=()=>{const p=pl();if(!fsEl()){if(p&&!p.hidden&&!window.MkKeepFull)userOut=true;clearInterval(tick);mine=0}};
d.addEventListener("fullscreenchange",fc);d.addEventListener("webkitfullscreenchange",fc);
const p0=pl();p0&&new MutationObserver(()=>{const p=pl();if(p.hidden){failed=false;userOut=false;if(!mine&&fsEl()&&!window.MkKeepFull)setTimeout(()=>{p.hidden&&fsEl()&&!window.MkKeepFull&&out()},700)}else setTimeout(()=>{!p.hidden&&!fsEl()&&!userOut&&(failed=true)},900)}).observe(p0,{attributes:true,attributeFilter:["hidden"]});
const ts=d.getElementById("toasts");ts&&new MutationObserver(m=>{if(!mine||shown)return;for(const r of m)for(const n of r.addedNodes)if(n.classList&&n.classList.contains("err")){const p=pl();p&&p.hidden&&stop();return}}).observe(ts,{childList:true});
})();