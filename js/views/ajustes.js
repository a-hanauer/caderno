// Tela "Ajustes" (área dos pais): conexão com o Google Agenda, casas, backup por código, PIN.
import { state, commit, getConn, setConn, getCache, clearAllLocal, replaceState, getDefaults } from '../store.js';
import { exportCode, decodeCode, applyImport, encodeConn, decodeConn, connLink, validConnUrl } from '../codec.js';
import { syncEvents, syncStatus, REASONS, minutesAgo, resetIndex } from '../events.js';
import { icon, openSheet, toast, confirmSheet } from '../ui.js';
import { h, VERSION } from '../util.js';

// ---------- PIN (trava de criança, não é segurança forte) ----------
async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let x = 5381;
  for (const b of data) x = ((x << 5) + x + b) >>> 0;
  return 'f' + x.toString(16);
}

function keypad({ title, text, check }) {
  return new Promise((resolve) => {
    let val = '';
    let busy = false;
    let finished = false;
    const dots = h('div', { class: 'pin-dots', 'aria-live': 'polite' }, [0, 1, 2, 3].map(() => h('i')));
    const paint = () => [...dots.children].forEach((d, i) => d.classList.toggle('f', i < val.length));
    const finish = (v) => {
      if (finished) return;
      finished = true;
      document.removeEventListener('keydown', onKey);
      sh.close();
      resolve(v);
    };
    const press = async (k) => {
      if (busy) return;
      if (k === 'del') {
        val = val.slice(0, -1);
        paint();
        return;
      }
      if (val.length >= 4) return;
      val += k;
      paint();
      if (val.length === 4) {
        busy = true;
        const ok = await check(val);
        busy = false;
        if (ok) finish(true);
        else {
          dots.classList.add('shake');
          setTimeout(() => {
            dots.classList.remove('shake');
            val = '';
            paint();
          }, 420);
        }
      }
    };
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
    };
    document.addEventListener('keydown', onKey);
    const keys = h('div', { class: 'keypad' });
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'])
      keys.append(k === '' ? h('span', { class: 'key blank' }) : h('button', { class: 'key', type: 'button', 'aria-label': k === 'del' ? 'Apagar' : k, onClick: () => press(k) }, k === 'del' ? icon('backspace') : k));
    const sh = openSheet({ title, onClose: () => finish(false), content: h('div', { class: 'stack' }, text && h('p', { class: 'muted', style: { textAlign: 'center' } }, text), dots, keys) });
  });
}

/** pede o PIN, se existir. Resolve true se pode entrar. */
export async function gate() {
  if (!state.settings.pinHash) return true;
  return keypad({
    title: 'Área dos pais',
    text: 'Digite o PIN',
    check: async (p) => (await hashPin(p, state.settings.pinSalt)) === state.settings.pinHash,
  });
}

async function setPinFlow() {
  let first = '';
  const a = await keypad({ title: 'Novo PIN', text: 'Escolha 4 números', check: async (p) => ((first = p), true) });
  if (!a) return false;
  const b = await keypad({ title: 'Repita o PIN', text: 'Digite de novo para confirmar', check: async (p) => p === first });
  if (!b) return false;
  const salt = Math.random().toString(36).slice(2);
  const hash = await hashPin(first, salt);
  commit((s) => {
    s.settings.pinSalt = salt;
    s.settings.pinHash = hash;
  });
  toast('PIN definido.');
  return true;
}

