/**
 * 지도 모듈 – 전체 1,331개 해구 격자 시각화
 * Canvas 렌더러 (대량 폴리곤 성능 최적화)
 */
import { FORECAST_ELEMENTS, GRID, computeStat, circularMean, compassName, DIRECTION_OF, THRESHOLDS } from './data.js';

let map = null;
let gridGroup = null;
let zoneLayers = {};
let arrowLayers = {};   // zoneId → L.marker (방향 화살표)
let arrowGroup = null;
let favSet = new Set();      // 내 해구
let selectedId = null;       // 상세 시트가 열린 해구
let onZoneClick = null;
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; // 터치 기기는 툴팁 대신 상세 시트 사용
let peakMode = false;        // true: 예측 기간 내 최대값으로 표출
export function setZoneClickHandler(fn) { onZoneClick = fn; }
export function setHighlight({ favs, selected }) { if (favs) favSet = favs; if (selected !== undefined) selectedId = selected; }
export function setPeakMode(v) { peakMode = v; }
const ARROW_SVG = '<svg viewBox="-10 -10 20 20"><path d="M0,-8 L5.5,2 L1.6,0.8 L1.6,8 L-1.6,8 L-1.6,0.8 L-5.5,2 Z"/></svg>';
const H = GRID / 2;

/* ═══ 색상 스케일 ═══ */
function getScale(k) {
  const S = {
    wh_sig: [[0,[40,80,180]],[0.5,[40,140,220]],[1,[60,180,160]],[2,[100,200,80]],[3,[230,210,50]],[4,[230,140,30]],[6,[210,50,40]],[8,[160,20,60]]],
    ws: [[0,[60,100,180]],[5,[60,160,200]],[10,[80,200,120]],[15,[200,220,60]],[20,[240,160,30]],[25,[220,60,30]],[30,[170,30,70]]],
    tw: [[0,[20,30,120]],[5,[30,80,180]],[10,[40,140,200]],[15,[60,190,160]],[20,[180,210,80]],[25,[230,160,40]],[30,[210,50,30]]],
    vs: [[0,[180,30,30]],[2000,[220,120,40]],[5000,[220,200,60]],[10000,[80,180,120]],[15000,[40,120,200]],[20000,[40,80,180]]],
    wvprd_max: [[2,[40,100,200]],[5,[60,170,160]],[8,[140,200,80]],[12,[230,200,50]],[16,[220,100,30]],[20,[180,30,50]]],
  };
  return S[k] || [[0,[40,100,200]],[90,[60,180,120]],[180,[220,200,60]],[270,[220,100,40]],[360,[40,100,200]]];
}

export function valueToColor(v, k) {
  const s = getScale(k);
  if (v <= s[0][0]) return `rgb(${s[0][1]})`;
  if (v >= s[s.length-1][0]) return `rgb(${s[s.length-1][1]})`;
  for (let i = 0; i < s.length - 1; i++) {
    if (v >= s[i][0] && v <= s[i+1][0]) {
      const t = (v - s[i][0]) / (s[i+1][0] - s[i][0]);
      const c = s[i][1].map((c0, j) => Math.round(c0 + t * (s[i+1][1][j] - c0)));
      return `rgb(${c})`;
    }
  }
  return '#888';
}

/* ═══ 지도 초기화 ═══ */
export function initMap(containerId, zones) {
  map = L.map(containerId, {
    center: [35, 130], zoom: 5, minZoom: 3, maxZoom: 10,
    zoomControl: false, attributionControl: true,
    preferCanvas: true, renderer: L.canvas({ padding: 0.5 })
  });

  // 무료 공개 해양/해안선 지도 (Esri World Ocean Base, API 키 불필요 · 출처 표기 필수)
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 10, maxNativeZoom: 10,
    attribution: '&copy; Esri, GEBCO, NOAA, HERE, Geonames'
  }).addTo(map);
  map.attributionControl.setPrefix(false);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  gridGroup = L.layerGroup().addTo(map);

  zones.forEach(z => {
    const bounds = [[z.lat - H, z.lon - H], [z.lat + H, z.lon + H]];
    const rect = L.rectangle(bounds, {
      color: 'rgba(255,255,255,0.12)', weight: 0.4,
      fillColor: '#444', fillOpacity: 0.4,
      bubblingMouseEvents: false
    });
    rect._zid = z.id; rect._zlat = z.lat; rect._zlon = z.lon;
    if (!COARSE) rect.bindTooltip('', { sticky: true, className: 'zone-tip', direction: 'top', offset: [0, -8] });
    gridGroup.addLayer(rect);
    rect.on('click', () => { rect.closeTooltip(); onZoneClick && onZoneClick(String(z.id)); });
    zoneLayers[z.id] = rect;

    const arrow = L.marker([z.lat, z.lon], {
      icon: L.divIcon({ className: 'dir-arrow', html: `<div class="dir-arrow-inner">${ARROW_SVG}</div>`, iconSize: [0, 0] }),
      interactive: false, keyboard: false
    });
    arrowLayers[z.id] = arrow;
  });

  arrowGroup = L.layerGroup().addTo(map);
  map.on('zoomend', resizeArrows);
  resizeArrows();

  return map;
}

