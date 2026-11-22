/**
 * 기상청 해구(海區) 데이터 모듈
 * - 전체 대해구 1,331개 격자 (0.5° × 0.5°, zones.js 로드)
 * - 예측 요소: 유의파고, 풍속, 풍향, 파향, 최대파주기, 수온, 시정
 * - 모의 예측: 1시간 간격 12시간 (13 스텝) — 특정 해역 사용자를 위한 단기 예측
 */

import { ZONES } from './zones.js';
export { ZONES };

export const GRID = 0.5;

// 단기 예측 설정: 1시간 간격, 최대 12시간
export const STEP_HOURS = 1;
export const FORECAST_HOURS = 12;

// 위험 기준 (단순화한 값: 실제 특보 기준은 기상청 공지 확인 필요)
// dir: 'up' = 값이 클수록 위험, 'down' = 값이 작을수록 위험
export const THRESHOLDS = {
  wh_sig: { dir: 'up', caution: 2, warning: 3 },
  ws: { dir: 'up', caution: 10, warning: 14 },
  vs: { dir: 'down', caution: 3000, warning: 1000 }
};

/** 'ok' | 'caution' | 'warning' */
export function riskLevel(key, v) {
  const t = THRESHOLDS[key];
  if (!t) return 'ok';
  if (t.dir === 'up') return v >= t.warning ? 'warning' : v >= t.caution ? 'caution' : 'ok';
  return v <= t.warning ? 'warning' : v <= t.caution ? 'caution' : 'ok';
}

export const FORECAST_ELEMENTS = [
  { key: 'wh_sig', name: '유의파고', unit: 'm', min: 0, max: 8, decimals: 1 },
  { key: 'ws', name: '풍속', unit: 'm/s', min: 0, max: 30, decimals: 1 },
  { key: 'wd', name: '풍향', unit: '°', min: 0, max: 360, decimals: 0, hidden: true },
  { key: 'wvdr', name: '파향', unit: '°', min: 0, max: 360, decimals: 0, hidden: true },
  { key: 'wvprd_max', name: '최대파주기', unit: 's', min: 0, max: 20, decimals: 1 },
  { key: 'tw', name: '수온', unit: '℃', min: 0, max: 30, decimals: 1 },
  { key: 'vs', name: '시정', unit: 'm', min: 0, max: 20000, decimals: 0 }
];

// 요소 선택기에 노출되는 요소 (풍향·파향은 화살표로 표출하므로 제외)
export const SELECTABLE_ELEMENTS = FORECAST_ELEMENTS.filter(e => !e.hidden);

// 요소별 함께 표출할 방향 요소 (화살표): 풍속→풍향, 유의파고→파향
export const DIRECTION_OF = {
  ws: { key: 'wd', name: '풍향' },
  wh_sig: { key: 'wvdr', name: '파향' }
};

