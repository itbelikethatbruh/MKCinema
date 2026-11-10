
'use strict';
/* =====================================================================
   MKCinema · Get started guide and the settings layout
   ===================================================================== */

/* ---------------- Get started: VLC, a key for whichever debrid service the user has, sources, an account ---------------- */
const Guide = {
  steps() {},
  vlcId() { return PLATFORM === 'android' ? 'vlc-android' : PLATFORM === 'ios' ? 'vlc-ios' : 'm3u'; },
  html() {},
  // the service shown in the debrid step: the one already saved, else the last one picked here, else the first in the list
  svc() { return Vault.service() || Store.get('guideSvc', '') || 'ad'; },
  bind() {},
};
SECTIONS.unshift({ id: 'start', icon: 'compass', label: 'Get started', intro: 'Four steps from a fresh install to pressing play. Most people are done in five minutes.', rows: () => [{ html: () => Guide.html() }], bind: () => Guide.bind() });
// Playback gets a direct VLC row next to the external player choice
{
  const pb = SECTIONS.find((s) => s.id === 'playback');
  if (pb) { const rows = pb.rows; pb.rows = () => { const r = rows(); const i = r.findIndex((x) => x.key === 'extPlayer'); r.splice(i + 1, 0, { html: () => `<div class="set-row"><div><b>VLC</b><small>Recommended for MKV files and any stream that will not play in the browser. Free on every platform.</small></div><div class="set-ctl">${vlcButtons()}</div></div>` }); return r; }; }
}

/* ---------------- Settings layout ----------------
   Wide screens: a grouped sidebar and the chosen section as calm, rounded groups of rows.
   Phones: a home list of sections (icon, name, one line) and a full page per section with a back bar, like the
   system settings people already know, instead of a sideways strip of tabs. */
