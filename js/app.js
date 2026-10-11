// Caderno — ponto de entrada: rotas, abas, sincronização e virada do dia.
import { state, subscribe, ensureLog, pruneLog, setConn } from './store.js';
import { today, h, clear, VERSION } from './util.js';
import { icon, toast, closeAllSheets } from './ui.js';
import { syncEvents, syncStatus, minutesAgo } from './events.js';
import { decodeConn, validConnUrl } from './codec.js';
import { refreshWx } from './weather.js';
import * as hoje from './views/hoje.js';
import * as mes from './views/mes.js';
import * as rotina from './views/rotina.js';
import * as tarefas from './views/tarefas.js';
import * as ajustes from './views/ajustes.js';

const VIEWS = { hoje, mes, rotina, tarefas, ajustes };
const TABS = [
  ['hoje', 'Hoje'],
  ['rotina', 'Rotina'],
  ['tarefas', 'Tarefas'],
  ['mes', 'Mês'],
];

const page = document.getElementById('page');
const tabsEl = document.getElementById('tabs');
let route = 'hoje';
let day = today();
let started = false;

const ctx = { go, rerender: () => render(false) };

function parseRoute() {
  const m = location.hash.match(/^#\/([a-z]+)/);
  return m && VIEWS[m[1]] ? m[1] : 'hoje';
}

export function go(r) {
  if (location.hash === '#/' + r) show(r);
  else location.hash = '#/' + r;
}

function render(animate) {
  const keep = animate ? 0 : page.scrollTop;
  clear(page);
  VIEWS[route].render(page, ctx);
  page.scrollTop = keep;
  if (animate) {
    page.classList.remove('enter');
    void page.offsetWidth;
    page.classList.add('enter');
  }
  paintTabs();
  document.body.classList.toggle('v-ajustes', route === 'ajustes');
  page.dataset.area = route;
  document.getElementById('app').dataset.area = route;
  if (route !== 'hoje') delete document.body.dataset.cover;
  paintChrome();
  if (route !== 'ajustes') {
    const q = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return Math.round(r.top) + '-' + Math.round(r.bottom); };
    window.__lay = { app: q('app'), tabs: q('tabs') };
  }
}

/** cor do topo: tinge a barra de status / fundo do sistema (theme-color e fundo da página) com a cor do cabeçalho */
const TOP_COLORS = { hoje: '#1c8a4b', mes: '#0b8794', rotina: '#d9780a', tarefas: '#7a3fd0', ajustes: '#0a6e3a' };
const COVER_COLORS = { pai: '#2d5fb4', mae: '#b53a77', troca: '#6a42b8', none: '#475268' };
const BOTTOM_COLORS = { mes: '#fcf8ec', rotina: '#fcf8ec', tarefas: '#fcf8ec', ajustes: '#f2f2f7' };
function paintChrome() {
  const cover = COVER_COLORS[document.body.dataset.cover] || COVER_COLORS.none;
  const fullbug = document.documentElement.classList.contains('fullbug');
  const c = route === 'hoje' ? cover : fullbug ? BOTTOM_COLORS[route] : TOP_COLORS[route];
  document.documentElement.style.backgroundColor = c;
  document.body.style.backgroundColor = c;
  try { localStorage.setItem('caderno-top', c); } catch {}
  let m = document.querySelector('meta[name=theme-color]');
  if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.append(m); }
  m.content = c;
}