/** 각도 샘플의 원형 평균 (0~360°) */
export function circularMean(samples) {
  let x = 0, y = 0;
  for (const d of samples) { const r = d * Math.PI / 180; x += Math.cos(r); y += Math.sin(r); }
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

const COMPASS = ['북','북북동','북동','동북동','동','동남동','남동','남남동','남','남남서','남서','서남서','서','서북서','북서','북북서'];
export function compassName(deg) { return COMPASS[Math.round(deg / 22.5) % 16]; }

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
  if (!samples || !samples.length) return NaN;
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
  const STEPS = FORECAST_HOURS / STEP_HOURS + 1;
  const rng = seededRandom(20261113 + parseInt(baseUtc));

  const timeSteps = Array.from({ length: STEPS }, (_, i) => {
    const t = new Date(base.getTime() + i * STEP_HOURS * 3600000);
    const kst = new Date(t.getTime() + 9 * 3600000);
    return {
      index: i, hours: i * STEP_HOURS, utc: t.toISOString(),
      label: `+${String(i * STEP_HOURS).padStart(2, '0')}h`,
      kstLabel: `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} ${String(kst.getUTCHours()).padStart(2, '0')}시`
    };
  });

  // 폭풍 중심 (시간에 따라 이동)
  const sLat0 = 30 + rng() * 5, sLon0 = 128 + rng() * 4;

  // zoneValues[step][zoneId] = { wh_sig, ws, wd, wvdr, wvprd_max, tw, vs }
  const zoneValues = [];
  for (let step = 0; step < STEPS; step++) {
    const sd = {};
    const t = step / (STEPS - 1);
    const sLat = sLat0 + t * 2, sLon = sLon0 - t * 1;
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
        wd: (220 + (z.lon - 125) * 5 + step * STEP_HOURS * 2.7) % 360,
        wvdr: (200 + (z.lon - 125) * 3 + step * STEP_HOURS * 1.7) % 360,
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

  const globalStats = buildGlobalStats(zoneValues, ZONES);

  return { timeSteps, zoneValues, globalStats, zones: ZONES, mock: true };
}

/* ─── 전체 통계: 해구별 대표값 기준 전역 분포 (값이 없는 해구는 제외) ─── */
export function buildGlobalStats(zoneValues, zones) {
  return zoneValues.map(sd => {
    const st = {};
    for (const e of SELECTABLE_ELEMENTS) {
      const v = zones.map(z => computeStat(sd[z.id][e.key], 'mean')).filter(Number.isFinite).sort((a, b) => a - b);
      const n = v.length;
      if (!n) { st[e.key] = null; continue; }
      const sum = v.reduce((a, b) => a + b, 0);
      const pct = p => { const i = p / 100 * (n - 1), lo = i | 0; return lo === Math.ceil(i) ? v[lo] : v[lo] + (v[lo + 1] - v[lo]) * (i - lo); };
      const r = x => Math.round(x * 10) / 10;
      st[e.key] = { min: r(v[0]), max: r(v[n - 1]), mean: r(sum / n), p25: r(pct(25)), p50: r(pct(50)), p75: r(pct(75)) };
    }
    return st;
  });
}

/* ─── 실데이터(data.json, Open-Meteo) → 앱 데이터 구조 ─── */
export function buildDataFromForecast(json) {
  const nowSec = Date.now() / 1000;
  // 현재 시각 이하의 마지막 정시부터 표출 (데이터가 최대 3시간 묵었을 수 있음)
  let start = 0;
  json.times.forEach((t, i) => { if (t <= nowSec) start = i; });
  const count = Math.min(FORECAST_HOURS / STEP_HOURS + 1, json.times.length - start);

  const timeSteps = Array.from({ length: count }, (_, i) => {
    const t = json.times[start + i];
    const kst = new Date((t + 9 * 3600) * 1000);   // UTC getter 로 KST 계산 (실행 환경 시간대와 무관)
    return {
      index: i, hours: i * STEP_HOURS, utc: new Date(t * 1000).toISOString(),
      label: `+${String(i * STEP_HOURS).padStart(2, '0')}h`,
      kstLabel: `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} ${String(kst.getUTCHours()).padStart(2, '0')}시`
    };
  });

  const zoneValues = timeSteps.map((_, i) => {
    const sd = {};
    for (const z of ZONES) {
      const rec = json.zones[z.id] || {};
      const zd = {};
      for (const e of FORECAST_ELEMENTS) {
        const v = rec[e.key] ? rec[e.key][start + i] : null;
        zd[e.key] = v == null ? [] : [v];     // 값 없음 = 빈 배열
      }
      sd[z.id] = zd;
    }
    return sd;
  });

  return {
    timeSteps, zoneValues, globalStats: buildGlobalStats(zoneValues, ZONES), zones: ZONES,
    mock: false, generatedAt: json.generatedAt, source: json.source
  };
}

/** data.json 을 읽어 실데이터 구성. 없으면(로컬 개발 등) 모의 데이터로 대체하고 mock:true 로 표시 */
export async function loadForecastData() {
  try {
    const res = await fetch('data.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = buildDataFromForecast(await res.json());
    if (data.timeSteps.length < 2) throw new Error('예측 시간 부족');
    return data;
  } catch (e) {
    console.warn('data.json 로드 실패 → 모의 데이터 사용:', e);
    return generateForecastData('00');
  }
}
