// Tela "Hoje": onde o Sebastião dorme, a linha do dia (agenda + rotina + tarefas) e o que vem aí.
import { state, commit, ensureLog, dayStats, streak, toggleRoutine, toggleTask, BLOCOS } from '../store.js';
import { today, addDays, parse, cap, longDate, weekdayName, countdown, shortDate, INICIAIS, diffDays, h } from '../util.js';
import { eventsOn, houseOn, upcoming, HOUSE, syncStatus, tasksOn } from '../events.js';
import { icon, checkbox, celebrate } from '../ui.js';

/** transforma um cartão em botão acessível (div, para poder conter títulos e listas) */
const tap = (el, fn) => {
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.addEventListener('click', fn);
  el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fn()));
  return el;
};

export const currentBlock = (now = new Date()) => BLOCOS.find((b) => now.getHours() < b.ate) || BLOCOS[BLOCOS.length - 1];

const BLOCK_COLOR = { manha: '#d99a0b', tarde: '#e0742a', noite: '#5b63c4' };
const BLOCK_BG = { manha: '#fff3c9', tarde: '#ffe3cc', noite: '#e2e4fa' };
const BLOCK_AT = { manha: 420, tarde: 720, noite: 1080 }; // posição de cada bloco na linha do dia (minutos)
const NOTE_BY_CAT = { prova: 'p', trabalho: 'y', niver: 'b', data: 'v', tarefa: 'v' };

let openState = { day: '', map: {} }; // blocos que o usuário abriu/fechou hoje
let celebratedDay = '';

export function leave() {
  delete document.body.dataset.cover;
}

function greeting(hour) {
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
}

