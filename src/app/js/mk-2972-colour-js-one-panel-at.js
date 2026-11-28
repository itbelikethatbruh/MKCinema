
(()=>{const d=document;
/* 2.97.2 one panel at a time: opening Settings, Audio & subtitles, Share or any side drawer closes the others, and
   #player gets .pc-panel while one is open so the player's own buttons step back under it */
const P=()=>d.getElementById('player');const MENUS=['optMenu','subMenu','dspPop'];
const menuOpen=()=>MENUS.map(i=>d.getElementById(i)).filter(e=>e&&!e.hidden);
const drawersOpen=()=>[...d.querySelectorAll('#player .drawer.open')];
let busy=false;
function sync(from){const p=P();if(!p||busy)return;busy=true;try{
 if(from){if(from.classList.contains('drawer')){if(from.classList.contains('open'))menuOpen().forEach(m=>{m.hidden=true})}
  else if(!from.hidden){MENUS.forEach(i=>{const m=d.getElementById(i);if(m&&m!==from&&!m.hidden)m.hidden=true});if(drawersOpen().length&&typeof closeDrawers==='function')closeDrawers()}}
 p.classList.toggle('pc-panel',!!(menuOpen().length||drawersOpen().length));
}finally{busy=false}}
function hook(){const p=P();if(!p)return;
 const mo=new MutationObserver(rs=>{const seen=new Set();rs.forEach(r=>{if(!seen.has(r.target)){seen.add(r.target);sync(r.target)}})});
 MENUS.forEach(i=>{const m=d.getElementById(i);m&&mo.observe(m,{attributes:true,attributeFilter:['hidden']})});
 d.querySelectorAll('#player .drawer').forEach(x=>mo.observe(x,{attributes:true,attributeFilter:['class']}));
 sync()}
d.readyState==='loading'?d.addEventListener('DOMContentLoaded',hook):hook();
})();
(()=>{const d=document;
/* 2.97.2 simpler Settings: Quick · Picture · Sound · More · Colours. The old Playback tab repeated Quick (speed, sleep
   timer); its extras (all speeds, quality, A-B repeat, timing) now open the More tab under a "Playback" heading. */
function tidy(){const m=d.getElementById('optMenu');if(!m||m.hidden)return;
 const play=m.querySelector('.px-pane[data-pane="play"]'),more=m.querySelector('.px-pane[data-pane="more"]');
 if(play&&more&&play.children.length&&!more.querySelector('[data-pc-play]')){
  const box=d.createElement('div');box.dataset.pcPlay='1';box.className='pc-play';
  while(play.firstChild)box.appendChild(play.firstChild);more.prepend(box);
  /* the sleep timer and the usual speeds are already on Quick: keep them here only as the buttons Quick uses */
  const hide=e=>{if(e)e.classList.add('pc-dup')};
  box.querySelectorAll('h5').forEach(h=>{const n=h.nextElementSibling,t=h.textContent.trim().toLowerCase();
   if(n&&n.classList.contains('tl-sleep')){hide(h);hide(n)}
   else if(n&&n.querySelector&&n.querySelector('[data-speed]')&&n.querySelectorAll('[data-speed]').length<=6){hide(h);hide(n)}});
  const sl=box.querySelector('.tl-sleep');hide(sl);
  /* nothing left but headings (phones: Quick already has every speed) = no empty Playback block */
  if(![...box.children].some(c=>!c.classList.contains('pc-dup')&&c.tagName!=='H5'))hide(box)}
 if(typeof PxMenu!=='undefined'&&PxMenu.tab==='play'){PxMenu.tab='more';PxMenu.show()}}
function hook(){const m=d.getElementById('optMenu');if(!m)return;
 new MutationObserver(tidy).observe(m,{childList:true,attributes:true,attributeFilter:['hidden']});tidy()}
d.readyState==='loading'?d.addEventListener('DOMContentLoaded',hook):hook();
})();