const SET_GROUPS = [
  ['', ['start']],
  ['You', ['account', 'picks', 'home']],
  ['Look and feel', ['appearance', 'performance']],
  ['Watching', ['playback', 'subtitles', 'streams', 'debrid']],
  ['Connected', ['sync', 'devices']],
  ['More', ['sound', 'keys', 'data', 'support', 'about']],
];
const SET_BLURB = {
  start: 'VLC, debrid and your first sources', account: 'Sign in and sync', picks: 'Recommendations made on this device', home: 'Start page and rows',
  appearance: 'Contrast, posters, ratings', performance: 'Effects and smoothness', playback: 'Player, VLC, skip intro, audio', subtitles: 'Size, colour, language',
  streams: 'Addons and how sources load', debrid: 'AllDebrid, Premiumize, Real-Debrid, TorBox', sync: 'Scrobble and watchlists', devices: 'Phone remote, watch party, install',
  sound: 'Intro and soundtrack', keys: 'Keyboard and gamepad', data: 'Setup Cloner, backup, restore', support: 'Keep MKCinema going',
  about: 'Version, credits, third-party licenses',
};
const SET_PHONE = matchMedia('(max-width: 760px)');
let setPhoneHome = false;
const secById = (id) => SECTIONS.find((x) => x.id === id);
renderSettingsNav = function () {
  const used = new Set(SET_GROUPS.flatMap(([, ids]) => ids));
  const groups = SET_GROUPS.map(([g, ids]) => [g, ids.map(secById).filter(Boolean)]);
  const rest = SECTIONS.filter((s) => !used.has(s.id)); if (rest.length) groups.push(['Other', rest]);
  $('#setNav').innerHTML = `<h2 id="setTitle">Settings</h2>${groups.map(([g, list]) => `<div class="sn-group">${g ? `<div class="sn-h">${esc(g)}</div>` : ''}<div class="sn-list">${list.map((sec) => `<button type="button" data-nav data-sec="${sec.id}" class="${sec.id === setSection ? 'on' : ''}" aria-current="${sec.id === setSection ? 'page' : 'false'}"><span class="sn-ic"><i data-lucide="${sec.icon}"></i></span><span class="sn-t"><b>${esc(sec.label)}</b><small>${esc(SET_BLURB[sec.id] || '')}</small></span><i data-lucide="chevron-right" class="sn-go"></i></button>`).join('')}</div></div>`).join('')}`;
  icons();
  $$('#setNav [data-sec]').forEach((b) => b.addEventListener('click', () => {
    const phone = SET_PHONE.matches;
    if (b.dataset.sec === setSection && !phone) return;
    setSection = b.dataset.sec; setPhoneHome = false; markSettingsNav(); renderSettingsBody(); $('#setBody').scrollTop = 0;
  }));
};
markSettingsNav = function () {
  $$('#setNav [data-sec]').forEach((b) => { const on = b.dataset.sec === setSection; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  const m = $('#settings .modal'); m.classList.toggle('m-home', SET_PHONE.matches && setPhoneHome); m.classList.toggle('m-sec', SET_PHONE.matches && !setPhoneHome);
  if (SET_PHONE.matches && setPhoneHome) $('#setNav').scrollTop = 0;
};
renderSettingsBody = function () {
  const sec = secById(setSection) || SECTIONS[0], rows = sec.rows();
  // rows become rounded groups; a group label closes one group and starts the next
  let html = '', open = false;
  const start = () => { if (!open) { html += '<div class="set-card">'; open = true; } };
  const end = () => { if (open) { html += '</div>'; open = false; } };
  rows.forEach((d) => { if (d.group) { end(); html += `<div class="set-group">${esc(d.group)}</div>`; } else { start(); html += rowHTML(d); } });
  end();
  $('#setBody').innerHTML = `<div class="set-back"><button type="button" class="set-back-b" id="setBack" data-nav><i data-lucide="chevron-left"></i>Settings</button></div>
    <div class="set-sec"><header class="set-hd"><span class="set-hd-ic"><i data-lucide="${sec.icon}"></i></span><div><h3>${esc(sec.label)}</h3><p>${esc(sec.intro)}</p></div></header>${html}</div>`;
  rows.forEach(bindRow); if (sec.bind) sec.bind();
  $$('#setBody [data-preset]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.preset; if (k === 'custom' || k === CFG.quality) return;
    CFG.quality = k; CFG.qualityChosen = true; applyPreset(k); saveCfg(); applyAll(); renderSettingsBody(); toast(`Effects: ${PRESETS[k].label}`, 'ok');
  }));
  const imp = $('#set-import-go'); if (imp) imp.onclick = () => importData($('#set-import').value);
  const sw = $('#cl-secrets'); if (sw) sw.onclick = () => { const v = !sw.classList.contains('on'); sw.classList.toggle('on', v); sw.setAttribute('aria-checked', v); };
  const pick = $('#set-import-pick'), pf = $('#set-import-file'); if (pf) { pf.onclick = () => pick.click(); pick.onchange = async () => { const f = pick.files[0]; if (f) importData(await f.text()); pick.value = ''; }; }
  $('#setBack').onclick = () => { setPhoneHome = true; markSettingsNav(); };
  icons();
};
openSettings = function (section) {
  const named = section && SECTIONS.some((x) => x.id === section);
  if (named) setSection = section;
  setPhoneHome = SET_PHONE.matches && !named;
  renderSettingsNav(); openLayer('settings'); markSettingsNav(); renderSettingsBody(); $('#setBody').scrollTop = 0;
};
SET_PHONE.addEventListener('change', () => { if (!$('#settings').hidden) markSettingsNav(); });
// Back on a phone section page returns to the list first
{
  const prevBack = back;
  back = function () { if (!$('#settings').hidden && SET_PHONE.matches && !setPhoneHome) { setPhoneHome = true; markSettingsNav(); return; } return prevBack(); };
}
/* ---------------- About & licenses ----------------
   Third-party notices, verbatim. Stremio's MIT notice comes first because MKCinema builds on Stremio's add-on SDK and protocol. */
