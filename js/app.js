/**
 * 앱 메인 모듈 - SPA 컨트롤러
 * 전체 1,331개 해구 격자 + 우측 패널 + 하단 플레이바
 */
import { ZONES, FORECAST_ELEMENTS, SELECTABLE_ELEMENTS, STAT_CRITERIA, DIRECTION_OF, FORECAST_HOURS, STEP_HOURS, THRESHOLDS, riskLevel, computeStat, circularMean, compassName, generateForecastData } from './data.js';
import { initMap, updateGrid, createLegend, setZoneClickHandler, setHighlight, setPeakMode, focusZones } from './map.js';

const state = {
  data: null, currentStep: 0, currentElement: 'wh_sig',
  currentStat: 'max', peak: false, selectedZone: null, favs: loadFavs(), isPlaying: false, playInterval: null,
  playSpeed: 1000, panelOpen: false
};

/* ═══ 초기화 ═══ */
export function initApp() {
  document.getElementById('loading').style.display = 'flex';
  setTimeout(() => {
    state.data = generateForecastData('00');
    initMap('map-container', state.data.zones);
    setZoneClickHandler(openZone);
    setHighlight({ favs: state.favs });
    buildHeader(); buildPanel(); buildPlaybar(); buildLegend(); buildStatScroll();
    updateDisplay();
    if (state.favs.size) focusZones([...state.favs]);
    document.getElementById('loading').style.display = 'none';
  }, 50);
}

/* ═══ 헤더 ═══ */
function buildHeader() {
  const h = document.getElementById('header');
  const ts = state.data.timeSteps[0];
  h.innerHTML = `
    <div class="header-left">
      <div class="header-title">해구별 예측정보</div>
      <div class="header-sub">기준: ${ts.kstLabel} (KST) | 해구 ${ZONES.length}개 | 0.5° 격자</div>
    </div>
    <div class="header-right">
    <div class="elem-picker" id="elem-picker">
      <button class="elem-picker-compact" id="elem-picker-compact" aria-label="예측 요소 변경">
        <span class="elem-picker-name" id="elem-picker-name"></span>
        <span class="elem-picker-chevron">▾</span>
      </button>
      <div class="elem-picker-list" id="elem-picker-list">
        ${SELECTABLE_ELEMENTS.map(e => `<button class="elem-picker-option" data-elem="${e.key}">${e.name}<span class="option-unit">${e.unit}</span></button>`).join('')}
      </div>
    </div>
    <button class="panel-toggle-btn" id="panel-toggle" aria-label="설정">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        <circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>
      </svg>
    </button>
    </div>`;
  document.getElementById('panel-toggle').addEventListener('click', togglePanel);
}

/* ═══ 패널 ═══ */
function buildPanel() {
  const p = document.getElementById('side-panel');
  let html = `<div class="panel-header"><span>설정</span><button class="panel-close-btn" id="panel-close">&times;</button></div><div class="panel-body">`;

  // 내 해구
  html += `<div class="panel-section"><div class="panel-section-title">내 해구 ★</div><div id="fav-list" class="panel-options"></div></div>`;

  // 속도
  html += `<div class="panel-section"><div class="panel-section-title">재생 속도</div><div class="speed-control">
    <input type="range" id="speed-slider" min="200" max="3000" step="100" value="${state.playSpeed}" class="speed-slider">
    <div class="speed-labels"><span>빠름</span><span id="speed-value">${(state.playSpeed/1000).toFixed(1)}s</span><span>느림</span></div>
  </div></div>`;

  // 정보
  html += `<div class="panel-section panel-info"><div class="panel-section-title">데이터 정보</div>
    <div class="info-item">모델: 지역파랑예측모델(RWW3)</div>
    <div class="info-item">격자: 0.5° × 0.5° (약 50km)</div>
    <div class="info-item">해구: ${ZONES.length}개</div>
    <div class="info-item">발표: 1일 2회 (00/12 UTC)</div>
    <div class="info-item">예측: ${STEP_HOURS}시간 간격 최대 ${FORECAST_HOURS}시간</div>
    <div class="info-note">※ 모의 데이터로 실제 예보와 다릅니다</div>
  </div>`;

  // 통계 카드
  html += `<div class="panel-section"><div class="panel-section-title">현재 전체 통계</div><div id="stats-card" class="stats-card"></div></div>`;
  html += '</div>';
  p.innerHTML = html;

  renderFavList();
  document.getElementById('panel-close').addEventListener('click', togglePanel);
  document.getElementById('speed-slider').addEventListener('input', e => {
    state.playSpeed = +e.target.value;
    document.getElementById('speed-value').textContent = `${(state.playSpeed/1000).toFixed(1)}s`;
    if (state.isPlaying) { stopPlay(); startPlay(); }
  });
  document.getElementById('panel-overlay').addEventListener('click', togglePanel);
}

