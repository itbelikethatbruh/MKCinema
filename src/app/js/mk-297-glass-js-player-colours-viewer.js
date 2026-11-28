
(()=>{const d=document,R=d.documentElement;
/* 2.97 player colours: the viewer picks the player colour and the panel look; both live in CFG (pxAccent, pxGlass) */
const ACC=[['champagne','#d8c29a','Champagne','#b0874f'],['pearl','#f2f0ea','Pearl','#9fb0c4'],['ice','#8fd3ff','Ice','#7b86ff'],['rose','#ff8fb1','Rose','#c38bff'],['ember','#ff8a4c','Ember','#ff4f6d'],['jade','#5fe0a8','Jade','#2fbfd8'],['violet','#b69cff','Violet','#6f9bff'],['gold','#ffd24a','Gold','#ff9533']];
/* 2.97.2: each colour has a partner colour for gradients and second touches */
const rgb=h=>{const n=parseInt(h.slice(1),16);return `${n>>16&255},${n>>8&255},${n&255}`};
const GL=[['clear','See-through'],['frosted','Frosted glass'],['solid','Solid']];
const cfg=(k,v)=>{try{return (typeof CFG!=='undefined'&&CFG[k])||v}catch{return v}};
/* TVs, Low graphics and the lite build always get the solid panel */
const forced=()=>{try{return (typeof IS_TV!=='undefined'&&IS_TV)||R.classList.contains('tv')||R.classList.contains('lite')||(typeof CFG!=='undefined'&&CFG.quality==='low')}catch{return false}};
const acc=()=>ACC.find(a=>a[0]===cfg('pxAccent','champagne'))||ACC[0];
const glass=()=>{const g=cfg('pxGlass','frosted');return forced()?'solid':GL.some(x=>x[0]===g)?g:'frosted'};
const noblur=()=>{try{return /Android/i.test(navigator.userAgent)&&matchMedia('(pointer:coarse)').matches&&!forced()}catch{return false}};
function apply(){R.classList.toggle('pc-noblur',noblur());const h=acc()[1],n=parseInt(h.slice(1),16);R.style.setProperty('--pc-acc',h);R.style.setProperty('--pc-acc-rgb',`${n>>16&255},${n>>8&255},${n&255}`);R.style.setProperty('--pc-acc-2',acc()[3]);R.style.setProperty('--pc-acc2-rgb',rgb(acc()[3]));R.dataset.pcglass=glass()}
function set(k,v){if(typeof setCfg==='function')setCfg(k,v);else if(typeof CFG!=='undefined')CFG[k]=v;apply()}
function html(){const a=acc()[0],g=glass();
 return `<div class="pl-sec"><div class="pl-h"><span>Highlight colour</span></div><div class="pl-sw" role="radiogroup">`+
  ACC.map(([k,h,l])=>`<button type="button" role="radio" data-pcacc="${k}" aria-label="${l}" title="${l}" aria-checked="${k===a}" class="${k===a?'on':''}" style="--c:${h}"></button>`).join('')+`</div></div>`+
  (forced()?'':`<div class="pl-sec"><div class="pl-h"><span>Panel look</span></div><div class="rs-chips">${GL.map(([k,l])=>`<button type="button" data-pcglass="${k}" class="${k===g?'on':''}">${l}</button>`).join('')}</div></div>`)+
  `<div class="pl-prev"><span>Preview</span><i></i><span class="tnum">1:36:12</span></div><p class="pl-note">Colours the progress bar, the buttons you pick and the remote highlight.</p>`}
function mark(p){p.querySelectorAll('[data-pcacc]').forEach(x=>{const on=x.dataset.pcacc===acc()[0];x.classList.toggle('on',on);x.setAttribute('aria-checked',String(on))});
 p.querySelectorAll('[data-pcglass]').forEach(x=>x.classList.toggle('on',x.dataset.pcglass===glass()))}
function fill(p){if(!p)return;p.innerHTML=html();
 p.onclick=e=>{const b=e.target.closest('button');if(!b||!p.contains(b))return;
  if(b.dataset.pcacc)set('pxAccent',b.dataset.pcacc);else if(b.dataset.pcglass)set('pxGlass',b.dataset.pcglass);else return;
  e.stopPropagation();mark(p)}}
/* a tab row wider than the panel (long words, small phones) scrolls the chosen tab into view */
function seen(){const m=d.getElementById('optMenu');if(!m)return;m.querySelectorAll('.px-tabs').forEach(t=>{if(t.scrollWidth<=t.clientWidth+1||!t.getClientRects().length)return;const on=t.querySelector('button.on');if(!on)return;const l=on.offsetLeft-t.offsetLeft,r=l+on.offsetWidth;if(l<t.scrollLeft)t.scrollLeft=l-8;else if(r>t.scrollLeft+t.clientWidth)t.scrollLeft=r-t.clientWidth+8})}
function hook(){const m=d.getElementById('optMenu');if(!m)return;m.addEventListener('click',e=>{if(e.target.closest('.px-tabs'))setTimeout(seen,0)},true);new MutationObserver(()=>{if(!m.hidden)requestAnimationFrame(seen)}).observe(m,{childList:true,attributes:true,attributeFilter:['hidden']})}
d.readyState==='loading'?d.addEventListener('DOMContentLoaded',hook):hook();
window.PlayerLook={apply,fill};
apply();
try{CFG_HOOKS.push(k=>{if(k==='pxAccent'||k==='pxGlass'||k==='quality')apply()})}catch{}
})();
