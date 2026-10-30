// Ponte com o app iOS (Capacitor). No site, tudo aqui fica desligado.
export const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

// O app não usa empacotador (bundler), então o runtime JS do @capacitor/core não está carregado:
// só existe a ponte nativa (window.Capacitor.nativePromise / nativeCallback). Este é um registerPlugin mínimo sobre ela.
export function plugin(name) {
  const C = window.Capacitor;
  if (!NATIVE || !C) return null;
  if (typeof C.registerPlugin === 'function') {
    try {
      return C.registerPlugin(name);
    } catch {}
  }
  if (typeof C.nativePromise !== 'function') return null;
  return new Proxy(
    {},
    {
      get(_, method) {
        if (method === 'then') return undefined; // não é uma promise
        if (method === 'addListener')
          return (eventName, fn) => {
            const id = C.nativeCallback(name, 'addListener', { eventName }, (data) => fn(data));
            return Promise.resolve({ remove: () => C.nativePromise(name, 'removeListener', { callbackId: id, eventName }) });
          };
        return (opts = {}) => C.nativePromise(name, String(method), opts);
      },
    }
  );
}

let cal = null;
/** plugin Swift que lê a agenda do iPhone (EventKit). null no site ou se o plugin não estiver no app. */
export function calPlugin() {
  if (!NATIVE) return null;
  if (!cal) cal = plugin('CadernoCalendar');
  return cal;
}

// agendas do iPhone escolhidas neste aparelho (os ids do iOS valem só aqui, não vão no backup)
const KEY = 'caderno:v1:ical';
export function iphoneCalIds() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function setIphoneCalIds(ids) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 60)));
  } catch {}
}
/** a agenda vem do iPhone? (app nativo + pelo menos uma agenda escolhida) */
export const usingIphoneCal = () => NATIVE && iphoneCalIds().length > 0;

// ---------- vibração (Haptics) ----------
let hp = null;
const haptics = () => {
  if (!NATIVE) return null;
  if (!hp) hp = plugin('Haptics');
  return hp;
};
/** 'light' (marcar, trocar de aba) · 'success' (rotina completa) · 'error' (PIN errado) */
export function haptic(kind = 'light') {
  const p = haptics();
  if (!p) return;
  try {
    const r = kind === 'success' ? p.notification({ type: 'SUCCESS' }) : kind === 'error' ? p.notification({ type: 'ERROR' }) : p.impact({ style: 'LIGHT' });
    r && r.catch && r.catch(() => {});
  } catch {}
}

// ---------- notificações locais ----------
let ln = null;
export function notifPlugin() {
  if (!NATIVE) return null;
  if (!ln) ln = plugin('LocalNotifications');
  return ln;
}
