
(()=>{const d=document;
// Back from a phone's system gesture while the film fills the screen (Android app 1.17.9+ asks the page first):
// close the film and land on the page it came from. Returns true when the page handled it.
window.MKFsBack=function(){try{const p=d.getElementById('player');if(!p||p.hidden||d.documentElement.classList.contains('pip-mode'))return false;
 for(const x of d.querySelectorAll('#player .menu:not([hidden])'))x.hidden=true;typeof closeDrawers==='function'&&closeDrawers();
 for(let i=0;i<4&&!p.hidden;i++){try{back()}catch{break}}
 if(!p.hidden&&typeof closePlayer==='function')closePlayer();
 return p.hidden}catch{return false}};
// quieter start: the automatic "subtitles on" and "intro skipped" notes are not shown (the Watch intro button stays)
if(typeof toast==='function'&&!toast._rx){const t=toast;const quiet=(m,k)=>{const p=d.getElementById('player');if(!p||p.hidden)return false;
  return k==='subs'&&/ subtitles on$/.test(m)||/^(Intro|Recap|Ending) skipped automatically$/.test(m)};
 const w=function(m,type,dur,k){if(quiet(String(m||''),k||''))return;return t.apply(this,arguments)};w._rx=1;try{toast=w}catch{}}
})();
