// Códigos compartilháveis: backup/transferência dos dados e conexão com o Google Agenda.
import { state, getConn, getCache, setCache, replaceState, setConn, getDefaults } from './store.js';
import { isYmd, uid, addDays, today } from './util.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64u(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64u(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function pipe(bytes, stream) {
  const w = stream.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

// ---------- dados ----------
export async function exportCode({ withConn = false } = {}) {
  const keep = addDays(today(), -60);
  const log = {};
  for (const [d, v] of Object.entries(state.log)) if (d >= keep) log[d] = v;
  const { pinHash, pinSalt, ...settings } = state.settings;
  const payload = { app: 'caderno', v: 1, at: new Date().toISOString(), profile: state.profile, settings, routine: state.routine, tasks: state.tasks, log };
  if (withConn && getConn()) payload.conn = getConn();
  // cópia dos eventos da agenda (para aparelhos que não conseguem falar com o Google)
  const cache = getCache();
  if (cache?.events?.length) payload.ev = { at: cache.fetchedAt || 0, from: cache.from, to: cache.to, e: cache.events.map((x) => [x.title, x.allDay ? 1 : 0, x.start, x.end]) };
  const json = JSON.stringify(payload);
  if (typeof CompressionStream !== 'undefined') return 'CADERNO1.' + toB64u(await pipe(enc.encode(json), new CompressionStream('gzip')));
  return 'CADERNO0.' + toB64u(enc.encode(json));
}

const grab = (text, re) => (String(text).match(re) || [null])[0];

export async function decodeCode(text) {
  const code = grab(text, /CADERNO[01]\.[A-Za-z0-9_-]+/);
  if (!code) throw new Error('Não encontrei um código do Caderno nesse texto.');
  const [head, body] = code.split('.');
  let bytes = fromB64u(body);
  if (head === 'CADERNO1') {
    if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não consegue abrir esse código.');
    bytes = await pipe(bytes, new DecompressionStream('gzip'));
  }
  let obj;
  try {
    obj = JSON.parse(dec.decode(bytes));
  } catch {
    throw new Error('O código parece estar incompleto ou cortado.');
  }
  if (!obj || obj.app !== 'caderno') throw new Error('Esse código não é do Caderno.');
  return sanitizePayload(obj);
}

const str = (v, n) => String(v ?? '').slice(0, n);
const BLOCKS = ['manha', 'tarde', 'noite'];
const WHENS = ['todos', 'escola', 'fds'];

function sanitizePayload(o) {
  const out = {
    profile: { name: str(o.profile?.name || 'Sebastião', 30) },
    settings: { kwPai: str(o.settings?.kwPai ?? 'pai, papai, andré, andre', 80), kwMae: str(o.settings?.kwMae ?? 'mãe, mae, mamãe, mamae, aline', 80), wx: o.settings?.wx && typeof o.settings.wx.lat === 'number' && typeof o.settings.wx.lon === 'number' && Math.abs(o.settings.wx.lat) <= 90 && Math.abs(o.settings.wx.lon) <= 180 ? { name: str(o.settings.wx.name, 60), lat: o.settings.wx.lat, lon: o.settings.wx.lon } : null },
    routine: [],
    tasks: [],
    log: {},
    conn: null,
    ev: null,
  };
  if (o.ev && Array.isArray(o.ev.e)) {
    const D = /^\d{4}-\d{2}-\d{2}$/, DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
    const events = [];
    for (const x of o.ev.e.slice(0, 3000)) {
      if (!Array.isArray(x) || typeof x[0] !== 'string') continue;
      const allDay = !!x[1];
      if (!(allDay ? D : DT).test(x[2])) continue;
      events.push({ id: 'i' + events.length, title: str(x[0], 120) || 'Sem título', allDay, start: x[2], end: typeof x[3] === 'string' ? x[3] : x[2], cal: '' });
    }
    if (events.length) out.ev = { events, fetchedAt: typeof o.ev.at === 'number' ? o.ev.at : 0, from: isYmd(o.ev.from) ? o.ev.from : null, to: isYmd(o.ev.to) ? o.ev.to : null };
  }
  for (const r of Array.isArray(o.routine) ? o.routine.slice(0, 60) : []) {
    if (!r || !r.label) continue;
    out.routine.push({
      id: str(r.id || 'r-' + uid(), 40),
      label: str(r.label, 40),
      emoji: str(r.emoji || 'ok', 16),
      block: BLOCKS.includes(r.block) ? r.block : 'manha',
      when: WHENS.includes(r.when) ? r.when : 'todos',
    });
  }
  for (const t of Array.isArray(o.tasks) ? o.tasks.slice(0, 500) : []) {
    if (!t || !t.text) continue;
    out.tasks.push({
      id: str(t.id || 't-' + uid(), 40),
      text: str(t.text, 120),
      due: isYmd(t.due) ? t.due : null,
      time: isYmd(t.due) && typeof t.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t.time) ? t.time : null,
      done: !!t.done,
      doneAt: typeof t.doneAt === 'number' ? t.doneAt : null,
      created: typeof t.created === 'number' ? t.created : Date.now(),
    });
  }
  for (const [d, v] of Object.entries(o.log && typeof o.log === 'object' ? o.log : {})) {
    if (!isYmd(d) || !v || !Array.isArray(v.plan)) continue;
    out.log[d] = {
      plan: v.plan.slice(0, 60).map((p) => ({ id: str(p.id, 40), label: str(p.label, 40), emoji: str(p.emoji || 'ok', 16), block: BLOCKS.includes(p.block) ? p.block : 'manha' })),
      done: Array.isArray(v.done) ? v.done.slice(0, 60).map((x) => str(x, 40)) : [],
    };
  }
  if (o.conn && typeof o.conn.u === 'string' && typeof o.conn.t === 'string') out.conn = { u: str(o.conn.u, 300), t: str(o.conn.t, 200) };
  return out;
}

