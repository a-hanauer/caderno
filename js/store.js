// Estado do app: tudo fica no aparelho (localStorage). Nada disso vai pro GitHub.
import { today, dayType, addDays, diffDays, isYmd, uid } from './util.js';

const KEY = 'caderno:v1:data';
const KEY_CONN = 'caderno:v1:conn';
const KEY_CACHE = 'caderno:v1:cache';

export const BLOCOS = [
  { id: 'manha', nome: 'Manhã', icon: 'sol', ate: 12 },
  { id: 'tarde', nome: 'Tarde', icon: 'tarde', ate: 18 },
  { id: 'noite', nome: 'Noite', icon: 'lua', ate: 24 },
];
export const QUANDO = [
  { id: 'todos', nome: 'Todos os dias' },
  { id: 'escola', nome: 'Dias de escola (seg–sex)' },
  { id: 'fds', nome: 'Fim de semana' },
];

function defaultRoutine() {
  const r = (id, emoji, label, block, when) => ({ id, emoji, label, block, when });
  return [
    r('r-cama', 'cama', 'Arrumar a cama', 'manha', 'todos'),
    r('r-dentes-m', 'escova', 'Escovar os dentes', 'manha', 'todos'),
    r('r-cafe', 'tigela', 'Tomar café da manhã', 'manha', 'todos'),
    r('r-mochila', 'mochila', 'Conferir a mochila', 'manha', 'escola'),
    r('r-tema', 'livros', 'Fazer o tema de casa', 'tarde', 'escola'),
    r('r-material', 'lapis', 'Guardar o material', 'tarde', 'escola'),
    r('r-leitura', 'livroaberto', 'Ler um pouco', 'tarde', 'todos'),
    r('r-banho', 'chuveiro', 'Tomar banho', 'noite', 'todos'),
    r('r-dentes-n', 'escova', 'Escovar os dentes', 'noite', 'todos'),
  ];
}

function defaults() {
  return {
    v: 1,
    profile: { name: 'Sebastião' },
    settings: { pinHash: null, pinSalt: null, kwPai: 'pai, papai, andré, andre', kwMae: 'mãe, mae, mamãe, mamae, aline' },
    routine: defaultRoutine(),
    log: {}, // 'YYYY-MM-DD' -> { plan:[{id,label,emoji,block}], done:[ids] }
    tasks: [], // { id, text, due:'YYYY-MM-DD'|null, done, doneAt, created }
    dismissed: {}, // ex.: { ontem: 'YYYY-MM-DD' }
  };
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function load() {
  const base = defaults();
  const saved = readJSON(KEY);
  if (!saved || typeof saved !== 'object') return base;
  const st = { ...base.settings, ...(saved.settings || {}) };
  // migração: quem ainda tem as palavras do modelo antigo recebe os nomes dos pais
  if (st.kwPai === 'pai, papai') st.kwPai = base.settings.kwPai;
  if (st.kwMae === 'mãe, mae, mamãe, mamae') st.kwMae = base.settings.kwMae;
  return {
    ...base,
    ...saved,
    profile: { ...base.profile, ...(saved.profile || {}) },
    settings: st,
    routine: Array.isArray(saved.routine) ? saved.routine : base.routine,
    log: saved.log && typeof saved.log === 'object' ? saved.log : {},
    tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
    dismissed: saved.dismissed && typeof saved.dismissed === 'object' ? saved.dismissed : {},
  };
}

export const state = load();

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
let saveError = null;
export const lastSaveError = () => saveError;

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveError = null;
  } catch (e) {
    saveError = e;
  }
}

/** altera o estado, grava e (por padrão) avisa as telas para redesenhar */
export function commit(mutator, { silent = false } = {}) {
  mutator(state);
  persist();
  if (!silent) listeners.forEach((fn) => fn());
}

/** troca o estado inteiro (importação / zerar) */
export function replaceState(next) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, defaults(), next);
  persist();
  listeners.forEach((fn) => fn());
}

export const getDefaults = defaults;

// ---------- conexão com o Google Agenda e cache de eventos ----------
export const getConn = () => {
  const c = readJSON(KEY_CONN);
  return c && typeof c.u === 'string' && typeof c.t === 'string' ? c : null;
};
export const setConn = (c) => {
  try {
    if (c) localStorage.setItem(KEY_CONN, JSON.stringify(c));
    else localStorage.removeItem(KEY_CONN);
  } catch {}
};
export const getCache = () => readJSON(KEY_CACHE);
export const setCache = (c) => {
  try {
    localStorage.setItem(KEY_CACHE, JSON.stringify(c));
  } catch {}
};
export const clearAllLocal = () => {
  try {
    [KEY, KEY_CONN, KEY_CACHE].forEach((k) => localStorage.removeItem(k));
  } catch {}
};

