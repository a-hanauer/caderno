// Tela "Rotina": checklist diário em blocos (manhã, tarde, noite), com histórico da semana.
import { state, BLOCOS, QUANDO, ensureLog, dayStats, streak, toggleRoutine, addRoutineItem, updateRoutineItem, removeRoutineItem, moveRoutineItem } from '../store.js';
import { today, addDays, dow, cap, weekdayName, longDate, shortDate, INICIAIS, h } from '../util.js';
import { icon, checkbox, openSheet, confirmSheet, iconPicker, choice, toast, celebrate } from '../ui.js';
import { currentBlock } from './hoje.js';

let editing = false;
let opened = null; // Set com os blocos abertos
let celebrated = null; // data em que o carimbo de "tudo feito" já apareceu

export function leave() {
  editing = false;
  opened = null;
}

const quandoTag = { escola: 'escola', fds: 'fim de semana' };

export function render(root, ctx) {
  root.className = 'page ruled';
  const t = today();
  const log = ensureLog(t);
  const cur = currentBlock();
  if (!opened) opened = new Set([cur.id]);

  const stats = () => dayStats(t);
  const sub = h('p', { class: 'sub' });
  const paintHead = () => {
    const s = stats();
    const st = streak(t);
    sub.textContent = s ? `${s.complete ? 'Tudo feito!' : `${s.done} de ${s.total} hoje`}${st > 0 ? ` · ${st} ${st > 1 ? 'dias seguidos' : 'dia'}` : ''}` : `${cap(weekdayName(t))}, ${shortDate(t)}`;
  };

  const editBtn = h('button', { class: 'icon-btn' + (editing ? ' on' : ''), type: 'button', 'aria-label': editing ? 'Terminar edição' : 'Editar tarefas', 'aria-pressed': String(editing), onClick: () => { editing = !editing; ctx.rerender(); } }, icon(editing ? 'check' : 'pencil'));
  const head = h('header', { class: 'p-head' }, h('div', { style: { minWidth: '0' } }, h('h1', {}, editing ? 'Editar rotina' : 'Rotina'), sub), editBtn);

  // ----- últimos 7 dias -----
  const strip = h('div', { class: 'strip' });
  let todayMk = null;
  for (let i = 6; i >= 0; i--) {
    const d = addDays(t, -i);
    const s = dayStats(d);
    const mk = h('span', { class: 'mk' + (s ? (s.complete ? ' full' : ' part') : '') }, s ? (s.complete ? icon('check') : `${s.done}/${s.total}`) : '');
    if (i === 0) todayMk = mk;
    strip.append(
      h(
        'button',
        {
          class: 'slot' + (i === 0 ? ' today' : ''),
          type: 'button',
          'aria-label': `${cap(weekdayName(d))}: ${s ? `${s.done} de ${s.total}` : 'sem registro'}`,
          onClick: () => toast(s ? `${cap(weekdayName(d))}, ${shortDate(d)}: ${s.done} de ${s.total} tarefas${s.missed.length ? `. Faltou: ${s.missed.slice(0, 3).map((m) => m.label).join(', ')}${s.missed.length > 3 ? '…' : ''}` : '. Tudo feito!'}` : `${cap(weekdayName(d))}, ${shortDate(d)}: sem registro`),
        },
        h('span', { class: 'ini' }, INICIAIS[dow(d)]),
        mk
      )
    );
  }

  // ----- blocos -----
  const blocks = h('div', { class: 'blocks' });
  const counters = new Map();

  const refresh = (party) => {
    const L = ensureLog(t);
    const done = new Set(L.done);
    for (const b of BLOCOS) {
      const c = counters.get(b.id);
      if (!c) continue;
      const items = L.plan.filter((p) => p.block === b.id);
      const n = items.filter((p) => done.has(p.id)).length;
      c.textContent = items.length ? `${n}/${items.length}` : '';
      c.classList.toggle('ok', items.length > 0 && n === items.length);
    }
    paintHead();
    const s = stats();
    if (todayMk && s) {
      todayMk.className = 'mk ' + (s.complete ? 'full' : 'part');
      todayMk.replaceChildren(...(s.complete ? [icon('check')] : [`${s.done}/${s.total}`]));
    }
    if (party && s && s.complete && celebrated !== t) {
      celebrated = t;
      const n = streak(t);
      celebrate('Tudo feito!', n > 1 ? `${n} dias seguidos!` : 'Rotina completa hoje');
    }
  };

  for (const b of BLOCOS) {
    const planItems = log.plan.filter((p) => p.block === b.id);
    const editItems = state.routine.filter((r) => r.block === b.id);
    if (!editing && !planItems.length) continue;
    const isCur = b.id === cur.id;
    const section = h('section', { class: 'block' + (opened.has(b.id) || editing ? '' : ' closed'), dataset: { b: b.id } });
    const cnt = h('span', { class: 'cnt' });
    counters.set(b.id, cnt);
    const headBtn = h(
      'button',
      { class: 'block-head' + (isCur ? ' cur' : ''), type: 'button', 'aria-expanded': String(opened.has(b.id) || editing), onClick: () => {
        if (editing) return;
        const closed = section.classList.toggle('closed');
        closed ? opened.delete(b.id) : opened.add(b.id);
        headBtn.setAttribute('aria-expanded', String(!closed));
      } },
      icon(b.icon),
      h('span', { class: 'nm' }, b.nome),
      cnt,
      !editing && icon('down', 'chev')
    );
    const items = h('div', { class: 'items' });

    if (!editing) {
      const done = new Set(log.done);
      for (const p of planItems) {
        const cb = checkbox(done.has(p.id));
        const row = h('button', { class: 'item' + (done.has(p.id) ? ' done' : ''), type: 'button', role: 'checkbox', 'aria-checked': String(done.has(p.id)) }, cb, h('span', { class: 'ri' }, icon(p.emoji)), h('span', { class: 'lbl' }, h('span', { class: 'strike' }, p.label)));
        row.addEventListener('click', () => {
          const on = toggleRoutine(t, p.id);
          row.classList.toggle('done', on);
          row.setAttribute('aria-checked', String(on));
          cb.classList.toggle('on', on);
          refresh(on);
        });
        items.append(row);
      }
    } else {
      editItems.forEach((r) => {
        items.append(
          h(
            'div',
            { class: 'item edit' },
            h('span', { class: 'ri' }, icon(r.emoji)),
            h('button', { class: 'lbl', type: 'button', onClick: () => itemSheet(r) }, r.label, r.when !== 'todos' && [' ', h('span', { class: 'tag' }, quandoTag[r.when])]),
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Subir', onClick: () => moveRoutineItem(r.id, -1) }, icon('up')),
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Descer', onClick: () => moveRoutineItem(r.id, 1) }, icon('down')),
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Apagar ' + r.label, onClick: async () => {
              if (await confirmSheet({ title: 'Apagar tarefa?', text: `"${r.label}" some da rotina.`, yes: 'Apagar', danger: true })) removeRoutineItem(r.id);
            } }, icon('trash'))
          )
        );
      });
      items.append(h('button', { class: 'add-row', type: 'button', onClick: () => itemSheet(null, b.id) }, icon('plus'), 'Nova tarefa'));
    }
    section.append(headBtn, items);
    blocks.append(section);
  }

  root.append(head, ...(editing ? [] : [strip]), blocks, h('div', { class: 'fill' }));
  paintHead();
  refresh(false);
}