/** aplica os dados importados: 'replace' troca tudo; 'merge' junta com o que já existe */
export function applyImport(data, mode) {
  if (mode === 'replace') {
    replaceState({
      ...getDefaults(),
      profile: data.profile,
      settings: { ...getDefaults().settings, ...data.settings, pinHash: state.settings.pinHash, pinSalt: state.settings.pinSalt },
      routine: data.routine,
      tasks: data.tasks,
      log: data.log,
      dismissed: {},
    });
  } else {
    const routine = [...state.routine];
    for (const r of data.routine) if (!routine.some((x) => x.id === r.id)) routine.push(r);
    const tasks = [...state.tasks];
    for (const t of data.tasks) {
      const i = tasks.findIndex((x) => x.id === t.id);
      if (i < 0) tasks.push(t);
      else if ((t.doneAt || t.created) > (tasks[i].doneAt || tasks[i].created)) tasks[i] = t;
    }
    const log = { ...state.log };
    for (const [d, v] of Object.entries(data.log)) {
      if (!log[d]) log[d] = v;
      else {
        for (const p of v.plan) if (!log[d].plan.some((x) => x.id === p.id)) log[d].plan.push(p);
        log[d].done = [...new Set([...log[d].done, ...v.done])];
      }
    }
    replaceState({ ...state, routine, tasks, log });
  }
  if (data.conn) setConn(data.conn);
  if (data.ev && data.ev.fetchedAt >= (getCache()?.fetchedAt || 0)) setCache(data.ev);
}

// ---------- conexão com o Google Agenda ----------
export const encodeConn = (c) => 'CADERNOCON1.' + toB64u(enc.encode(JSON.stringify({ u: c.u, t: c.t })));

export function decodeConn(text) {
  const code = grab(text, /CADERNOCON1\.[A-Za-z0-9_-]+/);
  if (!code) throw new Error('Não encontrei um código de conexão.');
  try {
    const o = JSON.parse(dec.decode(fromB64u(code.split('.')[1])));
    if (typeof o.u !== 'string' || typeof o.t !== 'string') throw new Error();
    return { u: o.u.replace(/\s+/g, ''), t: o.t.replace(/\s+/g, '') };
  } catch {
    throw new Error('O código de conexão parece incompleto.');
  }
}

export function connLink(c) {
  return `${location.origin}${location.pathname}#c=${encodeConn(c)}`;
}

/** URL do Apps Script precisa ser https://script.google.com/... */
export function validConnUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && /(^|\.)script\.google\.com$|(^|\.)script\.googleusercontent\.com$/.test(x.hostname);
  } catch {
    return false;
  }
}
