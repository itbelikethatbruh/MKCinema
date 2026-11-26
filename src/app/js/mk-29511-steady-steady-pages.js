(()=>{/* 2.95.11 steady pages */
'use strict';
if(window.__mkSteady)return;window.__mkSteady=1;
const $1=(s,r)=>(r||document).querySelector(s),$a=(s,r)=>[...(r||document).querySelectorAll(s)];
const det=document.getElementById('detail'),pn=document.getElementById('detailPanel');

/* 1. The title page redrawn for the same title (Watchlist, Spoiler Guard, coming back from the film, Shuffle) keeps
   its place: the scroll position is put back, the page keeps its height until the new parts are in, More like this
   and Where to watch keep their filled rows instead of starting again from grey boxes, and episode pictures already
   on screen are kept (no blank flash while the lazy loader catches up). */
let depth=0,qbTok=0;
// the page's own buttons bar (one Play button + pill, Choose a source) is laid out in the same frame as the redraw, not one later
const ezb=()=>{try{if(window.MKEasy&&!(typeof IS_TV!=='undefined'&&IS_TV)&&!document.documentElement.classList.contains('tv'))MKEasy.detail()}catch(e){}};
const steadyDetail=()=>{
  if(typeof renderDetail!=='function'||!det||!pn||renderDetail._mkSteady)return;
  const rd=renderDetail;
  renderDetail=function(loading){
    if(depth)return rd.apply(this,arguments);
    // 2.95.3 quick back puts this redraw one frame after the player is gone; it happens here, so it is steady too
    const Q=window.MkQuickBack;
    if(Q&&Q.hold&&!Q.inRd&&typeof D==='object'&&D&&D.video===Q.vid0&&!det.hidden){
      const args=arguments,self=this,tok=++qbTok;
      requestAnimationFrame(()=>setTimeout(()=>{
        if(tok!==qbTok||det.hidden||!document.getElementById('player').hidden)return;
        const a=document.activeElement,keep=a&&a!==document.body&&a.id;
        Q.inRd=true;try{renderDetail.apply(self,args)}finally{Q.inRd=false}
        try{if(keep&&document.activeElement===document.body){const n=document.getElementById(keep);if(n)(typeof Nav==='object'&&typeof IS_TV!=='undefined'&&IS_TV?Nav.focus(n,true):n.focus({preventScroll:true}))}}catch(e){}
      },0));
      return;
    }
    depth++;try{return steady.apply(this,arguments)}finally{depth--}
  };
  renderDetail._mkSteady=1;
  const steady=function(loading){
    const m=typeof D==='object'&&D?D.meta:null;
    const same=!!(m&&!det.hidden&&pn.dataset.mkFor===String(m.id)&&!det.classList.contains('dp-hold'));
    if(!same){pn.style.minHeight='';clearTimeout(pn._mkMinT);const r=rd.apply(this,arguments);ezb();if(m)pn.dataset.mkFor=String(m.id);return r}
    const y=det.scrollTop,h=pn.offsetHeight;
    const more=$1('#dMore',pn),moreOk=more&&more.dataset.for===String(m.id)?more:null;
    const wtw=$1('#dWtw',pn),wtwOk=wtw&&wtw.children.length?wtw:null;
    const imgs=new Map();$a('#dEps [data-vid] .th img',pn).forEach(im=>{if(im.complete&&im.naturalWidth>2&&!im.dataset.lsrc)imgs.set(im.closest('[data-vid]').dataset.vid+'|'+(im.getAttribute('src')||''),im)});
    pn.style.minHeight=h+'px';
    let r;try{r=rd.apply(this,arguments)}finally{
      ezb();
      try{
        const nm=$1('#dMore',pn);if(moreOk&&nm&&nm!==moreOk&&nm.dataset.for!==String(m.id)){nm.replaceWith(moreOk)}
        const nw=$1('#dWtw',pn);if(wtwOk&&nw&&nw!==wtwOk&&!nw.children.length){nw.replaceWith(wtwOk)}
        if(imgs.size)$a('#dEps [data-vid] .th img',pn).forEach(im=>{const k=im.closest('[data-vid]').dataset.vid+'|'+(im.dataset.lsrc||im.getAttribute('src')||'');const o=imgs.get(k);if(o&&o!==im){o.className=im.className.replace(/\bss-wait\b/,'');im.replaceWith(o)}});
      }catch(e){}
      if(det.scrollTop!==y)det.scrollTop=y;
      clearTimeout(pn._mkMinT);
      // the kept height goes once whatever comes late has had time to arrive, and only when the space it frees is
      // below the bottom of the screen (so nothing in view moves); otherwise at the next scroll that makes it so
      const end=()=>{let b=0;for(const k of pn.children){if(k.getClientRects().length)b=Math.max(b,k.getBoundingClientRect().bottom)}return b};
      const free=()=>{if(!pn.style.minHeight)return;if(det.hidden||end()>=innerHeight-1){pn.style.minHeight='';det.removeEventListener('scroll',later)}};
      const later=()=>{clearTimeout(pn._mkMinT);pn._mkMinT=setTimeout(free,120)};
      if(pn._mkMinL)det.removeEventListener('scroll',pn._mkMinL);pn._mkMinL=later;
      pn._mkMinT=setTimeout(()=>{free();if(pn.style.minHeight)det.addEventListener('scroll',later,{passive:true})},1600);
    }
    return r;
  };
};
// stays the outermost layer even when a feature wraps renderDetail later (checked whenever a title opens)
const keepOuter=()=>{if(typeof openDetail!=='function'||openDetail._mkSteadyOd)return;const od=openDetail;openDetail=function(){try{steadyDetail()}catch(e){}return od.apply(this,arguments)};openDetail._mkSteadyOd=1;try{Object.assign(openDetail,od)}catch(e){}};

/* 2. Toasts: the ones already showing glide to their new place when one arrives or leaves (they jumped) */
const toasts=()=>{
  const box=document.getElementById('toasts');if(!box||box._mkFlip)return;box._mkFlip=1;
  let last=new Map();
  const snap=()=>{const m=new Map();for(const t of box.children)m.set(t,t.offsetTop);return m};
  new MutationObserver(()=>{
    const now=snap();
    for(const [t,y] of now){const p=last.get(t);if(p==null||Math.abs(p-y)<2||!t.animate)continue;
      try{t.animate([{transform:`translate3d(0,${p-y}px,0)`},{transform:'translate3d(0,0,0)'}],{duration:340,easing:'cubic-bezier(.2,.75,.2,1)',composite:'add'})}catch(e){}}
    last=now;
  }).observe(box,{childList:true});
};

/* 3. Posters fade in when they arrive, over their dark box, instead of popping in. A poster that is already there
   when its card is drawn (cached) shows at once, so redrawn rows never flash. */
const posters=()=>{
  const R=document.documentElement;if(R._mkPf)return;R._mkPf=1;
  const SEL='[data-card] .l0>img';
  const ok=im=>im.complete&&im.naturalWidth>2;
  const mark=im=>{if(ok(im))im.classList.add('mk-in');else im.classList.add('mk-pf')};
  const scan=n=>{if(n.nodeType!==1)return;if(n.matches&&n.matches(SEL))mark(n);else if(n.querySelectorAll)n.querySelectorAll(SEL).forEach(mark)};
  new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)scan(n)}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('load',e=>{const im=e.target;if(im instanceof HTMLImageElement&&im.classList.contains('mk-pf')&&ok(im)){im.classList.remove('mk-pf');im.classList.add('mk-in')}},true);
  // never left see-through
  setInterval(()=>{document.querySelectorAll('img.mk-pf').forEach(im=>{if(ok(im)||(!im.dataset.lsrc&&im.complete)){im.classList.remove('mk-pf');im.classList.add('mk-in')}})},2000);
  R.classList.add('mk-pfade');
};

const go=()=>{try{steadyDetail();keepOuter()}catch(e){}try{toasts()}catch(e){}try{posters()}catch(e){}};
if(document.readyState==='complete')setTimeout(go,0);else addEventListener('load',()=>setTimeout(go,0),{once:true});
})();