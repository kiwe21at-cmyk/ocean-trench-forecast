/**
 * 기상청 해구(海區) 데이터 모듈
 * - 대해구 13개 영역 (해양기상 광역예보구역 기준)
 * - 소해구: 대해구 내 0.5° 격자 분할
 * - 예측 요소: 유의파고(m), 풍속(m/s), 풍향(°), 파향(°), 최대파주기(s)
 * - 모의 예측 데이터: 1일 2회(00/12UTC), 3시간 간격, 72시간 예측
 */

// ═══════════════════════════════════════════
//  대해구 정의 (해양기상 광역예보구역)
// ═══════════════════════════════════════════
export const SEA_ZONES = [
  {
    id: 1, code: 'west_north',
    name: '서해북부', nameShort: '서해북',
    color: '#4a90d9',
    polygon: [
      [38.0, 124.0], [38.0, 126.0], [37.0, 126.5],
      [36.0, 126.0], [36.0, 124.0], [38.0, 124.0]
    ]
  },
  {
    id: 2, code: 'west_central',
    name: '서해중부', nameShort: '서해중',
    color: '#5ba0e0',
    polygon: [
      [38.0, 124.0], [36.0, 124.0], [36.0, 126.0],
      [36.5, 126.5], [37.5, 127.0], [38.0, 126.5],
      [38.0, 124.0]
    ]
  },
  {
    id: 3, code: 'west_south',
    name: '서해남부', nameShort: '서해남',
    color: '#6bb0e8',
    polygon: [
      [36.0, 124.0], [36.0, 126.0], [35.0, 126.5],
      [34.3, 126.5], [33.2, 124.5], [33.2, 124.0],
      [36.0, 124.0]
    ]
  },
  {
    id: 4, code: 'south_west',
    name: '남해서부', nameShort: '남서해',
    color: '#48b8a0',
    polygon: [
      [34.3, 126.5], [34.7, 127.8], [33.6, 127.8],
      [33.3, 127.1], [33.3, 125.9], [33.8, 126.0],
      [34.3, 126.5]
    ]
  },
  {
    id: 5, code: 'south_east',
    name: '남해동부', nameShort: '남동해',
    color: '#50c0a8',
    polygon: [
      [34.7, 127.8], [35.3, 129.3], [34.0, 130.2],
      [33.7, 130.2], [32.6, 127.8], [33.6, 127.8],
      [34.7, 127.8]
    ]
  },
  {
    id: 6, code: 'jeju',
    name: '제주도해상', nameShort: '제주',
    color: '#40a8d0',
    polygon: [
      [33.8, 125.5], [33.8, 127.5], [33.3, 127.5],
      [32.2, 127.8], [32.2, 124.5], [33.2, 124.5],
      [33.3, 125.5], [33.8, 125.5]
    ]
  },
  {
    id: 7, code: 'east_south',
    name: '동해남부', nameShort: '동해남',
    color: '#3080c0',
    polygon: [
      [35.3, 129.3], [37.1, 129.4], [37.1, 131.3],
      [33.7, 131.3], [33.7, 130.2], [34.0, 130.2],
      [35.3, 129.3]
    ]
  },
  {
    id: 8, code: 'east_central',
    name: '동해중부', nameShort: '동해중',
    color: '#2870b0',
    polygon: [
      [37.1, 129.4], [39.0, 128.5], [39.0, 131.3],
      [37.1, 131.3], [37.1, 129.4]
    ]
  },
  {
    id: 9, code: 'east_north',
    name: '동해북부', nameShort: '동해북',
    color: '#2060a0',
    polygon: [
      [39.0, 128.5], [41.0, 128.0], [41.0, 131.3],
      [39.0, 131.3], [39.0, 128.5]
    ]
  },
  {
    id: 10, code: 'daehwatoe',
    name: '대화퇴', nameShort: '대화퇴',
    color: '#3868a8',
    polygon: [
      [39.5, 133.5], [39.8, 134.2], [40.3, 135.5],
      [38.7, 135.5], [38.7, 133.0], [38.9, 133.0],
      [39.5, 133.5]
    ]
  },
  {
    id: 11, code: 'yeonghaejoo',
    name: '연해주', nameShort: '연해주',
    color: '#3050a0',
    polygon: [
      [39.7, 133.3], [39.7, 133.8], [41.5, 131.4],
      [42.0, 134.0], [45.8, 138.7], [45.5, 139.3],
      [44.6, 139.0], [40.5, 135.9], [39.7, 133.3]
    ]
  },
  {
    id: 12, code: 'kyushu',
    name: '규슈해상', nameShort: '규슈',
    color: '#5878b0',
    polygon: [
      [33.3, 127.9], [33.3, 129.5], [31.0, 131.0],
      [31.0, 129.5], [27.0, 127.5], [27.0, 126.0],
      [29.7, 127.5], [32.3, 127.5], [33.3, 127.9]
    ]
  },
  {
    id: 13, code: 'east_china',
    name: '동중국해', nameShort: '동중국',
    color: '#4070a8',
    polygon: [
      [29.7, 123.0], [29.7, 127.5], [27.0, 126.0],
      [27.0, 121.1], [29.7, 123.0]
    ]
  }
];

