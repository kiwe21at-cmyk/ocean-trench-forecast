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

// 세로 스크롤바 순서: 아래(최솟값) → 위(최댓값)
export const STAT_CRITERIA = [
  { key: 'min', name: '최솟값', label: 'MIN' },
  { key: 'p25', name: '25%', label: 'P25' },
  { key: 'p50', name: '중앙값', label: 'P50' },
  { key: 'mean', name: '평균값', label: 'AVG' },
  { key: 'p75', name: '75%', label: 'P75' },
  { key: 'max', name: '최댓값', label: 'MAX' }
];

// 해구 1개당 예측 지점(앙상블 멤버) 수 — 고해상도 예측이 격자 하나에 여러 지점을 포함하는 상황을 모의
export const ENSEMBLE_SIZE = 6;

function percentile(sorted, p) {
  const i = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** 해구 내 여러 예측 지점(samples) 중 선택한 기준으로 대표값 산출 */
export function computeStat(samples, statKey) {
  const s = [...samples].sort((a, b) => a - b);
  switch (statKey) {
    case 'min': return s[0];
    case 'max': return s[s.length - 1];
    case 'mean': return s.reduce((a, b) => a + b, 0) / s.length;
    case 'p25': return percentile(s, 25);
    case 'p50': return percentile(s, 50);
    case 'p75': return percentile(s, 75);
    default: return s[s.length - 1];
  }
}

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

      // 해구 중심값(기존 로직) — 앙상블 멤버들의 중심
      const center = {
        wh_sig: Math.max(0, (0.5 + lf * 1.5 + se * 3 + n * 1.5)),
        ws: Math.max(0, (3 + lf * 8 + se * 12 + n * 4)),
        wd: (220 + (z.lon - 125) * 5 + step * 8) % 360,
        wvdr: (200 + (z.lon - 125) * 3 + step * 5) % 360,
        wvprd_max: Math.max(2, (5 + lf * 4 + se * 4)),
        tw: Math.max(0, (25 - lf * 12 - se * 2 + Math.sin(t * Math.PI * 2) * 1.5 + n)),
        vs: Math.max(500, 15000 - (3 + lf * 8 + se * 12) * 400)
      };

      // 해구 1개 안의 고해상도 예측 지점(앙상블) ENSEMBLE_SIZE개를 중심값 주변 편차로 생성
      const zd = {};
      for (const key of Object.keys(center)) {
        const isAngle = key === 'wd' || key === 'wvdr';
        const spread = isAngle ? 15 : Math.abs(center[key]) * 0.12 + 0.3;
        const samples = [];
        for (let k = 0; k < ENSEMBLE_SIZE; k++) {
          const jitter = (rng() - 0.5) * 2 * spread;
          let v = center[key] + jitter;
          if (isAngle) v = ((v % 360) + 360) % 360;
          else v = Math.max(0, v);
          samples.push(Math.round(v * 10) / 10);
        }
        zd[key] = samples;
      }
      sd[z.id] = zd;
    }
    zoneValues.push(sd);
  }

  // 전체 통계 (각 스텝) — 해구별 대표값(앙상블 평균) 기준 전역 분포
  const globalStats = [];
  for (let step = 0; step < STEPS; step++) {
    const st = {};
    for (const e of FORECAST_ELEMENTS) {
      const v = ZONES.map(z => computeStat(zoneValues[step][z.id][e.key], 'mean')).sort((a, b) => a - b);
      const n = v.length, sum = v.reduce((a, b) => a + b, 0);
      const pct = p => { const i = p / 100 * (n - 1), lo = i | 0; return lo === Math.ceil(i) ? v[lo] : v[lo] + (v[lo + 1] - v[lo]) * (i - lo); };
      st[e.key] = { min: v[0], max: v[n - 1], mean: Math.round(sum / n * 10) / 10, p25: Math.round(pct(25) * 10) / 10, p50: Math.round(pct(50) * 10) / 10, p75: Math.round(pct(75) * 10) / 10 };
    }
    globalStats.push(st);
  }

  return { timeSteps, zoneValues, globalStats, zones: ZONES };
}
