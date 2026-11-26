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
const CAP=700;let st=null,seq=0,inT=0,mo=null,revAt=0,revId=null;/* 2.95.17 steady open */const hold=on=>document.body.classList.toggle('mk-dphold',!!on);
const reveal=()=>{clearTimeout(det._mkHoldT);det._mkHoldT=setTimeout(()=>hold(false),det.hidden?0:340);if(!st)return;clearTimeout(st.cap);st=null;
  const lg=det.querySelector('#detailPanel .logo3d.pop');
  try{renderDetail.popAt=now()}catch(e){}revAt=now();try{revId=D.meta&&D.meta.id}catch(e){revId=null}if(lg)lg.style.setProperty('--t0','0s');
  let rm=false;try{rm=!!(CFG.reduceMotion||matchMedia('(prefers-reduced-motion: reduce)').matches)}catch(e){}
  det.classList.toggle('dp-rm',rm);det.classList.remove('dp-hold');det.classList.add('dp-in');try{rest=measure()}catch(e){}
  /* 2.91.10: only the parts on screen at this moment rise (class dp-a). A part the page redraws during the fade (full
     details arriving late) does not rise again: it only finishes the fade, opacity only, so it never moves and the TV
     remote focus never scrolls the page to follow a moving button */
  const t0=now(),pn=document.getElementById('detailPanel'),T='#detailPanel .d-hero>img.bg,#detailPanel .d-hero .d-body>*,#detailPanel>.d-body';
  if(mo)mo.disconnect();
  const cont=el=>{const xs=[];if(el.matches(T))xs.push(el);if(el.querySelectorAll)xs.push(...el.querySelectorAll(T));const gone=now()-t0;if(gone>=900)return;
    for(const x of xs){if(x.classList.contains('logo3d'))x.style.setProperty('--t0',(gone/1000).toFixed(3)+'s');
      x.classList.add('dp-a','dp-c');const d=parseFloat(getComputedStyle(x).animationDelay)||0;
      x.style.setProperty('animation-delay',(d-gone/1000).toFixed(3)+'s','important')}};
  mo=null;
  clearTimeout(inT);inT=setTimeout(()=>{det.classList.remove('dp-under');det.classList.add('dp-done');const g=Math.max(1.3,(now()-revAt)/1000).toFixed(3)+'s';det.querySelectorAll('#detailPanel .logo3d').forEach(x=>x.style.setProperty('--t0',g));det.querySelectorAll('#detailPanel .dp-c').forEach(x=>x.style.removeProperty('animation-delay'));det.querySelectorAll('#detailPanel .dp-a').forEach(x=>x.classList.remove('dp-a','dp-c'));det.classList.remove('dp-in','dp-rm');if(mo){mo.disconnect();mo=null}},1100)};
const ready=tok=>{if(!st||st.tok!==tok)return;
  const left=Math.max(160,CAP-(now()-st.t0));
  const imgs=[...det.querySelectorAll('#detailPanel .d-hero>img.bg,#detailPanel .d-hero .hero-logo')].filter(i=>!i.hidden&&i.getAttribute('src'));
  const dec=Promise.all(imgs.map(i=>(i.complete&&i.naturalWidth?(i.decode?i.decode():Promise.resolve()):new Promise(r=>{i.addEventListener('load',r,{once:true});i.addEventListener('error',r,{once:true})}).then(()=>i.decode&&i.decode())).catch(()=>{})));
  Promise.race([dec,new Promise(r=>setTimeout(r,left))]).then(()=>{if(st&&st.tok===tok)requestAnimationFrame(reveal)})};
const od=openDetail;
openDetail=function(){
  const a0=arguments[0];let other=false;try{other=!!(a0&&a0.id&&typeof D==='object'&&D&&D.meta&&String(a0.id)!==String(D.meta.id))}catch(e){}
  const fresh=det.hidden||other;let tok=0;
  let ep=false;try{ep=!!(arguments[1]&&arguments[1].videoId&&typeof TOUCH_UI!=='undefined'&&TOUCH_UI&&!(typeof IS_TV!=='undefined'&&IS_TV))}catch(e){}
  if(fresh&&ep){clearTimeout(inT);if(st)clearTimeout(st.cap);st=null;clearTimeout(det._mkHoldT);hold(false);det.classList.remove('dp-hold','dp-in','dp-rm','dp-done');det.classList.add('dp-under')}
  else if(fresh){det.classList.remove('dp-under','dp-done');clearTimeout(inT);if(mo){mo.disconnect();mo=null}det.classList.remove('dp-in','dp-rm');if(st)clearTimeout(st.cap);tok=++seq;st={tok,t0:now(),cap:setTimeout(reveal,CAP)};det.classList.add('dp-hold');clearTimeout(det._mkHoldT);hold(true)}
  let r;try{r=od.apply(this,arguments)}catch(e){reveal();throw e}
  if(tok){if(det.hidden){reveal()}else Promise.resolve(r).then(()=>ready(tok),()=>ready(tok))}
  return r};
