
'use strict';
/* =====================================================================
   MKCinema · configuration and effects presets
   ===================================================================== */
/* One look, by design: Noir. Matte black, platinum type, graphite hairlines, nothing moving behind the page. */
const LOOKS = {
  noir: { label: 'Noir', blurb: 'Matte black, platinum type and fine hairlines. The original.', l0: '#000000', lb: '#111113', li: '#f2f2f3', la: '#d9d4c7', meta: '#000000' },
  midnight: { label: 'Midnight', blurb: 'Ink blue blacks and ice silver type, like a cinema before the lights go down.', l0: '#05070c', lb: '#0f1625', li: '#f0f2f5', la: '#bccde4', meta: '#05070c' },
  velvet: { label: 'Velvet', blurb: 'Deep oxblood and soft ivory, with rose gold for the small highlights.', l0: '#0a0506', lb: '#221014', li: '#f4f1f2', la: '#e3c8bd', meta: '#0a0506' },
  sepia: { label: 'Sepia', blurb: 'Warm umber blacks, cream type and amber highlights, like old film stock.', l0: '#0a0805', lb: '#211912', li: '#f5f2f0', la: '#e8d7b8', meta: '#0a0805' }
};

/* Effects presets. High adds depth: raised, shimmering buttons, posters that lift and tilt, the 3D logo pulse, and
   frosted glass on desktops. Phones get everything but the glass (Chrome on Android can black out blurred tiles). */
const PRESETS = {
  high: { label: 'High', blur: 18, note: 'Depth, shimmer and glass' },
  balanced: { label: 'Balanced', blur: 10, note: 'Shimmer and light glass' },
  low: { label: 'Low', blur: 0, note: 'Flat and still, the fastest' },
};
const PRESET_ORDER = ['high', 'balanced', 'low'];

const CFG_DEFAULTS = {
  // appearance
  look: 'noir', cardInfo: 'hover', uiScale: 100, reduceMotion: false, contrast: 'high',
  // performance
  quality: 'high', qualityChosen: false, blur: 18, showFps: false,
  // playback
  maxQuality: '4k', preferFormat: 'any', autoNext: true, upNextAt: 45, seekStep: 10, resume: true, speed: 1,
  failover: true, skipIntro: true, autoSkipIntro: false, xray: true, spoilerGuard: false, dsp: 'flat',
  // posters
  ratingBadges: true, rpdb: false,
  // watch party
  partyName: '', partyShareLink: false, governor: true, syncKeys: true, anonStats: true,
  ambilight: true, ambIntensity: 85, rememberVolume: true, extPlayers: {},
  // subtitles
  subAuto: true, subDubSigns: true, subLang: 'eng', subSize: 100, subColor: '#ffffff', subBg: 65, subPos: 'bottom', subFont: 'sans', subOutline: true,
  // streams
  hideP2P: false, browserOnly: false, audioOnly: 'eng', showTrailers: true, timeout: 15, alwaysProxy: false,
  // intro, sound, trailers
  cloudSync: true,
  introMode: 'daily', sfxVolume: 70, trailerMode: 'auto',
};
const CFG = Object.assign({}, CFG_DEFAULTS, (() => { try { const c0 = window.__CFG0; window.__CFG0 = null; return c0 && typeof c0 === 'object' ? c0 : JSON.parse(localStorage.getItem('mkc:cfg') || '{}'); } catch (e) { return {}; } })());
// One-time upgrades for settings saved by older builds
if ((CFG.cfgRev || 0) < 4) {
  // Low is the default graphics preset from rev 4; keep a preset only if the user picked it themselves
  if (!CFG.qualityChosen && CFG.quality !== 'custom') CFG.quality = 'low';
  CFG.cfgRev = 4;
}
if (CFG.cfgRev < 6) {
  // rev 6: one Noir look and no animated background; themes, the 3D stage, parallax, tilt and grain are gone
  ['theme', 'customVoid', 'customA1', 'customA2', 'customA3', 'bgStyle', 'parallaxDepth', 'bg3d', 'renderScale', 'fpsCap', 'particles', 'nebula', 'tilt', 'grain', 'autoDowngrade', 'dimBgInMenus', 'autoLevel'].forEach((k) => delete CFG[k]);
  if (CFG.quality !== 'custom' && !PRESETS[CFG.quality]) CFG.quality = { ultra: 'high' }[CFG.quality] || 'low';
  CFG.cfgRev = 6;
}
if (CFG.cfgRev < 7) {
  // rev 7: the next-episode card shows during the last 45 s (the old default was 25 s)
  if (CFG.upNextAt === 25) CFG.upNextAt = 45;
  CFG.cfgRev = 7;
}
if (CFG.cfgRev < 8) {
  // rev 8: High is the default everywhere, phones included; a preset the user picked themselves is kept
  if (!CFG.qualityChosen && CFG.quality !== 'custom') CFG.quality = 'high';
  CFG.cfgRev = 8;
}
if (CFG.cfgRev < 9) {
  // rev 9: High text contrast is the default; a choice the user made themselves is kept
  if (!CFG.contrastChosen) CFG.contrast = 'high';
  CFG.cfgRev = 9;
}
if (CFG.cfgRev < 10) {
  // rev 10: trailers default to "Best for this device" (the YouTube app on TVs); "Open on YouTube" is kept
  if (CFG.trailerMode !== 'link') CFG.trailerMode = 'auto';
  CFG.cfgRev = 10;
}
const CFG_HOOKS = [];
function saveCfg() { try { localStorage.setItem('mkc:cfg', JSON.stringify(CFG)); } catch (e) { /* storage blocked */ } }
function setCfg(key, value, { silent = false } = {}) {
  CFG[key] = value; saveCfg();
  if (!silent) CFG_HOOKS.forEach((fn) => { try { fn(key, value); } catch (e) { console.error(e); } });
}
function applyPreset(name) {
  const level = PRESETS[name] ? name : 'high';
  CFG.blur = PRESETS[level].blur; saveCfg(); return level;
}
if (CFG.quality !== 'custom') CFG.quality = applyPreset(CFG.quality);
/* Devices without hover (phones, tablets) can never reveal "on hover" poster text, so they get the title below instead */
const NO_HOVER = matchMedia('(hover: none)');
/* Smart TVs (the MKCinema Android TV / Fire TV app, LG webOS, TV browsers): a D-pad remote, sofa distance and a slow GPU */
const PUBLIC_ORIGIN = location.hostname === 'mkcinema.pages.dev' ? 'https://app.mkcinema.app' : location.origin;
const IS_TV = document.documentElement.classList.contains('tv') || /MKCinemaTV|Android TV|GoogleTV|AFT[A-Z]|SMART-TV|SmartTV|Web0S|webOS|Tizen|BRAVIA/i.test(navigator.userAgent);
if (IS_TV) document.documentElement.classList.add('tv');
/* Phones and tablets: Chrome on Android can black out tiles of backdrop-filtered or 3D-layered elements while scrolling, so these get a flat, unblurred UI */
const TOUCH_UI = IS_TV || matchMedia('(pointer: coarse)').matches || NO_HOVER.matches;
const cardInfoMode = () => (CFG.cardInfo === 'hover' && NO_HOVER.matches ? 'below' : CFG.cardInfo);
