(()=>{"use strict";
// 2.93.7: Picture in picture only where it works. iPhone/iPad use Apple's own picture-in-picture call; where no way
// exists (TVs, some web views) the button and the Share list entry are hidden instead of showing an error.
const d=document,V=()=>{try{return typeof video<"u"&&video||d.getElementById("video")}catch{return d.getElementById("video")}};
const tv=()=>{try{return typeof IS_TV<"u"&&!!IS_TV}catch{return d.documentElement.classList.contains("tv")}};
let broke=!1;
const nat=()=>!tv()&&!!(window.MKAndroid&&MKAndroid.pip);
const std=()=>{const v=V();return!!(d.pictureInPictureEnabled&&v&&typeof v.requestPictureInPicture=="function"&&!v.disablePictureInPicture)};
const wk=()=>{const v=V();try{return!!(v&&typeof v.webkitSetPresentationMode=="function"&&typeof v.webkitSupportsPresentationMode=="function"&&v.webkitSupportsPresentationMode("picture-in-picture"))}catch{return!1}};
const can=()=>!tv()&&!broke&&(nat()||std()||wk());
window.MkPipOk=can;
const sync=()=>{const b=d.getElementById("pPip");b&&b.classList.toggle("mk-nopip",!can())};
const init=()=>{const b=d.getElementById("pPip");if(!b||b._mkPip)return;b._mkPip=1;const prev=b.onclick;
 b.onclick=async e=>{
  if(nat())return prev&&prev.call(b,e);
  const v=V();
  if(std()){try{d.pictureInPictureElement?await d.exitPictureInPicture():await v.requestPictureInPicture();return}catch(x){if(!wk()){broke=!0,sync();try{toast("Picture in picture is not available here","info")}catch{}return}}}
  if(wk()){try{v.webkitSetPresentationMode(v.webkitPresentationMode==="picture-in-picture"?"inline":"picture-in-picture");return}catch{}}
  broke=!0,sync();try{toast("Picture in picture is not available here","info")}catch{}
 };
 const v=V();v&&["loadedmetadata","emptied"].forEach(t=>v.addEventListener(t,sync));
 const p=d.getElementById("player");p&&new MutationObserver(sync).observe(p,{attributes:!0,attributeFilter:["hidden"]});
 sync()};
d.readyState==="loading"?d.addEventListener("DOMContentLoaded",init,{once:!0}):init()})();