export function render(root, ctx) {
  const { go } = ctx;
  root.className = 'page cover';
  const t = today();
  const log = ensureLog(t);
  const st0 = syncStatus();
  const conn = st0.connected || st0.count > 0;
  const now = new Date();
  const hour = now.getHours();
  const nowMin = hour * 60 + now.getMinutes();
  if (openState.day !== t) openState = { day: t, map: {} };

  // ----- capa -----
  const hs = houseOn(t);
  const hsTomorrow = houseOn(addDays(t, 1));
  document.body.dataset.cover = hs || 'none';
  const nome = (state.profile && state.profile.name) || 'Caderno';
  const head = h(
    'header',
    { class: 'cover-top' },
    h('div', { class: 'label-card' }, h('small', {}, 'Caderno do'), h('strong', {}, nome)),
    h('button', { class: 'icon-btn sm gear', type: 'button', 'aria-label': 'Ajustes (área dos pais)', onClick: () => go('ajustes') }, icon('gear'))
  );

  const dateLine = h('p', { class: 'cover-date' }, `${cap(weekdayName(t))}, ${longDate(t).replace(/ de \d{4}$/, '')} · ${greeting(hour).toLowerCase()}!`);

  // ----- a casa em destaque -----
  let hero;
  if (hs) {
    const days = h('div', { class: 'hero-days', 'aria-label': 'Casa nos próximos 7 dias' });
    for (let i = 0; i < 7; i++) {
      const d = addDays(t, i);
      const hh = houseOn(d);
      const dt = parse(d);
      days.append(h('div', { class: ['hd', hh || 'none', i === 0 && 'today'].filter(Boolean).join(' '), title: `${cap(weekdayName(d))}${hh ? ': ' + HOUSE[hh].nome : ''}` }, h('i', {}, INICIAIS[dt.getDay()]), h('b', {}, dt.getDate()), h('span', { class: 'dt' })));
    }
    hero = h(
      'section',
      { class: 'hero ' + hs, 'aria-label': hs === 'troca' ? 'Hoje tem troca de casa' : 'Hoje você dorme na ' + HOUSE[hs].nome },
      h('div', { class: 'hero-main' }, h('span', { class: 'hero-ico' }, icon(hs === 'troca' ? 'troca' : 'casa')), h('div', { class: 'hero-txt' }, h('small', {}, hs === 'troca' ? 'Hoje tem' : 'Hoje você dorme na'), h('strong', {}, hs === 'troca' ? 'Troca de casa' : HOUSE[hs].nome))),
      days,
      hsTomorrow && hsTomorrow !== hs && h('p', { class: 'hero-note' }, icon('troca'), hsTomorrow === 'troca' ? 'Amanhã tem troca de casa' : `Amanhã: ${HOUSE[hsTomorrow].nome}`)
    );
  } else if (!conn) {
    hero = h('section', { class: 'hero nohouse' }, h('div', { class: 'hero-main' }, h('span', { class: 'hero-ico' }, icon('casa')), h('div', { class: 'hero-txt' }, h('small', {}, 'Agenda não conectada'), h('strong', {}, 'Onde eu durmo?'))), h('button', { class: 'hero-btn', type: 'button', onClick: () => go('ajustes') }, 'Conectar a agenda'));
  } else {
    hero = h('section', { class: 'hero nohouse' }, h('div', { class: 'hero-main' }, h('span', { class: 'hero-ico' }, icon('casa')), h('div', { class: 'hero-txt' }, h('small', {}, 'Nenhuma casa marcada'), h('strong', {}, 'pra hoje'))));
  }

  // ----- ontem -----
  const y = addDays(t, -1);
  const ys = dayStats(y);
  let ontem = null;
  if (ys && state.dismissed.ontem !== y) {
    const dismiss = (label) => h('button', { type: 'button', onClick: () => commit((s) => (s.dismissed.ontem = y)) }, label);
    if (ys.missed.length) {
      const names = ys.missed.slice(0, 2).map((m) => m.label);
      const rest = ys.missed.length - names.length;
      ontem = h('div', { class: 'ontem' }, icon('alerta'), h('p', {}, `Ontem ${ys.missed.length > 1 ? 'faltaram' : 'faltou'} ${ys.missed.length} ${ys.missed.length > 1 ? 'tarefas' : 'tarefa'}: ${names.join(', ')}${rest > 0 ? ` e mais ${rest}` : ''}.`), dismiss('Entendi'));
    } else {
      const s = streak(y);
      ontem = h('div', { class: 'ontem good' }, icon('ok'), h('p', {}, `Ontem você fechou a rotina inteira!${s > 1 ? ` ${s} dias seguidos.` : ''}`), dismiss('Legal'));
    }
  }

  // ----- seu dia: linha do tempo -----
  const stats = dayStats(t);
  const cur = currentBlock(now);
  const doneSet = new Set(log.done);
  const entries = [];

  for (const e of eventsOn(t)) {
    const min = e.allDay ? -1 : parseInt(e.start.slice(11, 13), 10) * 60 + parseInt(e.start.slice(14, 16), 10);
    const endMin = !e.allDay && e.end && e.end.slice(0, 10) === e.start.slice(0, 10) ? parseInt(e.end.slice(11, 13), 10) * 60 + parseInt(e.end.slice(14, 16), 10) : min;
    const past = !e.allDay && endMin < nowMin;
    const node = h('span', { class: 'node', style: { '--c': e.cat.color, '--nb': '#fff' } }, icon(e.cat.icon));
    entries.push({
      at: min,
      el: h(
        'div',
        { class: 'tl-i', style: past ? { opacity: '.55' } : null },
        node,
        h('div', { class: 'tl-body' }, h('div', { class: 'tl-title' }, h('b', {}, e.title), h('span', { class: 'tl-time' }, e.allDay ? 'dia todo' : e.start.slice(11, 16))), h('p', { class: 'tl-sub' }, e.cat.label + (!e.allDay && e.end && e.end.slice(0, 10) === e.start.slice(0, 10) ? ` · até ${e.end.slice(11, 16)}` : '')))
      ),
    });
  }

  // tarefas com hora marcada hoje entram na linha do dia, como compromissos
  for (const it of tasksOn(t).filter((x) => x.task.time)) {
    const tk = it.task;
    const min = parseInt(tk.time.slice(0, 2), 10) * 60 + parseInt(tk.time.slice(3, 5), 10);
    const cb = checkbox(false);
    const row = h('button', { class: 'mini', type: 'button', role: 'checkbox', 'aria-checked': 'false', style: { borderTop: '0' } }, cb, h('span', { class: 'lbl' }, h('span', { class: 'strike' }, tk.text)), h('span', { class: 'tl-time' }, tk.time));
    row.addEventListener('click', () => {
      const on = toggleTask(tk.id);
      row.classList.toggle('done', on);
      row.setAttribute('aria-checked', String(on));
      cb.classList.toggle('on', on);
      setTimeout(() => ctx.rerender(), 500);
    });
    entries.push({ at: min, el: h('div', { class: 'tl-i', style: min < nowMin ? { opacity: '.7' } : null }, h('span', { class: 'node', style: { '--c': it.cat.color, '--nb': '#fff' } }, icon(it.cat.icon)), h('div', { class: 'tl-body' }, row, h('p', { class: 'tl-sub' }, it.cat.label))) });
  }

  // tarefas únicas para hoje (ou atrasadas), sem hora
  const dueNow = state.tasks.filter((x) => !x.done && x.due && (x.due < t || (x.due === t && !x.time))).sort((a, b) => a.due.localeCompare(b.due));
  if (dueNow.length) {
    const list = h('div', { class: 'tl-list' });
    for (const tk of dueNow.slice(0, 4)) {
      const cb = checkbox(false);
      const row = h('button', { class: 'mini', type: 'button', role: 'checkbox', 'aria-checked': 'false' }, cb, h('span', { class: 'lbl' }, h('span', { class: 'strike' }, tk.text)), tk.due < t && h('span', { class: 'due late' }, diffDays(t, tk.due) === -1 ? 'ontem' : `${-diffDays(t, tk.due)}d`));
      row.addEventListener('click', () => {
        const on = toggleTask(tk.id);
        row.classList.toggle('done', on);
        row.setAttribute('aria-checked', String(on));
        cb.classList.toggle('on', on);
        setTimeout(() => ctx.rerender(), 500);
      });
      list.append(row);
    }
    if (dueNow.length > 4) list.append(tap(h('button', { class: 'mini', type: 'button' }, h('span', { class: 'lbl muted' }, `+ ${dueNow.length - 4} na lista de tarefas`)), () => go('tarefas')));
    entries.push({
      at: -0.5,
      el: h('div', { class: 'tl-i' }, h('span', { class: 'node', style: { '--c': '#7048c0', '--nb': '#ece4fa' } }, icon('tarefas')), h('div', { class: 'tl-body' }, h('div', { class: 'tl-title', style: { minHeight: '40px', alignItems: 'center' } }, h('b', {}, 'Tarefas pra hoje'), h('span', { class: 'cnt', style: { color: 'var(--muted)', fontWeight: '600', fontSize: '15px' } }, dueNow.length)), list)),
    });
  }

  // blocos da rotina
  for (const b of BLOCOS) {
    const items = log.plan.filter((p) => p.block === b.id);
    if (!items.length) continue;
    const n = items.filter((p) => doneSet.has(p.id)).length;
    const behind = b.ate <= hour && n < items.length;
    const isCur = b.id === cur.id;
    const open = b.id in openState.map ? openState.map[b.id] : isCur || behind;
    const complete = n === items.length;
    const cnt = h('span', { class: 'cnt' + (complete ? ' ok' : behind ? ' late' : '') }, `${n}/${items.length}`);
    const tli = h('div', { class: 'tl-i' + (open ? '' : ' closed'), dataset: { b: b.id } });
    const headBtn = h('button', { class: 'tl-head', type: 'button', 'aria-expanded': String(open) }, h('span', { class: 'tl-ht' }, h('b', {}, b.nome), h('small', { class: behind ? 'late' : '' }, behind ? 'ficou pra trás' : complete ? 'tudo feito' : isCur ? 'agora' : n ? 'em andamento' : 'ainda não começou')), cnt, icon('down', 'chev'));
    headBtn.addEventListener('click', () => {
      const closed = tli.classList.toggle('closed');
      openState.map[b.id] = !closed;
      headBtn.setAttribute('aria-expanded', String(!closed));
    });
    const list = h('div', { class: 'tl-list' });
    for (const p of items) {
      const cb = checkbox(doneSet.has(p.id));
      const row = h(
        'button',
        { class: 'mini' + (doneSet.has(p.id) ? ' done' : ''), type: 'button', role: 'checkbox', 'aria-checked': String(doneSet.has(p.id)), style: { '--c': BLOCK_COLOR[b.id] } },
        cb,
        h('span', { class: 'ri' }, icon(p.emoji)),
        h('span', { class: 'lbl' }, h('span', { class: 'strike' }, p.label))
      );
      row.addEventListener('click', () => {
        const on = toggleRoutine(t, p.id);
        row.classList.toggle('done', on);
        row.setAttribute('aria-checked', String(on));
        cb.classList.toggle('on', on);
        const s = dayStats(t);
        if (on && s && s.complete && celebratedDay !== t) {
          celebratedDay = t;
          celebrate();
        }
        setTimeout(() => ctx.rerender(), 600);
      });
      list.append(row);
    }
    tli.append(h('span', { class: 'node', style: { '--c': BLOCK_COLOR[b.id], '--nb': BLOCK_BG[b.id] } }, icon(complete ? 'ok' : b.icon)), h('div', { class: 'tl-body' }, headBtn, list));
    entries.push({ at: BLOCK_AT[b.id], el: tli });
  }

  entries.sort((a, b) => a.at - b.at);

  const pct = stats ? Math.round((stats.done / stats.total) * 100) : 0;
  const dayCard = h('section', { class: 'day-card', 'aria-label': 'Seu dia' });
  dayCard.append(
    h('div', { class: 'day-head' }, h('h2', {}, 'Seu dia'), stats && h('span', { class: 'prog' }, stats.complete ? 'tudo feito!' : `${stats.done} de ${stats.total}`), stats && h('span', { class: 'ring', style: { '--p': pct } }, stats.complete ? icon('check') : null))
  );
  if (entries.length) dayCard.append(h('div', { class: 'tl' }, entries.map((e) => e.el)));
  else dayCard.append(h('div', { class: 'day-empty' }, icon('ok'), h('span', {}, conn ? 'Nada marcado e sem rotina hoje.' : 'Conecte a agenda para ver os compromissos.')));

  // ----- vem aí -----
  const next = upcoming(t, 6);
  let nextBox = null;
  if (next.length) {
    const grid = h('div', { class: 'next-grid' + (next.length === 1 ? ' one' : '') });
    for (const e of next)
      grid.append(
        tap(h('div', { class: 'note tappable next-note ' + (NOTE_BY_CAT[e.cat.id] || 'o'), style: { '--c': e.cat.color } }, icon(e.cat.icon), h('b', {}, e.title), h('span', { class: 'when' }, (e.n <= 14 ? countdown(e.n) : shortDate(e.day)) + (!e.allDay ? ' · ' + e.start.slice(11, 16) : ''))), () => go(e.kind === 'task' ? 'tarefas' : 'mes'))
      );
    nextBox = h('section', {}, h('h2', { class: 'sec-title' }, icon('mes'), 'Vem aí'), grid);
  }

  root.append(head, dateLine, h('div', { class: 'stack' }, hero, ontem, dayCard, nextBox));
}
