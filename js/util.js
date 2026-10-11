// Utilitários: datas (sempre no fuso local do aparelho), DOM e textos em pt-BR.

export const VERSION = 'v37';

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const INICIAIS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const pad = (n) => String(n).padStart(2, '0');

/** Date -> 'YYYY-MM-DD' (fuso local) */
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 'YYYY-MM-DD' -> Date à meia-noite local */
export const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

/** dias entre duas datas (b - a), imune a horário de verão */
export const diffDays = (a, b) => {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
};

export const dow = (s) => parse(s).getDay();
export const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(parse(s)) === s;
export const today = () => ymd(new Date());

/** 'escola' (seg–sex) ou 'fds' (sáb/dom) */
export const dayType = (s) => {
  const w = dow(s);
  return w === 0 || w === 6 ? 'fds' : 'escola';
};

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const longDate = (s) => {
  const d = parse(s);
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
};
export const shortDate = (s) => {
  const d = parse(s);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};
export const weekdayName = (s) => DIAS[dow(s)];

/** texto de contagem regressiva a partir de uma diferença em dias */
export const countdown = (n) => {
  if (n === 0) return 'hoje!';
  if (n === 1) return 'amanhã';
  if (n === -1) return 'ontem';
  if (n < 0) return `há ${-n} dias`;
  return `em ${n} dias`;
};

/** minúsculas e sem acentos (para comparar títulos) */
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/**
 * Cria elementos DOM sem innerHTML (títulos vindos do Google Agenda nunca viram HTML).
 * h('div', {class:'x', onClick:fn, style:{color:'red'}}, 'texto', outroEl)
 */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    } else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.length > 2 && k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'type' || k === 'placeholder' || k === 'maxLength' || k === 'readOnly' || k === 'rows')
      el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/** insere SVG estático (strings constantes do próprio app) */
export function svgEl(markup, cls) {
  const s = document.createElement('span');
  s.className = 'ico' + (cls ? ' ' + cls : '');
  s.innerHTML = markup;
  return s;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}