function togglePanel() {
  state.panelOpen = !state.panelOpen;
  document.getElementById('side-panel').classList.toggle('open', state.panelOpen);
  document.getElementById('panel-overlay').classList.toggle('visible', state.panelOpen);
}

/* ═══ 플레이바 (다이얼 드럼) ═══ */
function buildPlaybar() {
  const pb = document.getElementById('playbar');
  const steps = state.data.timeSteps;
  pb.innerHTML = `
    <div class="playbar-controls">
      <button class="play-btn" id="play-btn">
        <svg id="play-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>
        <svg id="pause-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display:none">
          <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
      </button>
    </div>
    <div class="dial-wrapper">
      <button class="dial-arrow" id="prev-btn" aria-label="이전">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="16,4 8,12 16,20"/></svg>
      </button>
      <div class="dial-drum" id="dial-drum">
        <div class="dial-items" id="dial-items">
          <div class="dial-item" data-offset="-2"><span class="dial-kst"></span><span class="dial-hlabel"></span></div>
          <div class="dial-item" data-offset="-1"><span class="dial-kst"></span><span class="dial-hlabel"></span></div>
          <div class="dial-item" data-offset="0"><span class="dial-kst"></span><span class="dial-hlabel"></span></div>
          <div class="dial-item" data-offset="1"><span class="dial-kst"></span><span class="dial-hlabel"></span></div>
          <div class="dial-item" data-offset="2"><span class="dial-kst"></span><span class="dial-hlabel"></span></div>
        </div>
        <div class="dial-fade-l"></div>
        <div class="dial-fade-r"></div>
        <div class="dial-center-line"></div>
      </div>
      <button class="dial-arrow" id="next-btn" aria-label="다음">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,4 16,12 8,20"/></svg>
      </button>
    </div>`;

  updateDial();

  document.getElementById('play-btn').addEventListener('click', () => state.isPlaying ? stopPlay() : startPlay());
  document.getElementById('prev-btn').addEventListener('click', () => {
    state.currentStep = Math.max(0, state.currentStep - 1); updateDisplay();
  });
  document.getElementById('next-btn').addEventListener('click', () => {
    state.currentStep = Math.min(steps.length - 1, state.currentStep + 1); updateDisplay();
  });

  // 드럼 드래그 (좌→우: 이전, 우→좌: 다음)
  const drum = document.getElementById('dial-drum');
  let dragX = null, dragBase = null;
  drum.addEventListener('mousedown', e => { dragX = e.clientX; dragBase = state.currentStep; });
  drum.addEventListener('touchstart', e => { dragX = e.touches[0].clientX; dragBase = state.currentStep; }, {passive:true});
  window.addEventListener('mousemove', e => {
    if (dragX === null) return;
    const delta = Math.round((dragX - e.clientX) / 50);
    state.currentStep = Math.max(0, Math.min(steps.length - 1, dragBase + delta));
    updateDisplay();
  });
  window.addEventListener('touchmove', e => {
    if (dragX === null) return;
    const delta = Math.round((dragX - e.touches[0].clientX) / 50);
    state.currentStep = Math.max(0, Math.min(steps.length - 1, dragBase + delta));
    updateDisplay();
  }, {passive:true});
  window.addEventListener('mouseup', () => { dragX = null; });
  window.addEventListener('touchend', () => { dragX = null; });
}

function updateDial() {
  const steps = state.data.timeSteps;
  const s = state.currentStep;
  document.querySelectorAll('#dial-items .dial-item').forEach(el => {
    const d = +el.dataset.offset;
    const i = s + d;
    const kst = el.querySelector('.dial-kst');
    const lbl = el.querySelector('.dial-hlabel');
    if (i >= 0 && i < steps.length) {
      kst.textContent = steps[i].kstLabel;
      lbl.textContent = steps[i].label;
      el.classList.remove('dial-empty');
    } else {
      kst.textContent = '';
      lbl.textContent = '';
      el.classList.add('dial-empty');
    }
  });
}

function startPlay() {
  state.isPlaying = true;
  document.getElementById('play-icon').style.display = 'none';
  document.getElementById('pause-icon').style.display = '';
  state.playInterval = setInterval(() => {
    state.currentStep = (state.currentStep + 1) % state.data.timeSteps.length;
    updateDisplay();
  }, state.playSpeed);
}

function stopPlay() {
  state.isPlaying = false;
  document.getElementById('play-icon').style.display = '';
  document.getElementById('pause-icon').style.display = 'none';
  clearInterval(state.playInterval);
}