// ═══════════════════════════════════════════
//  예측 요소 정의
// ═══════════════════════════════════════════
export const FORECAST_ELEMENTS = [
  { key: 'wh_sig', name: '유의파고', unit: 'm', min: 0, max: 8, decimals: 1 },
  { key: 'ws', name: '풍속', unit: 'm/s', min: 0, max: 30, decimals: 1 },
  { key: 'wd', name: '풍향', unit: '°', min: 0, max: 360, decimals: 0 },
  { key: 'wvdr', name: '파향', unit: '°', min: 0, max: 360, decimals: 0 },
  { key: 'wvprd_max', name: '최대파주기', unit: 's', min: 0, max: 20, decimals: 1 },
  { key: 'tw', name: '수온', unit: '℃', min: 0, max: 30, decimals: 1 },
  { key: 'vs', name: '시정', unit: 'm', min: 0, max: 20000, decimals: 0 }
];

// ═══════════════════════════════════════════
//  소해구 격자 생성 (0.5° 격자)
// ═══════════════════════════════════════════

/**
 * 대해구 내에서 0.5° 격자를 생성하여 소해구 목록을 반환
 */
export function generateSubZones(zone) {
  const bounds = getPolygonBounds(zone.polygon);
  const subZones = [];
  const gridSize = 0.5;

  const latStart = Math.floor(bounds.minLat / gridSize) * gridSize;
  const lonStart = Math.floor(bounds.minLon / gridSize) * gridSize;

  let idx = 1;
  for (let lat = latStart; lat < bounds.maxLat; lat += gridSize) {
    for (let lon = lonStart; lon < bounds.maxLon; lon += gridSize) {
      const center = [lat + gridSize / 2, lon + gridSize / 2];
      if (pointInPolygon(center, zone.polygon)) {
        subZones.push({
          id: `${zone.id}_${idx}`,
          parentId: zone.id,
          parentName: zone.name,
          lat, lon,
          latEnd: lat + gridSize,
          lonEnd: lon + gridSize,
          center,
          polygon: [
            [lat, lon], [lat + gridSize, lon],
            [lat + gridSize, lon + gridSize], [lat, lon + gridSize],
            [lat, lon]
          ]
        });
        idx++;
      }
    }
  }
  return subZones;
}

function getPolygonBounds(polygon) {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  polygon.forEach(([lat, lon]) => {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  });
  return { minLat, maxLat, minLon, maxLon };
}

