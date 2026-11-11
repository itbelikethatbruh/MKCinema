// MKCinema "miko-ai": Miko's built-in AI, shared by everyone, on Supabase Edge Functions (deploy with verify_jwt off).
// The Groq key lives ONLY in the function secret GROQ_API_KEY. It is never sent to the browser, and it is not in the app,
// the site or the repo. This function forwards one chat round to Groq's chat completions endpoint, with tight limits:
//   - only from MKCinema's own sites, and only with the project's publishable key
//   - only the models in STEPS, only plain chat rounds with tools (no streaming), answer length capped
//   - per visitor (salted hash of the IP, never the IP itself): PER_MIN rounds a minute and PER_DAY rounds a day
//   - everyone together: ALL_DAY rounds a day, kept below the Groq plan's daily request limit
// Nothing about the chat is stored or logged: this file has no console calls on purpose. Only counters are kept
// (table public.miko_ai_usage, rows older than two days are dropped).
// v2: a chain of free allowances. Each Groq model has its own daily allowance, and Cloudflare Workers AI gives 10,000
// free Neurons a day. When one says "limit reached" (429), that step rests until its retry-after and the next one answers.
// Secrets it reads: GROQ_API_KEY. Optional: CF_AI_ACCOUNT + CF_AI_TOKEN (Workers AI), MIKO_AI_PER_DAY, MIKO_AI_ALL_DAY,
// MIKO_AI_OFF=1 (switch it off).
const VERSION = 2;
const GROQ = 'https://api.groq.com/openai/v1/chat/completions';
type Step = { id: string; model: string; url: () => string; key: () => string; extra: Record<string, unknown> };
const STEPS: Step[] = [
  { id: 'groq-120b', model: 'openai/gpt-oss-120b', url: () => GROQ, key: () => env('GROQ_API_KEY'), extra: { reasoning_effort: 'low' } },
  { id: 'groq-qwen', model: 'qwen/qwen3.8-27b', url: () => GROQ, key: () => env('GROQ_API_KEY'), extra: { reasoning_effort: 'none' } },
  { id: 'groq-20b', model: 'openai/gpt-oss-20b', url: () => GROQ, key: () => env('GROQ_API_KEY'), extra: { reasoning_effort: 'low' } },
  { id: 'cf-120b', model: '@cf/openai/gpt-oss-120b', url: () => `https://api.cloudflare.com/client/v4/accounts/${env('CF_AI_ACCOUNT')}/ai/v1/chat/completions`, key: () => (env('CF_AI_ACCOUNT') ? env('CF_AI_TOKEN') : ''), extra: { reasoning_effort: 'low' } },
];

const resting = new Map<string, number>(); // step id -> time it may be tried again (per isolate)
const ORIGINS = [/^https:\/\/(mkcinema|mkctv)\.pages\.dev$/, /^https:\/\/((app|tv)\.)?mkcinema\.app$/];
const MAX_BODY = 64_000, MAX_MSGS = 40, MAX_TOOLS = 12, MAX_TEXT = 12_000, MAX_OUT = 2048;

const env = (k: string) => { try { return Deno.env.get(k) || ''; } catch { return ''; } };
const num = (k: string, d: number) => { const n = Number(env(k)); return Number.isFinite(n) && n > 0 ? n : d; };
const PER_MIN = 10, PER_DAY = num('MIKO_AI_PER_DAY', 60), ALL_DAY = num('MIKO_AI_ALL_DAY', 3000);