const APP_VERSION = '2.62.5';
const LIC_TEXT = {"stremio": "The MIT License (MIT)\n=====================\n\nCopyright © 2019 SmartCode OOD\n\nPermission is hereby granted, free of charge, to any person\nobtaining a copy of this software and associated documentation\nfiles (the “Software”), to deal in the Software without\nrestriction, including without limitation the rights to use,\ncopy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the\nSoftware is furnished to do so, subject to the following\nconditions:\n\nThe above copyright notice and this permission notice shall be\nincluded in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND,\nEXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES\nOF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND\nNONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT\nHOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,\nWHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING\nFROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR\nOTHER DEALINGS IN THE SOFTWARE.", "hls": "Copyright (c) 2017 Dailymotion (http://www.dailymotion.com)\n\nLicensed under the Apache License, Version 2.0 (the \"License\");\nyou may not use this file except in compliance with the License.\nYou may obtain a copy of the License at\n\n    http://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software\ndistributed under the License is distributed on an \"AS IS\" BASIS,\nWITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\nSee the License for the specific language governing permissions and\nlimitations under the License.\n\nsrc/remux/mp4-generator.js and src/demux/exp-golomb.ts implementation in this project\nare derived from the HLS library for video.js (https://github.com/videojs/videojs-contrib-hls)\n\nThat work is also covered by the Apache 2 License, following copyright:\nCopyright (c) 2013-2015 Brightcove\n\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\nTHE SOFTWARE.", "lucide": "ISC License\n\nCopyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.\n\nPermission to use, copy, modify, and/or distribute this software for any\npurpose with or without fee is hereby granted, provided that the above\ncopyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\" AND THE AUTHOR DISCLAIMS ALL WARRANTIES\nWITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF\nMERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR\nANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES\nWHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN\nACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF\nOR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.", "supa": "MIT License\n\nCopyright (c) 2020 Supabase\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.", "webvlc": "MIT License\n\nCopyright (c) 2026 Addy Osmani\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.", "express": "(The MIT License)\n\nCopyright (c) 2009-2014 TJ Holowaychuk <tj@vision-media.ca>\nCopyright (c) 2013-2014 Roman Shtylman <shtylman+expressjs@gmail.com>\nCopyright (c) 2014-2015 Douglas Christopher Wilson <doug@somethingdoug.com>\n\nPermission is hereby granted, free of charge, to any person obtaining\na copy of this software and associated documentation files (the\n'Software'), to deal in the Software without restriction, including\nwithout limitation the rights to use, copy, modify, merge, publish,\ndistribute, sublicense, and/or sell copies of the Software, and to\npermit persons to whom the Software is furnished to do so, subject to\nthe following conditions:\n\nThe above copyright notice and this permission notice shall be\nincluded in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,\nEXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF\nMERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.\nIN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY\nCLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,\nTORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE\nSOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.", "cors": "(The MIT License)\n\nCopyright (c) 2013 Troy Goode <troygoode@gmail.com>\n\nPermission is hereby granted, free of charge, to any person obtaining\na copy of this software and associated documentation files (the\n'Software'), to deal in the Software without restriction, including\nwithout limitation the rights to use, copy, modify, merge, publish,\ndistribute, sublicense, and/or sell copies of the Software, and to\npermit persons to whom the Software is furnished to do so, subject to\nthe following conditions:\n\nThe above copyright notice and this permission notice shall be\nincluded in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,\nEXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF\nMERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.\nIN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY\nCLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,\nTORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE\nSOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.", "nf": "The MIT License (MIT)\n\nCopyright (c) 2016 David Frank\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.", "ofl": "-----------------------------------------------------------\nSIL OPEN FONT LICENSE Version 1.1 - 26 February 2007\n-----------------------------------------------------------\n\nPREAMBLE\nThe goals of the Open Font License (OFL) are to stimulate worldwide\ndevelopment of collaborative font projects, to support the font creation\nefforts of academic and linguistic communities, and to provide a free and\nopen framework in which fonts may be shared and improved in partnership\nwith others.\n\nThe OFL allows the licensed fonts to be used, studied, modified and\nredistributed freely as long as they are not sold by themselves. The\nfonts, including any derivative works, can be bundled, embedded, \nredistributed and/or sold with any software provided that any reserved\nnames are not used by derivative works. The fonts and derivatives,\nhowever, cannot be released under any other type of license. The\nrequirement for fonts to remain under this license does not apply\nto any document created using the fonts or their derivatives.\n\nDEFINITIONS\n\"Font Software\" refers to the set of files released by the Copyright\nHolder(s) under this license and clearly marked as such. This may\ninclude source files, build scripts and documentation.\n\n\"Reserved Font Name\" refers to any names specified as such after the\ncopyright statement(s).\n\n\"Original Version\" refers to the collection of Font Software components as\ndistributed by the Copyright Holder(s).\n\n\"Modified Version\" refers to any derivative made by adding to, deleting,\nor substituting -- in part or in whole -- any of the components of the\nOriginal Version, by changing formats or by porting the Font Software to a\nnew environment.\n\n\"Author\" refers to any designer, engineer, programmer, technical\nwriter or other person who contributed to the Font Software.\n\nPERMISSION & CONDITIONS\nPermission is hereby granted, free of charge, to any person obtaining\na copy of the Font Software, to use, study, copy, merge, embed, modify,\nredistribute, and sell modified and unmodified copies of the Font\nSoftware, subject to the following conditions:\n\n1) Neither the Font Software nor any of its individual components,\nin Original or Modified Versions, may be sold by itself.\n\n2) Original or Modified Versions of the Font Software may be bundled,\nredistributed and/or sold with any software, provided that each copy\ncontains the above copyright notice and this license. These can be\nincluded either as stand-alone text files, human-readable headers or\nin the appropriate machine-readable metadata fields within text or\nbinary files as long as those fields can be easily viewed by the user.\n\n3) No Modified Version of the Font Software may use the Reserved Font\nName(s) unless explicit written permission is granted by the corresponding\nCopyright Holder. This restriction only applies to the primary font name as\npresented to the users.\n\n4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font\nSoftware shall not be used to promote, endorse or advertise any\nModified Version, except to acknowledge the contribution(s) of the\nCopyright Holder(s) and the Author(s) or with their explicit written\npermission.\n\n5) The Font Software, modified or unmodified, in part or in whole,\nmust be distributed entirely under this license, and must not be\ndistributed under any other license. The requirement for fonts to\nremain under this license does not apply to any document created\nusing the Font Software.\n\nTERMINATION\nThis license becomes null and void if any of the above conditions are\nnot met.\n\nDISCLAIMER\nTHE FONT SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND,\nEXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF\nMERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT\nOF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE\nCOPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,\nINCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL\nDAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING\nFROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM\nOTHER DEALINGS IN THE FONT SOFTWARE."};
const OFL = `This Font Software is licensed under the SIL Open Font License, Version 1.1.\n\n${LIC_TEXT.ofl}`;
const LIC_GROUPS = [
  ['In the app', [
    { name: 'hls.js', ver: '1.5.13', use: 'Streaming playback', lic: 'Apache-2.0', url: 'https://github.com/video-dev/hls.js', text: LIC_TEXT.hls, extra: 'Full license: https://www.apache.org/licenses/LICENSE-2.0' },
    { name: 'Lucide', ver: '0.454.0', use: 'Icons', lic: 'ISC', url: 'https://lucide.dev', text: LIC_TEXT.lucide },
    { name: 'supabase-js', ver: '2.117.3', use: 'Accounts and sync', lic: 'MIT', url: 'https://github.com/supabase/supabase-js', text: LIC_TEXT.supa },
    { name: 'GSAP', ver: '3.12.5', use: 'Animation', lic: 'GreenSock Standard', url: 'https://gsap.com/standard-license', text: 'GSAP is used under the GreenSock Standard "no charge" license. GreenSock publishes those terms only on its website, not as a license file in the package.\nLicense terms: https://gsap.com/standard-license' },
    { name: 'even-g2-js', use: 'Even Realities G2 glasses connection (adapted)', lic: 'MIT', url: 'https://github.com/mrahtz/even-g2-js', text: "MIT License\n\nCopyright (c) 2026 Matthew Rahtz\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE." },
  ]],
  ['Fonts', [
    { name: 'Fraunces', use: 'Display type', lic: 'OFL-1.1', url: 'https://github.com/undercasetype/Fraunces', text: `Copyright 2018 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces)\n\n${OFL}` },
    { name: 'Sora', use: 'Headings', lic: 'OFL-1.1', url: 'https://github.com/sora-xor/sora-font', text: `Copyright 2019 The Sora Project Authors (https://github.com/sora-xor/sora-font)\n\n${OFL}` },
    { name: 'Onest', use: 'Body text', lic: 'OFL-1.1', url: 'https://github.com/googlefonts/onest', text: `Copyright 2021 The Onest Project Authors (https://github.com/googlefonts/onest)\n\n${OFL}` },
    { name: 'JetBrains Mono', use: 'Labels and numbers', lic: 'OFL-1.1', url: 'https://github.com/JetBrains/JetBrainsMono', text: `Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)\n\n${OFL}` },
  ]],
  ['Companion server', [
    { name: 'Express', ver: '4.x', use: 'Web server', lic: 'MIT', url: 'https://github.com/expressjs/express', text: LIC_TEXT.express },
    { name: 'cors', ver: '2.x', use: 'Cross-origin access', lic: 'MIT', url: 'https://github.com/expressjs/cors', text: LIC_TEXT.cors },
    { name: 'node-fetch', ver: '2.x', use: 'Network requests', lic: 'MIT', url: 'https://github.com/node-fetch/node-fetch', text: LIC_TEXT.nf },
  ]],
  ['Data and services', [
    { name: 'Wikipedia', use: 'X-Ray summaries and cast photos', lic: 'CC BY-SA 4.0', url: 'https://en.wikipedia.org/wiki/Wikipedia:Copyrights', text: 'Text from Wikipedia is available under the Creative Commons Attribution-ShareAlike 4.0 License (https://creativecommons.org/licenses/by-sa/4.0/). MKCinema shows a link to the source article with each summary.\nPhotos come from Wikimedia Commons and keep the license shown on their file pages.' },
    { name: 'Other services', use: 'Metadata, trailers, subtitles, sync and debrid', lic: 'Their terms', url: '', text: 'MKCinema connects to these services. Their data, images and video belong to their owners and are used under each service\'s own terms:\n\nCinemeta and OpenSubtitles v3 (Stremio add-ons), Metahub artwork, YouTube (official trailers, through the YouTube embedded player), OMDb, Kitsu, AniSkip, RPDB, Trakt, Simkl, Pictorium by Eful97 (only if you add its link), Supabase, and the debrid service you connect (AllDebrid, Premiumize, Real-Debrid or TorBox).\n\nAdd-ons you install yourself are run by third parties and are not part of MKCinema.' },
  ]],
  ['Ideas adapted', [
    { name: 'webvlc', use: 'Local file playback, drag and drop, VLC-style keys', lic: 'MIT', url: 'https://github.com/addyosmani/webvlc', text: LIC_TEXT.webvlc },
  ]],
];
const licItem = (x) => `<details class="lic"><summary data-nav><span class="lic-n"><b>${esc(x.name)}</b><small>${x.ver ? `${esc(x.ver)} · ` : ''}${esc(x.use)}</small></span><span class="lic-tag">${esc(x.lic)}</span><i data-lucide="chevron-down" class="lic-chev"></i></summary>
  <div class="lic-body"><pre class="lic-pre">${esc(x.text)}${x.extra ? `\n\n${esc(x.extra)}` : ''}</pre>${x.url ? `<a class="lic-link" href="${esc(x.url)}" target="_blank" rel="noopener" data-nav><i data-lucide="external-link"></i>${x.lic.startsWith('CC') ? 'License details' : 'Project page'}</a>` : ''}</div></details>`;
