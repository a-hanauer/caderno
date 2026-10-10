/**
 * CADERNO — ponte entre o Google Agenda e o app (SOMENTE LEITURA).
 *
 * Este script roda na SUA conta Google. O app (no GitHub Pages) chama o endereço
 * do script com um "token" secreto; o script responde com a lista de eventos.
 * Nada daqui vai para o GitHub. Só são enviados: título, data/hora e nome da agenda
 * (descrição, convidados e local NÃO são enviados).
 *
 * Passo a passo completo: veja o README.md.
 */

const CONFIG = {
  // Nomes (ou IDs) das agendas que o app deve ler. Exemplos:
  //   ['Guarda Sebastião', 'Escola', 'Atividades']
  // Deixe vazio [] para ler só a sua agenda principal.
  // Agendas compartilhadas com você precisam estar na lista "Outras agendas" do Google Agenda.
  AGENDAS: [],

  TZ: 'America/Sao_Paulo', // fuso das datas enviadas
  MAX_DIAS: 500,           // limite de dias por pedido
  MAX_EVENTOS: 3000,       // limite de eventos por pedido
};

/** Chamado pelo app. Parâmetros: token, from=AAAA-MM-DD, to=AAAA-MM-DD */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token) return json_({ ok: false, error: 'sem-token' });
    if (!iguais_(String(p.token || ''), token)) return json_({ ok: false, error: 'token' });
    if (p.action === 'ping') return json_({ ok: true, pong: true });

    const hoje = new Date();
    const de = parseDia_(p.from) || somaDias_(hoje, -40);
    let ate = parseDia_(p.to) || somaDias_(hoje, 400);
    if ((ate.getTime() - de.getTime()) / 864e5 > CONFIG.MAX_DIAS) ate = somaDias_(de, CONFIG.MAX_DIAS);
    const fim = somaDias_(ate, 1); // inclui o último dia

    const agendas = agendas_();
    if (!agendas.length) return json_({ ok: false, error: 'sem-agenda' });

    const vistos = {};
    const eventos = [];
    for (const cal of agendas) {
      const nome = cal.getName();
      for (const ev of cal.getEvents(de, fim)) {
        const todoDia = ev.isAllDayEvent();
        // Em eventos de dia inteiro, o Google devolve o fim como a meia-noite do dia SEGUINTE (exclusivo).
        const inicio = fmt_(ev.getStartTime(), todoDia ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm");
        const termino = fmt_(ev.getEndTime(), todoDia ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm");
        const id = ev.getId() + '|' + inicio;
        if (vistos[id]) continue;
        vistos[id] = true;
        eventos.push({ id: id, title: ev.getTitle(), allDay: todoDia, start: inicio, end: termino, cal: nome });
        if (eventos.length >= CONFIG.MAX_EVENTOS) break;
      }
    }
    return json_({ ok: true, v: 1, generatedAt: new Date().toISOString(), events: eventos });
  } catch (err) {
    return json_({ ok: false, error: 'erro', message: String(err) });
  }
}

/** RODE UMA VEZ: cria o token secreto. Depois abra "Execuções" / "Registro" e copie o token. */
function gerarToken() {
  const t = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('TOKEN', t);
  Logger.log('SEU TOKEN (copie tudo, sem espaços):\n\n' + t);
  return t;
}

/** RODE PARA TESTAR (e para o Google pedir permissão de acesso à agenda). */
function testar() {
  if (!PropertiesService.getScriptProperties().getProperty('TOKEN')) {
    Logger.log('Ainda não existe token. Rode primeiro a função gerarToken.');
    return;
  }
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  const resp = JSON.parse(doGet({ parameter: { token: token } }).getContent());
  if (!resp.ok) {
    Logger.log('Deu erro: ' + resp.error + (resp.message ? ' — ' + resp.message : ''));
    return;
  }
  Logger.log('Tudo certo! ' + resp.events.length + ' eventos encontrados.');
  const amostra = resp.events.slice(0, 8).map(function (e) {
    return (e.allDay ? '[dia todo] ' : '') + e.start + ' → ' + e.end + '  ' + e.title + '  (' + e.cal + ')';
  });
  Logger.log(amostra.join('\n'));
}

/** Lista os nomes das suas agendas (para preencher CONFIG.AGENDAS). */
function listarAgendas() {
  Logger.log(
    CalendarApp.getAllCalendars()
      .map(function (c) { return '• ' + c.getName(); })
      .join('\n')
  );
}

// ---------- auxiliares ----------
function agendas_() {
  if (!CONFIG.AGENDAS.length) return [CalendarApp.getDefaultCalendar()];
  const achadas = [];
  for (const nomeOuId of CONFIG.AGENDAS) {
    const porId = CalendarApp.getCalendarById(nomeOuId);
    if (porId) {
      achadas.push(porId);
      continue;
    }
    for (const c of CalendarApp.getCalendarsByName(nomeOuId)) achadas.push(c);
  }
  return achadas;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fmt_(data, padrao) {
  return Utilities.formatDate(data, CONFIG.TZ, padrao);
}
function parseDia_(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? Utilities.parseDate(s, CONFIG.TZ, 'yyyy-MM-dd') : null;
}
function somaDias_(d, n) {
  return new Date(d.getTime() + n * 864e5);
}
function iguais_(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
