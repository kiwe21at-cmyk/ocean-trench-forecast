/**
 * 지도 모듈 - Leaflet 기반 해구 영역 시각화
 * 기상 일기도 스타일: 등치선(isobar) 테두리 + 예측값 기반 색상
 */

import { SEA_ZONES, FORECAST_ELEMENTS } from './data.js';

let map = null;
let zoneLayerGroups = {};  // { zoneId: { main, glow, inner, subZones[], label } }
let currentElement = null;
let showSubZones = false;

// ═══════════════════════════════════════════
//  색상 스케일 (요소별 자동 적용)
// ═══════════════════════════════════════════

function getColorScale(elementKey) {
  // 유의파고 (파랑 → 빨강)
  if (elementKey === 'wh_sig') {
    return [
      { stop: 0, color: [40, 80, 180] },
      { stop: 0.5, color: [40, 140, 220] },
      { stop: 1.0, color: [60, 180, 160] },
      { stop: 2.0, color: [100, 200, 80] },
      { stop: 3.0, color: [230, 210, 50] },
      { stop: 4.0, color: [230, 140, 30] },
      { stop: 6.0, color: [210, 50, 40] },
      { stop: 8.0, color: [160, 20, 60] }
    ];
  }
  // 풍속
  if (elementKey === 'ws') {
    return [
      { stop: 0, color: [60, 100, 180] },
      { stop: 5, color: [60, 160, 200] },
      { stop: 10, color: [80, 200, 120] },
      { stop: 15, color: [200, 220, 60] },
      { stop: 20, color: [240, 160, 30] },
      { stop: 25, color: [220, 60, 30] },
      { stop: 30, color: [170, 30, 70] }
    ];
  }
  // 수온
  if (elementKey === 'tw') {
    return [
      { stop: 0, color: [20, 30, 120] },
      { stop: 5, color: [30, 80, 180] },
      { stop: 10, color: [40, 140, 200] },
      { stop: 15, color: [60, 190, 160] },
      { stop: 20, color: [180, 210, 80] },
      { stop: 25, color: [230, 160, 40] },
      { stop: 30, color: [210, 50, 30] }
    ];
  }
  // 시정
  if (elementKey === 'vs') {
    return [
      { stop: 0, color: [180, 30, 30] },
      { stop: 2000, color: [220, 120, 40] },
      { stop: 5000, color: [220, 200, 60] },
      { stop: 10000, color: [80, 180, 120] },
      { stop: 15000, color: [40, 120, 200] },
      { stop: 20000, color: [40, 80, 180] }
    ];
  }
  // 파주기
  if (elementKey === 'wvprd_max') {
    return [
      { stop: 2, color: [40, 100, 200] },
      { stop: 5, color: [60, 170, 160] },
      { stop: 8, color: [140, 200, 80] },
      { stop: 12, color: [230, 200, 50] },
      { stop: 16, color: [220, 100, 30] },
      { stop: 20, color: [180, 30, 50] }
    ];
  }
  // 방향 (풍향/파향) — 순환형
  return [
    { stop: 0, color: [40, 100, 200] },
    { stop: 90, color: [60, 180, 120] },
    { stop: 180, color: [220, 200, 60] },
    { stop: 270, color: [220, 100, 40] },
    { stop: 360, color: [40, 100, 200] }
  ];
}

export function valueToColor(value, elementKey) {
  const scale = getColorScale(elementKey);
  let lower = scale[0], upper = scale[scale.length - 1];
  for (let i = 0; i < scale.length - 1; i++) {
    if (value >= scale[i].stop && value <= scale[i + 1].stop) {
      lower = scale[i];
      upper = scale[i + 1];
      break;
    }
  }
  if (value <= scale[0].stop) { lower = upper = scale[0]; }
  if (value >= scale[scale.length - 1].stop) { lower = upper = scale[scale.length - 1]; }

  const range = upper.stop - lower.stop || 1;
  const t = Math.max(0, Math.min(1, (value - lower.stop) / range));
  const r = Math.round(lower.color[0] + t * (upper.color[0] - lower.color[0]));
  const g = Math.round(lower.color[1] + t * (upper.color[1] - lower.color[1]));
  const b = Math.round(lower.color[2] + t * (upper.color[2] - lower.color[2]));
  return `rgb(${r},${g},${b})`;
}

