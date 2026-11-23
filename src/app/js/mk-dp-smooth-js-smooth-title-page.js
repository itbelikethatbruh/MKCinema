(()=>{
/* 2.91.9 smooth title page opening: (1) details and pictures start loading while a poster is focused, hovered or
   touched, so the page usually has everything the moment it opens; (2) the page is shown once, built, with a short
   staged fade instead of filling in piece by piece. Never waits more than 1 s. */
if(window.__mkDpSmooth)return;window.__mkDpSmooth=1;
/* the menu-bar lift value moves from body (where every change re-styled the whole page) to the few items that use it;
   the replacement rules are in the style block above */
try{for(const sh of document.styleSheets){let r;try{r=sh.cssRules}catch(e){continue}
  for(let i=r.length-1;i>=0;i--){const x=r[i];if(x.type!==1||!x.style||!x.style.getPropertyValue('--mkp-lift'))continue;
    const sel=x.selectorText||'';if(/mk-pill-down|layer-open|mkp-aside|mk-player-on/.test(sel)&&!/:is\(/.test(sel))sh.deleteRule(i)}}}catch(e){}
const det=document.getElementById('detail');
if(!det||typeof openDetail!=='function'||typeof engine!=='object'||!engine)return;
const now=()=>performance.now();
/* shared short-term cache: a prefetch and the opening use the same request */
const MC=new Map(),TTL=6e5,of=engine.fetchMeta;
if(typeof of==='function')engine.fetchMeta=function(type,id){
  const k=type+'|'+id,c=MC.get(k);if(c&&Date.now()-c.at<TTL)return c.p;
  const p=Promise.resolve(of.apply(this,arguments));MC.set(k,{at:Date.now(),p});
  p.then(m=>{if(!m)MC.delete(k)},()=>MC.delete(k));
  if(MC.size>80)MC.delete(MC.keys().next().value);return p};
const IM=new Map();
const warmImg=u=>{if(!u||typeof u!=='string'||IM.has(u))return;const i=new Image();i.decoding='async';i.src=u;IM.set(u,i);try{i.decode().catch(()=>{})}catch(e){}if(IM.size>48)IM.delete(IM.keys().next().value)};
const logoOf=m=>{try{return typeof metaLogo==='function'?metaLogo(m):m.logo}catch(e){return null}};
const warm=card=>{const id=card.dataset.id,type=card.dataset.type;if(!id||!type)return;let s=null;try{s=S.metas&&S.metas.get(id)}catch(e){}
  if(s){warmImg(s.background);warmImg(logoOf(s))}
  try{engine.fetchMeta(type,id).then(m=>{if(m){const x={...(s||{}),...m};warmImg(x.background);warmImg(logoOf(x))}},()=>{})}catch(e){}};
const CARD='[data-card][data-id][data-type]';let wt=0,wc=null;
const arm=(c,ms)=>{if(!c||c===wc)return;clearTimeout(wt);wt=setTimeout(()=>{wc=c;warm(c)},ms)};
document.addEventListener('focusin',e=>{const c=e.target&&e.target.closest&&e.target.closest(CARD);if(c&&!c.closest('#detail .d-hero'))arm(c,typeof IS_TV!=='undefined'&&IS_TV?380:240)},true);
document.addEventListener('pointerover',e=>{if(e.pointerType!=='mouse')return;const c=e.target&&e.target.closest&&e.target.closest(CARD);if(c)arm(c,160)},{passive:true});
document.addEventListener('pointerdown',e=>{const c=e.target&&e.target.closest&&e.target.closest(CARD);if(c&&c!==wc){clearTimeout(wt);wc=c;warm(c)}},{passive:true,capture:true});
/* staged opening */
const CAP=1000;let st=null,seq=0,inT=0;
const reveal=()=>{if(!st)return;clearTimeout(st.cap);st=null;
  const lg=det.querySelector('#detailPanel .logo3d.pop');
  try{renderDetail.popAt=now()}catch(e){}if(lg)lg.style.setProperty('--t0','0s');
  let rm=false;try{rm=!!(CFG.reduceMotion||matchMedia('(prefers-reduced-motion: reduce)').matches)}catch(e){}
  det.classList.toggle('dp-rm',rm);det.classList.remove('dp-hold');det.classList.add('dp-in');
  clearTimeout(inT);inT=setTimeout(()=>det.classList.remove('dp-in','dp-rm'),1100)};
const ready=tok=>{if(!st||st.tok!==tok)return;
  const left=Math.max(160,CAP-(now()-st.t0));
  const imgs=[...det.querySelectorAll('#detailPanel .d-hero>img.bg,#detailPanel .d-hero .hero-logo')].filter(i=>!i.hidden&&i.getAttribute('src'));
  const dec=Promise.all(imgs.map(i=>(i.complete&&i.naturalWidth?(i.decode?i.decode():Promise.resolve()):new Promise(r=>{i.addEventListener('load',r,{once:true});i.addEventListener('error',r,{once:true})}).then(()=>i.decode&&i.decode())).catch(()=>{})));
  Promise.race([dec,new Promise(r=>setTimeout(r,left))]).then(()=>{if(st&&st.tok===tok)requestAnimationFrame(reveal)})};
const od=openDetail;
openDetail=function(){
  const fresh=det.hidden;let tok=0;
  if(fresh){clearTimeout(inT);det.classList.remove('dp-in','dp-rm');if(st)clearTimeout(st.cap);tok=++seq;st={tok,t0:now(),cap:setTimeout(reveal,CAP)};det.classList.add('dp-hold')}
  let r;try{r=od.apply(this,arguments)}catch(e){reveal();throw e}
  if(tok){if(det.hidden){reveal()}else Promise.resolve(r).then(()=>ready(tok),()=>ready(tok))}
  return r};
try{openDetail._mkDp=1}catch(e){}
/* leaving the page while it is still waiting: nothing is left half hidden */
if(typeof closeLayer==='function'){const cl=closeLayer;closeLayer=function(id){const r=cl.apply(this,arguments);if(id==='detail'&&st)reveal();return r}}
})();