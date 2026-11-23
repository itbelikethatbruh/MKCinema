
(()=>{try{
 if(typeof MoreLike==="undefined"||!MoreLike||typeof MoreLike.place!=="function")return;
 const tv=typeof IS_TV!=="undefined"&&IS_TV;
 /* computers with a mouse already get hover arrows (RailMouse); this arrow is for touch screens */
 const mouse=()=>{try{return matchMedia("(hover: hover) and (pointer: fine)").matches}catch{return false}};
 const tr=s=>{try{return typeof I18N!=="undefined"&&I18N.t?I18N.t(s):s}catch{return s}};
 const SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
 const bg=()=>{const s=document.getElementById("dStreams"),pn=document.getElementById("detailPanel");if(!s||!pn)return;const c=getComputedStyle(pn).backgroundColor;if(c&&!/rgba\(0, 0, 0, 0\)|transparent/.test(c)&&s.style.getPropertyValue("--mkss-bg")!==c)s.style.setProperty("--mkss-bg",c)};
 function setup(){
  bg();if(tv||mouse())return;
  const row=document.getElementById("dMore");if(!row)return;const rail=row.querySelector(".rail");if(!rail)return;
  let btn=row.querySelector(".mk-ml-next");
  if(!btn||btn._rail!==rail){
   if(btn)btn.remove();
   btn=document.createElement("button");btn.type="button";btn.className="mk-ml-next";btn.tabIndex=-1;btn.setAttribute("aria-label",tr("Scroll right"));btn.innerHTML=SVG;btn._rail=rail;row.appendChild(btn);
   let raf=0;const upd=()=>{raf=0;if(!rail.isConnected)return;const rtl=getComputedStyle(rail).direction==="rtl";btn.classList.toggle("rtl",rtl);
    const max=rail.scrollWidth-rail.clientWidth;row.classList.toggle("mk-ml-more",max>8&&Math.abs(rail.scrollLeft)<max-8);
    const c=rail.querySelector(".card-inner,.card");if(c){const rr=row.getBoundingClientRect(),cr=c.getBoundingClientRect();if(cr.height>40)btn.style.top=Math.round(cr.top-rr.top+cr.height/2)+"px"}};
   const q=()=>{raf||(raf=requestAnimationFrame(upd))};
   rail.addEventListener("scroll",q,{passive:true});addEventListener("resize",q,{passive:true});
   if(window.MutationObserver)new MutationObserver(q).observe(rail,{childList:true});
   btn.addEventListener("click",e=>{e.stopPropagation();const rtl=getComputedStyle(rail).direction==="rtl";rail.scrollBy({left:(rtl?-1:1)*Math.max(160,rail.clientWidth*.8),behavior:"smooth"})});
   const rm=typeof CFG!=="undefined"&&CFG&&CFG.reduceMotion;
   if(!rm&&window.IntersectionObserver){const io=new IntersectionObserver(en=>{for(const x of en)if(x.isIntersecting&&row.classList.contains("mk-ml-more")){io.disconnect();btn.classList.add("mk-ml-nudge")}},{threshold:.6});io.observe(rail)}
   btn.addEventListener("animationend",()=>btn.classList.remove("mk-ml-nudge"));
   q();setTimeout(q,600);
  }
 }
 const place=MoreLike.place;
 MoreLike.place=function(){const r=place.apply(this,arguments);try{setup()}catch(e){}return r};
 document.addEventListener("scroll",e=>{const t=e.target;if(t&&t.classList&&t.classList.contains("streams")&&!t._mkss){t._mkss=1;bg()}},{capture:true,passive:true});
}catch(e){try{console.warn("More like this arrow skipped:",e.message)}catch{}}})();
