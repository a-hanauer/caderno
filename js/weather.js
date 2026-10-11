// Previsão do tempo (Open-Meteo: gratuito, sem chave). Guarda a última resposta para funcionar offline.
import { state } from './store.js';

const KEY = 'caderno:v1:wx';
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
};

export function wxPlace() {
  const p = state.settings.wx;
  return p && typeof p.lat === 'number' && typeof p.lon === 'number' ? p : null;
}

/** previsão guardada para o lugar atual (ou null) */
export function getWx() {
  const p = wxPlace();
  const c = read();
  if (!p || !c || c.lat !== p.lat || c.lon !== p.lon) return null;
  return c;
}
export const wxDay = (d) => getWx()?.days?.find((x) => x.d === d) || null;

let inflight = null;
/** atualiza se a cópia tiver mais de 1 hora. Nunca lança erro. */
export function refreshWx(force = false) {
  const p = wxPlace();
  if (!p) return Promise.resolve(null);
  const c = getWx();
  if (!force && c && Date.now() - c.at < 3600000) return Promise.resolve(null);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(null);
  if (inflight) return inflight;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=8`;
  inflight = fetch(url, { cache: 'no-store' })
    .then((r) => r.json())
    .then((d) => {
      if (!d || !d.daily || !Array.isArray(d.daily.time)) return null;
      const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
      const out = {
        at: Date.now(),
        lat: p.lat,
        lon: p.lon,
        cur: d.current ? { t: num(d.current.temperature_2m), code: num(d.current.weather_code), day: d.current.is_day !== 0 } : null,
        days: d.daily.time.map((t, i) => ({ d: t, code: num(d.daily.weather_code?.[i]), max: num(d.daily.temperature_2m_max?.[i]), min: num(d.daily.temperature_2m_min?.[i]), rain: num(d.daily.precipitation_probability_max?.[i]) })),
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(out));
      } catch {}
      return out;
    })
    .catch(() => null)
    .finally(() => (inflight = null));
  return inflight;
}

/** código WMO -> ícone, nome e cor do destaque */
export function wxKind(code, day = true) {
  if (code === null || code === undefined) return null;
  if (code === 0) return day ? { icon: 'sol', label: 'Céu limpo', acc: '#ffc928' } : { icon: 'lua', label: 'Céu limpo', acc: '#ffe08a' };
  if (code <= 2) return day ? { icon: 'solnuvem', label: 'Poucas nuvens', acc: '#ffc928' } : { icon: 'luanuvem', label: 'Poucas nuvens', acc: '#ffe08a' };
  if (code === 3) return { icon: 'nuvem', label: 'Nublado', acc: '#c9d3e2' };
  if (code === 45 || code === 48) return { icon: 'neblina', label: 'Neblina', acc: '#c9d3e2' };
  if (code >= 51 && code <= 57) return { icon: 'chuvisco', label: 'Garoa', acc: '#8ec2ff' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { icon: 'chuva', label: 'Chuva', acc: '#8ec2ff' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: 'neve', label: 'Neve', acc: '#e6f2ff' };
  if (code >= 95) return { icon: 'trovao', label: 'Tempestade', acc: '#ffd84d' };
  return { icon: 'nuvem', label: 'Nublado', acc: '#c9d3e2' };
}

export const deg = (v) => (v === null || v === undefined ? '' : `${Math.round(v)}°`);

/** busca cidades pelo nome (para os Ajustes) */
export async function searchPlace(q) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=pt&format=json`, { cache: 'no-store' });
  const d = await r.json();
  return (d.results || []).map((x) => ({ name: x.name, region: [x.admin1, x.country_code].filter(Boolean).join(' · '), lat: Math.round(x.latitude * 1000) / 1000, lon: Math.round(x.longitude * 1000) / 1000 }));
}