const KEYS = new Set<string>(['sb_publishable_ZpiFwB_oM579GwCunYpHWg_jelRazT-']);
if (env('SUPABASE_ANON_KEY')) KEYS.add(env('SUPABASE_ANON_KEY'));
try { const p = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') || '{}'); for (const v of Object.values(p)) if (typeof v === 'string' && v) KEYS.add(v); } catch { /* not set */ }
const serviceKey = () => {
  try { const p = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}'); const v = Object.values(p).find((x) => typeof x === 'string' && x); if (v) return v as string; } catch { /* not set */ }
  return env('SUPABASE_SERVICE_ROLE_KEY');
};

// per-minute limit: in memory, per isolate (best effort). The daily limits are in the database.
const mins = new Map<string, { n: number; t: number }>();
const days = new Map<string, { n: number; d: string }>(); // fallback if the database can't be reached
function perMinute(id: string): number {
  const now = Date.now();
  if (mins.size > 5000) for (const [k, v] of mins) if (now - v.t >= 60_000) mins.delete(k);
  let h = mins.get(id); if (!h || now - h.t >= 60_000) { h = { n: 0, t: now }; mins.set(id, h); }
  h.n++; return h.n > PER_MIN ? Math.max(1, Math.ceil((h.t + 60_000 - now) / 1000)) : 0;
}
const today = () => new Date().toISOString().slice(0, 10);
const toMidnight = () => { const n = new Date(); return Math.max(60, Math.ceil((Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - n.getTime()) / 1000)); };
async function daily(id: string): Promise<[number, number]> {
  const url = env('SUPABASE_URL'), key = serviceKey();
  try {
    if (!url || !key) throw 0;
    const r = await fetch(`${url}/rest/v1/rpc/miko_ai_hit`, { method: 'POST', headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ buckets: [`ip:${id}`, 'all'] }), signal: AbortSignal.timeout(4000) });
    const j = await r.json(); if (!r.ok || !Array.isArray(j) || j.length !== 2) throw 0;
    return [Number(j[0]) || 0, Number(j[1]) || 0];
  } catch {
    const d = today(); if (days.size > 20000) days.clear();
    const bump = (k: string) => { let h = days.get(k); if (!h || h.d !== d) { h = { n: 0, d }; days.set(k, h); } return ++h.n; };
    return [bump(`ip:${id}`), bump('all')];
  }
}
const clientIp = (req: Request) => (req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || 'unknown').trim();
async function visitor(req: Request): Promise<string> {
  const salt = `${serviceKey()}|miko-ai|${today()}`; // changes every day, so a hash can't be followed across days
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${clientIp(req)}`));
  return Array.from(new Uint8Array(h).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

// keep only the fields a chat round needs, so the endpoint can't be used for anything else
type Any = Record<string, unknown>;
const txt = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : v == null ? '' : null);
function cleanMessages(list: unknown): Any[] | null {
  if (!Array.isArray(list) || !list.length || list.length > MAX_MSGS) return null;
  const out: Any[] = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i] as Any; if (!m || typeof m !== 'object') return null;
    const role = m.role, content = txt(m.content); if (content === null) return null;
    if (role === 'system') { if (i !== 0) return null; out.push({ role, content }); continue; }
    if (role === 'user') { out.push({ role, content }); continue; }
    if (role === 'tool') { if (typeof m.tool_call_id !== 'string') return null; out.push({ role, content, tool_call_id: m.tool_call_id.slice(0, 100) }); continue; }
    if (role === 'assistant') {
      const k: Any = { role, content };
      if (Array.isArray(m.tool_calls) && m.tool_calls.length) {
        if (m.tool_calls.length > 8) return null;
        k.tool_calls = m.tool_calls.map((t: Any) => ({ id: String(t?.id || '').slice(0, 100), type: 'function', function: { name: String((t?.function as Any)?.name || '').slice(0, 64), arguments: String((t?.function as Any)?.arguments || '{}').slice(0, 4000) } }));
      }
      out.push(k); continue;
    }
    return null;
  }
  return out;
}
function cleanTools(list: unknown): Any[] | null {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > MAX_TOOLS) return null;
  const out: Any[] = [];
  for (const t of list as Any[]) {
    const f = t && (t.function as Any); if (!f || typeof f.name !== 'string' || !/^[a-z_]{1,64}$/.test(f.name)) return null;
    out.push({ type: 'function', function: { name: f.name, description: String(f.description || '').slice(0, 600), parameters: f.parameters && typeof f.parameters === 'object' ? f.parameters : { type: 'object', properties: {} } } });
  }
  return out;
}

export async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get('origin') || '';
  const okOrigin = ORIGINS.some((r) => r.test(origin));
  const cors: Record<string, string> = {
    'access-control-allow-origin': okOrigin ? origin : 'https://app.mkcinema.app',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'apikey, content-type, accept, x-client-info',
    'access-control-expose-headers': 'retry-after, x-mkc-left, x-mkc-why, x-mkc-step',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
  const json = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const self = new URL(req.url);
  if (req.method === 'GET' && self.searchParams.get('ping')) return json(200, { ok: true, v: VERSION, ready: env('MIKO_AI_OFF') !== '1' && STEPS.some((s) => s.key()), steps: STEPS.filter((s) => s.key()).map((s) => s.id) });
  if (req.method !== 'POST') return json(405, { error: { message: 'method not allowed' } }, { allow: 'POST, OPTIONS' });
  if (!KEYS.has(req.headers.get('apikey') || '')) return json(401, { error: { message: 'key missing or wrong' } });
  if (!okOrigin) return json(403, { error: { message: 'Miko’s built-in AI is for MKCinema only' } });
  if (!STEPS.some((s) => s.key()) || env('MIKO_AI_OFF') === '1') return json(503, { error: { message: 'Miko’s built-in AI is off right now' } }, { 'x-mkc-why': 'off' });

  const id = await visitor(req);
  const wait = perMinute(id);
  if (wait) return json(429, { error: { message: 'Too many questions at once. Wait a moment.' } }, { 'retry-after': String(wait), 'x-mkc-why': 'minute' });

  const raw = await req.text().catch(() => '');
  if (!raw || raw.length > MAX_BODY) return json(413, { error: { message: 'That conversation is too long. Start a new one.' } });
  let b: Any; try { b = JSON.parse(raw); } catch { return json(400, { error: { message: 'bad request' } }); }
  // a test can name a step to start from (only steps from the list above, so nothing else can be reached)
  const from = Math.max(0, STEPS.findIndex((s) => s.id === self.searchParams.get('from')));
  const messages = cleanMessages(b.messages), tools = cleanTools(b.tools);
  if (!messages || !tools) return json(400, { error: { message: 'bad request' } });

  // counted only for rounds that will really be sent
  const [mine, all] = await daily(id);
  if (mine > PER_DAY) return json(429, { error: { message: 'You’ve used today’s built-in AI. It comes back tomorrow.' } }, { 'retry-after': String(toMidnight()), 'x-mkc-why': 'day', 'x-mkc-left': '0' });
  if (all > ALL_DAY) return json(429, { error: { message: 'Miko’s built-in AI is busy today. It comes back tomorrow.' } }, { 'retry-after': String(toMidnight()), 'x-mkc-why': 'all', 'x-mkc-left': '0' });

  const extra: Record<string, string> = { 'x-mkc-left': String(Math.max(0, PER_DAY - mine)) };
  let rest = 0, bad = 0;
  for (const st of STEPS.slice(from)) {
    const key = st.key(), now = Date.now(); if (!key || (resting.get(st.id) || 0) > now) continue;
    const body: Any = { model: st.model, messages, max_completion_tokens: MAX_OUT, stream: false, ...st.extra };
    if (tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
    try {
      const r = await fetch(st.url(), { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
      const j = await r.json().catch(() => null) as Any | null;
      const ch = r.ok && j && Array.isArray(j.choices) ? (j.choices as Any[])[0] : null;
      if (ch && ch.message) return json(200, { choices: [{ index: 0, finish_reason: ch.finish_reason, message: ch.message }], usage: j!.usage, model: st.id }, { ...extra, 'x-mkc-step': st.id });
      // never pass a service's own error text through (it can name the account)
      if (r.status === 429) { const ra = Math.min(86_400, Number(r.headers.get('retry-after')) || 60); resting.set(st.id, now + ra * 1000); rest = rest ? Math.min(rest, ra) : ra; continue; }
      if (r.status === 400) { bad++; continue; }
      resting.set(st.id, now + 30_000);
    } catch { resting.set(st.id, Date.now() + 30_000); }
  }
  if (bad && !rest) return json(400, { error: { message: 'The AI couldn’t read that request.' } }, extra);
  return json(429, { error: { message: 'Miko’s built-in AI needs a breather. Try again in a minute.' } }, { ...extra, 'retry-after': String(Math.max(30, rest || 60)), 'x-mkc-why': 'upstream' });
}

Deno.serve((req) => handle(req).catch(() => new Response(JSON.stringify({ error: { message: 'relay error' } }), { status: 500, headers: { 'content-type': 'application/json', 'access-control-allow-origin': 'https://app.mkcinema.app' } })));
