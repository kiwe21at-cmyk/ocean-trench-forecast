/**
 * 앱 메인 모듈 - SPA 컨트롤러
 * 우측 슬라이드 패널 + 하단 플레이바 + 지도 연동
 */

import { SEA_ZONES, FORECAST_ELEMENTS, STAT_CRITERIA, generateForecastData } from './data.js';
import { initMap, updateZoneDisplay, addSubZoneLayers, createLegend } from './map.js';

// ═══════════════════════════════════════════
//  상태 관리
// ═══════════════════════════════════════════
const state = {
  forecastData: null,
  currentStep: 0,
  currentElement: 'wh_sig',
  currentStat: 'max',
  isPlaying: false,
  playInterval: null,
  playSpeed: 1000, // ms
  panelOpen: false
};

// ═══════════════════════════════════════════
//  초기화
// ═══════════════════════════════════════════
export function initApp() {
  // 데이터 생성
  state.forecastData = generateForecastData('00');

  // 지도 초기화
  initMap('map-container');

  // 소해구 레이어 추가
  Object.keys(state.forecastData.zoneData).forEach(zoneId => {
    const data = state.forecastData.zoneData[zoneId];
    addSubZoneLayers(parseInt(zoneId), data.subZones);
  });

  // UI 구성
  buildPanel();
  buildPlaybar();
  buildLegend();
  buildHeader();

  // 초기 표출
  updateDisplay();
}

// ═══════════════════════════════════════════
//  헤더
// ═══════════════════════════════════════════
function buildHeader() {
  const header = document.getElementById('header');
  const ts = state.forecastData.timeSteps[0];
  header.innerHTML = `
    <div class="header-left">
      <div class="header-title">해구별 예측정보</div>
      <div class="header-sub">기준: ${ts.kstLabel} (KST) | 3시간 간격 72시간</div>
    </div>
    <button class="panel-toggle-btn" id="panel-toggle" aria-label="설정 패널 열기">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
        <circle cx="8" cy="6" r="2" fill="currentColor"/>
        <circle cx="16" cy="12" r="2" fill="currentColor"/>
        <circle cx="10" cy="18" r="2" fill="currentColor"/>
      </svg>
    </button>
  `;

  document.getElementById('panel-toggle').addEventListener('click', togglePanel);
}

// ═══════════════════════════════════════════
//  우측 슬라이드 패널
// ═══════════════════════════════════════════
function buildPanel() {
  const panel = document.getElementById('side-panel');

  // 예측 요소 선택
  let elemHtml = '<div class="panel-section"><div class="panel-section-title">예측 요소</div><div class="panel-options">';
  FORECAST_ELEMENTS.forEach(elem => {
    const active = elem.key === state.currentElement ? 'active' : '';
    elemHtml += `<button class="option-btn elem-btn ${active}" data-elem="${elem.key}">${elem.name}<span class="option-unit">${elem.unit}</span></button>`;
  });
  elemHtml += '</div></div>';

  // 통계 기준 선택
  let statHtml = '<div class="panel-section"><div class="panel-section-title">표출 기준</div><div class="panel-options stat-options">';
  STAT_CRITERIA.forEach(stat => {
    const active = stat.key === state.currentStat ? 'active' : '';
    statHtml += `<button class="option-btn stat-btn ${active}" data-stat="${stat.key}"><span class="stat-label">${stat.label}</span><span class="stat-name">${stat.name}</span></button>`;
  });
  statHtml += '</div></div>';

  // 재생 속도
  let speedHtml = `
    <div class="panel-section">
      <div class="panel-section-title">재생 속도</div>
      <div class="speed-control">
        <input type="range" id="speed-slider" min="200" max="3000" step="100" value="${state.playSpeed}" class="speed-slider">
        <div class="speed-labels">
          <span>빠름</span><span id="speed-value">${(state.playSpeed / 1000).toFixed(1)}s</span><span>느림</span>
        </div>
      </div>
    </div>
  `;

  // 정보
  let infoHtml = `
    <div class="panel-section panel-info">
      <div class="panel-section-title">데이터 정보</div>
      <div class="info-item">모델: 지역파랑예측모델(RWW3)</div>
      <div class="info-item">격자: 0.5° (약 50km)</div>
      <div class="info-item">대해구: ${SEA_ZONES.length}개 영역</div>
      <div class="info-item">발표: 1일 2회 (00/12 UTC)</div>
      <div class="info-item">예측: 3시간 간격 72시간</div>
      <div class="info-note">※ 모의 데이터로 실제 예보와 다릅니다</div>
    </div>
  `;

  panel.innerHTML = `
    <div class="panel-header">
      <span>설정</span>
      <button class="panel-close-btn" id="panel-close" aria-label="닫기">&times;</button>
    </div>
    <div class="panel-body">
      ${elemHtml}${statHtml}${speedHtml}${infoHtml}
    </div>
  `;

  // 이벤트 바인딩
  document.getElementById('panel-close').addEventListener('click', togglePanel);

  panel.querySelectorAll('.elem-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentElement = btn.dataset.elem;
      panel.querySelectorAll('.elem-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      buildLegend();
      updateDisplay();
    });
  });

  panel.querySelectorAll('.stat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentStat = btn.dataset.stat;
      panel.querySelectorAll('.stat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateDisplay();
    });
  });

  document.getElementById('speed-slider').addEventListener('input', (e) => {
    state.playSpeed = parseInt(e.target.value);
    document.getElementById('speed-value').textContent = `${(state.playSpeed / 1000).toFixed(1)}s`;
    if (state.isPlaying) {
      stopPlay();
      startPlay();
    }
  });

  // 오버레이
  document.getElementById('panel-overlay').addEventListener('click', togglePanel);
}