function pointInPolygon(point, polygon) {
  const [y, x] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// ═══════════════════════════════════════════
//  모의 예측 데이터 생성
// ═══════════════════════════════════════════

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * 72시간 예측 데이터 생성 (3시간 간격 = 25 스텝)
 * @param {string} baseUtc - '00' 또는 '12' (UTC 발표시각)
 * @returns {{ timeSteps: Array, zoneData: Object }}
 */
export function generateForecastData(baseUtc = '00') {
  const now = new Date();
  const baseDate = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    parseInt(baseUtc), 0, 0
  ));

  const TIME_STEPS = 25; // 0h ~ 72h, 3시간 간격
  const rng = seededRandom(20261113 + parseInt(baseUtc));

  const timeSteps = [];
  for (let i = 0; i < TIME_STEPS; i++) {
    const t = new Date(baseDate.getTime() + i * 3 * 3600 * 1000);
    timeSteps.push({
      index: i,
      hours: i * 3,
      utc: t.toISOString(),
      label: `+${String(i * 3).padStart(2, '0')}h`,
      dateLabel: `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:00`,
      kstLabel: (() => {
        const kst = new Date(t.getTime() + 9 * 3600 * 1000);
        return `${kst.getMonth() + 1}/${kst.getDate()} ${String(kst.getHours()).padStart(2, '0')}시`;
      })()
    });
  }

  const zoneData = {};

  SEA_ZONES.forEach(zone => {
    const subZones = generateSubZones(zone);
    const baseWh = 0.5 + rng() * 2.5;     // 기본 유의파고
    const baseWs = 3 + rng() * 12;         // 기본 풍속
    const baseTw = 10 + rng() * 15;        // 기본 수온
    const phase = rng() * Math.PI * 2;

    zoneData[zone.id] = {
      zone,
      subZones,
      steps: []
    };

    for (let step = 0; step < TIME_STEPS; step++) {
      const timeFactor = Math.sin(phase + (step / TIME_STEPS) * Math.PI * 2);
      const stormFactor = step > 8 && step < 16 ? 1.5 : 1.0;

      const subValues = subZones.map(sub => {
        const spatialNoise = rng() * 0.3 - 0.15;
        const whSig = Math.max(0, (baseWh + timeFactor * 1.5 + spatialNoise * 2) * stormFactor);
        const ws = Math.max(0, baseWs + timeFactor * 5 + spatialNoise * 3);
        const wd = Math.round((180 + rng() * 60 - 30 + step * 5) % 360);
        const wvdr = Math.round((200 + rng() * 40 - 20 + step * 3) % 360);
        const wvprdMax = Math.max(2, 6 + timeFactor * 3 + rng() * 2);
        const tw = Math.max(0, baseTw + Math.sin(phase + step * 0.1) * 2 + spatialNoise * 1);
        const vs = Math.max(500, 15000 - ws * 500 + rng() * 2000);

        return {
          subZoneId: sub.id,
          wh_sig: Math.round(whSig * 10) / 10,
          ws: Math.round(ws * 10) / 10,
          wd,
          wvdr,
          wvprd_max: Math.round(wvprdMax * 10) / 10,
          tw: Math.round(tw * 10) / 10,
          vs: Math.round(vs)
        };
      });

      // 대해구 통계 계산
      const stats = {};
      FORECAST_ELEMENTS.forEach(elem => {
        const vals = subValues.map(v => v[elem.key]).filter(v => v >= 0).sort((a, b) => a - b);
        const n = vals.length;
        if (n === 0) {
          stats[elem.key] = { min: 0, max: 0, mean: 0, p25: 0, p50: 0, p75: 0 };
          return;
        }
        const sum = vals.reduce((a, b) => a + b, 0);
        const pct = (p) => {
          const idx = (p / 100) * (n - 1);
          const lo = Math.floor(idx), hi = Math.ceil(idx);
          return lo === hi ? vals[lo] : vals[lo] + (vals[hi] - vals[lo]) * (idx - lo);
        };
        stats[elem.key] = {
          min: vals[0],
          max: vals[n - 1],
          mean: Math.round((sum / n) * 10) / 10,
          p25: Math.round(pct(25) * 10) / 10,
          p50: Math.round(pct(50) * 10) / 10,
          p75: Math.round(pct(75) * 10) / 10
        };
      });

      zoneData[zone.id].steps.push({
        stepIndex: step,
        subValues,
        stats
      });
    }
  });

  return { timeSteps, zoneData };
}

// ═══════════════════════════════════════════
//  통계 기준 정의
// ═══════════════════════════════════════════
export const STAT_CRITERIA = [
  { key: 'max', name: '최댓값', label: 'MAX' },
  { key: 'min', name: '최솟값', label: 'MIN' },
  { key: 'mean', name: '평균값', label: 'AVG' },
  { key: 'p25', name: '25%', label: 'P25' },
  { key: 'p50', name: '50%', label: 'P50' },
  { key: 'p75', name: '75%', label: 'P75' }
];
