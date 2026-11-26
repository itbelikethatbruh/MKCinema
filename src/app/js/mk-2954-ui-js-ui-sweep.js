/* 2.95.4 ui sweep */(()=>{
const de=document.documentElement,$=(s)=>document.querySelector(s);
const vis=(e)=>{if(!e)return null;const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).display!=='none'?r:null};
const EzbFit={
  over(){const t=$('#tabs'),d=vis($('.dock'));if(!t||!d)return false;let L=d.left,R=d.right;
    const b=vis($('.dock .brand')),k=vis($('.dock-tools'));if(b)L=Math.max(L,b.right+10);if(k)R=Math.min(R,k.left-10);
    const mid=d.left+d.width/2,room=2*Math.min(mid-L,R-mid),w=Math.max(t.scrollWidth,t.getBoundingClientRect().width);
    return w>room+1||t.scrollWidth>t.clientWidth+1;},
  run(){const t=$('#tabs');de.classList.remove('ezf1','ezf2','ezf3','ezf4','ezf5');
    if(!t||!de.classList.contains('ezb-bar')||innerWidth<=760||de.classList.contains('nav-side')||getComputedStyle(t).display==='none')return;
    for(let l=1;l<=5&&this.over();l++)de.classList.add('ezf'+l);},
};
let raf=0;const later=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>EzbFit.run())};
addEventListener('resize',later);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(later);
const t=$('#tabs');if(t)try{new MutationObserver(later).observe(t,{childList:true,subtree:true,characterData:true})}catch(e){}
try{new MutationObserver(later).observe(de,{attributes:true,attributeFilter:['lang']})}catch(e){}
setTimeout(later,0);setTimeout(later,1500);window.EzbFit=EzbFit;
})();