// Leitor de agenda no formato iCal (.ics), como o "endereço secreto" do Google Agenda.
// Entrega os eventos no formato do Caderno: { id, title, allDay, start, end, cal }
//   dia inteiro: start/end 'YYYY-MM-DD' (end exclusivo) · com hora: 'YYYY-MM-DDTHH:mm' no fuso do aparelho.
// Cobre o que o Google exporta: fusos (TZID), eventos de vários dias, repetições (RRULE: diária, semanal,
// mensal, anual, com INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY), exceções (EXDATE) e ocorrências editadas (RECURRENCE-ID).

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymdhm = (d) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** linhas desdobradas → [{name, params, value}] */
function lines(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (const l of raw) {
    if ((l.startsWith(' ') || l.startsWith('\t')) && out.length) out[out.length - 1] += l.slice(1);
    else out.push(l);
  }
  return out
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(':');
      if (i < 0) return null;
      const head = l.slice(0, i).split(';');
      const params = {};
      for (const p of head.slice(1)) {
        const [k, v] = p.split('=');
        if (k) params[k.toUpperCase()] = (v || '').replace(/^"|"$/g, '');
      }
      return { name: head[0].toUpperCase(), params, value: l.slice(i + 1) };
    })
    .filter(Boolean);
}

const unescape = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

// ---------- datas e fusos ----------
/** diferença (minutos) entre o horário de parede do fuso e UTC naquele instante */
function tzOffset(tz, utcMs) {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return (asUtc - utcMs) / 60000;
  } catch {
    return null;
  }
}
/** horário de parede {y,mo,d,h,mi} num fuso → instante (Date) */
function wallToDate(w, tz) {
  if (!tz) return new Date(w.y, w.mo - 1, w.d, w.h, w.mi); // sem fuso: hora local do aparelho
  const guess = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi);
  let off = tzOffset(tz, guess);
  if (off === null) return new Date(w.y, w.mo - 1, w.d, w.h, w.mi);
  let ms = guess - off * 60000;
  const off2 = tzOffset(tz, ms);
  if (off2 !== null && off2 !== off) ms = guess - off2 * 60000;
  return new Date(ms);
}

/** valor de DTSTART/DTEND/RECURRENCE-ID/EXDATE → { allDay, wall, tz, utc } */
function parseWhen(value, params) {
  const v = value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const wall = { y: +m[1], mo: +m[2], d: +m[3], h: m[4] ? +m[4] : 0, mi: m[5] ? +m[5] : 0 };
  if (!m[4] || params.VALUE === 'DATE') return { allDay: true, wall };
  if (m[7]) return { allDay: false, wall, utc: true };
  return { allDay: false, wall, tz: params.TZID || null };
}
const toDate = (w) => (w.allDay ? new Date(w.wall.y, w.wall.mo - 1, w.wall.d) : w.utc ? new Date(Date.UTC(w.wall.y, w.wall.mo - 1, w.wall.d, w.wall.h, w.wall.mi)) : wallToDate(w.wall, w.tz));
const keyOf = (w) => (w.allDay ? ymd(toDate(w)) : String(toDate(w).getTime()));

