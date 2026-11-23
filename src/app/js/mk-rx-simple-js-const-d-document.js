
(()=>{const d=document,m=()=>d.getElementById('optMenu');
const ROWS=[['Speed','speed',[['0.5','0.5×'],['0.75','0.75×'],['1','1×'],['1.25','1.25×'],['1.5','1.5×'],['2','2×']]],
 ['Picture','picp',[['normal','Normal'],['vivid','Vivid'],['dark','Brighter']]],
 ['Screen','fit',[['fit','Fit'],['fill','Fill'],['crop','Crop bars']]],
 ['Sleep timer','sleep',[['0','Off'],['15','15'],['30','30'],['60','60'],['end','End of film']]]];
let full=false,busy=false,sleepPick='0';
const isOn=(k,v,x)=>{if(k!=='sleep')return x.classList.contains('on');const l=(m().querySelector('.tl-sleep .tl-k')||{}).textContent||'';if(/off/i.test(l))sleepPick='0';return v===sleepPick};
const src=(k,v)=>{const e=m();return e&&e.querySelector(`[data-pane] [data-${k}="${v}"]`)};
function paint(){const e=m();if(!e||busy)return;busy=true;try{
 if(full){e.classList.remove('rx-simple');const o=e.querySelector('.rx-simple-pane');o&&o.remove();return}
 e.classList.add('rx-simple');let pane=e.querySelector('.rx-simple-pane');
 if(!pane){pane=d.createElement('div');pane.className='rx-simple-pane';e.prepend(pane);
  pane.addEventListener('click',ev=>{ev.stopPropagation();const b=ev.target.closest('button');if(!b)return;
   if(b.classList.contains('rs-all')){full=true;paint();const t=e.querySelector('[data-pxtab].on')||e.querySelector('[data-pxtab]');if(t&&typeof IS_TV!=='undefined'&&IS_TV&&window.Nav)try{Nav.focus(t,!0)}catch{}return}
   const x=src(b.dataset.k,b.dataset.v);if(x){if(b.dataset.k==='sleep')sleepPick=b.dataset.v;x.click();setTimeout(paint,30)}})}
 const html=`<h4>Settings</h4>`+ROWS.map(([label,k,opts])=>{const shown=opts.filter(([v])=>src(k,v));if(!shown.length)return'';
  return `<div class="rs-row"><span>${label}</span><div class="rs-chips">${shown.map(([v,t])=>{const x=src(k,v);return `<button type="button" data-k="${k}" data-v="${v}" class="${x&&isOn(k,v,x)?'on':''}">${t}</button>`}).join('')}</div></div>`}).join('')+`<button type="button" class="rs-all">All settings <span aria-hidden="true">›</span></button>`;
 if(pane.dataset.h!==html){const f=d.activeElement&&pane.contains(d.activeElement)?[d.activeElement.dataset.k,d.activeElement.dataset.v]:null;pane.innerHTML=html;pane.dataset.h=html;
  if(f){const n=pane.querySelector(`[data-k="${f[0]}"][data-v="${f[1]}"]`)||pane.querySelector('.rs-all');n&&n.focus()}}
 if(e.firstChild!==pane)e.prepend(pane);
}finally{busy=false}}
function hook(){const e=m();if(!e)return;
 new MutationObserver(()=>{if(e.hidden){full=false;return}paint()}).observe(e,{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(()=>{if(!e.hidden&&!busy)paint()}).observe(e,{childList:true});
 if(!e.hidden)paint()}
d.readyState==='loading'?d.addEventListener('DOMContentLoaded',hook):hook();
})();
