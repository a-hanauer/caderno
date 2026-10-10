// Componentes de interface compartilhados: ícones, folhas (sheets), avisos, checkbox desenhado à mão.
import { h, svgEl } from './util.js';

const svg = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

export const ICONS = {
  hoje: svg('<path d="M3 5.5C5.5 4.5 9 4.5 12 6.5c3-2 6.5-2 9-1v13c-2.5-1-6-1-9 1-3-2-6.5-2-9-1z"/><path d="M12 6.5v13"/>'),
  mes: svg('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  rotina: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>'),
  tarefas: svg('<path d="M4 6.5l1.6 1.6L8.5 5M4 12.5l1.6 1.6 2.9-3.1M4 18.5l1.6 1.6 2.9-3.1"/><path d="M12 7h8M12 13h8M12 19h8"/>'),
  gear: svg(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
  ),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  pencil: svg('<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/>'),
  trash: svg('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>'),
  up: svg('<path d="M6 14l6-6 6 6"/>'),
  down: svg('<path d="M6 10l6 6 6-6"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  left: svg('<path d="M15 5l-7 7 7 7"/>'),
  right: svg('<path d="M9 5l7 7-7 7"/>'),
  share: svg('<path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
};

export const icon = (name, cls) => svgEl(ICONS[name], cls);

// ---------- checkbox desenhado à mão ----------
const CB = `<svg viewBox="0 0 32 32" aria-hidden="true"><path class="cb-box" d="M5 6.5c5-1 17-1.2 22 0.3 0.6 5 0.8 14 0 19.4-5 1-17 1-22-0.2-0.8-6-0.7-14 0-19.5z"/><path class="cb-tick" d="M8 16.5l5.5 5.5L25 9"/></svg>`;
export function checkbox(checked) {
  const s = document.createElement('span');
  s.className = 'cb' + (checked ? ' on' : '');
  s.innerHTML = CB;
  return s;
}

// ---------- carimbo ----------
export const stamp = (text, cls = '') => h('span', { class: 'stamp ' + cls }, text);

// ---------- aviso (post-it) ----------
let toastTimer;
export function toast(msg, ms = 2600) {
  const root = document.getElementById('toast-root');
  root.replaceChildren(h('div', { class: 'toast', role: 'status' }, msg));
  requestAnimationFrame(() => root.firstChild && root.firstChild.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    root.firstChild && root.firstChild.classList.remove('show');
    setTimeout(() => root.replaceChildren(), 250);
  }, ms);
}

// ---------- folha que sobe de baixo ----------
const openSheets = [];

export function openSheet({ title, content, footer, onClose, tall = false }) {
  const root = document.getElementById('sheet-root');
  const back = h('div', { class: 'sheet-back' });
  let closed = false;
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar' }, icon('close'));
  const box = h(
    'section',
    { class: 'sheet' + (tall ? ' tall' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-grip' }),
    h('header', { class: 'sheet-head' }, h('h2', {}, title), closeBtn),
    h('div', { class: 'sheet-body' }, content),
    footer ? h('footer', { class: 'sheet-foot' }, footer) : null
  );
  const wrap = h('div', { class: 'sheet-wrap' }, back, box);
  root.append(wrap);
  document.body.classList.add('sheet-open');

  // mantém a folha acima do teclado (iOS não redimensiona a janela)
  const vv = window.visualViewport;
  const fit = () => {
    if (!vv) return;
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    wrap.style.setProperty('--kb', kb + 'px');
    wrap.style.setProperty('--vvh', vv.height + 'px');
  };
  vv && vv.addEventListener('resize', fit);
  vv && vv.addEventListener('scroll', fit);
  fit();

  const onKey = (e) => e.key === 'Escape' && api.close();
  document.addEventListener('keydown', onKey);

  const api = {
    el: box,
    close() {
      if (closed) return;
      closed = true;
      wrap.classList.remove('open');
      vv && vv.removeEventListener('resize', fit);
      vv && vv.removeEventListener('scroll', fit);
      document.removeEventListener('keydown', onKey);
      const i = openSheets.indexOf(api);
      if (i >= 0) openSheets.splice(i, 1);
      if (!openSheets.length) document.body.classList.remove('sheet-open');
      setTimeout(() => wrap.remove(), 230);
      onClose && onClose();
    },
  };
  openSheets.push(api);
  back.addEventListener('click', () => api.close());
  closeBtn.addEventListener('click', () => api.close());
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  return api;
}

export const closeAllSheets = () => [...openSheets].forEach((s) => s.close());

/** pergunta de sim/não. Resolve true/false. */
export function confirmSheet({ title, text, yes = 'Sim', no = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => {
      if (answered) return;
      answered = true;
      sh.close();
      resolve(v);
    };
    const sh = openSheet({
      title,
      onClose: () => done(false),
      content: h(
        'div',
        { class: 'stack' },
        text && h('p', { class: 'muted' }, text),
        h('div', { class: 'row-btns' }, h('button', { class: 'btn ghost', type: 'button', onClick: () => done(false) }, no), h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', onClick: () => done(true) }, yes))
      ),
    });
  });
}

export const EMOJIS = [
  '🪥', '🚿', '🛏️', '🥣', '🎒', '📚', '✏️', '📖', '🧼', '👕', '🧦', '👟', '🍎', '🥛', '💧', '🍽️', '🧹', '🗑️', '🐶', '🐱', '🌱', '🎹', '⚽', '🎮', '🧩', '🔬', '🤖', '🗣️', '📝', '🧮', '🎨', '🎵', '🏃', '🚲', '🧘', '🦷', '📱', '🍳', '⏰', '✅',
];

export function emojiPicker(current, onPick) {
  const grid = h('div', { class: 'emoji-grid' });
  const mark = () => [...grid.children].forEach((b) => b.classList.toggle('sel', b.dataset.e === current));
  for (const e of EMOJIS)
    grid.append(
      h(
        'button',
        {
          type: 'button',
          class: 'emoji-btn',
          dataset: { e },
          'aria-label': e,
          onClick: () => {
            current = e;
            mark();
            onPick(e);
          },
        },
        e
      )
    );
  mark();
  return grid;
}

/** grupo de botões de opção (um só escolhido) */
export function choice(options, current, onPick, cls = '') {
  const wrap = h('div', { class: 'choice ' + cls, role: 'radiogroup' });
  const mark = () => [...wrap.children].forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === current)));
  for (const o of options)
    wrap.append(
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: 'chip',
          dataset: { v: o.id },
          onClick: () => {
            current = o.id;
            mark();
            onPick(o.id);
          },
        },
        o.emoji ? o.emoji + ' ' : '',
        o.nome
      )
    );
  mark();
  return wrap;
}
