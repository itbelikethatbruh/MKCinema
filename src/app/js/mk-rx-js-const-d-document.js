
(()=>{const d=document,$=s=>d.querySelector(s),R=d.documentElement;
const SV=p=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ten=s=>`<text x="12" y="15.4" text-anchor="middle" font-size="7.2" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">10</text>`;
const I={rew:SV('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'+ten()),fwd:SV('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'+ten()),
 back:SV('<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>'),pip:SV('<rect x="2" y="4" width="20" height="16" rx="2.5"/><rect x="12" y="11.5" width="7" height="5.5" rx="1" fill="currentColor"/>'),
 pic:SV('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10V8.5h3M17 14v1.5h-3"/>'),moon:SV('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>')};
const L={pMini:'Keep playing in a corner',pPip:'Picture in picture',pCast:'Send to phone',pParty:'Watch party',pDev:'Share and other screens',pFull:'Full screen',pLock:'Lock controls',pClose:'Close player',pNext:'Next episode',pxSpeed:'Playback speed',rxPic:'Picture',pSubs:'Audio & subtitles',pEpsBtn:'Episodes',pSrcBtn:'Sources',rxSleep:'Sleep timer',pMute:'Mute',pOpts:'Settings'};
const btn=(id,svg,fn)=>{let x=d.getElementById(id);if(x)return x;x=d.createElement('button');x.className='ibtn';x.type='button';x.id=id;x.innerHTML=svg;x.addEventListener('click',e=>{e.stopPropagation();fn()});return x};
const tab=t=>()=>{const m=$('#optMenu'),o=$('#pOpts');if(!m||!o)return;if(m.hidden)o.click();setTimeout(()=>{const b=m.querySelector(`[data-pxtab="${t}"]`);b&&!b.classList.contains('on')&&b.click();if(b&&typeof IS_TV!=='undefined'&&IS_TV&&window.Nav&&Nav.focus)try{Nav.focus(b,!0)}catch{}if(t==='play'){const s=m.querySelector('.tl-sleep button.on,.tl-sleep button');s&&s.scrollIntoView({block:'nearest'})}},40)};
const el=(c,id)=>{let x=id&&d.getElementById(id);if(!x){x=d.createElement('div');x.className=c;if(id)x.id=id}return x};
const put=(box,ids)=>{let prev=null;for(const n of ids){const x=typeof n==='string'?d.getElementById(n):n;if(!x)continue;if(prev?prev.nextSibling!==x:box.firstChild!==x)prev?prev.after(x):box.prepend(x);prev=x}};
let laid=false;
function lay(){const hud=$('#hud'),top=hud&&hud.querySelector('.hud-top'),bot=hud&&hud.querySelector('.hud-bot'),ctl=bot&&bot.querySelector('.ctl'),title=hud&&hud.querySelector('.hud-title'),close=$('#pClose');
 if(!top||!bot||!ctl||!title||!close)return;R.classList.add('mk-rx');
 const park=el('rx-park','rxPark');park.hidden=true;park.setAttribute('aria-hidden','true');if(park.parentNode!==hud)hud.append(park);
 // top: one bar of screen tools, then Back on its own at the far right
 const tools=el('rx-cap rx-tools','rxTools');tools.setAttribute('role','toolbar');tools.setAttribute('aria-label','Screen');
 put(tools,['pMini','pPip','pCast','pParty','pDev','pFull','pLock']);
 for(const x of [...top.children])if(x!==tools&&x!==close)park.append(x);
 put(top,[tools,close]);
 // title block with the end time on the right, above the seek bar
 const info=el('rx-info','rxInfo'),ends=el('rx-ends','rxEnds');put(info,[title,ends]);if(bot.firstChild!==info)bot.prepend(info);
 // bottom: the main bar and the time
 const main=el('rx-cap rx-main','rxMain');main.setAttribute('role','toolbar');main.setAttribute('aria-label','Player');
 const vol=el('rx-vol','rxVol');put(vol,['pMute','pVol']);
 put(main,['pNext','pxSpeed',btn('rxPic',I.pic,tab('pic')),'pSubs','pEpsBtn','pSrcBtn',btn('rxSleep',I.moon,tab('play')),vol,'pOpts']);
 const time=el('rx-cap rx-time','rxTime'),sl=time.querySelector('.rx-sl')||Object.assign(d.createElement('span'),{className:'rx-sl',textContent:'/'});
 put(time,['pxCur',sl,'pxEnd']);
 for(const x of [...ctl.children])if(x!==main&&x!==time)park.append(x);
 put(ctl,[main,time]);
 // icons and names
 const mp=$('#pmBack'),mf=$('#pmFwd');if(mp&&!mp.dataset.rx){mp.innerHTML=I.rew;mp.dataset.rx=1}if(mf&&!mf.dataset.rx){mf.innerHTML=I.fwd;mf.dataset.rx=1}
 close.classList.add('rx-round');if(!close.dataset.rx){close.innerHTML=I.back;close.dataset.rx=1}
 for(const id of ['pMini','pPip']){const x=d.getElementById(id);if(x&&!x.dataset.rx){x.innerHTML=I.pip;x.dataset.rx=1}}
 for(const [k,v] of Object.entries(L)){const x=d.getElementById(k);if(x){if(!x.getAttribute('aria-label'))x.setAttribute('aria-label',v);if(!x.title)x.title=v}}
 laid=true;paint()}
// "Ends at" beside the title: same rules as the setting "Show when it ends"
let lastE='';function paint(){const e=d.getElementById('rxEnds');if(!e)return;let s='';
 try{const n=typeof pDur==='function'?pDur():video.duration,c=typeof pNow==='function'?pNow():video.currentTime,r=video.playbackRate||1,live=P&&P.ctx&&(P.ctx.live||P.ctx.isLive);
  if(CFG.endsAt!==false&&isFinite(n)&&n>=300&&!live){const t=new Date(Date.now()+Math.max(0,n-c)*1000/r);s='Ends at '+t.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}}catch{}
 if(s!==lastE){lastE=s;e.textContent=s;e.hidden=!s}}
setInterval(()=>{const p=d.getElementById('player');if(p&&!p.hidden&&laid){const h=d.getElementById('hud');if(h&&!h.classList.contains('idle'))paint();cueLift()}},1000);
// browser subtitles step above the controls while they show (only when they sit at the bottom)
// browser subtitles step up just above the title while the controls show (the page already lifts them; this sets how far)
function cueLift(){try{const p=d.getElementById('player'),i=d.getElementById('rxInfo');if(!p||p.hidden||!i)return;const r=i.getBoundingClientRect();if(!r.height)return;const v=Math.max(0,Math.round(innerHeight-r.top-innerHeight*.035));if(v!==+p.dataset.rxLift){p.dataset.rxLift=v;p.style.setProperty('--rx-lift',v+'px')}}catch{}}
addEventListener('resize',()=>setTimeout(cueLift,120));
function hook(){const p=d.getElementById('player'),h=d.getElementById('hud');if(!p)return;
 new MutationObserver(()=>{if(!p.hidden){lay();cueLift()}}).observe(p,{attributes:true,attributeFilter:['hidden']});
 if(!p.hidden)lay()}
// picture-in-picture: close open menus and panels so the small window shows only the film
if(window.MKPip&&typeof MKPip.mode==='function'&&!MKPip._rx){const m=MKPip.mode;MKPip.mode=function(t){if(t)try{for(const x of d.querySelectorAll('#player .menu:not([hidden])'))x.hidden=true;typeof closeDrawers==='function'&&closeDrawers()}catch{}return m.apply(this,arguments)};MKPip._rx=1}
// Phones: the system Back (swipe) while a film fills the screen closes the film and returns to the page it came from,
// instead of only leaving full screen and turning the film upright. Our own exits (the Full screen button, closing) are marked.
let selfExit=0;for(const k of ['exitFullscreen','webkitExitFullscreen']){const f=Document.prototype[k];if(typeof f==='function'&&!f._rx){const w=function(){selfExit=Date.now();return f.apply(this,arguments)};w._rx=1;Document.prototype[k]=w}}
let wasFull=false;const touch=()=>!(typeof IS_TV!=='undefined'&&IS_TV)&&matchMedia('(pointer:coarse)').matches;
const onFs=()=>{const now=!!(d.fullscreenElement||d.webkitFullscreenElement),p=d.getElementById('player');const left=wasFull&&!now;wasFull=now;
 if(!left||!p||p.hidden||!touch()||Date.now()-selfExit<1500)return;
 // wait a moment: entering picture-in-picture or leaving the app can also end full screen, and those must not close the film
 setTimeout(()=>{if(p.hidden||d.fullscreenElement||d.webkitFullscreenElement||R.classList.contains('pip-mode')||d.hidden)return;
 try{for(const x of d.querySelectorAll('#player .menu:not([hidden])'))x.hidden=true;typeof closeDrawers==='function'&&closeDrawers()}catch{}
 for(let i=0;i<4&&!p.hidden;i++){try{back()}catch{break}}
 if(!p.hidden&&typeof closePlayer==='function')try{closePlayer()}catch{}},450)};
d.addEventListener('fullscreenchange',onFs);d.addEventListener('webkitfullscreenchange',onFs);
d.readyState==='loading'?d.addEventListener('DOMContentLoaded',hook):hook();
})();
