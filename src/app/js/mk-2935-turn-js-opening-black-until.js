(()=>{const d=document,R=d.documentElement;
// 2.93.5 Phones: opening and closing a film turns the phone sideways and back. The player is never shown half turned:
// it opens black and fades in once the sideways shape is drawn, and on close the screen goes black, turns upright and
// then fades back to the page the film was opened from.
const tv=()=>typeof IS_TV!=='undefined'&&IS_TV||R.classList.contains('tv');
const touch=()=>!tv()&&!/iPhone|iPod/.test(navigator.userAgent)&&matchMedia('(pointer:coarse)').matches;
const land=()=>innerWidth>innerHeight,fsEl=()=>d.fullscreenElement||d.webkitFullscreenElement||null;
const frames=(f)=>requestAnimationFrame(()=>requestAnimationFrame(f));
const P=()=>d.getElementById('player');
/* opening: black until the film is sideways */
let openJob=0;
function opening(){const p=P();if(!p||p.hidden||!touch()||land()||!p.requestFullscreen)return;
 const job=++openJob,t0=Date.now();let done=false,settling=false;R.classList.remove('mk-turn-in');R.classList.add('mk-turn');
 const off=()=>{removeEventListener('resize',chk);d.removeEventListener('fullscreenchange',chk);d.removeEventListener('fullscreenerror',show);clearInterval(iv)};
 const show=()=>{if(done||job!==openJob)return;done=true;off();R.classList.add('mk-turn-in');R.classList.remove('mk-turn');setTimeout(()=>{if(job===openJob)R.classList.remove('mk-turn-in')},320)};
 const chk=()=>{if(done)return;const q=P();if(!q||q.hidden)return show();
  if(land()){if(!settling){settling=true;frames(()=>setTimeout(show,60))}return}
  const age=Date.now()-t0;
  if(age>450&&!fsEl())return show(); // full screen refused (no tap yet): show the film upright
  if(age>1400)return show()}; // the phone did not turn (rotation lock or no lock support): never stay black
 const iv=setInterval(chk,120);addEventListener('resize',chk);d.addEventListener('fullscreenchange',chk);d.addEventListener('fullscreenerror',show);chk()}
function hook(){const p=P();if(!p||p._mkTurn)return;p._mkTurn=1;
 new MutationObserver(()=>{if(!p.hidden)opening();else{openJob++;R.classList.remove('mk-turn','mk-turn-in')}}).observe(p,{attributes:true,attributeFilter:['hidden']});
 if(!p.hidden)opening();
 /* closing: black, leave full screen, turn upright, fade back to the page */
 if(typeof closePlayer!=='function'||closePlayer._mkTurn)return;const orig=closePlayer;
 const w=function(){const p=P(),fs=fsEl();
  if(!p||p.hidden||window.MkKeepFull||!touch()||!fs||!(fs===p||p.contains(fs))||!land())return orig.apply(this,arguments);
  openJob++;R.classList.remove('mk-turn','mk-turn-in');
  let c=d.getElementById('mkTurnCover');if(c)c.remove();c=d.createElement('div');c.id='mkTurnCover';c.setAttribute('aria-hidden','true');d.body.appendChild(c);
  let r;window.MkKeepFull=true;try{r=orig.apply(this,arguments)}finally{window.MkKeepFull=false}
  const t0=Date.now();let gone=false,turned=false;
  const lift=()=>{if(gone)return;gone=true;removeEventListener('resize',chk);clearInterval(iv);c.classList.add('out');setTimeout(()=>c.remove(),320)};
  const chk=()=>{if(gone||turned)return;const age=Date.now()-t0;
   if(!land()||age>1500){turned=true;frames(()=>setTimeout(lift,60));return}
   if(age>650&&!fsEl())turned=true,frames(()=>setTimeout(lift,60))}; // held sideways with auto-rotate: nothing turns
  const iv=setInterval(chk,120);
  // two frames so the full-screen picture is black before it is handed back, then leave full screen
  const leave=(n)=>{const q=P();
   if(q&&!q.hidden){if(n<12)return setTimeout(()=>leave(n+1),50); // still closing
    gone=true;clearInterval(iv);c.remove();return} // a new film opened meanwhile: it keeps the full screen
   try{if(screen.orientation&&screen.orientation.unlock)screen.orientation.unlock()}catch{}
   if(fsEl())try{const x=d.exitFullscreen?d.exitFullscreen():d.webkitExitFullscreen();x&&x.catch&&x.catch(()=>{})}catch{}
   addEventListener('resize',chk)};
  frames(()=>leave(0));
  return r};
 w._mkTurn=1;try{closePlayer=w}catch{}}
/* Audio & subtitles on a phone held sideways: use the full height when the panel can end before the top
   buttons (a little narrower if needed), otherwise start below them. CSS keeps the bottom row in view either way. */
const fitMenu=(m)=>{try{m.style.removeProperty('--mk-pt');m.style.removeProperty('--mk-pw');
 if(m.hidden||!touch()||!matchMedia('(pointer:coarse) and (max-height:500px)').matches)return;
 const p=P(),mr=m.getBoundingClientRect();if(!p||!mr.width)return;let cap=innerWidth;
 for(const b of p.querySelectorAll('button')){if(m.contains(b)||!b.offsetParent)continue;const r=b.getBoundingClientRect();if(r.width&&r.bottom<=100&&r.top>=0&&r.right>mr.left&&r.left<innerWidth)cap=Math.min(cap,b.parentElement&&b.parentElement.classList.contains('rx-cap')?b.parentElement.getBoundingClientRect().left:r.left)}
 const room=cap-12-mr.left;if(room>=Math.min(mr.width,460)){m.style.setProperty('--mk-pt','max(14px, env(safe-area-inset-top,0px))');if(room<mr.width)m.style.setProperty('--mk-pw',Math.floor(room)+'px')}}catch{}};
const watchMenus=()=>{for(const id of ['subMenu']){const m=d.getElementById(id);if(!m||m._mkFit)continue;m._mkFit=1;
 new MutationObserver(()=>{if(!m.hidden)fitMenu(m)}).observe(m,{attributes:true,attributeFilter:['hidden','class']});
 addEventListener('resize',()=>{if(!m.hidden)fitMenu(m)})}};
d.readyState==='loading'?d.addEventListener('DOMContentLoaded',watchMenus,{once:true}):watchMenus();
d.readyState==='loading'?d.addEventListener('DOMContentLoaded',hook,{once:true}):hook();
})();