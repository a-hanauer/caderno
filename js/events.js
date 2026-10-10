// Eventos do Google Agenda (somente leitura): sincronização, cache offline,
// detecção da casa (pai/mãe) e categorias.
import { state, getConn, getCache, setCache } from './store.js';
import { addDays, diffDays, norm, today } from './util.js';

// ---------- categorias (por palavras no título) ----------
export const CATS = [
  { id: 'prova', emoji: '📝', label: 'Prova', color: '#d9453d', re: /\b(prova|teste|avaliacao|simulado|recuperacao|exame)\b/, destaque: true },
  { id: 'trabalho', emoji: '📚', label: 'Trabalho / tema', color: '#e8913a', re: /\b(trabalho|entrega|apresentacao|seminario|tema|projeto|feira)\b/, destaque: true },
  { id: 'niver', emoji: '🎂', label: 'Aniversário', color: '#d8a31a', re: /\b(aniversario|niver)\b/, destaque: true },
  { id: 'data', emoji: '🎉', label: 'Data especial', color: '#8a63d2', re: /\b(feriado|recesso|ferias|sem aula|natal|pascoa|dia d[oae]s?)\b/, destaque: true },
  { id: 'robotica', emoji: '🤖', label: 'Robótica', color: '#3f8f9e', re: /robotic/ },
  { id: 'ingles', emoji: '🗣️', label: 'Inglês', color: '#4f7fd0', re: /\b(ingles|english)\b/ },
  { id: 'terapia', emoji: '💬', label: 'Terapia', color: '#7a8f5a', re: /\b(terapia|psicolog\w*|psico)\b/ },
  { id: 'escola', emoji: '🏫', label: 'Escola', color: '#c2802f', re: /\b(escola|aula|reuniao|passeio|excursao)\b/ },
  { id: 'outro', emoji: '📌', label: 'Compromisso', color: '#6b7b93', re: /./ },
];

export function categorize(title) {
  const t = norm(title);
  return CATS.find((c) => c.re.test(t)) || CATS[CATS.length - 1];
}

// ---------- casa onde ele dorme ----------
const words = (s) => ' ' + norm(s).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
const kwList = (str) =>
  String(str || '')
    .split(',')
    .map((k) => norm(k).replace(/[^a-z0-9]+/g, ' ').trim())
    .filter(Boolean);
const hasKw = (title, kws) => {
  const t = words(title);
  return kws.some((k) => t.includes(' ' + k + ' '));
};

/** 'pai' | 'mae' | 'troca' | null para um evento de dia inteiro */
function houseOfEvent(ev, kwPai, kwMae) {
  if (!ev.allDay) return null;
  const cat = categorize(ev.title);
  if (cat.id === 'niver' || cat.id === 'data') return null; // "Dia dos Pais" não é a casa
  const p = hasKw(ev.title, kwPai);
  const m = hasKw(ev.title, kwMae);
  if (p && m) return 'troca';
  return p ? 'pai' : m ? 'mae' : null;
}

export const HOUSE = {
  pai: { nome: 'Casa do Papai', cor: 'var(--pai)' },
  mae: { nome: 'Casa da Mamãe', cor: 'var(--mae)' },
  troca: { nome: 'Dia de troca', cor: 'var(--troca)' },
};

// ---------- índice por dia ----------
let memo = { sig: '', idx: null };

function eachDay(start, endExcl, cap = 45) {
  const out = [];
  if (!endExcl || diffDays(start, endExcl) <= 0) return [start];
  for (let d = start, i = 0; d < endExcl && i < cap; d = addDays(d, 1), i++) out.push(d);
  return out;
}

export function getIndex() {
  const cache = getCache();
  const sig = `${cache?.fetchedAt || 0}|${state.settings.kwPai}|${state.settings.kwMae}`;
  if (memo.sig === sig && memo.idx) return memo.idx;
  const byDay = new Map();
  const house = new Map();
  if (cache && Array.isArray(cache.events)) {
    const kwPai = kwList(state.settings.kwPai);
    const kwMae = kwList(state.settings.kwMae);
    for (const ev of cache.events) {
      const hs = houseOfEvent(ev, kwPai, kwMae);
      const days = ev.allDay ? eachDay(ev.start, ev.end) : [ev.start.slice(0, 10)];
      if (hs) {
        for (const d of days) house.set(d, house.has(d) && house.get(d) !== hs ? 'troca' : hs);
        continue;
      }
      const cat = categorize(ev.title);
      for (const d of days) {
        if (!byDay.has(d)) byDay.set(d, []);
        byDay.get(d).push({ ...ev, cat, day: d });
      }
    }
    for (const list of byDay.values())
      list.sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1));
  }
  memo = { sig, idx: { byDay, house } };
  return memo.idx;
}

