// Tela "Ajustes" (área dos pais): conexão com o Google Agenda, casas, backup por código, PIN.
import { state, commit, getConn, setConn, getCache, clearAllLocal, replaceState, getDefaults } from '../store.js';
import { exportCode, decodeCode, applyImport, encodeConn, decodeConn, connLink, validConnUrl } from '../codec.js';
import { syncEvents, syncStatus, REASONS, minutesAgo, resetIndex } from '../events.js';
import { icon, openSheet, toast, confirmSheet } from '../ui.js';
import { h, VERSION } from '../util.js';
import { wxPlace, refreshWx, searchPlace } from '../weather.js';
import { familyCode, lastSync, syncError, fmtCode, syncNow, createFamily, peekFamily, joinFamily, leaveFamily } from '../sync.js';

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

/** pede 4 números com o teclado numérico do próprio sistema (área dos pais: visual neutro) */
function keypad({ title, text, check, cta = 'Continuar' }) {
  return new Promise((resolve) => {
    let finished = false;
    const input = h('input', { class: 'pin-in', type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxLength: 4, autocomplete: 'off', autocorrect: 'off', 'aria-label': text || title, enterkeyhint: 'done' });
    const msg = h('p', { class: 'pin-msg', 'aria-live': 'polite' }, text || '');
    const finish = (v) => {
      if (finished) return;
      finished = true;
      sh.close();
      resolve(v);
    };
    const submit = async () => {
      const v = input.value.replace(/\D/g, '');
      if (v.length !== 4) {
        msg.textContent = 'O PIN tem 4 números.';
        msg.classList.add('err');
        input.focus();
        return;
      }
      if (await check(v)) finish(true);
      else {
        msg.textContent = 'PIN errado. Tente de novo.';
        msg.classList.add('err');
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 420);
        input.value = '';
        input.focus();
      }
    };
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 4);
      msg.classList.remove('err');
      msg.textContent = text || '';
      if (input.value.length === 4) submit();
    });
    input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), submit()));
    const ok = h('button', { class: 'sbtn primary', type: 'button', onClick: submit }, cta);
    const sh = openSheet({ title, cls: 'sys', onClose: () => finish(false), content: h('div', { class: 'pin-box' }, msg, input), footer: h('div', { class: 'set-btns', style: { padding: '0', background: 'none', border: '0' } }, ok) });
    setTimeout(() => input.focus(), 60);
  });
}

