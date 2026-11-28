
(()=>{const d=document,m=()=>d.getElementById('optMenu');
/* 2.97: the short card is the "Quick" tab of the one Settings panel. Its tab row matches the full menu, so Quick,
   Playback, Picture, Sound, More and Colours sit together; picking another tab shows that tab in the same panel. */
const ROWS=[['Speed','speed',[['0.5','0.5×'],['0.75','0.75×'],['1','1×'],['1.25','1.25×'],['1.5','1.5×'],['2','2×']]],
 ['Picture','picp',[['normal','Normal'],['vivid','Vivid'],['dark','Brighter']]],
 ['Screen','fit',[['fit','Fit'],['fill','Fill'],['crop','Crop bars']]],
 ['Sleep timer','sleep',[['0','Off'],['15','15'],['30','30'],['60','60'],['end','End']]]];
let full=false,busy=false,sleepPick='0',fresh=false;
const tv=()=>typeof IS_TV!=='undefined'&&IS_TV;
const navTo=n=>{if(n&&tv()&&typeof Nav!=='undefined'&&Nav.focus)try{Nav.focus(n,!0)}catch{}};
const isOn=(k,v,x)=>{if(k!=='sleep')return x.classList.contains('on');const l=(m().querySelector('.tl-sleep .tl-k')||{}).textContent||'';if(/off/i.test(l))sleepPick='0';return v===sleepPick};
const src=(k,v)=>{const e=m();return e&&e.querySelector(`[data-pane] [data-${k}="${v}"]`)};
const X='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const tabs=e=>`<div class="px-tabs rs-tabs" role="tablist"><button type="button" role="tab" data-rstab="quick" class="on" aria-selected="true">Quick</button>`+
 [...e.querySelectorAll('.px-tabs [data-pxtab]:not([data-pxtab="play"])')].map(b=>`<button type="button" role="tab" data-rstab="${b.dataset.pxtab}" aria-selected="false">${b.textContent.trim()}</button>`).join('')+
 (tv()?'':`<button type="button" class="px-x rs-x" aria-label="Close">${X}</button>`)+`</div>`;
function go(k){const e=m();if(!e)return;full=true;paint();if(typeof PxMenu!=='undefined'){PxMenu.tab=k;PxMenu.show()}navTo(e.querySelector(`.px-tabs [data-pxtab="${k}"]`))}
function paint(){const e=m();if(!e||busy)return;busy=true;try{
 if(full){e.classList.remove('rx-simple');const o=e.querySelector('.rx-simple-pane');o&&o.remove();return}
 if(!e.querySelector('.px-tabs [data-pxtab]'))return;
 e.classList.add('rx-simple');let pane=e.querySelector('.rx-simple-pane');
 if(!pane){pane=d.createElement('div');pane.className='rx-simple-pane';e.prepend(pane);
  pane.addEventListener('click',ev=>{ev.stopPropagation();const b=ev.target.closest('button');if(!b)return;
   if(b.classList.contains('rs-x')){e.hidden=true;return}
   if(b.dataset.rstab){if(b.dataset.rstab!=='quick')go(b.dataset.rstab);return}
   const x=src(b.dataset.k,b.dataset.v);if(x){if(b.dataset.k==='sleep')sleepPick=b.dataset.v;x.click();setTimeout(paint,30)}})}
 const html=tabs(e)+`<div class="rs-body">`+ROWS.map(([label,k,opts])=>{const shown=opts.filter(([v])=>src(k,v));if(!shown.length)return'';
  return `<div class="rs-row"><span>${label}</span><div class="rs-chips">${shown.map(([v,t])=>{const x=src(k,v);return `<button type="button" data-k="${k}" data-v="${v}" class="${x&&isOn(k,v,x)?'on':''}">${t}</button>`}).join('')}</div></div>`}).join('')+`</div>`;
 if(pane.dataset.h!==html){const a=d.activeElement,f=a&&pane.contains(a)?(a.dataset.rstab?['rstab',a.dataset.rstab]:[a.dataset.k,a.dataset.v]):null;pane.innerHTML=html;pane.dataset.h=html;
  if(f){const n=f[0]==='rstab'?pane.querySelector(`[data-rstab="${f[1]}"]`):pane.querySelector(`[data-k="${f[0]}"][data-v="${f[1]}"]`);n&&n.focus()}}
 if(e.firstChild!==pane)e.prepend(pane);
 if(fresh){fresh=false;if(tv())setTimeout(()=>{if(!pane.contains(d.activeElement))navTo(pane.querySelector('.rs-chips button.on')||pane.querySelector('.rs-chips button'))},90)}
}finally{busy=false}}
window.RxSimple={
 full(){full=true;paint()},
 quick(){const e=m();full=false;paint();e&&navTo(e.querySelector('.rx-simple-pane .rs-chips button.on'))},
 /* the full menu's tab row gets a Quick tab in front, back to the short card */
 tab(bar){if(!bar||bar.querySelector('[data-rstab]'))return;const q=d.createElement('button');q.type='button';q.dataset.rstab='quick';q.setAttribute('role','tab');q.setAttribute('aria-selected','false');q.textContent='Quick';
  q.addEventListener('click',ev=>{ev.stopPropagation();RxSimple.quick()});bar.prepend(q)}};
function hook(){const e=m();if(!e)return;
 new MutationObserver(()=>{if(e.hidden){full=false;const a=d.activeElement,o=d.getElementById('pOpts');if(tv()&&o&&!d.getElementById('player').hidden&&(!a||a===d.body||e.contains(a)))navTo(o);return}fresh=true;paint()}).observe(e,{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(()=>{if(!e.hidden&&!busy)paint()}).observe(e,{childList:true});
 if(!e.hidden)paint()}
d.readyState==='loading'?d.addEventListener('DOMContentLoaded',hook):hook();
})();