export const eventsOn = (d) => getIndex().byDay.get(d) || [];
export const houseOn = (d) => getIndex().house.get(d) || null;

/** próximas datas importantes (provas, trabalhos, aniversários, datas especiais) */
export function upcoming(from = today(), limit = 4, horizon = 90) {
  const out = [];
  for (const [d, list] of getIndex().byDay) {
    const n = diffDays(from, d);
    if (n < 0 || n > horizon) continue;
    for (const ev of list) if (ev.cat.destaque) out.push({ ...ev, n });
  }
  out.sort((a, b) => a.n - b.n || a.title.localeCompare(b.title));
  return out.slice(0, limit);
}

// ---------- sincronização ----------
const clean = (s, n = 120) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function sanitize(list) {
  const out = [];
  for (const e of Array.isArray(list) ? list : []) {
    if (!e || typeof e.title !== 'string') continue;
    const allDay = !!e.allDay;
    if (allDay ? !DATE_RE.test(e.start) : !DATETIME_RE.test(e.start)) continue;
    out.push({
      id: clean(e.id, 160),
      title: clean(e.title) || 'Sem título',
      allDay,
      start: e.start,
      end: typeof e.end === 'string' ? e.end : e.start,
      cal: clean(e.cal, 60),
    });
  }
  return out;
}

let inflight = null;
export function isSyncing() {
  return !!inflight;
}

export function syncStatus() {
  const conn = getConn();
  const cache = getCache();
  return { connected: !!conn, fetchedAt: cache?.fetchedAt || 0, count: cache?.events?.length || 0 };
}

export function minutesAgo(ts) {
  return ts ? Math.max(0, Math.round((Date.now() - ts) / 60000)) : null;
}

/** busca os eventos no Apps Script. Nunca lança erro: devolve {ok, reason} */
export function syncEvents() {
  if (inflight) return inflight;
  const conn = getConn();
  if (!conn) return Promise.resolve({ ok: false, reason: 'sem-conexao' });
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve({ ok: false, reason: 'offline' });

  inflight = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const from = addDays(today(), -40);
      const to = addDays(today(), 400);
      const url = `${conn.u}${conn.u.includes('?') ? '&' : '?'}token=${encodeURIComponent(conn.t)}&from=${from}&to=${to}`;
      // GET simples, sem cabeçalhos extras: evita pré-checagem CORS no Apps Script
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store', redirect: 'follow' });
      let data;
      try {
        data = await res.json();
      } catch {
        return { ok: false, reason: 'resposta', detail: 'HTTP ' + res.status };
      }
      if (!data || data.ok !== true) return { ok: false, reason: data?.error === 'token' ? 'token' : 'resposta' };
      setCache({ events: sanitize(data.events), fetchedAt: Date.now(), from, to });
      memo = { sig: '', idx: null };
      return { ok: true, count: data.events.length };
    } catch (e) {
      if (e.name === 'AbortError') return { ok: false, reason: 'tempo' };
      // diagnóstico: uma checagem "opaca" diz se o Google respondeu mas o navegador bloqueou a leitura
      let reason = 'rede';
      try {
        await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined });
        reason = 'acesso';
      } catch {}
      return { ok: false, reason, detail: String(e && e.message || e).slice(0, 80) };
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
  })();
  return inflight;
}

export function resetIndex() {
  memo = { sig: '', idx: null };
}

export const REASONS = {
  'sem-conexao': 'A agenda ainda não está conectada.',
  offline: 'Sem internet agora. Usando a última cópia.',
  token: 'O código de acesso não foi aceito. Confira o token.',
  resposta: 'A resposta do Google veio estranha. Confira o endereço.',
  tempo: 'O Google demorou demais. Tente de novo.',
  rede: 'Não consegui falar com o Google. Confira o endereço e a internet.',
  acesso: 'O Google respondeu, mas bloqueou a leitura. Na implantação do Apps Script, "Quem pode acessar" precisa ser "Qualquer pessoa" (com Nova versão).',
};