/** pede o PIN, se existir. Resolve true se pode entrar. */
export async function gate() {
  if (!state.settings.pinHash) return true;
  return keypad({
    title: 'Área dos pais',
    text: 'Digite o PIN',
    cta: 'Entrar',
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
    `modo ${r.classList.contains('fullbug') ? 'fullbug' : '-'}`,
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

  // ===== sincronizar aparelhos (Firebase) =====
  const fid = familyCode();
  const syncKids = [];
  if (!fid) {
    syncKids.push(h('div', { class: 'set-status' }, h('i'), h('div', {}, 'Só neste aparelho', h('small', {}, 'Ligue para ver as mesmas marcações em todos os celulares'))));
    const start = btn('Começar a sincronizar', { cls: 'primary', ic: 'refresh', onClick: async () => {
      start.disabled = true;
      try {
        await createFamily();
        toast('Pronto! Agora envie o código para os outros celulares.');
      } catch (e) {
        toast(navigator.onLine === false ? 'Sem internet agora.' : 'Não consegui ligar agora. Tente de novo.');
      }
      ctx.rerender();
    } });
    const code = h('input', { class: 'set-in', type: 'text', placeholder: 'xxxx-xxxx-xxxx-xxxx-xxxx', 'aria-label': 'Código da família', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', style: { fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '.04em' } });
    const join = btn('Entrar', { cls: 'primary', onClick: async () => {
      join.disabled = true;
      try {
        const p = await peekFamily(code.value);
        const ok = await confirmSheet({ title: 'Usar os dados da família?', text: `Na nuvem há ${p.tasks} tarefas únicas e ${p.days} dias de histórico${p.conn ? ', além da conexão com a agenda' : ''}. O que está neste aparelho será trocado por isso.`, yes: 'Entrar' });
        if (ok) {
          await joinFamily(p.fid);
          toast('Sincronizado!');
        }
      } catch (e) {
        toast(navigator.onLine === false ? 'Sem internet agora.' : e.message);
      }
      join.disabled = false;
      ctx.rerender();
    } });
    syncKids.push(h('div', { class: 'set-btns' }, start), field('Já começou em outro celular? Cole o código', code), h('div', { class: 'set-btns' }, join));
  } else {
    const err = syncError();
    const at = lastSync();
    syncKids.push(h('div', { class: 'set-status ' + (err ? 'bad' : 'ok') }, h('i'), h('div', {}, err ? (err === 'offline' ? 'Sem internet (sincroniza ao voltar)' : 'Não sincronizou da última vez') : 'Sincronizado', h('small', {}, at ? `Última vez ${ago(at)}` : 'Ainda não sincronizou'))));
    const shown = fmtCode(fid);
    const codeIn = h('input', { class: 'set-in selectable', type: 'text', readOnly: true, value: shown, 'aria-label': 'Código da família', style: { fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '.04em', textAlign: 'center' } });
    const now = btn('Sincronizar agora', { ic: 'refresh', onClick: async () => {
      now.disabled = true;
      const r = await syncNow();
      toast(r.ok ? 'Sincronizado.' : r.reason === 'offline' ? 'Sem internet agora.' : 'Não deu certo agora.' + (r.detail ? ' [' + r.detail + ']' : ''));
      ctx.rerender();
    } });
    syncKids.push(
      field('Código da família', codeIn),
      h('div', { class: 'set-btns' }, btn('Copiar', { cls: 'primary', ic: 'copy', onClick: async () => toast((await copyText(shown)) ? 'Código copiado.' : 'Segure no código para copiar.') }), navigator.share ? btn('Enviar', { ic: 'share', onClick: () => navigator.share({ title: 'Caderno', text: shown }).catch(() => {}) }) : null, now),
      h('button', { class: 'set-row danger', type: 'button', onClick: async () => {
        if (await confirmSheet({ title: 'Parar de sincronizar?', text: 'Este aparelho deixa de receber e enviar mudanças. Os dados continuam aqui e nos outros celulares.', yes: 'Parar', danger: true })) {
          leaveFamily();
          ctx.rerender();
        }
      } }, icon('close'), h('span', { class: 'tx' }, 'Parar de sincronizar neste aparelho'))
    );
  }
  const sincro = sec('Sincronizar aparelhos', group(...syncKids), note(fid ? 'Rotina, tarefas, histórico, ajustes e a agenda ficam iguais em todos os celulares com este código. Envie só para quem você confia.' : 'Ligue num celular e cole o código nos outros. Vai junto: rotina, tarefas, histórico, ajustes e a agenda.'));

  // ===== Google Agenda =====
  let agenda;
  if (fid) {
    // com a família ligada, quem lê o Google é o robô (GitHub); os celulares só recebem
    const late = st.fetchedAt && minutesAgo(st.fetchedAt) > 90;
    const rStatus = h('div', { class: 'set-status ' + (st.fetchedAt ? (late ? 'bad' : 'ok') : 'bad') }, h('i'), h('div', {}, st.fetchedAt ? (late ? 'O robô está atrasado' : 'Recebendo do robô') : 'Aguardando o robô', h('small', {}, st.fetchedAt ? `${st.count} eventos · o robô leu o Google ${ago(st.fetchedAt)}` : 'Ainda não chegou nenhuma leitura da agenda')));
    const upd = btn('Atualizar agora', { cls: 'primary', ic: 'refresh', onClick: async () => {
      upd.disabled = true;
      upd.lastChild.textContent = 'Atualizando…';
      const r = await syncEvents();
      toast(r.ok ? `Pronto: ${r.count} eventos.` : (REASONS[r.reason] || 'Não deu certo agora.') + (r.detail ? ' [' + r.detail + ']' : ''));
      ctx.rerender();
    } });
    agenda = sec('Google Agenda', group(rStatus, h('div', { class: 'set-btns' }, upd)), note('Um robô lê a agenda do Google a cada 15 a 30 minutos e entrega para todos os celulares da família. Mudanças feitas no Google aparecem aqui depois da próxima leitura.'));
  } else {
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
      agendaKids.push(h('p', { class: 'set-note', style: { margin: '10px 0 0' } }, 'Ligue "Sincronizar aparelhos" acima: a agenda chega junto, sem configurar nada aqui.'));
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
    agenda = sec('Google Agenda', group(...agendaKids), conn ? note('O link de conexão dá acesso aos títulos da agenda. Envie só para quem você confia.') : null);
  }

  // ===== casas =====
  const kwPai = h('input', { class: 'set-in', type: 'text', value: state.settings.kwPai, 'aria-label': 'Palavras da casa do Papai', autocapitalize: 'off', spellcheck: 'false' });
  const kwMae = h('input', { class: 'set-in', type: 'text', value: state.settings.kwMae, 'aria-label': 'Palavras da casa da Mamãe', autocapitalize: 'off', spellcheck: 'false' });
  kwPai.addEventListener('change', () => commit((x) => (x.settings.kwPai = kwPai.value.slice(0, 80)), { silent: true }));
  kwMae.addEventListener('change', () => commit((x) => (x.settings.kwMae = kwMae.value.slice(0, 80)), { silent: true }));
  const casas = sec('Casas', group(field('Palavras da casa do Papai', kwPai), field('Palavras da casa da Mamãe', kwMae)), note('Eventos de dia inteiro com uma dessas palavras no título dizem em qual casa ele dorme. Separe por vírgula. Ex.: "André" ou "André - pai".'));

  // ===== previsão do tempo =====
  const place = wxPlace();
  const setPlace = (pl) => {
    commit((x) => (x.settings.wx = pl), { silent: true });
    if (pl) refreshWx(true).then((r) => toast(r ? 'Previsão atualizada.' : 'Não consegui buscar a previsão agora.'));
    ctx.rerender();
  };
  const q = h('input', { class: 'set-in', type: 'search', placeholder: 'Ex.: Porto Alegre', 'aria-label': 'Cidade', autocapitalize: 'words', spellcheck: 'false' });
  const results = h('div', {});
  const doSearch = async () => {
    const v = q.value.trim();
    if (v.length < 2) return q.focus();
    results.replaceChildren(h('p', { class: 'set-note' }, 'Buscando…'));
    try {
      const list = await searchPlace(v);
      results.replaceChildren(...(list.length ? list.map((r) => h('button', { class: 'set-row', type: 'button', onClick: () => setPlace({ name: r.name, lat: r.lat, lon: r.lon }) }, icon('casa'), h('span', { class: 'tx' }, r.name, h('small', {}, r.region)), icon('right'))) : [h('p', { class: 'set-note' }, 'Nenhuma cidade encontrada.')]));
    } catch {
      results.replaceChildren(h('p', { class: 'set-note' }, 'Sem internet ou a busca falhou.'));
    }
  };
  q.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), doSearch()));
  const here = btn('Usar a localização', { ic: 'casa', onClick: () => {
    if (!navigator.geolocation) return toast('Este aparelho não informa a localização.');
    navigator.geolocation.getCurrentPosition(
      (pos) => setPlace({ name: 'Localização do aparelho', lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 }),
      () => toast('Não consegui a localização. Busque pela cidade.'),
      { timeout: 15000, maximumAge: 3600000 }
    );
  } });
  const wxKids = [h('div', { class: 'set-status ' + (place ? 'ok' : '') }, h('i'), h('div', {}, place ? place.name : 'Sem cidade definida', h('small', {}, place ? 'A previsão aparece na tela Hoje' : 'Defina uma cidade para ver a previsão em Hoje')))];
  wxKids.push(field('Buscar cidade', q), h('div', { class: 'set-btns' }, btn('Buscar', { cls: 'primary', onClick: doSearch }), here), results);
  if (place) wxKids.push(h('button', { class: 'set-row danger', type: 'button', onClick: () => setPlace(null) }, icon('close'), h('span', { class: 'tx' }, 'Tirar a previsão')));
  const tempo = sec('Previsão do tempo', group(...wxKids), note('Dados do Open-Meteo. A cidade vai junto no código de dados, para o outro celular.'));

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
    if (!(await confirmSheet({ title: 'Apagar tudo?', text: 'Isso apaga todos os dados do Caderno neste aparelho e para de sincronizar. Os outros celulares não são afetados.', yes: 'Apagar tudo', danger: true }))) return;
    leaveFamily();
    clearAllLocal();
    resetIndex();
    replaceState(getDefaults());
    toast('Tudo zerado.');
    ctx.go('hoje');
  } }, icon('trash'), h('span', { class: 'tx' }, 'Apagar tudo deste aparelho'))));

  root.append(h('div', { class: 'set' }, bar, sincro, agenda, casas, tempo, backup, pin, reset, h('p', { class: 'set-foot' }, `Caderno ${VERSION} · ${fid ? 'sincronizado pelo Firebase' : 'os dados ficam só neste aparelho'}.`), h('p', { class: 'set-foot', style: { marginTop: '6px' } }, diag())));
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
