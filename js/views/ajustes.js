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
      keys.append(k === '' ? h('span', { class: 'key blank' }) : h('button', { class: 'key', type: 'button', 'aria-label': k === 'del' ? 'Apagar' : k, onClick: () => press(k) }, k === 'del' ? '⌫' : k));
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

export function render(root, ctx) {
  root.className = 'page plain';
  const st = syncStatus();
  const conn = getConn();

  const head = h(
    'header',
    { class: 'p-head', style: { flexDirection: 'column', alignItems: 'flex-start', gap: '0' } },
    h('button', { class: 'back-link', type: 'button', onClick: () => ctx.go('hoje') }, icon('back'), 'Voltar'),
    h('h1', {}, 'Ajustes'),
    h('p', { class: 'sub' }, 'Área dos pais')
  );

  // ===== Google Agenda =====
  const agenda = h('section', { class: 'card' }, h('h3', {}, 'Google Agenda'));
  const stack = h('div', { class: 'stack' });
  stack.append(h('div', { class: 'status ' + (st.connected ? (st.fetchedAt ? 'ok' : '') : 'bad') }, h('i'), h('span', {}, st.connected ? (st.fetchedAt ? `Conectada · ${st.count} eventos · atualizada ${ago(st.fetchedAt)}` : 'Conectada · ainda não atualizada') : (st.count ? `Sem conexão · cópia com ${st.count} eventos · de ${ago(st.fetchedAt)}` : 'Não conectada'))));

  if (!conn) {
    const url = h('input', { class: 'field', type: 'url', placeholder: 'https://script.google.com/macros/s/…/exec', 'aria-label': 'Endereço do Apps Script', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    const tok = h('input', { class: 'field', type: 'text', placeholder: 'token (texto longo)', 'aria-label': 'Token', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    const go = h('button', { class: 'btn primary', type: 'button', onClick: () => connect(url.value.trim(), tok.value.trim(), go, ctx) }, 'Conectar e testar');
    const code = h('textarea', { class: 'field', rows: 3, placeholder: 'Cole aqui o link ou código de conexão', 'aria-label': 'Código de conexão', spellcheck: 'false' });
    const useCode = h('button', { class: 'btn', type: 'button', onClick: () => {
      try {
        const c = decodeConn(code.value);
        connect(c.u, c.t, useCode, ctx);
      } catch (e) {
        toast(e.message);
      }
    } }, 'Usar código');
    stack.append(h('div', {}, h('span', { class: 'label' }, 'Endereço do app (Apps Script)'), url), h('div', {}, h('span', { class: 'label' }, 'Token'), tok), go, h('hr', { style: { border: 0, borderTop: '1px dashed var(--line)', width: '100%', margin: '2px 0' } }), h('div', {}, h('span', { class: 'label' }, 'Ou use um código de conexão'), code, h('p', { class: 'hint' }, 'É o código que o outro celular gerou em "Copiar link de conexão".')), useCode);
  } else {
    const upd = h('button', { class: 'btn primary', type: 'button', onClick: async () => {
      upd.disabled = true;
      upd.textContent = 'Atualizando…';
      const r = await syncEvents();
      toast(r.ok ? `Pronto: ${r.count} eventos.` : (REASONS[r.reason] || 'Não deu certo agora.') + (r.detail ? ' [' + r.detail + ']' : ''));
      ctx.rerender();
    } }, 'Atualizar agora');
    const link = h('button', { class: 'btn', type: 'button', onClick: async () => {
      const text = connLink(conn);
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Caderno', text });
          return;
        } catch {}
      }
      toast((await copyText(text)) ? 'Link copiado.' : 'Não consegui copiar.');
    } }, icon('share'), 'Copiar link de conexão');
    const off = h('button', { class: 'btn ghost', type: 'button', onClick: async () => {
      if (await confirmSheet({ title: 'Desconectar?', text: 'A agenda some do app até conectar de novo. Seus dados da rotina e tarefas continuam.', yes: 'Desconectar', danger: true })) {
        setConn(null);
        localStorage.removeItem('caderno:v1:cache');
        resetIndex();
        ctx.rerender();
      }
    } }, 'Desconectar');
    stack.append(upd, link, h('p', { class: 'hint' }, 'O link de conexão dá acesso aos títulos da agenda. Envie só para quem você confia.'), off);
  }

  // palavras que indicam a casa
  const kwPai = h('input', { class: 'field', type: 'text', value: state.settings.kwPai, 'aria-label': 'Palavras da casa do pai', autocapitalize: 'off', spellcheck: 'false' });
  const kwMae = h('input', { class: 'field', type: 'text', value: state.settings.kwMae, 'aria-label': 'Palavras da casa da mãe', autocapitalize: 'off', spellcheck: 'false' });
  kwPai.addEventListener('change', () => commit((s) => (s.settings.kwPai = kwPai.value.slice(0, 80)), { silent: true }));
  kwMae.addEventListener('change', () => commit((s) => (s.settings.kwMae = kwMae.value.slice(0, 80)), { silent: true }));
  stack.append(h('hr', { style: { border: 0, borderTop: '1px dashed var(--line)', width: '100%', margin: '2px 0' } }), h('div', {}, h('span', { class: 'label' }, 'Palavras da casa do Papai'), kwPai), h('div', {}, h('span', { class: 'label' }, 'Palavras da casa da Mamãe'), kwMae), h('p', { class: 'hint' }, 'Eventos de dia inteiro com uma dessas palavras no título dizem em qual casa ele dorme. Separe por vírgula. Ex.: "André - pai" ou só "André" é reconhecido pela palavra "pai" ou "André".'));
  agenda.append(stack);

  // ===== backup =====
  const backup = h('section', { class: 'card' }, h('h3', {}, 'Backup e outro celular'));
  const bstack = h('div', { class: 'stack' });
  const incl = h('input', { type: 'checkbox' });
  const out = h('div', {});
  const gen = h('button', { class: 'btn', type: 'button', onClick: async () => {
    const code = await exportCode({ withConn: incl.checked });
    const ta = h('textarea', { class: 'field selectable', rows: 4, readOnly: true, 'aria-label': 'Código dos dados' });
    ta.value = code;
    const copy = h('button', { class: 'btn sm', type: 'button', onClick: async () => toast((await copyText(code)) ? 'Código copiado.' : 'Segure no texto para copiar.') }, icon('copy'), 'Copiar');
    const share = navigator.share ? h('button', { class: 'btn sm', type: 'button', onClick: () => navigator.share({ title: 'Caderno', text: code }).catch(() => {}) }, icon('share'), 'Enviar') : null;
    out.replaceChildren(ta, h('div', { class: 'row-btns', style: { marginTop: '8px' } }, copy, share), h('p', { class: 'hint' }, `${code.length} caracteres.`));
    ta.focus();
    ta.select();
  } }, 'Gerar código dos dados');
  bstack.append(
    h('p', { class: 'muted small' }, 'Leva rotina, tarefas e histórico para outro celular (ou guarda uma cópia). Também leva uma cópia dos eventos da agenda já baixados, útil se este celular não conseguir falar com o Google.'),
    h('label', { class: 'checkline' }, incl, h('span', {}, 'Incluir a conexão com o Google Agenda (contém o token: não compartilhe em lugar aberto)')),
    gen,
    out
  );
  const imp = h('textarea', { class: 'field', rows: 3, placeholder: 'Cole aqui um código do Caderno', 'aria-label': 'Código para importar', spellcheck: 'false' });
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
  bstack.append(h('hr', { style: { border: 0, borderTop: '1px dashed var(--line)', width: '100%', margin: '2px 0' } }), h('div', {}, h('span', { class: 'label' }, 'Importar código'), imp), h('div', { class: 'row-btns' }, h('button', { class: 'btn', type: 'button', onClick: () => doImport('merge') }, 'Juntar'), h('button', { class: 'btn danger', type: 'button', onClick: () => doImport('replace') }, 'Substituir tudo')));
  backup.append(bstack);

  // ===== PIN =====
  const has = !!state.settings.pinHash;
  const pin = h('section', { class: 'card' }, h('h3', {}, 'PIN dos ajustes'));
  const pstack = h('div', { class: 'stack' });
  pstack.append(h('p', { class: 'muted small' }, has ? 'Esta área pede PIN para abrir.' : 'Sem PIN: qualquer pessoa com o celular abre esta área.'));
  pstack.append(h('div', { class: 'row-btns' }, h('button', { class: 'btn', type: 'button', onClick: async () => { if (await setPinFlow()) ctx.rerender(); } }, has ? 'Trocar PIN' : 'Definir PIN'), has && h('button', { class: 'btn ghost', type: 'button', onClick: async () => {
    if (await confirmSheet({ title: 'Tirar o PIN?', text: 'Os ajustes passam a abrir sem pedir nada.', yes: 'Tirar PIN' })) commit((s) => { s.settings.pinHash = null; s.settings.pinSalt = null; });
  } }, 'Tirar PIN')));
  pstack.append(h('p', { class: 'hint' }, 'O PIN só evita mexidas sem querer. Quem tem acesso ao aparelho destravado ainda pode abrir os dados do navegador.'));
  pin.append(pstack);

  // ===== zerar =====
  const reset = h('section', { class: 'card' }, h('h3', {}, 'Zerar'), h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'Apaga rotina, tarefas, histórico e a conexão com a agenda deste aparelho. Não dá para desfazer (gere um código antes, se quiser guardar).'), h('button', { class: 'btn danger', type: 'button', onClick: async () => {
    if (!(await confirmSheet({ title: 'Apagar tudo?', text: 'Isso apaga todos os dados do Caderno neste aparelho.', yes: 'Apagar tudo', danger: true }))) return;
    clearAllLocal();
    resetIndex();
    replaceState(getDefaults());
    toast('Tudo zerado.');
    ctx.go('hoje');
  } }, icon('trash'), 'Apagar tudo deste aparelho')));

  const about = h('p', { class: 'hint', style: { textAlign: 'center', padding: '4px 0 8px' } }, `Caderno ${VERSION} · os dados ficam só neste aparelho. Para instalar: Compartilhar → Adicionar à Tela de Início.`);

  root.append(head, h('div', { class: 'stack', style: { paddingTop: '6px' } }, agenda, backup, pin, reset, about));
}

async function connect(u, t, btn, ctx) {
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