try{openDetail._mkDp=1}catch(e){}
/* 2.95.17: the episode panel closes onto a page that is already in place (its entrance is finished, not played) */
try{if(typeof EpSheet==='object'&&EpSheet.close){const ec=EpSheet.close;EpSheet.close=function(){const r=ec.apply(this,arguments);if(det.classList.contains('dp-under')){det.classList.remove('dp-under');det.classList.add('dp-done');try{det.getAnimations({subtree:true}).forEach(a=>{try{const t=a.effect&&a.effect.getTiming();if(t&&t.iterations!==Infinity&&a.playState==='running')a.finish()}catch(e){}})}catch(e){}}return r}}}catch(e){}
/* 2.91.10: when the page fills in more (a longer details line, a second row of genres, a tag added a moment later), the
   parts that move glide to their new place instead of jumping. Layout positions (offsetTop) ignore running animations. */
const pnl=document.getElementById('detailPanel'),G='#detailPanel .d-hero .d-body>*,#detailPanel>.d-body';let rest=new Map();
const keyOf=(e,i)=>i+'|'+String(e.className||'').split(' ')[0];
const measure=()=>{const m=new Map();det.querySelectorAll(G).forEach((e,i)=>{if(e.offsetParent)m.set(keyOf(e,i),e.offsetTop+(e.offsetParent===pnl?0:e.offsetParent.offsetTop))});return m};
const settle=()=>{if(det.hidden||det.classList.contains('dp-hold')){rest=new Map();return}
  const m=measure();if(rest.size){let i=0;for(const e of det.querySelectorAll(G)){const k=keyOf(e,i++),y=rest.get(k),z=m.get(k);if(y==null||z==null||!e.animate)continue;const d=y-z;
    if(Math.abs(d)<2||Math.abs(d)>220)continue;try{e.animate([{transform:'translate3d(0,'+d+'px,0)'},{transform:'translate3d(0,0,0)'}],{duration:380,easing:'cubic-bezier(.2,.75,.2,1)',composite:'add'})}catch(x){}}}
  rest=m};
let lastMut=0,lastIn=0,lastTop=0;
/* a logo redrawn later for the same title keeps its finished entrance instead of popping in again */
const logoKeep=ms=>{if(!revAt||typeof D==='undefined'||!D.meta||D.meta.id!==revId)return;const g=((now()-revAt)/1000).toFixed(3)+'s';
  for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1){const l=n.matches('.logo3d')?[n]:n.querySelectorAll?n.querySelectorAll('.logo3d'):[];for(const x of l)x.style.setProperty('--t0',g)}};
if(pnl)new MutationObserver(ms=>{lastMut=now();try{logoKeep(ms)}catch(e){}try{settle()}catch(e){}}).observe(pnl,{childList:true,subtree:true,characterData:true});
/* on TVs the remote focus is put back after a redraw and the page could hop a few pixels: that hop glides too */
['keydown','wheel','touchstart','pointerdown'].forEach(t=>addEventListener(t,()=>{lastIn=now()},{capture:true,passive:true}));
det.addEventListener('scroll',()=>{const y=det.scrollTop,d=y-lastTop;lastTop=y;
  if(!pnl||!pnl.animate||det.hidden||Math.abs(d)<2||Math.abs(d)>90||now()-lastMut>600||now()-lastIn<350)return;
  try{pnl.animate([{transform:'translate3d(0,'+d+'px,0)'},{transform:'translate3d(0,0,0)'}],{duration:380,easing:'cubic-bezier(.2,.75,.2,1)',composite:'add'})}catch(e){}},{passive:true});
/* leaving the page while it is still waiting: nothing is left half hidden */
if(typeof closeLayer==='function'){const cl=closeLayer;closeLayer=function(id){const r=cl.apply(this,arguments);if(id==='detail'&&st)reveal();return r}}
})();