/* ═══ 범례 ═══ */
function buildLegend() {
  const lg = createLegend(state.currentElement);
  const el = document.getElementById('legend');
  const grad = lg.stops.map((s,i) => `${s.color} ${(i/(lg.stops.length-1))*100}%`).join(', ');
  el.innerHTML = `
    <div class="legend-title">${lg.title}</div>
    <div class="legend-bar" style="background:linear-gradient(to right,${grad})"></div>
    <div class="legend-labels">${lg.stops.map((s,i) => `<span style="left:${(i/(lg.stops.length-1))*100}%">${s.label}</span>`).join('')}</div>`;
}

/* ═══ 표출 기준 가로 칩 줄 (지도 위 상단 플로팅, 전체 해구 동시 적용) ═══ */
function buildStatScroll() {
  const wrap = document.getElementById('stat-scroll');
  wrap.innerHTML = `<div class="stat-chips" role="tablist" aria-label="표출 기준">${
    STAT_CRITERIA.map(s => `<button class="stat-chip" role="tab" data-key="${s.key}">${s.name}</button>`).join('')
  }<span class="stat-chip-sep"></span><button class="stat-chip stat-chip-peak" id="peak-toggle" aria-pressed="false">${FORECAST_HOURS}h 최악</button></div>`;

  const peakBtn = document.getElementById('peak-toggle');
  peakBtn.addEventListener('click', () => {
    state.peak = !state.peak;
    peakBtn.classList.toggle('active', state.peak);
    peakBtn.setAttribute('aria-pressed', state.peak);
    updateDisplay();
  });

  const chips = wrap.querySelectorAll('.stat-chip[data-key]');
  const applyStat = (key) => {
    state.currentStat = key;
    chips.forEach(c => {
      const on = c.dataset.key === key;
      c.classList.toggle('active', on);
      c.setAttribute('aria-selected', on);
    });
    updateDisplay();
  };
  chips.forEach(c => c.addEventListener('click', () => applyStat(c.dataset.key)));
  applyStat(state.currentStat);

  /* ── 요소 선택기 (windy.com 스타일) ── */
  const elemCompact = document.getElementById('elem-picker-compact');
  const elemList = document.getElementById('elem-picker-list');
  const elemNameEl = document.getElementById('elem-picker-name');
  const elemPicker = document.getElementById('elem-picker');

  function setElemLabel() {
    const e = FORECAST_ELEMENTS.find(x => x.key === state.currentElement);
    elemNameEl.textContent = e.name;
    elemList.querySelectorAll('.elem-picker-option').forEach(o => o.classList.toggle('active', o.dataset.elem === state.currentElement));
  }
  function closeElemList() { elemPicker.classList.remove('open'); }
  function toggleElemList() { elemPicker.classList.toggle('open'); }

  elemCompact.addEventListener('click', e => { e.stopPropagation(); toggleElemList(); });
  elemList.querySelectorAll('.elem-picker-option').forEach(opt => {
    opt.addEventListener('click', () => {
      state.currentElement = opt.dataset.elem;
      setElemLabel();
      closeElemList();
      buildLegend();
      updateDisplay();
    });
  });
  document.addEventListener('click', e => {
    if (!elemPicker.contains(e.target)) closeElemList();
  });

  setElemLabel();
}

/* ═══ 통합 업데이트 ═══ */
function updateDisplay() {
  const { zoneValues, globalStats, timeSteps } = state.data;
  const step = timeSteps[state.currentStep];

  setPeakMode(state.peak);
  updateGrid(zoneValues, state.currentStep, state.currentElement, state.currentStat);
  renderSheet();

  updateDial();

  // 통계 카드
  const gs = globalStats[state.currentStep];
  const elem = FORECAST_ELEMENTS.find(e => e.key === state.currentElement);
  const sc = document.getElementById('stats-card');
  if (sc && gs) {
    const st = gs[state.currentElement];
    sc.innerHTML = `
      <div class="sc-row"><span>최솟값</span><span>${st.min}${elem.unit}</span></div>
      <div class="sc-row"><span>P25</span><span>${st.p25}${elem.unit}</span></div>
      <div class="sc-row"><span>평균</span><span>${st.mean}${elem.unit}</span></div>
      <div class="sc-row"><span>P50</span><span>${st.p50}${elem.unit}</span></div>
      <div class="sc-row"><span>P75</span><span>${st.p75}${elem.unit}</span></div>
      <div class="sc-row"><span>최댓값</span><span>${st.max}${elem.unit}</span></div>`;
  }
}