// ---------- tela ----------
const ago = (ts) => {
  const m = minutesAgo(ts);
  if (m === null) return '';
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  if (m < 1440) return `há ${Math.round(m / 60)} h`;
  return `há ${Math.round(m / 1440)} dias`;
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function diag() {
  const r = document.documentElement;
  const cs = getComputedStyle(r);
  const probe = (css) => {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;' + css;
    r.appendChild(p);
    const v = Math.round(p.getBoundingClientRect().height);
    p.remove();
    return v;
  };
  const pad = (side) => {
    const p = document.createElement('div');
    p.style.cssText = `position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;padding-${side}:env(safe-area-inset-${side})`;
    r.appendChild(p);
    const v = Math.round(parseFloat(getComputedStyle(p)['padding' + side[0].toUpperCase() + side.slice(1)]) || 0);
    p.remove();
    return v;
  };
  const lay = window.__lay || {};
  const vv = window.visualViewport;
  const f = [
    r.classList.contains('app') ? 'app' : 'navegador',
    `env ${pad('top')}/${pad('bottom')}`,
    `guardado ${r.style.getPropertyValue('--sat') || 0}/${r.style.getPropertyValue('--sab') || 0}`,
    `inner ${innerWidth}x${innerHeight}`,
    `screen ${screen.width}x${screen.height}`,
    `vv ${vv ? Math.round(vv.height) + '@' + Math.round(vv.offsetTop) : '-'}`,
    `vh ${probe('height:100vh')} lvh ${probe('height:100lvh')} svh ${probe('height:100svh')} dvh ${probe('height:100dvh')}`,
    `app ${lay.app || '-'}`,
    `abas ${lay.tabs || '-'}`,
    `safe ${cs.getPropertyValue('--safe-t').trim()}/${cs.getPropertyValue('--safe-b').trim()}`,
    `body ${getComputedStyle(document.body).backgroundColor}`,
  ];
  return 'diag: ' + f.join(' · ');
}

export function render(root, ctx) {
  root.className = 'page set-page';
  const st = syncStatus();
  const conn = getConn();
  const sec = (title, ...kids) => h('section', { class: 'set-sec' }, h('h2', {}, title), ...kids);
  const group = (...kids) => h('div', { class: 'set-group' }, ...kids);
  const note = (t) => h('p', { class: 'set-note' }, t);
  const field = (label, input) => h('label', { class: 'set-field' }, h('span', {}, label), input);
  const btn = (label, { cls = '', ic, onClick }) => h('button', { class: 'sbtn ' + cls, type: 'button', onClick }, ic && icon(ic), label);

  const bar = h('header', { class: 'set-bar' }, h('button', { class: 'back', type: 'button', onClick: () => ctx.go('hoje') }, icon('left'), 'Voltar'), h('h1', {}, 'Ajustes'));

  // ===== Google Agenda =====
  const status = h('div', { class: 'set-status ' + (st.connected ? (st.fetchedAt ? 'ok' : '') : 'bad') }, h('i'), h('div', {}, st.connected ? (st.fetchedAt ? 'Conectada' : 'Conectada, ainda não atualizada') : st.count ? 'Sem conexão (usando cópia)' : 'Não conectada', h('small', {}, st.fetchedAt ? `${st.count} eventos · atualizada ${ago(st.fetchedAt)}` : 'Os compromissos vêm do Google Agenda')));
  const agendaKids = [status];
  if (!conn) {
    const url = h('input', { class: 'set-in', type: 'url', placeholder: 'https://script.google.com/macros/s/…/exec', 'aria-label': 'Endereço do Apps Script', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    const tok = h('input', { class: 'set-in', type: 'text', placeholder: 'texto longo gerado pelo script', 'aria-label': 'Token', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    const go = btn('Conectar e testar', { cls: 'primary', onClick: () => connect(url.value, tok.value, go, ctx) });
    const code = h('textarea', { class: 'set-in', rows: 3, placeholder: 'Cole aqui o link ou código de conexão', 'aria-label': 'Código de conexão', spellcheck: 'false' });
    const useCode = btn('Usar código', { onClick: () => {
      try {
        const c = decodeConn(code.value);
        connect(c.u, c.t, useCode, ctx);
      } catch (e) {
        toast(e.message);
      }
    } });
    agendaKids.push(field('Endereço do app (Apps Script)', url), field('Token', tok), h('div', { class: 'set-btns' }, go), field('Ou cole um código de conexão', code), h('div', { class: 'set-btns' }, useCode));
  } else {
    const upd = btn('Atualizar agora', { cls: 'primary', ic: 'refresh', onClick: async () => {
      upd.disabled = true;
      upd.lastChild.textContent = 'Atualizando…';
      const r = await syncEvents();
      toast(r.ok ? `Pronto: ${r.count} eventos.` : (REASONS[r.reason] || 'Não deu certo agora.') + (r.detail ? ' [' + r.detail + ']' : ''));
      ctx.rerender();
    } });
    agendaKids.push(h('div', { class: 'set-btns' }, upd));
    agendaKids.push(h('button', { class: 'set-row', type: 'button', onClick: async () => {
      const text = connLink(conn);
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Caderno', text });
          return;
        } catch {}
      }
      toast((await copyText(text)) ? 'Link copiado.' : 'Não consegui copiar.');
    } }, icon('link'), h('span', { class: 'tx' }, 'Copiar link de conexão', h('small', {}, 'Para conectar outro celular sem digitar')), icon('right')));
    agendaKids.push(h('button', { class: 'set-row danger', type: 'button', onClick: async () => {
      if (await confirmSheet({ title: 'Desconectar?', text: 'A agenda some do app até conectar de novo. Seus dados da rotina e tarefas continuam.', yes: 'Desconectar', danger: true })) {
        setConn(null);
        localStorage.removeItem('caderno:v1:cache');
        resetIndex();
        ctx.rerender();
      }
    } }, icon('close'), h('span', { class: 'tx' }, 'Desconectar a agenda')));
  }
  const agenda = sec('Google Agenda', group(...agendaKids), conn ? note('O link de conexão dá acesso aos títulos da agenda. Envie só para quem você confia.') : null);

  // ===== casas =====
  const kwPai = h('input', { class: 'set-in', type: 'text', value: state.settings.kwPai, 'aria-label': 'Palavras da casa do Papai', autocapitalize: 'off', spellcheck: 'false' });
  const kwMae = h('input', { class: 'set-in', type: 'text', value: state.settings.kwMae, 'aria-label': 'Palavras da casa da Mamãe', autocapitalize: 'off', spellcheck: 'false' });
  kwPai.addEventListener('change', () => commit((x) => (x.settings.kwPai = kwPai.value.slice(0, 80)), { silent: true }));
  kwMae.addEventListener('change', () => commit((x) => (x.settings.kwMae = kwMae.value.slice(0, 80)), { silent: true }));
  const casas = sec('Casas', group(field('Palavras da casa do Papai', kwPai), field('Palavras da casa da Mamãe', kwMae)), note('Eventos de dia inteiro com uma dessas palavras no título dizem em qual casa ele dorme. Separe por vírgula. Ex.: "André" ou "André - pai".'));

  // ===== backup =====
  const incl = h('input', { type: 'checkbox' });
  const out = h('div', {});
  const gen = btn('Gerar código dos dados', { cls: 'primary', onClick: async () => {
    const code = await exportCode({ withConn: incl.checked });
    const ta = h('textarea', { class: 'set-in selectable', rows: 4, readOnly: true, 'aria-label': 'Código dos dados' });
    ta.value = code;
    const copy = btn('Copiar', { ic: 'copy', onClick: async () => toast((await copyText(code)) ? 'Código copiado.' : 'Segure no texto para copiar.') });
    const share = navigator.share ? btn('Enviar', { ic: 'share', onClick: () => navigator.share({ title: 'Caderno', text: code }).catch(() => {}) }) : null;
    out.replaceChildren(h('div', { class: 'set-field' }, ta, h('p', { class: 'set-note', style: { margin: '6px 0 0' } }, `${code.length} caracteres.`)), h('div', { class: 'set-btns' }, copy, share));
    ta.focus();
    ta.select();
  } });
  const imp = h('textarea', { class: 'set-in', rows: 3, placeholder: 'Cole aqui um código do Caderno', 'aria-label': 'Código para importar', spellcheck: 'false' });
  const doImport = async (mode) => {
    let data;
    try {
      data = await decodeCode(imp.value);
    } catch (e) {
      toast(e.message);
      return;
    }
    const resumo = `${data.routine.length} tarefas de rotina, ${data.tasks.length} tarefas únicas, ${Object.keys(data.log).length} dias de histórico${data.ev ? `, ${data.ev.events.length} eventos da agenda` : ''}${data.conn ? ' e a conexão com a agenda' : ''}.`;
    const ok = await confirmSheet({ title: mode === 'replace' ? 'Substituir tudo?' : 'Juntar com o que já existe?', text: `O código tem ${resumo}${mode === 'replace' ? ' O que está neste aparelho será trocado.' : ''}`, yes: mode === 'replace' ? 'Substituir' : 'Juntar', danger: mode === 'replace' });
    if (!ok) return;
    applyImport(data, mode);
    imp.value = '';
    toast('Dados importados.');
    ctx.rerender();
  };
  const backup = sec(
    'Backup e outro celular',
    group(
      h('label', { class: 'set-check' }, incl, h('span', {}, 'Incluir a conexão com o Google Agenda (contém o token: não compartilhe em lugar aberto)')),
      h('div', { class: 'set-btns' }, gen),
      out,
      field('Importar um código', imp),
      h('div', { class: 'set-btns' }, btn('Juntar', { cls: 'primary', onClick: () => doImport('merge') }), btn('Substituir tudo', { cls: 'danger', onClick: () => doImport('replace') }))
    ),
    note('Leva rotina, tarefas, histórico e uma cópia dos eventos da agenda para outro celular (ou guarda um backup).')
  );

  // ===== PIN =====
  const has = !!state.settings.pinHash;
  const pinRows = [h('button', { class: 'set-row', type: 'button', onClick: async () => { if (await setPinFlow()) ctx.rerender(); } }, icon('lock'), h('span', { class: 'tx' }, has ? 'Trocar PIN' : 'Definir PIN'), h('span', { class: 'val' }, has ? 'ativo' : 'desligado'), icon('right'))];
  if (has)
    pinRows.push(h('button', { class: 'set-row danger', type: 'button', onClick: async () => {
      if (await confirmSheet({ title: 'Tirar o PIN?', text: 'Os ajustes passam a abrir sem pedir nada.', yes: 'Tirar PIN' })) commit((x) => { x.settings.pinHash = null; x.settings.pinSalt = null; });
    } }, icon('close'), h('span', { class: 'tx' }, 'Tirar o PIN')));
  const pin = sec('Segurança', group(...pinRows), note('O PIN só evita mexidas sem querer nesta área. Quem tem o aparelho destravado ainda pode abrir os dados do navegador.'));

  // ===== zerar =====
  const reset = sec('Zerar', group(h('button', { class: 'set-row danger', type: 'button', onClick: async () => {
    if (!(await confirmSheet({ title: 'Apagar tudo?', text: 'Isso apaga todos os dados do Caderno neste aparelho. Gere um código antes, se quiser guardar.', yes: 'Apagar tudo', danger: true }))) return;
    clearAllLocal();
    resetIndex();
    replaceState(getDefaults());
    toast('Tudo zerado.');
    ctx.go('hoje');
  } }, icon('trash'), h('span', { class: 'tx' }, 'Apagar tudo deste aparelho'))));

  root.append(h('div', { class: 'set' }, bar, agenda, casas, backup, pin, reset, h('p', { class: 'set-foot' }, `Caderno ${VERSION} · os dados ficam só neste aparelho.`), h('p', { class: 'set-foot', style: { marginTop: '6px' } }, diag())));
}

async function connect(u, t, btn, ctx) {
  u = String(u).replace(/\s+/g, ''); // espaços e quebras de linha colados por engano
  t = String(t).replace(/\s+/g, '');
  if (!validConnUrl(u)) return toast('O endereço precisa começar com https://script.google.com/');
  if (t.length < 16) return toast('O token parece curto demais. Copie o texto inteiro.');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Testando…';
  const before = getConn();
  setConn({ u, t });
  const r = await syncEvents();
  if (r.ok) toast(`Conectado! ${r.count} eventos.`);
  else if (r.reason === 'offline') toast('Salvei, mas estou sem internet. Teste depois em "Atualizar agora".');
  else {
    setConn(before);
    btn.disabled = false;
    btn.textContent = label;
    toast((REASONS[r.reason] || 'Não consegui conectar.') + (r.detail ? ' [' + r.detail + ']' : ''));
    return;
  }
  ctx.rerender();
}