SECTIONS.push({ id: 'about', icon: 'scale', label: 'About & licenses', intro: 'Version, MKCinema\'s own license, and the third-party software, fonts and services it uses.', rows: () => [
  { html: () => `<div class="ab-hero"><div class="ab-mark">MKCinema</div><small>Version ${APP_VERSION} · © 2026 Dee Lavish</small>
    <p class="ab-gpl">MKCinema is free software under the GNU General Public License, version 3. It comes with ABSOLUTELY NO WARRANTY. You are welcome to share and change it under the terms of that license.</p>
    <div class="free-pledge"><b>Free forever</b><p>MKCinema is free and always will be. No paid plan, no premium tier, no ads and nothing locked, now or later. Every feature is for everyone.</p><p>Donations on Ko-fi are optional and never unlock anything.</p></div>
    <div class="ab-links"><a class="btn btn-ghost btn-sm" href="https://github.com/itbelikethatbruh/MKCinema" target="_blank" rel="noopener" data-nav><i data-lucide="code"></i>Source code</a><a class="btn btn-ghost btn-sm" href="https://github.com/itbelikethatbruh/MKCinema/blob/main/LICENSE" target="_blank" rel="noopener" data-nav><i data-lucide="scale"></i>GPL-3.0 license</a></div></div>` },
  { group: 'Stremio' },
  { html: () => `<div class="lic-feature"><div class="lic-fh"><span class="lic-n"><b>Stremio Add-on SDK, stremio-core and stremio-translations</b><small>The companion server uses the Stremio Add-on SDK to serve its add-on. Stremio import reads watched history in the format stremio-core stores it (its watched-bitfield module). Some Tamil and Bengali interface words come from stremio-translations and its volunteer translators. All three are MIT licensed under this notice.</small></span><span class="lic-tag">MIT</span></div>
    <pre class="lic-pre">${esc(LIC_TEXT.stremio)}</pre>
    <div class="lic-links"><a class="lic-link" href="https://github.com/Stremio/stremio-addon-sdk" target="_blank" rel="noopener" data-nav><i data-lucide="external-link"></i>stremio-addon-sdk</a><a class="lic-link" href="https://github.com/Stremio/stremio-core" target="_blank" rel="noopener" data-nav><i data-lucide="external-link"></i>stremio-core</a><a class="lic-link" href="https://github.com/Stremio/stremio-translations" target="_blank" rel="noopener" data-nav><i data-lucide="external-link"></i>stremio-translations</a></div>
    <small class="lic-note">Stremio is a trademark of Smart Code OOD. MKCinema is an independent project and is not affiliated with or endorsed by Stremio.</small></div>` },
  ...LIC_GROUPS.flatMap(([g, list]) => [{ group: g }, { html: () => list.map(licItem).join('') }]),
] });
// First visit: the guide is the first thing Settings shows
if (!Store.get('guideSeen', false)) { setSection = 'start'; Store.set('guideSeen', true); }

