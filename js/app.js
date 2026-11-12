/**
 * 앱 메인 모듈 - SPA 컨트롤러
 * 전체 1,331개 해구 격자 + 우측 패널 + 하단 플레이바
 */
import { ZONES, FORECAST_ELEMENTS, STAT_CRITERIA, generateForecastData } from './data.js';
import { initMap, updateGrid, createLegend } from './map.js';

const state = {
  data: null, currentStep: 0, currentElement: 'wh_sig',
  currentStat: 'max', isPlaying: false, playInterval: null,
  playSpeed: 1000, panelOpen: false
};

/* ═══ 초기화 ═══ */
export function initApp() {
  document.getElementById('loading').style.display = 'flex';
  setTimeout(() => {
    state.data = generateForecastData('00');
    initMap('map-container', state.data.zones);
    buildHeader(); buildPanel(); buildPlaybar(); buildLegend();
    updateDisplay();
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
    <button class="panel-toggle-btn" id="panel-toggle" aria-label="설정">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        <circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>
      </svg>
    </button>`;
  document.getElementById('panel-toggle').addEventListener('click', togglePanel);
}

/* ═══ 패널 ═══ */
function buildPanel() {
  const p = document.getElementById('side-panel');
  let html = `<div class="panel-header"><span>설정</span><button class="panel-close-btn" id="panel-close">&times;</button></div><div class="panel-body">`;

  // 요소
  html += '<div class="panel-section"><div class="panel-section-title">예측 요소</div><div class="panel-options">';
  FORECAST_ELEMENTS.forEach(e => {
    html += `<button class="option-btn elem-btn ${e.key===state.currentElement?'active':''}" data-elem="${e.key}">${e.name}<span class="option-unit">${e.unit}</span></button>`;
  });
  html += '</div></div>';

  // 기준
  html += '<div class="panel-section"><div class="panel-section-title">표출 기준</div><div class="panel-options stat-options">';
  STAT_CRITERIA.forEach(s => {
    html += `<button class="option-btn stat-btn ${s.key===state.currentStat?'active':''}" data-stat="${s.key}"><span class="stat-label">${s.label}</span><span class="stat-name">${s.name}</span></button>`;
  });
  html += '</div></div>';

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
    <div class="info-item">예측: 3시간 간격 72시간</div>
    <div class="info-note">※ 모의 데이터로 실제 예보와 다릅니다</div>
  </div>`;

  // 통계 카드
  html += `<div class="panel-section"><div class="panel-section-title">현재 전체 통계</div><div id="stats-card" class="stats-card"></div></div>`;
  html += '</div>';
  p.innerHTML = html;

  document.getElementById('panel-close').addEventListener('click', togglePanel);
  p.querySelectorAll('.elem-btn').forEach(b => b.addEventListener('click', () => {
    state.currentElement = b.dataset.elem;
    p.querySelectorAll('.elem-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); buildLegend(); updateDisplay();
  }));
  p.querySelectorAll('.stat-btn').forEach(b => b.addEventListener('click', () => {
    state.currentStat = b.dataset.stat;
    p.querySelectorAll('.stat-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); updateDisplay();
  }));
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

/* ═══ 플레이바 ═══ */
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
      <button class="step-btn" id="prev-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="16,4 8,12 16,20"/></svg></button>
      <button class="step-btn" id="next-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,4 16,12 8,20"/></svg></button>
    </div>
    <div class="playbar-timeline">
      <div class="timeline-track" id="timeline-track">
        <div class="timeline-progress" id="timeline-progress"></div>
        <div class="timeline-thumb" id="timeline-thumb"></div>
        ${steps.map((_, i) => `<div class="timeline-tick" style="left:${(i/(steps.length-1))*100}%"></div>`).join('')}
      </div>
      <div class="timeline-labels">
        ${steps.filter((_,i)=>i%4===0).map((s,idx) => {
          const i=idx*4;
          return `<span class="timeline-label" style="left:${(i/(steps.length-1))*100}%">${s.label}</span>`;
        }).join('')}
      </div>
    </div>
    <div class="playbar-info">
      <span class="time-display" id="time-display">${steps[0].kstLabel}</span>
      <span class="step-display" id="step-display">${steps[0].label}</span>
    </div>`;

  document.getElementById('play-btn').addEventListener('click', () => state.isPlaying ? stopPlay() : startPlay());
  document.getElementById('prev-btn').addEventListener('click', () => { state.currentStep = Math.max(0, state.currentStep-1); updateDisplay(); });
  document.getElementById('next-btn').addEventListener('click', () => { state.currentStep = Math.min(steps.length-1, state.currentStep+1); updateDisplay(); });

  const track = document.getElementById('timeline-track');
  let drag = false;
  function onTrack(e) {
    const r = track.getBoundingClientRect();
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    state.currentStep = Math.round(Math.max(0, Math.min(1, (x-r.left)/r.width)) * (steps.length-1));
    updateDisplay();
  }
  track.addEventListener('mousedown', e => { drag=true; onTrack(e); });
  track.addEventListener('touchstart', e => { drag=true; onTrack(e); }, {passive:true});
  window.addEventListener('mousemove', e => { if(drag) onTrack(e); });
  window.addEventListener('touchmove', e => { if(drag) onTrack(e); }, {passive:true});
  window.addEventListener('mouseup', () => drag=false);
  window.addEventListener('touchend', () => drag=false);
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

/* ═══ 통합 업데이트 ═══ */
function updateDisplay() {
  const { zoneValues, globalStats, timeSteps } = state.data;
  const step = timeSteps[state.currentStep];

  updateGrid(zoneValues, state.currentStep, state.currentElement);

  const pct = (state.currentStep / (timeSteps.length-1)) * 100;
  const prog = document.getElementById('timeline-progress');
  const thumb = document.getElementById('timeline-thumb');
  if (prog) prog.style.width = `${pct}%`;
  if (thumb) thumb.style.left = `${pct}%`;

  const td = document.getElementById('time-display');
  const sd = document.getElementById('step-display');
  if (td) td.textContent = step.kstLabel;
  if (sd) sd.textContent = step.label;

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

document.addEventListener('DOMContentLoaded', initApp);
