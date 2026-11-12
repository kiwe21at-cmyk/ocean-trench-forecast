/**
 * 기상청 해구(海區) 데이터 모듈
 * - 전체 대해구 1,331개 격자 (0.5° × 0.5°, zones.js 로드)
 * - 예측 요소: 유의파고, 풍속, 풍향, 파향, 최대파주기, 수온, 시정
 * - 모의 예측: 3시간 간격 72시간 (25 스텝)
 */

import { ZONES } from './zones.js';
export { ZONES };

export const GRID = 0.5;

export const FORECAST_ELEMENTS = [
  { key: 'wh_sig', name: '유의파고', unit: 'm', min: 0, max: 8, decimals: 1 },
  { key: 'ws', name: '풍속', unit: 'm/s', min: 0, max: 30, decimals: 1 },
  { key: 'wd', name: '풍향', unit: '°', min: 0, max: 360, decimals: 0 },
  { key: 'wvdr', name: '파향', unit: '°', min: 0, max: 360, decimals: 0 },
  { key: 'wvprd_max', name: '최대파주기', unit: 's', min: 0, max: 20, decimals: 1 },
  { key: 'tw', name: '수온', unit: '℃', min: 0, max: 30, decimals: 1 },
  { key: 'vs', name: '시정', unit: 'm', min: 0, max: 20000, decimals: 0 }
];

export const STAT_CRITERIA = [
  { key: 'max', name: '최댓값', label: 'MAX' },
  { key: 'min', name: '최솟값', label: 'MIN' },
  { key: 'mean', name: '평균값', label: 'AVG' },
  { key: 'p25', name: '25%', label: 'P25' },
  { key: 'p50', name: '50%', label: 'P50' },
  { key: 'p75', name: '75%', label: 'P75' }
];

/* ─── seeded PRNG ─── */
function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/* ─── 모의 예측 데이터 생성 ─── */
export function generateForecastData(baseUtc = '00') {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), parseInt(baseUtc)));
  const STEPS = 25;
  const rng = seededRandom(20261113 + parseInt(baseUtc));

  const timeSteps = Array.from({ length: STEPS }, (_, i) => {
    const t = new Date(base.getTime() + i * 3 * 3600000);
    const kst = new Date(t.getTime() + 9 * 3600000);
    return {
      index: i, hours: i * 3, utc: t.toISOString(),
      label: `+${String(i * 3).padStart(2, '0')}h`,
      kstLabel: `${kst.getMonth() + 1}/${kst.getDate()} ${String(kst.getHours()).padStart(2, '0')}시`
    };
  });

  // 폭풍 중심 (시간에 따라 이동)
  const sLat0 = 30 + rng() * 5, sLon0 = 128 + rng() * 4;

  // zoneValues[step][zoneId] = { wh_sig, ws, wd, wvdr, wvprd_max, tw, vs }
  const zoneValues = [];
  for (let step = 0; step < STEPS; step++) {
    const sd = {};
    const t = step / STEPS;
    const sLat = sLat0 + t * 8, sLon = sLon0 - t * 3;
    const sInt = Math.sin(t * Math.PI) * 1.5;
    for (const z of ZONES) {
      const dist2 = (z.lat - sLat) ** 2 + (z.lon - sLon) ** 2;
      const se = Math.max(0, sInt * Math.exp(-dist2 / 50));
      const lf = (z.lat - 25) / 20;
      const n = rng() * 0.3 - 0.15;
      sd[z.id] = {
        wh_sig: Math.max(0, Math.round((0.5 + lf * 1.5 + se * 3 + n * 1.5) * 10) / 10),
        ws: Math.max(0, Math.round((3 + lf * 8 + se * 12 + n * 4) * 10) / 10),
        wd: Math.round((220 + (z.lon - 125) * 5 + step * 8 + rng() * 30) % 360),
        wvdr: Math.round((200 + (z.lon - 125) * 3 + step * 5 + rng() * 20) % 360),
        wvprd_max: Math.max(2, Math.round((5 + lf * 4 + se * 4 + rng() * 2) * 10) / 10),
        tw: Math.max(0, Math.round((25 - lf * 12 - se * 2 + Math.sin(t * Math.PI * 2) * 1.5 + n) * 10) / 10),
        vs: Math.max(500, Math.round(15000 - (3 + lf * 8 + se * 12) * 400 + rng() * 2000))
      };
    }
    zoneValues.push(sd);
  }

  // 전체 통계 (각 스텝)
  const globalStats = [];
  for (let step = 0; step < STEPS; step++) {
    const st = {};
    for (const e of FORECAST_ELEMENTS) {
      const v = ZONES.map(z => zoneValues[step][z.id][e.key]).sort((a, b) => a - b);
      const n = v.length, sum = v.reduce((a, b) => a + b, 0);
      const pct = p => { const i = p / 100 * (n - 1), lo = i | 0; return lo === Math.ceil(i) ? v[lo] : v[lo] + (v[lo + 1] - v[lo]) * (i - lo); };
      st[e.key] = { min: v[0], max: v[n - 1], mean: Math.round(sum / n * 10) / 10, p25: Math.round(pct(25) * 10) / 10, p50: Math.round(pct(50) * 10) / 10, p75: Math.round(pct(75) * 10) / 10 };
    }
    globalStats.push(st);
  }

  return { timeSteps, zoneValues, globalStats, zones: ZONES };
}
