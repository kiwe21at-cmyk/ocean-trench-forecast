/**
 * Open-Meteo(Marine + Forecast API)에서 한반도 주변 해구별 단기 예측을 받아 data.json으로 저장.
 * - 실행: node scripts/fetch-forecast.mjs [출력경로]   (Node 18+, 전역 fetch 사용)
 * - GitHub Actions에서 3시간마다 실행하여 Pages 아티팩트에 포함 (저장소에 커밋하지 않음)
 * - 데이터 출처: Open-Meteo.com (CC BY 4.0, 비상업적 무료 이용)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = process.argv[2] || 'data.json';
const HOURS = 16;          // 현재 시각부터 16시간 (갱신 주기 3h + 표출 12h + 여유)
const CHUNK = 150;         // 한 요청당 최대 좌표 수
const TZ_NOTE = 'times 는 UTC epoch(초)';

// zones.js 를 ES 모듈로 직접 읽어 해구 목록 확보
const zonesUrl = new URL('../js/zones.js', import.meta.url);
const { ZONES } = await import(fileURLToPath(zonesUrl));

const MARINE = {
  url: 'https://marine-api.open-meteo.com/v1/marine',
  vars: { wave_height: 'wh_sig', wave_direction: 'wvdr', wave_period: 'wvprd_max', sea_surface_temperature: 'tw' },
  extra: ''
};
const FORECAST = {
  url: 'https://api.open-meteo.com/v1/forecast',
  vars: { wind_speed_10m: 'ws', wind_direction_10m: 'wd', visibility: 'vs' },
  extra: '&wind_speed_unit=ms'
};

async function getJson(url, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'ocean-trench-forecast-ci' } });
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } catch (e) { lastErr = e; }
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  throw lastErr;
}

async function fetchGroup(group, zones, out) {
  let times = null;
  for (let i = 0; i < zones.length; i += CHUNK) {
    const part = zones.slice(i, i + CHUNK);
    const url = `${group.url}?latitude=${part.map(z => z.lat).join(',')}&longitude=${part.map(z => z.lon).join(',')}` +
      `&hourly=${Object.keys(group.vars).join(',')}&forecast_hours=${HOURS}&timeformat=unixtime${group.extra}`;
    let res = await getJson(url);
    if (!Array.isArray(res)) res = [res];       // 좌표 1개일 때는 객체로 옴
    if (res.length !== part.length) throw new Error(`응답 수 불일치: ${res.length} != ${part.length}`);
    res.forEach((r, k) => {
      const id = part[k].id;
      times = times || r.hourly.time;
      const rec = out[id] || (out[id] = {});
      for (const [apiKey, ourKey] of Object.entries(group.vars)) rec[ourKey] = r.hourly[apiKey];
    });
    await new Promise(r => setTimeout(r, 500));
  }
  return times;
}

const zones = {};
const t1 = await fetchGroup(MARINE, ZONES, zones);
const t2 = await fetchGroup(FORECAST, ZONES, zones);
if (t1.length !== t2.length || t1[0] !== t2[0]) throw new Error('Marine/Forecast 시간축 불일치');

// 정상성 검사: 파고 값이 하나라도 있는 해구가 너무 적으면 실패 처리 (이전 배포 유지)
const withWave = Object.values(zones).filter(z => z.wh_sig && z.wh_sig.some(v => v != null)).length;
const withWind = Object.values(zones).filter(z => z.ws && z.ws.some(v => v != null)).length;
if (withWave < ZONES.length * 0.7 || withWind < ZONES.length * 0.9) {
  throw new Error(`유효 데이터 부족: wave ${withWave}/${ZONES.length}, wind ${withWind}/${ZONES.length}`);
}

// 소수점 정리로 용량 절감
const round = (v, d) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d;
const digits = { wh_sig: 2, wvdr: 0, wvprd_max: 1, tw: 1, ws: 1, wd: 0, vs: 0 };
for (const rec of Object.values(zones)) for (const k of Object.keys(rec)) rec[k] = rec[k].map(v => round(v, digits[k]));

const payload = {
  source: 'Open-Meteo (Marine API, Forecast API) · CC BY 4.0',
  note: TZ_NOTE,
  generatedAt: Math.floor(Date.now() / 1000),
  times: t1,
  zones
};
writeFileSync(OUT, JSON.stringify(payload));
console.log(`저장: ${OUT} · 해구 ${ZONES.length}개 (파고 ${withWave}, 풍속 ${withWind}) · 시간 ${t1.length}개 · ${(JSON.stringify(payload).length / 1024).toFixed(0)}KB`);
