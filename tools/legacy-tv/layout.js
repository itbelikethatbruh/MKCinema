/* Layout fixes for older TV browsers, run in tv-legacy.html only. build.js fills in GAPS and RATIOS from the app's CSS.
   - Flexbox gap (Chromium 84): grid gaps work through grid-gap, but a flex row with gap would have its items touching.
     For each rule that sets a gap, the first matching element tells us whether it is a flex row, a flex column or a
     wrapping flex box, and one CSS rule then puts the same space between its children as margins.
   - aspect-ratio (Chromium 88): boxes that get their height from aspect-ratio would collapse to nothing, so their
     height is set from their width, again after layout changes (debounced, never per frame). */
(function (GAPS, RATIOS) {
  var sheet, done = {}, timer = 0, flexSels = [];
  function rule(css) {
    if (!sheet) { var st = document.createElement('style'); st.id = 'mkc-legacy-layout'; document.head.appendChild(st); sheet = st.sheet; }
    try { sheet.insertRule(css, sheet.cssRules.length); } catch (e) { /* a selector this engine cannot read */ }
  }
  function gaps() {
    for (var i = 0; i < GAPS.length; i++) {
      var g = GAPS[i], key = g[0] + '|' + g[3];
      if (done[key]) continue;
      if (g[3] && !matchMedia(g[3]).matches) continue;
      var el; try { el = document.querySelector(g[0]); } catch (e) { done[key] = 1; continue; }
      if (!el) continue;
      var cs = getComputedStyle(el);
      if (cs.display !== 'flex' && cs.display !== 'inline-flex') { if (cs.display !== 'none') done[key] = 1; continue; }
      done[key] = 1; flexSels.push(g[0]);
      var row = g[1], col = g[2], dir = cs.flexDirection, wrap = cs.flexWrap !== 'nowrap', sel = g[0].split(',');
      var kids = function (suffix) { return sel.map(function (s) { return s + ' > ' + suffix; }).join(','); };
      var css;
      if (wrap) css = kids('*') + '{margin-right:' + col + ';margin-bottom:' + row + '}';
      else if (dir === 'row') css = kids('* + *') + '{margin-left:' + col + '}';
      else if (dir === 'row-reverse') css = kids('* + *') + '{margin-right:' + col + '}';
      else if (dir === 'column') css = kids('* + *') + '{margin-top:' + row + '}';
      else css = kids('* + *') + '{margin-bottom:' + row + '}';
      rule(g[3] ? '@media ' + g[3] + '{' + css + '}' : css);
    }
  }
  /* A gap also separates a bare text run from an icon ("[icon] Trailer"), but a margin can only go on an element, so
     loose text inside these flex boxes is put in a <span>. */
  function wrapText() {
    for (var i = 0; i < flexSels.length; i++) {
      var list; try { list = document.querySelectorAll(flexSels[i]); } catch (e) { continue; }
      for (var j = 0; j < list.length; j++) {
        var el = list[j]; if (!el.firstElementChild) continue;
        for (var n = el.firstChild; n; n = n.nextSibling) {
          if (n.nodeType !== 3 || !/\S/.test(n.nodeValue)) continue;
          var sp = document.createElement('span'); sp.className = 'mkc-gt';
          el.insertBefore(sp, n); sp.appendChild(n); n = sp;
        }
      }
    }
  }
  /* <button> could not be a grid container before Chromium 83: its children just stack. The children are moved into a
     <span class="mkc-bg"> that takes the button's grid settings (build.js also adds "button > .mkc-bg > child"
     versions of the app's child selectors). */
  function wrapButtons() {
    var list = document.getElementsByTagName('button');
    for (var i = 0; i < list.length; i++) {
      var b = list[i]; if (!b.firstChild || (b.firstChild.className === 'mkc-bg' && !b.firstChild.nextSibling)) continue;
      var d = getComputedStyle(b).display; if (d !== 'grid' && d !== 'inline-grid') continue;
      var sp = document.createElement('span'); sp.className = 'mkc-bg';
      while (b.firstChild) sp.appendChild(b.firstChild);
      b.appendChild(sp);
    }
  }
  function ratios() {
    for (var i = 0; i < RATIOS.length; i++) {
      var r = RATIOS[i], list;
      if (r[2] && !matchMedia(r[2]).matches) continue;
      try { list = document.querySelectorAll(r[0]); } catch (e) { continue; }
      for (var j = 0; j < list.length; j++) {
        var el = list[j], w = el.offsetWidth;
        if (!w) continue;
        var h = Math.round(w / r[1]) + 'px';
        if (el.style.height !== h && (!el.style.height || el.__mkr)) { el.style.height = h; el.__mkr = 1; }
      }
    }
  }
  /* only on engines without the feature, so a newer TV that lands here looks the same as the main app */
  function flexGap() {
    var d = document.createElement('div'); d.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute';
    d.appendChild(document.createElement('div')); d.appendChild(document.createElement('div'));
    document.body.appendChild(d); var ok = d.scrollHeight === 1; d.parentNode.removeChild(d); return ok;
  }
  function buttonGrid() {
    var b = document.createElement('button'); b.style.cssText = 'display:grid;grid-template-columns:10px 10px;padding:0;border:0;position:absolute';
    var x = document.createElement('i'), y = document.createElement('i'); x.style.display = y.style.display = 'block';
    b.appendChild(x); b.appendChild(y); document.body.appendChild(b); var ok = y.offsetLeft - x.offsetLeft === 10 && y.offsetTop === x.offsetTop;
    b.parentNode.removeChild(b); return ok;
  }
  var force = window.MKC_LEGACY_TEST, needGap, needBtn, needRatio = force || !(window.CSS && CSS.supports && CSS.supports('aspect-ratio', '1'));
  function run() { timer = 0; try { if (needBtn) wrapButtons(); if (needGap) { gaps(); wrapText(); } if (needRatio) ratios(); } catch (e) {} }
  function soon() { if (!timer) timer = setTimeout(run, 200); }
  function start() {
    needGap = force || !flexGap(); /* MKC_LEGACY_TEST: the test page forces both fixes on */
    needBtn = !buttonGrid();
    if (needBtn) rule('.mkc-bg{display:grid;grid-template-columns:inherit;grid-template-rows:inherit;grid-template-areas:inherit;grid-auto-flow:inherit;grid-auto-rows:inherit;grid-auto-columns:inherit;grid-row-gap:inherit;grid-column-gap:inherit;align-items:inherit;justify-items:inherit;align-content:inherit;justify-content:inherit;width:100%;min-height:100%;text-align:inherit}');
    if (!needGap && !needRatio && !needBtn) return;
    run();
    new MutationObserver(soon).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    addEventListener('resize', soon);
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})(__GAPS__, __RATIOS__);