function itemSheet(item, blockId) {
  const draft = item ? { ...item } : { label: '', emoji: 'ok', block: blockId || 'manha', when: 'todos' };
  const input = h('input', { class: 'field', type: 'text', maxLength: 40, placeholder: 'Ex.: Escovar os dentes', value: draft.label, 'aria-label': 'Nome da tarefa' });
  const save = h('button', { class: 'btn primary', type: 'button', style: { flex: '1' }, onClick: () => {
    const label = input.value.trim();
    if (!label) { input.focus(); return; }
    draft.label = label;
    item ? updateRoutineItem(item.id, { label: draft.label, emoji: draft.emoji, block: draft.block, when: draft.when }) : addRoutineItem(draft);
    sh.close();
  } }, 'Salvar');
  const sh = openSheet({
    title: item ? 'Editar tarefa' : 'Nova tarefa',
    content: h(
      'div',
      { class: 'stack' },
      h('div', {}, h('span', { class: 'label' }, 'O que fazer?'), input),
      h('div', {}, h('span', { class: 'label' }, 'Desenho'), iconPicker(draft.emoji, (e) => (draft.emoji = e))),
      h('div', {}, h('span', { class: 'label' }, 'Quando do dia?'), choice(BLOCOS.map((b) => ({ id: b.id, nome: b.nome, icon: b.icon })), draft.block, (v) => (draft.block = v))),
      h('div', {}, h('span', { class: 'label' }, 'Em quais dias?'), choice(QUANDO, draft.when, (v) => (draft.when = v)))
    ),
    footer: h('div', { class: 'row-btns' }, save),
  });
  if (!item) setTimeout(() => input.focus(), 320);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && save.click());
}
