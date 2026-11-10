
/* 2.54 TV player parity (MKCinema TV app 1.9.0): the Android TV player gets the same skip times as MKCinema's own
   player (AniSkip, TheIntroDB, chapters, addon times, your own skips), a Next episode button in the credits, styled
   ASS/SSA subtitles, and Trakt, Simkl, AniList and MyAnimeList updates when you stop watching. Older TV apps ignore
   the extra fields. */
const TvParity = {
  /* runs while the TV player waits for subtitles (at most about 2.5 s): what the TV app needs besides the link */
  async prep(ctx) {
    const out = { hasNext: !!(ctx && ctx.video && nextVideo(ctx.meta, ctx.video)), autoSkip: !!CFG.autoSkipIntro, ass: CFG.tvAss !== false };
    try {
      if (CFG.skipIntro && ctx && ctx.meta) {
        const load = Promise.resolve(Skip.load(ctx)).catch(() => {});
        const idb = typeof Marks !== 'undefined' ? Promise.resolve(Marks.introdb(ctx)).catch(() => {}) : null;
        await Promise.race([Promise.all([load, idb]), new Promise((r) => setTimeout(r, 2500))]);
        await new Promise((r) => setTimeout(r, 0)); // TheIntroDB's times land one step after its answer
        const m = Skip.m, sk = {};
        if (m) {
          for (const k of ['recap', 'intro', 'ed']) if (Array.isArray(m[k]) && isFinite(m[k][0]) && isFinite(m[k][1]) && m[k][1] > m[k][0]) sk[k] = [Number(m[k][0]), Number(m[k][1])];
          if (isFinite(m.credits) && m.credits > 0) sk.credits = Number(m.credits);
        }
        if (Object.keys(sk).length) { out.skips = sk; MKLog.add('info', `TV player skip times: ${Object.keys(sk).join(', ')}`); }
      }
    } catch (e) { /* no skip times: the TV player plays without the button */ }
    this.start(ctx);
    return out;
  },
  /* Scrobble reads the web player's clock; for the TV player it gets the TV's position instead */
  with(ctx, pct, fn) {
    const o = { ctx: Scrobble.ctx, done: Scrobble.done, pct: Scrobble.pct };
    Scrobble.ctx = ctx; Scrobble.done = false; Scrobble.pct = () => pct;
    try { fn(); } finally { Scrobble.ctx = o.ctx; Scrobble.done = o.done; Scrobble.pct = o.pct; }
  },
  start(ctx) {
    try {
      if (!ctx || !Trakt.on()) return;
      const pr = S.progress[ctx.video ? ctx.video.id : ctx.meta.id];
      this.with(ctx, pr && pr.d > 0 ? clamp(pr.t / pr.d * 100, 0, 100) : 0, () => Scrobble.send('start'));
    } catch (e) { /* Trakt off or unreachable */ }
  },
  init() {
    if (!window.MKNative || typeof MKNative.done !== 'function') return;
    const done = MKNative.done;
    MKNative.done = function (pos, dur, ended, next, err, act) {
      const c = TvPlayer.cur;
      try {
        // the same rule as MKCinema's own player: past 80 % it counts as watched, before that Trakt keeps your spot
        if (c && act !== 'web' && !(err && !(pos > 0)) && dur > 30000) {
          const pct = ended ? 100 : clamp(pos / dur * 100, 0, 100);
          TvParity.with(c.ctx, pct, () => { if (pct >= 80) Scrobble.check(); else Scrobble.send('pause'); });
        }
      } catch (e) { /* never stands in the way of closing the player */ }
      return done.apply(this, arguments);
    };
    const sec = SECTIONS.find((s) => s.id === 'playback');
    if (sec && TvPlayer.on()) {
      const rows = sec.rows;
      sec.rows = () => {
        const r = rows(); if (r.some((x) => x.key === 'tvAss')) return r;
        const at = r.findIndex((x) => x.key === 'tvEngine' || x.key === 'tvPlayer');
        r.splice(at < 0 ? r.length : at + 1, 0, { key: 'tvAss', label: 'Styled anime subtitles in the TV player', help: 'Fonts, colours, positions and signs in ASS/SSA subtitles look the way the subtitle maker styled them. Needs the MKCinema TV app 1.9.0 or later.', type: 'toggle', get: () => CFG.tvAss !== false });
        return r;
      };
    }
  },
};
TvParity.init();

/* Notices for what the TV app 1.9.0 player uses (Settings › About & licenses) */
try {
  const mit = (c) => `MIT License\n\n${c}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
  const isc = 'ISC License\n\nCopyright (C) 2006-2016 libass contributors\n\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.';
  const apache = (c) => `${c}\n\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at\n\n    http://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.`;
  if (typeof LIC_GROUPS !== 'undefined' && !LIC_GROUPS.some((g) => g[0] === 'Android and TV app')) LIC_GROUPS.splice(1, 0, ['Android and TV app', [
    { name: 'AndroidX Media3 (ExoPlayer)', ver: '1.8.0', use: 'TV player', lic: 'Apache-2.0', url: 'https://github.com/androidx/media', text: apache('Copyright (C) The Android Open Source Project') },
    { name: 'libass', use: 'Styled ASS/SSA subtitles', lic: 'ISC', url: 'https://github.com/libass/libass', text: isc },
    { name: 'libass-android (ass-media)', ver: '0.4.0', use: 'libass in the TV player', lic: 'MIT', url: 'https://github.com/peerless2012/libass-android', text: mit('Copyright (c) 2025 peerless2012') },
    { name: 'Kotlin standard library', ver: '2.2.0', use: 'Needed by libass-android', lic: 'Apache-2.0', url: 'https://github.com/JetBrains/kotlin', text: apache('Copyright 2010-2025 JetBrains s.r.o. and Kotlin Programming Language contributors.') },
  ]]);
} catch (e) { /* older build without the licenses page */ }
