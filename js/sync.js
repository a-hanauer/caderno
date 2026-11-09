// Sincronização entre aparelhos pelo Firebase (Firestore, via REST, sem SDK).
// Uma família = um documento families/{código}. Cada "pedaço" do estado é um campo
// (rotina, ajustes, cada dia do histórico, cada tarefa, a conexão da agenda), guardado como texto JSON.
// Funciona por comparação em 3 vias: o que este aparelho tinha da última vez (base),
// o que está aqui agora (local) e o que está na nuvem (remoto). Só o que mudou vai e volta.
import { state, applyRemote, getConn, setConn, getDefaults } from './store.js';

const PROJECT = 'caderno-ebbd2';
const API_KEY = 'AIzaSyBkMi9fz4ugSDOodGQLZPcxnoeBVi2FwdI';
const ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/families/`;
const KEY = 'caderno:v1:sync';
const EVERY = 15000; // com o app aberto, olha a nuvem a cada 15 s

const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789'; // sem letras que se confundem (i, l, o, 0, 1)

function readMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) || 'null');
    return m && typeof m.fid === 'string' ? m : null;
  } catch {
    return null;
  }
}
let meta = readMeta(); // { fid, base: {campo: texto}, ut, at }
function saveMeta() {
  try {
    if (meta) localStorage.setItem(KEY, JSON.stringify(meta));
    else localStorage.removeItem(KEY);
  } catch {}
}

export const familyCode = () => meta?.fid || null;
export const lastSync = () => meta?.at || null;
export const fmtCode = (fid) => fid.match(/.{1,4}/g).join('-');
export const cleanCode = (txt) => String(txt || '').toLowerCase().replace(/[^a-z0-9]/g, '');
let lastError = null;
export const syncError = () => lastError;

function newCode() {
  const b = new Uint8Array(20);
  crypto.getRandomValues(b);
  return [...b].map((x) => ALPHA[x % ALPHA.length]).join('');
}

// ---------- estado <-> campos ----------
function units() {
  const u = {
    profile: JSON.stringify(state.profile),
    settings: JSON.stringify(state.settings),
    routine: JSON.stringify(state.routine),
  };
  for (const [d, L] of Object.entries(state.log)) u['log:' + d] = JSON.stringify(L);
  for (const t of state.tasks) u['task:' + t.id] = JSON.stringify(t);
  const c = getConn();
  if (c) u.conn = JSON.stringify({ u: c.u, t: c.t });
  return u;
}

function parse(s, fb) {
  try {
    return s == null ? fb : JSON.parse(s);
  } catch {
    return fb;
  }
}

/** escreve no aparelho o conjunto de campos que veio da nuvem */
function writeUnits(M) {
  const def = getDefaults();
  const connBefore = JSON.stringify(getConn() || null);
  applyRemote((s) => {
    s.profile = { ...def.profile, ...parse(M.profile, {}) };
    s.settings = { ...def.settings, ...parse(M.settings, {}) };
    const r = parse(M.routine, null);
    s.routine = Array.isArray(r) ? r : def.routine;
    s.log = {};
    const tasks = [];
    for (const [k, v] of Object.entries(M)) {
      if (k.startsWith('log:')) {
        const L = parse(v, null);
        if (L && Array.isArray(L.plan) && Array.isArray(L.done)) s.log[k.slice(4)] = L;
      } else if (k.startsWith('task:')) {
        const t = parse(v, null);
        if (t && t.id) tasks.push(t);
      }
    }
    s.tasks = tasks.sort((a, b) => (a.created || 0) - (b.created || 0));
  });
  const c = parse(M.conn, null);
  if (JSON.stringify(c && c.u ? { u: c.u, t: c.t } : null) !== connBefore) {
    setConn(c && c.u ? { u: c.u, t: c.t } : null);
    try { window.dispatchEvent(new Event('caderno:conn')); } catch {}
  }
}

/** junta dois registros do mesmo dia: marcações feitas em aparelhos diferentes valem as duas */
function mergeLog(b, l, r) {
  const B = parse(b, { plan: [], done: [] });
  const Lx = parse(l, { plan: [], done: [] });
  const R = parse(r, { plan: [], done: [] });
  const removed = new Set([...B.done.filter((x) => !Lx.done.includes(x)), ...B.done.filter((x) => !R.done.includes(x))]);
  const done = [...new Set([...R.done, ...Lx.done])].filter((x) => !removed.has(x));
  const plan = [...R.plan, ...Lx.plan.filter((p) => !R.plan.some((q) => q.id === p.id))];
  return JSON.stringify({ ...R, plan, done });
}

function merge(L, R, B) {
  const M = {};
  const keys = new Set([...Object.keys(L), ...Object.keys(R), ...Object.keys(B)]);
  for (const k of keys) {
    const l = L[k], r = R[k], b = B[k];
    let v;
    if (l === b) v = r; // só a nuvem mudou (ou nada)
    else if (r === b || l === r) v = l; // só aqui mudou
    else if (k.startsWith('log:') && l != null && r != null) v = mergeLog(b, l, r);
    else v = l ?? r; // os dois mudaram: vale este aparelho; apagar perde para editar
    if (v != null) M[k] = v;
  }
  return M;
}

// ---------- rede ----------
const qp = (k) => '`' + k.replace(/[`\\]/g, '\\$&') + '`';
function toFields(M, only) {
  const f = {};
  for (const k of only || Object.keys(M)) if (M[k] != null) f[k] = { stringValue: M[k] };
  return f;
}

async function call(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, cache: 'no-store', headers: opts.body ? { 'Content-Type': 'application/json' } : undefined });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function getRemote(fid) {
  const { status, body } = await call(ROOT + fid + '?key=' + API_KEY);
  if (status === 404) return null;
  if (status !== 200) throw new Error('get ' + status + ' ' + (body?.error?.status || ''));
  const R = {};
  for (const [k, v] of Object.entries(body.fields || {})) if (typeof v.stringValue === 'string') R[k] = v.stringValue;
  return { R, ut: body.updateTime };
}

/** grava só os campos que mudaram; falha se alguém gravou no meio (aí tenta de novo) */
async function putRemote(fid, M, changed, ut) {
  let url = ROOT + fid + '?key=' + API_KEY;
  const whole = !ut || changed.length > 60;
  if (!whole) for (const k of changed) url += '&updateMask.fieldPaths=' + encodeURIComponent(qp(k));
  url += ut ? '&currentDocument.updateTime=' + encodeURIComponent(ut) : '&currentDocument.exists=false';
  const { status, body } = await call(url, { method: 'PATCH', body: JSON.stringify({ fields: toFields(M, whole ? null : changed) }) });
  if (status === 200) return body.updateTime;
  const st = body?.error?.status || '';
  if (status === 409 || st === 'FAILED_PRECONDITION' || st === 'ALREADY_EXISTS' || st === 'ABORTED') return null; // conflito: repetir
  throw new Error('put ' + status + ' ' + st);
}

const typing = () => {
  const a = document.activeElement;
  return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !a.readOnly;
};

let running = null;
let again = false;
/** um ciclo completo: baixa, junta, sobe o que é daqui e aplica o que veio de lá */
export function syncNow() {
  if (!meta) return Promise.resolve({ ok: false, reason: 'off' });
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      for (let tries = 0; tries < 4; tries++) {
        if (!meta) return { ok: false, reason: 'off' };
        const fid = meta.fid;
        const remote = await getRemote(fid);
        const R = remote ? remote.R : {};
        const L = units();
        const B = meta.base || {};
        const M = merge(L, R, B);
        const pushKeys = [...new Set([...Object.keys(M), ...Object.keys(R)])].filter((k) => M[k] !== R[k]);
        const pullKeys = [...new Set([...Object.keys(M), ...Object.keys(L)])].filter((k) => M[k] !== L[k]);
        if (pullKeys.length && typing()) return { ok: false, reason: 'typing' }; // não mexe na tela enquanto alguém digita
        let ut = remote?.ut;
        if (pushKeys.length || !remote) {
          ut = await putRemote(fid, M, pushKeys, remote?.ut);
          if (!ut) continue;
        }
        if (!meta || meta.fid !== fid) return { ok: false, reason: 'off' };
        if (pullKeys.length) writeUnits(M);
        meta = { ...meta, base: M, ut, at: Date.now() };
        saveMeta();
        lastError = null;
        return { ok: true, pushed: pushKeys.length, pulled: pullKeys.length };
      }
      throw new Error('conflito');
    } catch (e) {
      lastError = navigator.onLine === false ? 'offline' : String(e.message || e);
      return { ok: false, reason: navigator.onLine === false ? 'offline' : 'erro', detail: lastError };
    } finally {
      running = null;
      if (again) {
        again = false;
        setTimeout(syncNow, 300);
      }
    }
  })();
  return running;
}

// ---------- família ----------
/** cria a família na nuvem com os dados deste aparelho */
export async function createFamily() {
  const fid = newCode();
  const M = units();
  const ut = await putRemote(fid, M, Object.keys(M), null);
  if (!ut) throw new Error('Não consegui criar. Tente de novo.');
  meta = { fid, base: M, ut, at: Date.now() };
  saveMeta();
  start();
  return fid;
}

/** confere se um código existe e o que tem nele */
export async function peekFamily(code) {
  const fid = cleanCode(code);
  if (fid.length < 20) throw new Error('O código tem 20 letras e números.');
  const r = await getRemote(fid);
  if (!r) throw new Error('Não achei esse código. Confira as letras.');
  const k = Object.keys(r.R);
  return { fid, tasks: k.filter((x) => x.startsWith('task:')).length, days: k.filter((x) => x.startsWith('log:')).length, conn: !!r.R.conn };
}

/** entra numa família: os dados deste aparelho são trocados pelos da nuvem */
export async function joinFamily(fid) {
  const r = await getRemote(fid);
  if (!r) throw new Error('Não achei esse código.');
  writeUnits(r.R);
  meta = { fid, base: r.R, ut: r.ut, at: Date.now() };
  saveMeta();
  start();
}

/** este aparelho para de sincronizar (os dados ficam aqui e na nuvem) */
export function leaveFamily() {
  meta = null;
  saveMeta();
  stop();
}

// ---------- ritmo ----------
let timer = null;
let pushT = null;
let wired = false;
function tick() {
  if (document.visibilityState === 'visible') syncNow();
}
function start() {
  stop();
  if (!meta) return;
  timer = setInterval(tick, EVERY);
}
function stop() {
  clearInterval(timer);
  timer = null;
}

export function initSync() {
  if (!wired) {
    wired = true;
    // cada mudança feita aqui sobe logo (com uma pequena espera para juntar toques seguidos)
    window.addEventListener('caderno:changed', (e) => {
      if (!meta || e.detail?.remote) return;
      clearTimeout(pushT);
      pushT = setTimeout(syncNow, 700);
    });
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && meta && syncNow());
    window.addEventListener('online', () => meta && syncNow());
    window.addEventListener('focusout', () => meta && setTimeout(() => !typing() && syncNow(), 400));
  }
  if (meta) {
    start();
    syncNow();
  }
}
