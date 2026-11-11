// Robô da agenda: lê o link iCal secreto do Google Agenda e grava os eventos no Firebase,
// num documento ao lado do da família. Os celulares só leem esse documento.
// Roda no GitHub Actions (veja .github/workflows/agenda.yml). Segredos: AGENDA_ICS e FAMILIA.
// Nunca imprime o link, o código nem os eventos.
import { parseICS, normalizeIcsUrl } from '../js/ics.js';

const PROJECT = 'caderno-ebbd2';
const API_KEY = 'AIzaSyBkMi9fz4ugSDOodGQLZPcxnoeBVi2FwdI';

const fail = (msg) => {
  console.error('Erro: ' + msg);
  process.exit(1);
};
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plus = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};

const url = normalizeIcsUrl(process.env.AGENDA_ICS);
const fid = String(process.env.FAMILIA || '').toLowerCase().replace(/[^a-z0-9]/g, '');
if (!url) fail('falta o segredo AGENDA_ICS (o endereço secreto em formato iCal).');
if (fid.length < 20) fail('falta o segredo FAMILIA (o código de 20 letras e números dos Ajustes).');

let text;
try {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) fail('o Google respondeu ' + res.status + ' ao ler a agenda. Confira o link.');
  text = await res.text();
} catch {
  fail('não consegui falar com o Google.');
}
if (!/BEGIN:VCALENDAR/.test(text)) fail('o link não devolveu uma agenda iCal.');

const from = plus(-40);
const to = plus(400);
const { name, events } = parseICS(text, from, to);
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const list = events.slice(0, 3000).map((e) => ({ id: clean(e.id, 160), title: clean(e.title, 120) || 'Sem título', allDay: e.allDay, start: e.start, end: e.end, cal: clean(e.cal, 60) }));
const data = JSON.stringify({ events: list, from, to, name: clean(name, 60) });
if (data.length > 900000) fail('agenda grande demais para um documento.');

const doc = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/families/${fid}agenda?key=${API_KEY}`;
try {
  // só grava quando algo mudou: os celulares não baixam de novo à toa
  const cur = await fetch(doc).then((r) => (r.ok ? r.json() : null));
  const same = cur?.fields?.data?.stringValue === data;
  const fields = { at: { integerValue: String(Date.now()) } };
  if (!same) fields.data = { stringValue: data };
  const res = await fetch(doc + '&updateMask.fieldPaths=at' + (same ? '' : '&updateMask.fieldPaths=data'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!res.ok) fail('o Firebase respondeu ' + res.status + ' ao gravar.');
  console.log(`${list.length} eventos ${same ? 'sem mudanças' : 'gravados'}.`);
} catch {
  fail('não consegui falar com o Firebase.');
}