/* On a phone turned sideways the screen is short, so the dock slides away while you scroll down and comes back as soon as you scroll up */
(function dockAutoHide() {
  if (IS_TV) return;
  const short = matchMedia('(orientation:landscape) and (max-height:540px)');
  let lastY = scrollY, ticking = false;
  const set = (on) => document.body.classList.toggle('dock-away', on);
  addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      ticking = false; const y = scrollY, d = y - lastY; lastY = y;
      if (!short.matches || y < 80) { set(false); return; }
      if (d > 6) set(true); else if (d < -6) set(false);
    });
  }, { passive: true });
  short.addEventListener('change', () => set(false));
})();
/* The dock keeps every tab on screen: when it runs out of room it drops, in order, the other tabs' labels,
   every label, the layout switch and file button, then the sound button. Nothing scrolls sideways. */
const DockFit = {
  // 1 tucks away extras, 2 gives the labelled tabs their own row, 3 tightens that row
  over() { const t = $('#tabs'), d = $('.dock'); return t.scrollWidth > t.clientWidth + 1 || d.scrollWidth > d.clientWidth + 1; },
  run() {
    const tabs = $('#tabs'), b = document.body; if (!tabs) return;
    ['dk1', 'dk2', 'dk3', 'dkw'].forEach((c) => b.classList.remove(c)); b.style.removeProperty('--dock-h');
    if (getComputedStyle(tabs).display === 'none') return;
    for (let lvl = 1; lvl <= 3 && this.over(); lvl++) b.classList.add(`dk${lvl}`);
    if (b.classList.contains('dk2')) {
      // on two rows the top row has room again: bring back the extras and the wordmark if they fit
      b.classList.remove('dk1'); b.classList.add('dkw'); if (this.over()) b.classList.remove('dkw');
      if (this.over()) b.classList.add('dk1');
      b.style.setProperty('--dock-h', `${$('.dock').offsetHeight}px`);
    }
  },
  init() { let raf = 0; const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => this.run()); };
    addEventListener('resize', later); $('#tabs').addEventListener('click', later);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(later); this.run(); },
};
DockFit.init();
// a contrast picked by hand is kept from now on (and wins over other devices)
CFG_HOOKS.push((k) => { if (k === 'contrast' && !CFG.contrastChosen) { CFG.contrastChosen = true; saveCfg(); } });
boot();
Account.init();
