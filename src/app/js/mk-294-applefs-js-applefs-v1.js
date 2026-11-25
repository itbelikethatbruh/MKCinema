(()=>{/*applefs v1*/const d=document,u=navigator.userAgent;
const apple=/iPhone|iPod|iPad/.test(u)||/Macintosh/.test(u)&&navigator.maxTouchPoints>1;
if(!apple||typeof toggleFull!=="function"||typeof IS_TV!=="undefined"&&IS_TV)return;
let home=false;try{home=navigator.standalone===true||matchMedia("(display-mode: standalone)").matches||matchMedia("(display-mode: fullscreen)").matches}catch{}
const pl=()=>d.getElementById("player"),v=()=>d.getElementById("video")||window.video,
elFs=()=>{const p=pl();return!!(p&&(p.requestFullscreen||p.webkitRequestFullscreen)&&(d.fullscreenEnabled||d.webkitFullscreenEnabled))},
fsEl=()=>d.fullscreenElement||d.webkitFullscreenElement||null;
/* Home-screen apps on iPad/iPhone (and any Apple device without element full screen) cannot hide the status bar with
   the browser's full screen; Apple's own video full screen can. Used only when the person asks for full screen. */
const useApple=()=>home||!elFs();window.MkAppleFs=useApple;
const mark=()=>d.documentElement.classList.toggle("mk-applefs",useApple());mark();d.addEventListener("DOMContentLoaded",mark);setTimeout(mark,3000);
const prev=toggleFull;
toggleFull=function(){const x=v(),p=pl();
 if(useApple()&&x&&p&&!p.hidden&&x.webkitEnterFullscreen&&!(d.getElementById("ytwrap")||{}).firstChild){
  if(x.webkitDisplayingFullscreen){try{x.webkitExitFullscreen()}catch{}return}
  if(x.readyState>=1||x.webkitSupportsFullscreen){try{const f=fsEl();if(f){const r=(d.exitFullscreen||d.webkitExitFullscreen).call(d);r&&r.catch&&r.catch(()=>{})}}catch{}
   try{x.webkitEnterFullscreen();return}catch{}}}
 return prev.apply(this,arguments)};
})();