// ---------- rotina: regras de negócio ----------
export const appliesOn = (item, date) => item.when === 'todos' || item.when === dayType(date);
const snap = (i) => ({ id: i.id, label: i.label, emoji: i.emoji, block: i.block });

/** garante que existe o registro do dia (a "folha" de hoje) */
export function ensureLog(date = today()) {
  if (state.log[date]) return state.log[date];
  state.log[date] = { plan: state.routine.filter((i) => appliesOn(i, date)).map(snap), done: [] };
  persist();
  return state.log[date];
}

/** mantém só os últimos ~120 dias de histórico */
export function pruneLog(date = today()) {
  let changed = false;
  for (const d of Object.keys(state.log)) {
    if (!isYmd(d) || diffDays(d, date) > 120) {
      delete state.log[d];
      changed = true;
    }
  }
  if (changed) persist();
}

export function dayStats(date) {
  const L = state.log[date];
  if (!L || !L.plan.length) return null;
  const done = L.plan.filter((p) => L.done.includes(p.id)).length;
  return { total: L.plan.length, done, missed: L.plan.filter((p) => !L.done.includes(p.id)), complete: done === L.plan.length };
}

/** dias seguidos com a rotina completa (hoje conta se já estiver completo) */
export function streak(date = today()) {
  let n = 0;
  const t = dayStats(date);
  let d = date;
  if (t && t.complete) n++;
  d = addDays(date, -1);
  for (let i = 0; i < 120; i++, d = addDays(d, -1)) {
    const s = dayStats(d);
    if (s && s.complete) n++;
    else break;
  }
  return n;
}

export function toggleRoutine(date, id) {
  commit(
    (s) => {
      const L = ensureLog(date);
      const i = L.done.indexOf(id);
      if (i >= 0) L.done.splice(i, 1);
      else L.done.push(id);
    },
    { silent: true }
  );
  return state.log[date].done.includes(id);
}

export function addRoutineItem({ label, emoji, block, when }) {
  const item = { id: 'r-' + uid(), label: label.trim().slice(0, 40), emoji: emoji || 'ok', block, when };
  commit((s) => {
    s.routine.push(item);
    const L = ensureLog();
    if (appliesOn(item, today()) && !L.plan.some((p) => p.id === item.id)) L.plan.push(snap(item));
  });
  return item;
}

export function updateRoutineItem(id, patch) {
  commit((s) => {
    const it = s.routine.find((r) => r.id === id);
    if (!it) return;
    Object.assign(it, patch);
    const L = ensureLog();
    const p = L.plan.find((x) => x.id === id);
    const should = appliesOn(it, today());
    if (p && should) Object.assign(p, snap(it));
    else if (p && !should) {
      L.plan = L.plan.filter((x) => x.id !== id);
      L.done = L.done.filter((x) => x !== id);
    } else if (!p && should) L.plan.push(snap(it));
  });
}

export function removeRoutineItem(id) {
  commit((s) => {
    s.routine = s.routine.filter((r) => r.id !== id);
    const L = ensureLog();
    L.plan = L.plan.filter((p) => p.id !== id);
    L.done = L.done.filter((x) => x !== id);
  });
}

export function moveRoutineItem(id, dir) {
  commit((s) => {
    const i = s.routine.findIndex((r) => r.id === id);
    if (i < 0) return;
    // troca com o vizinho do mesmo bloco
    const blk = s.routine[i].block;
    let j = i + dir;
    while (j >= 0 && j < s.routine.length && s.routine[j].block !== blk) j += dir;
    if (j < 0 || j >= s.routine.length) return;
    [s.routine[i], s.routine[j]] = [s.routine[j], s.routine[i]];
    const L = ensureLog();
    const order = new Map(s.routine.map((r, n) => [r.id, n]));
    L.plan.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  });
}

// ---------- tarefas únicas ----------
export const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export function addTask(text, due, time) {
  commit((s) => s.tasks.push({ id: 't-' + uid(), text: text.trim().slice(0, 120), due: isYmd(due) ? due : null, time: isYmd(due) && isTime(time) ? time : null, done: false, doneAt: null, created: Date.now() }));
}
export function updateTask(id, patch) {
  commit((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
  });
}
export function toggleTask(id) {
  commit(
    (s) => {
      const t = s.tasks.find((x) => x.id === id);
      if (!t) return;
      t.done = !t.done;
      t.doneAt = t.done ? Date.now() : null;
    },
    { silent: true }
  );
  return state.tasks.find((x) => x.id === id)?.done;
}
export function removeTask(id) {
  commit((s) => (s.tasks = s.tasks.filter((t) => t.id !== id)));
}
