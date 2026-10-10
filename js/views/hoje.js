// Tela "Hoje": a página do dia da agenda.
import { state, commit, ensureLog, dayStats, streak, BLOCOS } from '../store.js';
import { today, addDays, parse, cap, longDate, weekdayName, countdown, shortDate, h } from '../util.js';
import { eventsOn, houseOn, upcoming, HOUSE, syncStatus } from '../events.js';
import { icon } from '../ui.js';

/** transforma um cartão em botão acessível (div, para poder conter títulos e listas) */
const tap = (el, fn) => {
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.addEventListener('click', fn);
  el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fn()));
  return el;
};

export const currentBlock = (now = new Date()) => BLOCOS.find((b) => now.getHours() < b.ate) || BLOCOS[BLOCOS.length - 1];

export function render(root, { go }) {
  root.className = 'page dots';
  const t = today();
  const log = ensureLog(t);
  const conn = syncStatus().connected;
  const hour = new Date().getHours();

  // ----- cabeçalho -----
  const head = h(
    'header',
    { class: 'p-head' },
    h('div', {}, h('h1', {}, cap(weekdayName(t))), h('p', { class: 'sub' }, longDate(t))),
    h('button', { class: 'icon-btn sm quiet', type: 'button', 'aria-label': 'Ajustes (área dos pais)', onClick: () => go('ajustes') }, icon('gear'))
  );

  // ----- faixa da casa -----
  const hs = houseOn(t);
  const hsTomorrow = houseOn(addDays(t, 1));
  let ribbon;
  if (hs) ribbon = h('div', { class: 'ribbon ' + hs }, h('span', { class: 'moon' }, hs === 'troca' ? '🔁' : '🌙'), h('div', { class: 'rb-text' }, h('small', {}, hs === 'troca' ? 'Hoje tem' : 'Hoje você dorme na'), h('strong', {}, hs === 'troca' ? 'Troca de casa' : HOUSE[hs].nome)));
  else if (!conn) ribbon = h('div', { class: 'ribbon none' }, h('span', {}, 'Agenda não conectada'), h('button', { type: 'button', onClick: () => go('ajustes') }, 'Conectar'));
  else ribbon = h('div', { class: 'ribbon none' }, 'Nenhuma casa marcada pra hoje');
  const ribbonWrap = h('div', { class: 'ribbon-wrap' }, ribbon);
  if (hsTomorrow && hsTomorrow !== hs) ribbonWrap.append(h('p', { class: 'ribbon-sub' }, 'Amanhã: ', h('b', {}, HOUSE[hsTomorrow].nome)));

  // ----- ontem -----
  const y = addDays(t, -1);
  const ys = dayStats(y);
  let ontem = null;
  if (ys && state.dismissed.ontem !== y) {
    const dismiss = (label) => h('button', { type: 'button', onClick: () => commit((s) => (s.dismissed.ontem = y)) }, label);
    if (ys.missed.length) {
      const names = ys.missed.slice(0, 2).map((m) => m.label);
      const rest = ys.missed.length - names.length;
      ontem = h(
        'div',
        { class: 'ontem' },
        h('p', {}, `Ontem ${ys.missed.length > 1 ? 'faltaram' : 'faltou'} ${ys.missed.length} ${ys.missed.length > 1 ? 'tarefas' : 'tarefa'}: ${names.join(', ')}${rest > 0 ? ` e mais ${rest}` : ''}.`),
        dismiss('Entendi')
      );
    } else {
      const s = streak(y);
      ontem = h('div', { class: 'ontem good' }, h('p', {}, `Ontem você fechou a rotina inteira!${s > 1 ? ` ${s} dias seguidos.` : ''}`), dismiss('Legal'));
    }
  }

  // ----- agenda de hoje -----
  const evs = eventsOn(t);
  const evCard = tap(h('div', { class: 'note tappable' }, h('h3', {}, 'Hoje na agenda')), () => go('mes'));
  if (!evs.length) evCard.append(h('p', { class: 'muted' }, conn ? 'Nada marcado pra hoje.' : 'Conecte a agenda para ver os compromissos.'));
  else {
    const ul = h('ul', { class: 'ev-list' });
    for (const e of evs.slice(0, 3)) ul.append(h('li', {}, h('span', { class: 'e' }, e.cat.emoji), h('span', { class: 't' }, e.title), !e.allDay && h('span', { class: 'w' }, e.start.slice(11, 16))));
    evCard.append(ul);
    if (evs.length > 3) evCard.append(h('p', { class: 'more' }, `+ ${evs.length - 3} no calendário`));
  }

  // ----- rotina -----
  const stats = dayStats(t);
  const cur = currentBlock();
  const doneSet = new Set(log.done);
  const curPending = log.plan.filter((p) => p.block === cur.id && !doneSet.has(p.id));
  const behind = log.plan.filter((p) => {
    const b = BLOCOS.find((x) => x.id === p.block);
    return b && b.ate <= hour && !doneSet.has(p.id);
  });
  const rotCard = h(
    'div',
    { class: 'note m tappable' },
    h('h3', {}, 'Rotina'),
    stats
      ? [
          h('div', { class: 'big' }, stats.done, h('small', {}, ` / ${stats.total}`)),
          h('div', { class: 'pbar' }, h('i', { style: { '--w': Math.round((stats.done / stats.total) * 100) + '%' } })),
          stats.complete
            ? h('p', { class: 'small' }, 'Tudo feito hoje!')
            : behind.length
              ? h('p', { class: 'small late' }, `${behind.length} ${behind.length > 1 ? 'ficaram' : 'ficou'} pra trás`)
              : h('p', { class: 'small' }, curPending.length ? `${cur.nome}: falta${curPending.length > 1 ? 'm' : ''} ${curPending.length}` : `${cur.nome}: tudo certo`),
        ]
      : h('p', { class: 'muted small' }, 'Sem rotina hoje.')
  );

  // ----- tarefas -----
  const pend = state.tasks.filter((x) => !x.done);
  const dueToday = pend.filter((x) => x.due && x.due <= t);
  const overdue = pend.filter((x) => x.due && x.due < t);
  const taskCard = h(
    'div',
    { class: 'note b tappable' },
    h('h3', {}, 'Tarefas'),
    dueToday.length
      ? [h('div', { class: 'big' }, dueToday.length, h('small', {}, dueToday.length > 1 ? ' pra hoje' : ' pra hoje')), overdue.length ? h('p', { class: 'small late' }, `${overdue.length} atrasada${overdue.length > 1 ? 's' : ''}`) : h('p', { class: 'small' }, pend.length > dueToday.length ? `+ ${pend.length - dueToday.length} sem pressa` : 'Falta só isso')]
      : [h('div', { class: 'big' }, pend.length ? pend.length : '0', h('small', {}, pend.length ? ' na lista' : '')), h('p', { class: 'small' }, pend.length ? 'Nenhuma pra hoje' : 'Lista limpa')]
  );

  // ----- vem aí -----
  const next = upcoming(t, 2);
  const nextCard =
    next.length || conn
      ? h(
          'div',
          { class: 'note p nextbox tappable' },
          h('h3', {}, 'Vem aí'),
          next.length
            ? h('ul', {}, next.map((e) => h('li', {}, h('span', {}, e.cat.emoji), h('span', { class: 't' }, e.title), h('span', { class: 'w' }, e.n <= 14 ? countdown(e.n) : shortDate(e.day)))))
            : h('p', { class: 'muted' }, 'Nada importante nos próximos dias.')
        )
      : null;

  tap(rotCard, () => go('rotina'));
  tap(taskCard, () => go('tarefas'));
  nextCard && tap(nextCard, () => go('mes'));
  root.append(head, h('div', { class: 'stack' }, ribbonWrap, ontem, evCard, h('div', { class: 'duo' }, rotCard, taskCard), nextCard));
}