/* 줌에 맞춘 화살표 크기 (격자 한 칸 폭 기준, 너무 작으면 숨김) */
function resizeArrows() {
  const cellPx = 256 * Math.pow(2, map.getZoom()) * GRID / 360;
  const size = Math.min(22, Math.round(cellPx * 0.8));
  const el = map.getContainer();
  el.style.setProperty('--arrow-size', size + 'px');
  el.classList.toggle('arrows-hidden', cellPx < 9);
}

/* ═══ 격자 색상 업데이트 ═══ */
export function updateGrid(zoneValues, stepIndex, elemKey, statKey = 'mean') {
  const sd = zoneValues[stepIndex];
  if (!sd) return;
  const elem = FORECAST_ELEMENTS.find(e => e.key === elemKey);
  const ids = Object.keys(sd);
  const dirDef = DIRECTION_OF[elemKey];
  // 화살표 레이어는 방향 요소가 바뀔 때만 추가/제거 (스텝 이동 시 DOM 재생성 방지)
  if (!dirDef) arrowGroup.clearLayers();
  else if (arrowGroup.getLayers().length === 0) ids.forEach(id => arrowLayers[id] && arrowGroup.addLayer(arrowLayers[id]));
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const samples = sd[id][elemKey];
    let val = computeStat(samples, statKey);
    if (peakMode) {
      // 예측 기간 내 최악값: 시정은 최솟값, 그 외는 최댓값
      const worstLow = THRESHOLDS[elemKey] && THRESHOLDS[elemKey].dir === 'down';
      for (let k = 0; k < zoneValues.length; k++) {
        const v = computeStat(zoneValues[k][id][elemKey], statKey);
        val = worstLow ? Math.min(val, v) : Math.max(val, v);
      }
    }
    const rect = zoneLayers[id];
    if (!rect) continue;
    const color = valueToColor(val, elemKey);
    const isFav = favSet.has(id), isSel = selectedId === id;
    rect.setStyle(isSel
      ? { fillColor: color, fillOpacity: 0.7, color: '#ffffff', weight: 2.5 }
      : isFav
        ? { fillColor: color, fillOpacity: 0.6, color: '#ffd33d', weight: 2 }
        : { fillColor: color, fillOpacity: 0.55, color: color, weight: 0.5 });
    if (isSel || isFav) rect.bringToFront();
    const disp = elem.decimals > 0 ? val.toFixed(elem.decimals) : Math.round(val);
    let dirLine = '';
    if (dirDef) {
      const deg = circularMean(sd[id][dirDef.key]);
      dirLine = `<br>${dirDef.name}: ${compassName(deg)} (${Math.round(deg)}°)`;
      const arrow = arrowLayers[id];
      const inner = arrow && arrow.getElement() && arrow.getElement().firstChild;
      // 기상 관례상 방향은 "불어오는/오는 방향"이므로 진행 방향(+180°)으로 화살표 표시
      if (inner) inner.style.transform = `translate(-50%,-50%) rotate(${deg + 180}deg)`;
    }
    if (rect.getTooltip()) rect.setTooltipContent(
      `<b>해구 ${id}${isFav ? ' ★' : ''}</b><br>${elem.name}${peakMode ? '(기간 내 최악)' : ''}: ${disp}${elem.unit}${dirLine}<br><span style="color:#8b949e">예측 지점 ${samples.length}개 중 대표값 · ${rect._zlat}°N ${rect._zlon}°E</span>`
    );
  }
}

/* ═══ 범례 데이터 ═══ */
export function createLegend(elemKey) {
  const sc = getScale(elemKey);
  const elem = FORECAST_ELEMENTS.find(e => e.key === elemKey);
  return {
    title: `${elem.name} (${elem.unit})`,
    stops: sc.map(([stop, c]) => ({
      color: `rgb(${c})`,
      label: elem.decimals > 0 ? stop.toFixed(1) : String(Math.round(stop))
    }))
  };
}

export function getMap() { return map; }

/** 상세 시트에 가려지지 않도록 선택한 해구가 보이는 영역 중앙에 오게 지도 이동 */
export function revealZone(id, topInset, bottomInset) {
  const rect = zoneLayers[id];
  if (!rect) return;
  const p = map.latLngToContainerPoint(rect.getBounds().getCenter());
  const lo = topInset + 16, hi = map.getSize().y - bottomInset - 16;
  if (hi <= lo + 40) return;
  if (p.y > hi || p.y < lo) map.panBy([0, p.y - (lo + hi) / 2], { animate: true });
}

/** 해구 id 목록이 한 화면에 보이도록 이동 */
export function focusZones(ids) {
  const pts = ids.map(id => zoneLayers[id]).filter(Boolean).map(r => r.getBounds());
  if (!pts.length) return;
  let b = pts[0];
  pts.slice(1).forEach(x => { b = b.extend(x); });
  map.fitBounds(b, { padding: [60, 60], maxZoom: 8 });
}