// 일기도 스타일 등치선 대시 패턴
function contourDash(value, elementKey) {
  const elem = FORECAST_ELEMENTS.find(e => e.key === elementKey);
  if (!elem) return null;
  const norm = (value - elem.min) / (elem.max - elem.min);
  if (norm < 0.25) return '10 5 3 5';  // 점선(약)
  if (norm < 0.5) return '14 5';       // 파선
  if (norm < 0.75) return '8 4';       // 단파선
  return null;                          // 실선(강)
}

// ═══════════════════════════════════════════
//  지도 초기화
// ═══════════════════════════════════════════

export function initMap(containerId) {
  map = L.map(containerId, {
    center: [35.5, 128.5],
    zoom: 5,
    minZoom: 4,
    maxZoom: 10,
    zoomControl: false,
    attributionControl: false,
    preferCanvas: true
  });

  // 다크 해양 테마
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(map);

  L.control.zoom({ position: 'topleft' }).addTo(map);

  // 대해구 레이어 생성
  SEA_ZONES.forEach(zone => {
    const latlngs = zone.polygon.map(c => [c[0], c[1]]);
    const group = {};

    // 외곽 글로우 (등치선 외곽)
    group.glow = L.polygon(latlngs, {
      color: 'rgba(255,255,255,0.12)',
      weight: 7,
      fill: false,
      smoothFactor: 1.5,
      interactive: false
    }).addTo(map);

    // 메인 폴리곤
    group.main = L.polygon(latlngs, {
      color: '#aaa',
      weight: 2,
      dashArray: '10 5 3 5',
      fillColor: zone.color,
      fillOpacity: 0.35,
      smoothFactor: 1.5
    }).addTo(map);

    // 이너 등치선
    group.inner = L.polygon(latlngs, {
      color: 'rgba(255,255,255,0.06)',
      weight: 1,
      dashArray: '4 8',
      fill: false,
      smoothFactor: 1.5,
      interactive: false
    }).addTo(map);

    // 라벨
    const center = group.main.getBounds().getCenter();
    group.label = L.marker(center, {
      icon: L.divIcon({
        className: 'zone-label',
        html: `<div class="zone-label-inner">
          <span class="zone-name">${zone.name}</span>
          <span class="zone-value" id="val-${zone.id}">--</span>
        </div>`,
        iconSize: [100, 44],
        iconAnchor: [50, 22]
      }),
      interactive: false,
      pane: 'tooltipPane'
    }).addTo(map);

    // 팝업
    group.main.bindPopup('', { className: 'dark-popup', maxWidth: 280 });

    group.subLayers = [];
    zoneLayerGroups[zone.id] = group;
  });

  // 줌 레벨에 따라 소해구 표시 전환
  map.on('zoomend', () => {
    const zoom = map.getZoom();
    toggleSubZoneVisibility(zoom >= 7);
  });

  return map;
}

function toggleSubZoneVisibility(show) {
  showSubZones = show;
  Object.values(zoneLayerGroups).forEach(group => {
    group.subLayers.forEach(layer => {
      if (show) {
        if (!map.hasLayer(layer)) map.addLayer(layer);
      } else {
        if (map.hasLayer(layer)) map.removeLayer(layer);
      }
    });
  });
}

// ═══════════════════════════════════════════
//  소해구 격자 레이어 추가
// ═══════════════════════════════════════════

export function addSubZoneLayers(zoneId, subZones) {
  const group = zoneLayerGroups[zoneId];
  if (!group) return;

  // 기존 제거
  group.subLayers.forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
  group.subLayers = [];

  subZones.forEach(sub => {
    const latlngs = sub.polygon.map(c => [c[0], c[1]]);
    const layer = L.polygon(latlngs, {
      color: 'rgba(255,255,255,0.15)',
      weight: 0.5,
      fillColor: '#555',
      fillOpacity: 0.3,
      smoothFactor: 0.5,
      className: `sub-zone sub-${sub.id}`
    });

    if (showSubZones) layer.addTo(map);
    group.subLayers.push(layer);
  });
}