/** redesenho vindo de eventos em segundo plano: não atrapalha quem está digitando */
function softRender() {
  const a = document.activeElement;
  if (route === 'ajustes') return;
  if (a && page.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return;
  render(false);
}

function show(next) {
  closeAllSheets();
  if (next !== route) {
    VIEWS[route].leave && VIEWS[route].leave();
    if (next === 'mes') mes.enter();
  }
  route = next;
  render(true);
}

async function onHash() {
  if (/^#c=/.test(location.hash)) return;
  const next = parseRoute();
  if (started && next === route) return;
  if (next === 'ajustes') {
    const ok = await ajustes.gate();
    if (!ok) {
      history.replaceState(null, '', '#/' + route);
      return;
    }
  }
  show(next);
}

// ---------- abas ----------
function buildTabs() {
  for (const [id, nome] of TABS)
    tabsEl.append(h('button', { class: 'tab', type: 'button', dataset: { r: id }, 'aria-label': nome, onClick: () => go(id) }, icon(id), h('span', { class: 'tlab' }, nome)));
}
function paintTabs() {
  const t = today();
  const late = state.tasks.filter((x) => !x.done && x.due && x.due <= t).length;
  for (const b of tabsEl.children) {
    const on = b.dataset.r === route;
    b.classList.toggle('on', on);
    on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
    b.querySelector('.dot')?.remove();
    if (b.dataset.r === 'tarefas' && late > 0) b.append(h('span', { class: 'dot', 'aria-hidden': 'true' }, late > 9 ? '9+' : late));
  }
}

// ---------- link de conexão (#c=...) ----------
function consumeSetupHash() {
  const m = location.hash.match(/^#c=(.+)$/);
  if (!m) return;
  try {
    const c = decodeConn(m[1]);
    if (!validConnUrl(c.u)) throw new Error('O endereço desse link não parece do Google Apps Script.');
    setConn(c);
    toast('Agenda conectada neste aparelho!');
    syncEvents().then(() => softRender());
  } catch (e) {
    toast(e.message);
  }
  history.replaceState(null, '', location.pathname + location.search + '#/hoje');
}

// ---------- sincronização e virada do dia ----------
function maybeSync(force) {
  const st = syncStatus();
  if (!st.connected) return;
  const age = minutesAgo(st.fetchedAt);
  if (force || age === null || age >= 30) syncEvents().then((r) => r.ok && softRender());
}

function maybeWx(force) {
  refreshWx(force).then((r) => r && softRender());
}

function tick() {
  const d = today();
  if (d === day) return;
  day = d;
  ensureLog(d);
  pruneLog(d);
  softRender();
  maybeSync(true);
}

// ---------- início ----------
pruneLog();
ensureLog();
consumeSetupHash();
buildTabs();
subscribe(() => {
  if (subscribe.queued) return;
  subscribe.queued = true;
  requestAnimationFrame(() => {
    subscribe.queued = false;
    render(false);
  });
});

window.addEventListener('hashchange', onHash);
// o modo de tela (html.fullbug) pode mudar logo depois de abrir: refaz as cores do sistema
window.addEventListener('resize', () => setTimeout(paintChrome, 350));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    tick();
    maybeSync(false);
    maybeWx(false);
  }
});
window.addEventListener('online', () => maybeSync(true));
setInterval(tick, 30000);

(async () => {
  await onHash();
  if (!started) {
    started = true;
    if (!page.firstChild) show('hoje');
  }
  started = true;
  maybeSync(false);
  maybeWx(false);
})();

// ---------- versão nova: recarrega sozinho quando o app ficou aberto/suspenso numa versão velha ----------
let lastCheck = 0;
async function checkUpdate() {
  if (Date.now() - lastCheck < 60000) return;
  lastCheck = Date.now();
  try {
    const r = await fetch('./sw.js', { cache: 'no-store' });
    const m = (await r.text()).match(/caderno-(v\d+)/);
    if (!m || m[1] === VERSION) return;
    const a = document.activeElement;
    if (document.body.classList.contains('sheet-open') || (a && /^(INPUT|TEXTAREA)$/.test(a.tagName))) {
      lastCheck = 0; // tenta de novo daqui a pouco
      return;
    }
    const reg = await navigator.serviceWorker?.getRegistration();
    reg && (await reg.update().catch(() => {}));
    // no máximo uma recarga automática a cada 10 minutos (evita laço se a rede estiver ruim)
    let last = 0;
    try { last = +localStorage.getItem('caderno-reload') || 0; } catch {}
    if (Date.now() - last < 600000) return;
    try { localStorage.setItem('caderno-reload', String(Date.now())); } catch {}
    location.reload();
  } catch {}
}
setInterval(checkUpdate, 5 * 60000);
document.addEventListener('visibilitychange', () => !document.hidden && checkUpdate());
checkUpdate();

navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {});
// O service worker (modo offline) só roda no app da Tela de Início. No Safari ele fica desligado:
// no iOS 26/27, com service worker ativo, "Adicionar à Tela de Início" não pega o ícone e mostra só a letra "C".
const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
if ('serviceWorker' in navigator && window.isSecureContext) {
  if (standalone) navigator.serviceWorker.register('./sw.js').catch(() => {});
  else {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    window.caches && caches.keys().then((ks) => ks.filter((k) => k.startsWith('caderno-')).forEach((k) => caches.delete(k))).catch(() => {});
  }
}