/* ═══ 내 해구 (즐겨찾기, localStorage) ═══ */
function loadFavs() {
  try { return new Set(JSON.parse(localStorage.getItem('otf-favs') || '[]').map(String)); }
  catch { return new Set(); }
}
function saveFavs() {
  try { localStorage.setItem('otf-favs', JSON.stringify([...state.favs])); } catch {}
}
function toggleFav(id) {
  state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id);
  saveFavs();
  setHighlight({ favs: state.favs });
  renderFavList();
  updateDisplay();
}
function renderFavList() {
  const el = document.getElementById('fav-list');
  if (!el) return;
  if (!state.favs.size) { el.innerHTML = '<div class="info-item">지도에서 해구를 눌러 ★로 추가하세요</div>'; return; }
  el.innerHTML = [...state.favs].map(id => `<button class="option-btn" data-id="${id}">★ ${id}</button>`).join('') +
    `<button class="option-btn" id="fav-fit">모두 보기</button>`;
  el.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => {
    togglePanel(); focusZones([b.dataset.id]); openZone(b.dataset.id);
  }));
  document.getElementById('fav-fit').addEventListener('click', () => { togglePanel(); focusZones([...state.favs]); });
}

/* ═══ 해구 상세 시트 (12시간 추이) ═══ */
function openZone(id) {
  state.selectedZone = id;
  setHighlight({ selected: id });
  updateDisplay();
  document.getElementById('zone-sheet').classList.add('open');
}
function closeZone() {
  state.selectedZone = null;
  setHighlight({ selected: null });
  document.getElementById('zone-sheet').classList.remove('open');
  updateDisplay();
}

function sparkline(vals, cur, key, lo, hi) {
  const n = vals.length, W = 100, H = 26;
  const span = (hi - lo) || 1;
  const pts = vals.map((v, i) => [ (i / (n - 1)) * W, H - 2 - ((v - lo) / span) * (H - 4) ]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const [cx, cy] = pts[cur];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" class="spark-line"/></svg>` +
    `<span class="spark-dot risk-${riskLevel(key, vals[cur])}" style="left:${cx}%;top:${(cy / H * 100).toFixed(1)}%"></span>`;
}

function renderSheet() {
  const el = document.getElementById('zone-sheet');
  const id = state.selectedZone;
  if (!el) return;
  if (!id) { el.innerHTML = ''; return; }
  const { zoneValues, timeSteps, zones } = state.data;
  const z = zones.find(x => String(x.id) === id);
  const cur = state.currentStep;
  const stat = state.currentStat;
  const val = (step, key) => computeStat(zoneValues[step][id][key], stat);
  const dirAt = (step, key) => circularMean(zoneValues[step][id][key]);
  const fav = state.favs.has(id);

  const rows = SELECTABLE_ELEMENTS.map(e => {
    const series = timeSteps.map((_, i) => val(i, e.key));
    const now = series[cur];
    const worstLow = THRESHOLDS[e.key] && THRESHOLDS[e.key].dir === 'down';
    const worst = worstLow ? Math.min(...series) : Math.max(...series);
    const fmt = v => (e.decimals > 0 ? v.toFixed(e.decimals) : Math.round(v)) + e.unit;
    const dd = DIRECTION_OF[e.key];
    let dirHtml = '';
    if (dd) {
      const deg = dirAt(cur, dd.key);
      dirHtml = `<span class="zs-dir"><svg viewBox="-10 -10 20 20" style="transform:rotate(${deg + 180}deg)"><path d="M0,-8 L5.5,2 L1.6,0.8 L1.6,8 L-1.6,8 L-1.6,0.8 L-5.5,2 Z"/></svg>${dd.name} ${compassName(deg)} ${Math.round(deg)}°</span>`;
    }
    const lo = Math.min(...series), hi = Math.max(...series);
    return `<div class="zs-row">
      <div class="zs-name">${e.name}${dirHtml}</div>
      <div class="zs-spark">${sparkline(series, cur, e.key, lo, hi)}</div>
      <div class="zs-now risk-${riskLevel(e.key, now)}">${fmt(now)}</div>
      <div class="zs-worst risk-${riskLevel(e.key, worst)}">${fmt(worst)}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="zs-head">
      <div><div class="zs-title">해구 ${id}</div><div class="zs-sub">${z.lat}°N ${z.lon}°E · ${timeSteps[cur].kstLabel} 기준 (${timeSteps[cur].label})</div></div>
      <div class="zs-actions">
        <button class="zs-fav ${fav ? 'on' : ''}" id="zs-fav" aria-label="내 해구 ${fav ? '해제' : '추가'}">${fav ? '★' : '☆'}</button>
        <button class="panel-close-btn" id="zs-close" aria-label="닫기">&times;</button>
      </div>
    </div>
    <div class="zs-cols"><span></span><span>${FORECAST_HOURS}시간 추이</span><span>현재</span><span>최악</span></div>
    <div class="zs-body">${rows}</div>
    <div class="zs-foot">표출 기준: ${STAT_CRITERIA.find(s => s.key === stat).name} · 점은 현재 시각 · 색: 주의(노랑)/위험(빨강)</div>`;
  document.getElementById('zs-close').addEventListener('click', closeZone);
  document.getElementById('zs-fav').addEventListener('click', () => toggleFav(id));
}

document.addEventListener('DOMContentLoaded', initApp);
