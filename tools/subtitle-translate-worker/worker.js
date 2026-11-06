/* MKCinema subtitle translation (fallback for browsers without an on-device Translator).
   POST /translate  { from: "en", to: "pt-BR", lines: ["...", ...] }  ->  { lines: ["...", ...] }
   - Runs a Workers AI model on the MKCinema Cloudflare account; users need no key.
   - Stays on the Workers Free plan: when the daily Workers AI allowance runs out it answers 503 "busy" and the app keeps the original lines.
   - Only the MKCinema app origins, at most 60 lines / 6,000 characters per call, per-IP rate limit.
   - Results are cached by content, so a popular subtitle file is translated once per data centre.
   - Nothing is stored apart from that cache; Workers AI keeps no data (zero data retention model). */

const MODEL = '@cf/google/gemma-4-26b-a4b-it';
const ORIGINS = new Set(['https://app.mkcinema.app', 'https://mkcinema.pages.dev']);
const MAX_LINES = 60, MAX_CHARS = 6000, VERSION = 1;

const cors = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});
const json = (body, status, origin) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...(origin ? cors(origin) : {}) } });

const okOrigin = (o) => ORIGINS.has(o);
const tag = (s) => /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(s || '');

function languageName(code) {
  if (code === 'pt-BR') return 'Brazilian Portuguese';
  if (code === 'pt' || code === 'pt-PT') return 'European Portuguese';
  if (code === 'zh-TW' || code === 'zh-Hant') return 'Traditional Chinese';
  if (code === 'zh' || code === 'zh-CN' || code === 'zh-Hans') return 'Simplified Chinese';
  if (code === 'es-419') return 'Latin American Spanish';
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; } catch (e) { return code; }
}

async function sha(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* One numbered line per cue; line breaks inside a cue travel as ⏎ so the numbering can't drift. */
async function translate(env, from, to, lines) {
  const src = lines.map((l, i) => `${i + 1}\t${String(l).replace(/\r?\n/g, ' ⏎ ').replace(/\t/g, ' ')}`).join('\n');
  const system = `You translate film and TV subtitles from ${languageName(from)} to ${languageName(to)}. `
    + 'Translate every numbered line. Keep each number and its tab, keep ⏎ markers, keep tags like <i> and </i>. '
    + 'Write short, natural subtitle lines as a professional subtitler would. Keep names as they are. '
    + 'Output only the numbered lines, one per line, nothing else.';
  const r = await env.AI.run(MODEL, {
    messages: [{ role: 'system', content: system }, { role: 'user', content: src }],
    max_tokens: Math.min(4000, 200 + Math.ceil(src.length / 1.6)), temperature: 0.2,
    chat_template_kwargs: { enable_thinking: false }, reasoning_effort: 'none',
  });
  const text = (r && (r.response ?? r.choices?.[0]?.message?.content)) || '';
  const out = new Array(lines.length).fill(null);
  for (const row of String(text).split('\n')) {
    const m = /^\s*(\d+)[\t.:)\s]\s*(.*)$/.exec(row); if (!m) continue;
    const i = Number(m[1]) - 1; if (i < 0 || i >= lines.length || out[i] != null) continue;
    const t = m[2].trim(); if (t) out[i] = t.replace(/\s*⏎\s*/g, '\n');
  }
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') return json({ ok: true, service: 'mkcinema-subtitles', v: VERSION }, 200, okOrigin(origin) ? origin : null);
    if (url.pathname !== '/translate') return json({ error: 'not_found' }, 404);
    if (!okOrigin(origin)) return json({ error: 'origin' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'POST') return json({ error: 'method' }, 405, origin);

    let body; try { body = await request.json(); } catch (e) { return json({ error: 'bad_json' }, 400, origin); }
    const { from, to } = body || {}; const lines = Array.isArray(body && body.lines) ? body.lines.map((x) => String(x ?? '')) : null;
    if (!tag(from) || !tag(to) || !lines || !lines.length || lines.length > MAX_LINES) return json({ error: 'bad_request' }, 400, origin);
    if (lines.reduce((n, l) => n + l.length, 0) > MAX_CHARS) return json({ error: 'too_long' }, 413, origin);
    if (from.split('-')[0] === to.split('-')[0] && from === to) return json({ lines }, 200, origin);

    const key = new Request(`https://cache.subs.mkcinema.app/v${VERSION}/${to}/${await sha(`${from}\n${to}\n${lines.join('\u0001')}`)}`);
    const cache = caches.default;
    const hit = await cache.match(key);
    if (hit) { const h = await hit.json(); return json({ lines: h.lines, cached: true }, 200, origin); }

    const ip = request.headers.get('CF-Connecting-IP') || 'x';
    if (env.RL) { const { success } = await env.RL.limit({ key: ip }); if (!success) return json({ error: 'slow_down' }, 429, origin); }

    let out;
    try { out = await translate(env, from, to, lines); } catch (e) {
      const msg = String(e && e.message || e);
      // the daily allowance ran out, or the model is busy
      return json({ error: /limit|quota|neuron|capacity|429|3036|4006/i.test(msg) ? 'busy' : 'failed' }, 503, origin);
    }
    const good = out.filter((x) => x != null).length;
    if (good >= Math.ceil(lines.length * 0.8)) {
      ctx.waitUntil(cache.put(key, new Response(JSON.stringify({ lines: out }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=2592000' } })));
    }
    return json({ lines: out }, 200, origin);
  },
};
