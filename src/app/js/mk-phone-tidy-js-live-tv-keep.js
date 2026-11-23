
(function(){
  /* Live TV: keep the space for the game card while it loads (no jump), and never flash back to the empty card */
  function hub(){
    var H=window.MKLiveHub;if(!H||H._steady)return;H._steady=1;
    var KEY='mkc:lhH',show=H.show,draw=H.draw;
    var bucket=function(){return Math.round(innerWidth/40)*40+(innerHeight>innerWidth?'p':'l')};
    var get=function(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){return{}}};
    var guess=function(){var w=innerWidth;if(innerHeight>innerWidth&&w<700)return Math.round(w*0.72+250);return 0};
    H.show=function(){
      var v=this.host(),el=document.getElementById('lhHub'),sec=v&&document.getElementById('view-'+v);
      if(v&&el&&el.parentElement===sec&&el.dataset.lhv===v&&!this.kids()){
        if(el.querySelector('.lh-feat:not(.lh-wait)')&&this.games.length&&Date.now()-this.at<this.TTL)return Promise.resolve();
        if(el.querySelector('.lh-wait')&&this.busy)return Promise.resolve();
      }
      var r=show.apply(this,arguments);
      el=document.getElementById('lhHub');if(el&&v)el.dataset.lhv=v;
      var t=el&&el.querySelector('.lh-top');
      if(t&&t.querySelector('.lh-wait')){var h=get()[bucket()]||guess();if(h)t.style.minHeight=h+'px'}
      return r;
    };
    H.draw=function(){
      var t0=document.querySelector('#lhHub .lh-top'),fresh=!!(t0&&t0.querySelector('.lh-wait'));
      var r=draw.apply(this,arguments);
      var t=document.querySelector('#lhHub .lh-top');
      if(t&&this.games.length){
        t.style.minHeight='';
        var h=Math.round(t.getBoundingClientRect().height);
        if(h>60){var o=get();o[bucket()]=h;try{localStorage.setItem(KEY,JSON.stringify(o))}catch(e){}}
        if(fresh){t.classList.remove('lh-in');void t.offsetWidth;t.classList.add('lh-in')}
      }
      return r;
    };
    /* draw the hub before the first paint of Live TV, not a moment after it */
    var watch=function(s){if(!s||s._lhNow)return;s._lhNow=1;new MutationObserver(function(){if(s.classList.contains('on')&&H.host())try{H.show()}catch(e){}}).observe(s,{attributes:true,attributeFilter:['class']})};
    watch(document.getElementById('view-tv'));watch(document.getElementById('view-sports'));
    var main=document.querySelector('main');if(main)new MutationObserver(function(){watch(document.getElementById('view-sports'))}).observe(main,{childList:true,subtree:true});
  }

  /* Phones and tablets: a video opens full screen, sideways */
  function full(){
    if(typeof IS_TV!=='undefined'&&IS_TV)return;
    var pl=document.getElementById('player');if(!pl||!pl.requestFullscreen)return;
    if(/iPhone|iPod/.test(navigator.userAgent))return;
    var armed=false;
    var want=function(){return document.body.classList.contains('touch-ui')&&!pl.hidden};
    var lock=function(){try{if(screen.orientation&&screen.orientation.lock)screen.orientation.lock('landscape').catch(function(){})}catch(e){}};
    var enter=function(){
      if(!want())return;
      if(document.fullscreenElement){lock();return}
      try{pl.requestFullscreen({navigationUI:'hide'}).then(function(){armed=false;lock()},function(){armed=true})}catch(e){armed=true}
    };
    new MutationObserver(function(){if(pl.hidden){armed=false;return}enter()}).observe(pl,{attributes:true,attributeFilter:['hidden']});
    /* the browser said no (no tap close enough): the first tap on the player does it */
    pl.addEventListener('pointerup',function(){if(armed&&want()&&!document.fullscreenElement){armed=false;enter()}},true);
  }
  /* X-Ray when paused: off by default now; switch it off once on seats that had the old default (Settings can turn it back on) */
  function xray(){try{if(localStorage.getItem('mkc:xrayOff1'))return;localStorage.setItem('mkc:xrayOff1','1');if(typeof CFG!=='undefined'&&CFG.xray){CFG.xray=false;if(typeof saveCfg==='function')saveCfg()}}catch(e){}}
  var go=function(){try{xray()}catch(e){}try{hub()}catch(e){}try{full()}catch(e){}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go,{once:true});else go();
})();
