// Tela "Calendário": mês estilo calendário de parede, com a casa de cada dia e os compromissos.
import { state, dayStats } from '../store.js';
import { today, parse, ymd, addDays, MESES, INICIAIS, cap, weekdayName, h } from '../util.js';
import { itemsOn, houseOn, HOUSE } from '../events.js';
import { icon, openSheet } from '../ui.js';

let view = null; // { y, m }
let selected = null;

export function enter() {
  const d = new Date();
  view = { y: d.getFullYear(), m: d.getMonth() };
  selected = null;
}
export function leave() {
  view = null;
  selected = null;
}

export function render(root, ctx) {
  root.className = 'page plain fit';
  if (!view) enter();
  const t = today();
  const first = new Date(view.y, view.m, 1);
  const offset = first.getDay();
  const dim = new Date(view.y, view.m + 1, 0).getDate();
  const rows = Math.ceil((offset + dim) / 7);
  const start = addDays(ymd(first), -offset);
  const isCurrent = view.y === new Date().getFullYear() && view.m === new Date().getMonth();

  const shift = (n) => {
    let m = view.m + n;
    let y = view.y;
    if (m < 0) (m = 11), y--;
    if (m > 11) (m = 0), y++;
    view = { y, m };
    selected = null;
    ctx.rerender();
  };

  const head = h(
    'header',
    { class: 'mhead' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mês anterior', onClick: () => shift(-1) }, icon('left')),
    h('h1', {}, cap(MESES[view.m]), h('small', {}, String(view.y)), !isCurrent && h('button', { class: 'go-today', type: 'button', onClick: () => { enter(); ctx.rerender(); } }, icon('mes'), 'Voltar para hoje')),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Próximo mês', onClick: () => shift(1) }, icon('right'))
  );

  const wk = h('div', { class: 'wk' }, INICIAIS.map((i) => h('span', {}, i)));
  const grid = h('div', { class: 'grid', style: { '--rows': rows } });

  for (let i = 0; i < rows * 7; i++) {
    const d = addDays(start, i);
    const dt = parse(d);
    const inMonth = dt.getMonth() === view.m;
    const hs = houseOn(d);
    const evs = itemsOn(d);
    const cats = [];
    for (const e of evs) if (!cats.some((c) => c.icon === e.cat.icon)) cats.push(e.cat);
    const label = `${cap(weekdayName(d))}, ${dt.getDate()} de ${MESES[dt.getMonth()]}${hs ? '. ' + HOUSE[hs].nome : ''}${evs.length ? `. ${evs.length} compromisso${evs.length > 1 ? 's' : ''}` : ''}`;
    grid.append(
      h(
        'button',
        { class: ['cell', hs && 'h-' + hs, !inMonth && 'out', d < t && 'past', d === t && 'today', d === selected && 'sel'].filter(Boolean).join(' '), type: 'button', 'aria-label': label, onClick: () => openDay(d, ctx) },
        h('span', { class: 'n' }, dt.getDate()),
        h('span', { class: 'ics n' + Math.min(cats.length, 3) }, cats.slice(0, 3).map((c) => h('span', { class: 'ico-wrap', style: { display: 'contents', '--c': c.color } }, icon(c.icon))), cats.length > 3 && h('span', { class: 'more' }, `+${cats.length - 3}`))
      )
    );
  }

  // gesto de arrastar para trocar de mês
  let sx = 0, sy = 0;
  grid.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  grid.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 45) shift(dx < 0 ? 1 : -1);
  }, { passive: true });

  const legend = h('div', { class: 'legend' }, h('span', {}, h('i', { style: { background: 'var(--pai)' } }), 'Papai'), h('span', {}, h('i', { style: { background: 'var(--mae)' } }), 'Mamãe'));

  root.append(head, wk, grid, legend);
}

export function openDay(d, ctx) {
  selected = d;
  ctx.rerender();
  const t = today();
  const dt = parse(d);
  const hs = houseOn(d);
  const evs = itemsOn(d);
  const rs = d <= t ? dayStats(d) : null;
  const body = h('div', {});
  if (hs) body.append(h('p', { style: { marginBottom: '12px' } }, h('span', { class: 'house-chip ' + hs }, icon(hs === 'troca' ? 'troca' : 'casa'), HOUSE[hs].nome)));
  for (const e of evs) {
    const sub = e.kind === 'task' ? `${e.cat.id === 'tarefa' ? 'Tarefa' : e.cat.label + ' (tarefa)'} · ${e.allDay ? 'dia todo' : e.start.slice(11, 16)}` : e.allDay ? `${e.cat.label} · dia todo` : `${e.cat.label} · ${e.start.slice(11, 16)}${e.end && e.end.slice(11, 16) && e.end.slice(0, 10) === e.start.slice(0, 10) ? ' às ' + e.end.slice(11, 16) : ''}`;
    body.append(h('div', { class: 'ev-row', style: { '--c': e.cat.color } }, icon(e.cat.icon), h('div', { class: 'tt' }, e.title, h('small', {}, sub))));
  }
  if (rs)
    body.append(h('div', { class: 'ev-row', style: { '--c': rs.complete ? 'var(--green)' : '#e8913a' } }, icon(rs.complete ? 'ok' : 'rotina'), h('div', { class: 'tt' }, `Rotina: ${rs.done} de ${rs.total}`, rs.missed.length ? h('small', {}, 'Faltou: ' + rs.missed.map((m) => m.label).join(', ')) : h('small', {}, 'Tudo feito!'))));
  if (!body.children.length) body.append(h('p', { class: 'muted' }, 'Nada marcado nesse dia.'));
  openSheet({
    title: `${cap(weekdayName(d).replace('-feira', ''))}, ${dt.getDate()} de ${MESES[dt.getMonth()]}`,
    content: body,
    onClose: () => {
      selected = null;
      ctx.rerender();
    },
  });
}