function togglePanel() {
  state.panelOpen = !state.panelOpen;
  document.getElementById('side-panel').classList.toggle('open', state.panelOpen);
  document.getElementById('panel-overlay').classList.toggle('visible', state.panelOpen);
}

// ═══════════════════════════════════════════
//  하단 플레이바
// ═══════════════════════════════════════════
function buildPlaybar() {
  const playbar = document.getElementById('playbar');
  const steps = state.forecastData.timeSteps;

  playbar.innerHTML = `
    <div class="playbar-controls">
      <button class="play-btn" id="play-btn" aria-label="재생">
        <svg id="play-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="6,4 20,12 6,20"/>
        </svg>
        <svg id="pause-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display:none">
          <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
        </svg>
      </button>
      <button class="step-btn" id="prev-btn" aria-label="이전">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="16,4 8,12 16,20"/></svg>
      </button>
      <button class="step-btn" id="next-btn" aria-label="다음">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,4 16,12 8,20"/></svg>
      </button>
    </div>
    <div class="playbar-timeline">
      <div class="timeline-track" id="timeline-track">
        <div class="timeline-progress" id="timeline-progress"></div>
        <div class="timeline-thumb" id="timeline-thumb"></div>
        ${steps.map((s, i) => `<div class="timeline-tick" style="left:${(i / (steps.length - 1)) * 100}%" data-step="${i}"></div>`).join('')}
      </div>
      <div class="timeline-labels">
        ${steps.filter((_, i) => i % 4 === 0).map((s, idx) => {
          const i = idx * 4;
          return `<span class="timeline-label" style="left:${(i / (steps.length - 1)) * 100}%">${s.label}</span>`;
        }).join('')}
      </div>
    </div>
    <div class="playbar-info">
      <span class="time-display" id="time-display">${steps[0].kstLabel}</span>
      <span class="step-display" id="step-display">${steps[0].label}</span>
    </div>
  `;

  // 이벤트
  document.getElementById('play-btn').addEventListener('click', () => {
    state.isPlaying ? stopPlay() : startPlay();
  });
  document.getElementById('prev-btn').addEventListener('click', () => {
    state.currentStep = Math.max(0, state.currentStep - 1);
    updateDisplay();
  });
  document.getElementById('next-btn').addEventListener('click', () => {
    state.currentStep = Math.min(steps.length - 1, state.currentStep + 1);
    updateDisplay();
  });

  // 타임라인 드래그
  const track = document.getElementById('timeline-track');
  let dragging = false;

  function handleTrackInput(e) {
    const rect = track.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    state.currentStep = Math.round(pct * (steps.length - 1));
    updateDisplay();
  }

  track.addEventListener('mousedown', (e) => { dragging = true; handleTrackInput(e); });
  track.addEventListener('touchstart', (e) => { dragging = true; handleTrackInput(e); }, { passive: true });
  window.addEventListener('mousemove', (e) => { if (dragging) handleTrackInput(e); });
  window.addEventListener('touchmove', (e) => { if (dragging) handleTrackInput(e); }, { passive: true });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('touchend', () => { dragging = false; });
}

function startPlay() {
  state.isPlaying = true;
  document.getElementById('play-icon').style.display = 'none';
  document.getElementById('pause-icon').style.display = '';

  state.playInterval = setInterval(() => {
    state.currentStep++;
    if (state.currentStep >= state.forecastData.timeSteps.length) {
      state.currentStep = 0;
    }
    updateDisplay();
  }, state.playSpeed);
}

function stopPlay() {
  state.isPlaying = false;
  document.getElementById('play-icon').style.display = '';
  document.getElementById('pause-icon').style.display = 'none';
  clearInterval(state.playInterval);
}

// ═══════════════════════════════════════════
//  범례
// ═══════════════════════════════════════════
function buildLegend() {
  const legend = createLegend(state.currentElement);
  const container = document.getElementById('legend');

  const gradient = legend.stops.map((s, i) => {
    const pct = (i / (legend.stops.length - 1)) * 100;
    return `${s.color} ${pct}%`;
  }).join(', ');

  container.innerHTML = `
    <div class="legend-title">${legend.title}</div>
    <div class="legend-bar" style="background: linear-gradient(to right, ${gradient})"></div>
    <div class="legend-labels">
      ${legend.stops.map((s, i) => {
        const left = (i / (legend.stops.length - 1)) * 100;
        return `<span style="left:${left}%">${s.label}</span>`;
      }).join('')}
    </div>
  `;
}

// ═══════════════════════════════════════════
//  통합 업데이트
// ═══════════════════════════════════════════
function updateDisplay() {
  const { zoneData } = state.forecastData;
  const step = state.forecastData.timeSteps[state.currentStep];

  // 지도 업데이트
  updateZoneDisplay(zoneData, state.currentStep, state.currentElement, state.currentStat);

  // 타임라인 업데이트
  const steps = state.forecastData.timeSteps;
  const pct = (state.currentStep / (steps.length - 1)) * 100;
  const progress = document.getElementById('timeline-progress');
  const thumb = document.getElementById('timeline-thumb');
  if (progress) progress.style.width = `${pct}%`;
  if (thumb) thumb.style.left = `${pct}%`;

  // 시간 표시
  const timeDisp = document.getElementById('time-display');
  const stepDisp = document.getElementById('step-display');
  if (timeDisp) timeDisp.textContent = step.kstLabel;
  if (stepDisp) stepDisp.textContent = step.label;
}

// ═══════════════════════════════════════════
//  시작
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', initApp);