function durationMs(s) {
  const m = String(s || '').match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const ms = (((+m[2] || 0) * 7 + (+m[3] || 0)) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

// ---------- repetições ----------
function parseRule(s) {
  const r = {};
  for (const part of String(s).split(';')) {
    const [k, v] = part.split('=');
    if (k && v) r[k.toUpperCase()] = v;
  }
  return r;
}

/** horários de parede das ocorrências (a partir do início), até `until` (Date) — máx. 1500 */
function expand(start, rule, rangeEnd) {
  const freq = rule.FREQ;
  const interval = Math.max(1, parseInt(rule.INTERVAL || '1', 10));
  const count = rule.COUNT ? parseInt(rule.COUNT, 10) : Infinity;
  let until = null;
  if (rule.UNTIL) {
    const u = parseWhen(rule.UNTIL, {});
    if (u) until = u.allDay ? new Date(u.wall.y, u.wall.mo - 1, u.wall.d, 23, 59, 59) : toDate({ ...u, tz: u.utc ? null : start.tz });
  }
  const byday = rule.BYDAY ? rule.BYDAY.split(',').map((x) => {
    const m = x.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
    return m ? { n: m[1] ? parseInt(m[1], 10) : 0, dow: DAYS.indexOf(m[2]) } : null;
  }).filter(Boolean) : [];
  const bymd = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map((x) => parseInt(x, 10)) : [];
  const w0 = start.wall;
  const base = new Date(w0.y, w0.mo - 1, w0.d); // aritmética de calendário em datas "de parede"
  const out = [];
  let made = 0;
  const push = (d) => {
    const w = { ...start, wall: { ...w0, y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate() } };
    const at = toDate(w);
    if (at < toDate(start)) return true;
    if (until && at > until) return false;
    if (made >= count) return false;
    made++;
    if (at > rangeEnd) return false;
    out.push(w);
    return out.length < 1500;
  };
  const add = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  if (freq === 'DAILY') {
    for (let d = base; ; d = add(d, interval)) if (!push(d)) break;
  } else if (freq === 'WEEKLY') {
    const days = byday.length ? byday.map((b) => b.dow).sort() : [base.getDay()];
    const weekStart = add(base, -base.getDay());
    loop: for (let k = 0; k < 3000; k++) {
      const ws = add(weekStart, k * 7 * interval);
      for (const dow of days) if (!push(add(ws, dow))) break loop;
    }
  } else if (freq === 'MONTHLY') {
    loop: for (let k = 0; k < 600; k++) {
      const y = base.getFullYear();
      const mo = base.getMonth() + k * interval;
      const first = new Date(y, mo, 1);
      const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      let cands = [];
      if (byday.length) {
        for (const b of byday) {
          const all = [];
          for (let dd = 1; dd <= dim; dd++) if (new Date(first.getFullYear(), first.getMonth(), dd).getDay() === b.dow) all.push(dd);
          if (!b.n) cands.push(...all);
          else cands.push(b.n > 0 ? all[b.n - 1] : all[all.length + b.n]);
        }
      } else if (bymd.length) cands = bymd.map((x) => (x > 0 ? x : dim + x + 1));
      else cands = [base.getDate()];
      cands = [...new Set(cands.filter((x) => x >= 1 && x <= dim))].sort((a, b) => a - b);
      for (const dd of cands) if (!push(new Date(first.getFullYear(), first.getMonth(), dd))) break loop;
    }
  } else if (freq === 'YEARLY') {
    for (let k = 0; k < 200; k++) {
      const d = new Date(base.getFullYear() + k * interval, base.getMonth(), base.getDate());
      if (d.getMonth() !== base.getMonth()) continue; // 29/02 em ano comum
      if (!push(d)) break;
    }
  } else {
    push(base);
  }
  return out;
}

/** eventos do .ics entre `from` e `to` ('YYYY-MM-DD'), no formato do Caderno */
export function parseICS(text, from, to, calName = '') {
  const L = lines(text);
  const rangeStart = new Date(from + 'T00:00');
  const rangeEnd = new Date(to + 'T23:59');
  let name = calName;
  const vevents = [];
  let cur = null;
  for (const l of L) {
    if (l.name === 'X-WR-CALNAME' && !name) name = unescape(l.value);
    if (l.name === 'BEGIN' && l.value === 'VEVENT') cur = { ex: [] };
    else if (l.name === 'END' && l.value === 'VEVENT') {
      if (cur) vevents.push(cur);
      cur = null;
    } else if (cur) {
      if (l.name === 'UID') cur.uid = l.value;
      else if (l.name === 'SUMMARY') cur.title = unescape(l.value);
      else if (l.name === 'DTSTART') cur.start = parseWhen(l.value, l.params);
      else if (l.name === 'DTEND') cur.end = parseWhen(l.value, l.params);
      else if (l.name === 'DURATION') cur.dur = durationMs(l.value);
      else if (l.name === 'RRULE') cur.rule = parseRule(l.value);
      else if (l.name === 'EXDATE') for (const v of l.value.split(',')) { const w = parseWhen(v, l.params); w && cur.ex.push(w); }
      else if (l.name === 'RECURRENCE-ID') cur.rid = parseWhen(l.value, l.params);
      else if (l.name === 'STATUS') cur.status = l.value.toUpperCase();
    }
  }

  // ocorrências editadas (RECURRENCE-ID) substituem a ocorrência original da série
  const overrides = new Map();
  for (const e of vevents) if (e.rid && e.uid) overrides.set(e.uid + '|' + keyOf(e.rid), e);

  const out = [];
  const emit = (e, startW) => {
    if (!e.start || e.status === 'CANCELLED') return;
    const s = toDate(startW);
    let endD;
    if (e.end) {
      const len = toDate(e.end) - toDate(e.start);
      endD = new Date(s.getTime() + len);
    } else if (e.dur !== null && e.dur !== undefined) endD = new Date(s.getTime() + e.dur);
    else endD = e.start.allDay ? new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1) : s;
    if (e.start.allDay) {
      // duração em dias de calendário (evita erro no horário de verão)
      const days = e.end ? Math.max(1, Math.round((toDate(e.end) - toDate(e.start)) / 86400000)) : 1;
      endD = new Date(s.getFullYear(), s.getMonth(), s.getDate() + days);
    }
    if (endD <= rangeStart || s > rangeEnd) return;
    out.push({
      id: (e.uid || 'ev') + '@' + (e.start.allDay ? ymd(s) : ymdhm(s)),
      title: e.title || 'Sem título',
      allDay: !!e.start.allDay,
      start: e.start.allDay ? ymd(s) : ymdhm(s),
      end: e.start.allDay ? ymd(endD) : ymdhm(endD),
      cal: name,
    });
  };

  for (const e of vevents) {
    if (!e.start || e.rid) continue;
    if (!e.rule) {
      emit(e, e.start);
      continue;
    }
    const exKeys = new Set(e.ex.map(keyOf));
    for (const w of expand(e.start, e.rule, rangeEnd)) {
      const k = keyOf(w);
      if (exKeys.has(k)) continue;
      const ov = overrides.get(e.uid + '|' + k);
      if (ov) {
        overrides.delete(e.uid + '|' + k);
        emit(ov, ov.start);
      } else emit(e, w);
    }
  }
  // ocorrências editadas que caíram fora da série original (ex.: movidas para outro dia)
  for (const ov of overrides.values()) emit(ov, ov.start);

  out.sort((a, b) => a.start.localeCompare(b.start));
  return { name, events: out };
}

/** aceita webcal:// e o endereço iCal do Google; devolve https ou null */
export function normalizeIcsUrl(s) {
  let u = String(s || '').replace(/\s+/g, '');
  if (!u) return null;
  u = u.replace(/^webcals?:\/\//i, 'https://');
  try {
    const x = new URL(u);
    if (x.protocol !== 'https:') return null;
    return x.href;
  } catch {
    return null;
  }
}
