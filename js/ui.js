// Componentes de interface compartilhados: ícones, folhas (sheets), avisos, checkbox desenhado à mão.
import { h } from './util.js';
import { iconMarkup, iconKey, ROUTINE_ICONS } from './icons.js';

/** ícone próprio (veja icons.js). Aceita também ids antigos de emoji. */
export const icon = (name, cls) => {
  const el = document.createElement('span');
  el.className = 'ico' + (cls ? ' ' + cls : '');
  el.innerHTML = iconMarkup(iconKey(name));
  return el;
};

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

// ---------- carimbo de "tudo feito" ----------
export function celebrate() {
  const ov = h('div', { class: 'celebrate' }, h('span', { class: 'stamp pop' }, 'Tudo feito!'));
  document.getElementById('app').append(ov);
  setTimeout(() => ov.classList.add('out'), 1700);
  setTimeout(() => ov.remove(), 2300);
}

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

export function iconPicker(current, onPick) {
  current = iconKey(current);
  const grid = h('div', { class: 'icon-grid' });
  const mark = () => [...grid.children].forEach((b) => b.classList.toggle('sel', b.dataset.k === current));
  for (const k of ROUTINE_ICONS)
    grid.append(
      h('button', { type: 'button', class: 'icon-pick', dataset: { k }, 'aria-label': k, onClick: () => {
        current = k;
        mark();
        onPick(k);
      } }, icon(k))
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
        o.icon ? icon(o.icon) : null,
        o.nome
      )
    );
  mark();
  return wrap;
}