// ═══════════════════════════════════════════
//  해구 색상/값 업데이트
// ═══════════════════════════════════════════

/**
 * @param {Object} zoneData - generateForecastData().zoneData
 * @param {number} stepIndex - 시간 스텝
 * @param {string} elementKey - 예측 요소 (wh_sig 등)
 * @param {string} statKey - 통계 기준 (max, min, mean, p25, p50, p75)
 */
export function updateZoneDisplay(zoneData, stepIndex, elementKey, statKey) {
  currentElement = elementKey;
  const elem = FORECAST_ELEMENTS.find(e => e.key === elementKey);

  Object.keys(zoneData).forEach(zoneIdStr => {
    const zoneId = parseInt(zoneIdStr);
    const data = zoneData[zoneId];
    const step = data.steps[stepIndex];
    if (!step) return;

    const value = step.stats[elementKey]?.[statKey];
    if (value === undefined) return;

    const color = valueToColor(value, elementKey);
    const dash = contourDash(value, elementKey);
    const group = zoneLayerGroups[zoneId];
    if (!group) return;

    // 대해구 스타일 업데이트
    group.main.setStyle({
      fillColor: color,
      fillOpacity: 0.5,
      color: color,
      weight: 2.5,
      dashArray: dash
    });
    group.glow.setStyle({
      color: color,
      weight: 7,
      opacity: 0.2
    });
    group.inner.setStyle({
      color: color,
      opacity: 0.25
    });

    // 라벨 업데이트
    const labelEl = document.getElementById(`val-${zoneId}`);
    if (labelEl) {
      const displayVal = elem.decimals > 0 ? value.toFixed(elem.decimals) : Math.round(value);
      labelEl.textContent = `${displayVal}${elem.unit}`;
      labelEl.style.color = color;
    }

    // 팝업 내용 업데이트
    const stats = step.stats[elementKey];
    const zone = SEA_ZONES.find(z => z.id === zoneId);
    group.main.setPopupContent(`
      <div class="popup-content">
        <div class="popup-title">${zone.name}</div>
        <div class="popup-elem">${elem.name} (${elem.unit})</div>
        <div class="popup-stats">
          <div class="stat-row"><span>최솟값</span><span>${stats.min}</span></div>
          <div class="stat-row"><span>25%</span><span>${stats.p25}</span></div>
          <div class="stat-row"><span>평균</span><span>${stats.mean}</span></div>
          <div class="stat-row"><span>50%</span><span>${stats.p50}</span></div>
          <div class="stat-row"><span>75%</span><span>${stats.p75}</span></div>
          <div class="stat-row"><span>최댓값</span><span>${stats.max}</span></div>
        </div>
        <div class="popup-sub">소해구 ${data.subZones.length}개</div>
      </div>
    `);

    // 소해구 색상 업데이트
    if (group.subLayers.length > 0) {
      step.subValues.forEach((sv, i) => {
        if (group.subLayers[i]) {
          const subColor = valueToColor(sv[elementKey], elementKey);
          group.subLayers[i].setStyle({
            fillColor: subColor,
            fillOpacity: 0.45,
            color: subColor,
            weight: 0.5
          });
        }
      });
    }
  });
}

// ═══════════════════════════════════════════
//  범례 생성
// ═══════════════════════════════════════════

export function createLegend(elementKey) {
  const scale = getColorScale(elementKey);
  const elem = FORECAST_ELEMENTS.find(e => e.key === elementKey);
  const stops = scale.map((s, i) => {
    const color = `rgb(${s.color.join(',')})`;
    const label = elem.decimals > 0 ? s.stop.toFixed(1) : Math.round(s.stop);
    return { color, label: `${label}` };
  });
  return { title: `${elem.name} (${elem.unit})`, stops };
}

export function getMap() { return map; }
