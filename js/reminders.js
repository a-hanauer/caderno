// Lembretes locais do app iOS (sem servidor): rotina da manhã e da noite, véspera da troca de casa,
// tarefas com hora (15 min antes) e véspera de prova/trabalho. Refeito sempre que algo muda.
import { state, appliesOn } from './store.js';
import { today, addDays, parse } from './util.js';
import { houseOn, upcoming } from './events.js';
import { NATIVE, notifPlugin } from './native.js';

export const NOTIF_DEFAULT = { on: true, manha: '08:00', noite: '19:00', troca: '12:00' };
export const notifSettings = () => ({ ...NOTIF_DEFAULT, ...(state.settings.notif || {}) });

const at = (day, hhmm) => {
  const d = parse(day);
  d.setHours(parseInt(hhmm.slice(0, 2), 10), parseInt(hhmm.slice(3, 5), 10), 0, 0);
  return d;
};
const lista = (items) => items.slice(0, 3).map((p) => p.label).join(', ') + (items.length > 3 ? '…' : '');

/** o que avisar nos próximos dias (máx. 60: o iOS guarda até 64 lembretes por app) */
export function buildPlan(now = new Date()) {
  const ns = notifSettings();
  if (!ns.on) return [];
  const t = today();
  const out = [];

  // rotina: só os itens ainda não feitos (hoje) ou os que valem para aquele dia
  for (let i = 0; i < 7; i++) {
    const d = addDays(t, i);
    for (const [blk, nome] of [['manha', 'Rotina da manhã'], ['noite', 'Rotina da noite']]) {
      const L = i === 0 ? state.log[t] : null;
      const pend = L ? L.plan.filter((p) => p.block === blk && !L.done.includes(p.id)) : state.routine.filter((r) => r.block === blk && appliesOn(r, d));
      if (!pend.length) continue;
      const when = at(d, blk === 'manha' ? ns.manha : ns.noite);
      if (when > now) out.push({ when, title: nome, body: `Falta${pend.length > 1 ? 'm' : ''} ${pend.length}: ${lista(pend)}`, kind: blk });
    }
  }

  // véspera da troca de casa
  for (let i = 1; i <= 8; i++) {
    const d = addDays(t, i);
    const antes = addDays(d, -1);
    const h = houseOn(d);
    const ha = houseOn(antes);
    if (!h || !ha || h === ha) continue;
    const when = at(antes, ns.troca);
    if (when > now) out.push({ when, title: 'Amanhã tem troca de casa', body: h === 'troca' ? 'Amanhã é dia de troca.' : `Amanhã você dorme na casa ${h === 'pai' ? 'do Papai' : 'da Mamãe'}.`, kind: 'troca' });
  }

  // tarefas com hora: 15 minutos antes
  for (const tk of state.tasks) {
    if (tk.done || !tk.due || !tk.time) continue;
    const when = new Date(at(tk.due, tk.time).getTime() - 15 * 60000);
    if (when > now && when - now < 8 * 86400000) out.push({ when, title: tk.text, body: `Daqui a 15 minutos (${tk.time})`, kind: 'tarefa' });
  }

  // véspera de prova ou trabalho, às 18h
  for (const e of upcoming(t, 12, 8)) {
    if (e.n < 1 || !['prova', 'trabalho'].includes(e.cat.id)) continue;
    const when = at(addDays(e.day, -1), '18:00');
    if (when > now) out.push({ when, title: `Amanhã: ${e.title}`, body: e.cat.label, kind: e.cat.id });
  }

  out.sort((a, b) => a.when - b.when);
  return out.slice(0, 60);
}

let timer = null;
let lastSig = '';
/** refaz os lembretes (com folga, para juntar várias mudanças seguidas) */
export function scheduleReminders() {
  if (!NATIVE) return;
  clearTimeout(timer);
  timer = setTimeout(apply, 900);
}

export async function notifPermission(ask = false) {
  const P = notifPlugin();
  if (!P) return 'indisponivel';
  try {
    let p = await P.checkPermissions();
    if (ask && p.display !== 'granted' && p.display !== 'denied') p = await P.requestPermissions();
    return p.display;
  } catch {
    return 'indisponivel';
  }
}

async function apply() {
  const P = notifPlugin();
  if (!P) return;
  const plan = buildPlan();
  const sig = JSON.stringify(plan.map((p) => [+p.when, p.title, p.body]));
  if (sig === lastSig) return;
  try {
    // na primeira vez o iOS pergunta se pode avisar (só se os lembretes estiverem ligados)
    const perm = await notifPermission(notifSettings().on);
    const pend = await P.getPending();
    if (pend && pend.notifications && pend.notifications.length) await P.cancel({ notifications: pend.notifications.map((n) => ({ id: n.id })) });
    if (perm === 'granted' && plan.length)
      await P.schedule({ notifications: plan.map((p, i) => ({ id: 1000 + i, title: p.title, body: p.body, schedule: { at: p.when, allowWhileIdle: true }, extra: { kind: p.kind } })) });
    lastSig = sig;
  } catch {}
}

/** aviso de teste em 5 segundos (Ajustes) */
export async function testReminder() {
  const P = notifPlugin();
  if (!P) return false;
  if ((await notifPermission(true)) !== 'granted') return false;
  await P.schedule({ notifications: [{ id: 999, title: 'Caderno', body: 'Os lembretes estão funcionando.', schedule: { at: new Date(Date.now() + 5000) } }] });
  return true;
}
