// Tela "Tarefas": lista de tarefas únicas (fazer e marcar como feito).
import { state, commit, addTask, updateTask, toggleTask, removeTask } from '../store.js';
import { today, addDays, diffDays, dow, DIAS_CURTOS, shortDate, isYmd, h } from '../util.js';
import { icon, checkbox, stamp, openSheet, confirmSheet, choice } from '../ui.js';

let showDone = false;

export function leave() {
  showDone = false;
}

function dueChip(due, t) {
  if (!due) return null;
  const n = diffDays(t, due);
  if (n < 0) return h('span', { class: 'due late' }, n === -1 ? 'ontem' : `atrasada ${-n}d`);
  if (n === 0) return h('span', { class: 'due today' }, 'hoje');
  if (n === 1) return h('span', { class: 'due' }, 'amanhã');
  return h('span', { class: 'due' }, `${DIAS_CURTOS[dow(due)]} ${shortDate(due)}`);
}

export function render(root, ctx) {
  root.className = 'page ruled';
  const t = today();
  const pend = state.tasks
    .filter((x) => !x.done)
    .sort((a, b) => (a.due && b.due ? a.due.localeCompare(b.due) || a.created - b.created : a.due ? -1 : b.due ? 1 : a.created - b.created));
  const done = state.tasks.filter((x) => x.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

  const head = h('header', { class: 'p-head' }, h('div', {}, h('h1', {}, 'Tarefas'), h('p', { class: 'sub' }, pend.length ? `${pend.length} pra fazer` : 'Nada pendente')), h('button', { class: 'icon-btn on', type: 'button', 'aria-label': 'Nova tarefa', onClick: () => taskSheet(null) }, icon('plus')));

  const list = h('div', { class: 'bare' });

  const row = (tk) => {
    const cb = checkbox(tk.done);
    const r = h('div', { class: 'task' + (tk.done ? ' done' : '') });
    const chip = !tk.done ? dueChip(tk.due, t) : null;
    const btn = h('button', { class: 'cbtn', type: 'button', role: 'checkbox', 'aria-checked': String(tk.done), 'aria-label': tk.text }, cb);
    btn.addEventListener('click', () => {
      const on = toggleTask(tk.id);
      r.classList.toggle('done', on);
      btn.setAttribute('aria-checked', String(on));
      cb.classList.toggle('on', on);
      const old = r.querySelector('.stamp');
      old && old.remove();
      if (on) r.append(stamp('Feito', 'sm pop'));
      // depois de um instante a tarefa vai para "concluídas" (ou volta para a lista)
      setTimeout(() => ctx.rerender(), on ? 900 : 350);
    });
    r.append(btn, h('button', { class: 'tx', type: 'button', onClick: () => taskSheet(tk) }, h('span', { class: 'strike' }, tk.text)));
    if (chip) r.append(chip);
    if (tk.done) r.append(stamp('Feito', 'sm'));
    return r;
  };

  if (!pend.length) list.append(h('div', { class: 'empty' }, state.tasks.length ? 'Tudo feito por aqui.' : 'Toque no + para criar a primeira tarefa.'));
  for (const tk of pend) list.append(row(tk));

  const doneBlock = h('div', { class: 'bare' });
  if (done.length) {
    const btn = h('button', { class: 'sec-btn' + (showDone ? ' open' : ''), type: 'button', 'aria-expanded': String(showDone), onClick: () => { showDone = !showDone; ctx.rerender(); } }, `Concluídas (${done.length})`, icon('down', 'chev'));
    doneBlock.append(btn);
    if (showDone) {
      for (const tk of done.slice(0, 40)) doneBlock.append(row(tk));
      doneBlock.append(
        h('div', { class: 'rowline pad' }, h('button', { class: 'btn sm ghost', type: 'button', onClick: async () => {
          if (await confirmSheet({ title: 'Limpar concluídas?', text: `${done.length} tarefa${done.length > 1 ? 's' : ''} concluída${done.length > 1 ? 's' : ''} vão sumir da lista.`, yes: 'Limpar', danger: true }))
            commit((s) => (s.tasks = s.tasks.filter((x) => !x.done)));
        } }, icon('trash'), 'Limpar concluídas'))
      );
    }
  }

  root.append(head, list, doneBlock, h('div', { class: 'fill' }));
}

function taskSheet(tk) {
  const t = today();
  const draft = { text: tk ? tk.text : '', due: tk ? tk.due : null };
  const input = h('input', { class: 'field', type: 'text', maxLength: 120, placeholder: 'Ex.: Entregar o trabalho de ciências', value: draft.text, 'aria-label': 'O que fazer' });
  const date = h('input', { class: 'field', type: 'date', value: draft.due || '', 'aria-label': 'Data' });
  const quickOpts = [
    { id: 'hoje', nome: 'Hoje' },
    { id: 'amanha', nome: 'Amanhã' },
    { id: 'semana', nome: 'Em 7 dias' },
    { id: 'sem', nome: 'Sem data' },
  ];
  const quick = choice(quickOpts, draft.due === t ? 'hoje' : draft.due === addDays(t, 1) ? 'amanha' : draft.due === addDays(t, 7) ? 'semana' : draft.due ? '' : 'sem', (v) => {
    draft.due = v === 'hoje' ? t : v === 'amanha' ? addDays(t, 1) : v === 'semana' ? addDays(t, 7) : null;
    date.value = draft.due || '';
  });
  date.addEventListener('change', () => {
    draft.due = isYmd(date.value) ? date.value : null;
    [...quick.children].forEach((b) => b.setAttribute('aria-checked', 'false'));
  });
  const save = h('button', { class: 'btn primary', type: 'button', onClick: () => {
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    tk ? updateTask(tk.id, { text, due: draft.due }) : addTask(text, draft.due);
    sh.close();
  } }, tk ? 'Salvar' : 'Adicionar');
  const del = tk && h('button', { class: 'btn ghost', type: 'button', onClick: async () => {
    sh.close();
    if (await confirmSheet({ title: 'Apagar tarefa?', text: `"${tk.text}"`, yes: 'Apagar', danger: true })) removeTask(tk.id);
  } }, icon('trash'), 'Apagar');
  const sh = openSheet({
    title: tk ? 'Editar tarefa' : 'Nova tarefa',
    content: h('div', { class: 'stack' }, h('div', {}, h('span', { class: 'label' }, 'O que precisa ser feito?'), input), h('div', {}, h('span', { class: 'label' }, 'Pra quando?'), quick, h('div', { style: { marginTop: '10px' } }, date))),
    footer: h('div', { class: 'row-btns' }, del, save),
  });
  if (!tk) setTimeout(() => input.focus(), 320);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && save.click());
}
