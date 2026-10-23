// @ts-nocheck -- plain Web Crypto code; skips type checks so it deploys the same on any Deno version
// 1440 · "push" Edge Function: sends reminder notifications to phones.
//
// Setup (once): Supabase → Edge Functions → Deploy a new function → Via Editor.
// Name it  push , paste this whole file, deploy, then open the function's
// settings and turn OFF "Enforce JWT verification" (the database wakes it
// with its own token instead).
//
// It needs no secrets. The database calls it with a token; it uses that
// token to collect the waiting reminders and the push keys, then sends
// each one with standard Web Push (RFC 8291 encryption, RFC 8292 VAPID),
// using only the built-in Web Crypto API.

const PROJECT_URL = 'https://umdgecfjfjvavdpuzwxe.supabase.co';
const PUBLIC_KEY = 'sb_publishable_6LANBoBrp9GjJAVJnrom7g_lLA7SfmA'; // the app's public key
const CONTACT = 'https://maaannoj.github.io/1440/';

const enc = new TextEncoder();

// ---------- bytes ----------
export function b64u(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(str: string): Uint8Array {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// ---------- VAPID (who is sending) ----------
export async function signingKey(publicB64: string, privateB64: string): Promise<CryptoKey> {
  const pub = unb64u(publicB64);
  return crypto.subtle.importKey('jwk',
    { kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: privateB64, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}
export async function vapidHeader(endpoint: string, publicB64: string, key: CryptoKey): Promise<string> {
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 30 * 60,
    sub: CONTACT,
  })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + claims)));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${publicB64}`;
}

// ---------- message encryption (aes128gcm) ----------
export async function encrypt(payload: Uint8Array, p256dhB64: string, authB64: string): Promise<Uint8Array> {
  const uaPublic = unb64u(p256dhB64);
  const authSecret = unb64u(authB64);
  const mine = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', mine.publicKey));
  const theirs = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: theirs }, mine.privateKey, 256));

  const prkKey = await hmac(authSecret, shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(payload, new Uint8Array([2]))));

  const head = new Uint8Array(16 + 4 + 1 + asPublic.length);
  head.set(salt, 0);
  new DataView(head.buffer).setUint32(16, 4096);
  head[20] = asPublic.length;
  head.set(asPublic, 21);
  return concat(head, sealed);
}

// ---------- what the notification says ----------
type Item = { qid: number; endpoint: string; p256dh: string; auth: string; kind: string; total: number; done: number; minutes_left: number; world: string; name: string | null };
type Result = { qid: number; endpoint: string; status: number; text: string };

const WORLD: Record<string, { e: string; tail: string }> = {
  cyberpunk: { e: '⚡', tail: 'Jack in.' },
  bloom:     { e: '🌸', tail: 'Your flower is waiting.' },
  pixel:     { e: '🗡️', tail: 'The knight is waiting.' },
  cozy:      { e: '☕', tail: 'Kettle on. Let\'s finish.' },
  deep:      { e: '🐠', tail: 'Dive back in.' },
  orbit:     { e: '🪐', tail: 'Mission control is waiting.' },
  zen:       { e: '🎋', tail: 'One stroke at a time.' },
  comic:     { e: '💥', tail: 'Suit up!' },
  notebook:  { e: '📓', tail: 'Tick a box.' },
  pet:       { e: '🐣', tail: 'Mochi misses you.' },
};
export function message(it: Item) {
  const w = WORLD[it.world] || WORLD.cyberpunk;
  const left = Math.max(0, it.total - it.done);
  const q = (n: number) => `${n} quest${n === 1 ? '' : 's'}`;
  const mins = Math.max(0, it.minutes_left);
  let title, body;
  if (it.kind === 'last_call') {
    title = `⏰ Last call: ${q(left)} left`;
    body = `${mins} minutes to midnight. Anything not ticked is missed for good.`;
  } else if (it.kind === 'evening') {
    title = `${w.e} ${q(left)} still open`;
    body = `${it.done} of ${it.total} done · ${mins} minutes left today. ${w.tail}`;
  } else if (it.kind === 'morning') {
    title = `${w.e} ${q(left)} left today`;
    body = `${it.done} of ${it.total} done · ${mins} minutes to go. ${w.tail}`;
  } else {
    title = `${w.e} Reminders are on`;
    body = it.total === 0 ? 'Test ping. Add some quests and this is how you\'ll hear about them.'
      : left === 0 ? 'Test ping. Everything is done today. Nice.'
      : `Test ping. ${q(left)} left today · ${mins} minutes to go.`;
  }
  const ttl = it.kind === 'test' ? 600 : it.kind === 'last_call' ? Math.max(60, mins * 60) : 3600;
  return { title, body, tag: '1440-' + it.kind, badge: left, url: './#today', ttl };
}

// ---------- sending ----------
async function sendOne(it: Item, publicB64: string, key: CryptoKey, fetchImpl: typeof fetch): Promise<Result> {
  const m = message(it);
  const { ttl, ...shown } = m;
  const body = await encrypt(enc.encode(JSON.stringify(shown)), it.p256dh, it.auth);
  const res = await fetchImpl(it.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: String(ttl),
      Urgency: 'high',
      Authorization: await vapidHeader(it.endpoint, publicB64, key),
    },
    body,
  });
  return { qid: it.qid, endpoint: it.endpoint, status: res.status, text: res.ok ? '' : (await res.text()).slice(0, 200) };
}

async function rpc(fetchImpl: typeof fetch, fn: string, args: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const res = await fetchImpl(`${PROJECT_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  return res.ok ? { ok: true, data: text ? JSON.parse(text) : null } : { ok: false, error: text.slice(0, 300) };
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export async function handle(req: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (req.method !== 'POST') return json({ ok: true, note: '1440 push sender. The database calls this.' });
  let token = '';
  try { token = String((await req.json()).token || ''); } catch { /* no body */ }
  if (!token) return json({ error: 'missing token' }, 400);

  const claim = await rpc(fetchImpl, 'push_claim', { p_token: token });
  if (!claim.ok) return json({ error: 'not allowed', detail: claim.error }, 401);
  const { public: publicB64, private: privateB64, items } = claim.data as { public: string; private: string; items: Item[] };
  if (!items.length) return json({ sent: 0 });

  const key = await signingKey(publicB64, privateB64);
  const results = await Promise.all(items.map((it) =>
    sendOne(it, publicB64, key, fetchImpl).catch((e): Result => ({ qid: it.qid, endpoint: it.endpoint, status: 0, text: String(e).slice(0, 200) }))));

  // 404/410 mean the phone turned notifications off or reinstalled: forget it
  const gone = results.filter((r) => r.status === 404 || r.status === 410).map((r) => r.endpoint);
  if (gone.length) await rpc(fetchImpl, 'push_gone', { p_token: token, p_endpoints: gone });
  // record each answer, so "Send a test" in the app can say what happened
  await rpc(fetchImpl, 'push_done', { p_token: token, p_results: results.map((r) => ({ qid: r.qid, status: r.status, text: r.text })) });
  const sent = results.filter((r) => r.status >= 200 && r.status < 300).length;
  const failed = results.filter((r) => !(r.status >= 200 && r.status < 300) && !gone.includes(r.endpoint))
    .map((r) => ({ status: r.status, text: r.text, host: new URL(r.endpoint).host }));
  console.log(JSON.stringify({ sent, gone: gone.length, failed }));
  return json({ sent, gone: gone.length, failed });
}

declare const Deno: { serve?: (h: (req: Request) => Promise<Response>) => unknown } | undefined;
// (tests import this file with __1440_TEST set, so no server starts)
if (typeof Deno !== 'undefined' && Deno?.serve && !(globalThis as { __1440_TEST?: boolean }).__1440_TEST) Deno.serve((req: Request) => handle(req));
