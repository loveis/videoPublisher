// 관리 화면 공통 유틸: 서버 API 호출(401 처리), HTML 이스케이프, 바이트/시간 포맷, 프로토콜 이름
export const PROTOCOL_LABEL = {
  rtsp: 'RTSP', rtsps: 'RTSPS', rtmp: 'RTMP', rtmps: 'RTMPS', hls: 'HLS', webrtc: 'WebRTC', srt: 'SRT',
};

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }
  if (res.status === 401 && url !== '/api/login') {
    onUnauthorized();
    throw new Error(data.error);
  }
  if (!res.ok) throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), { status: res.status });
  return data;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function formatBytes(n) {
  if (n == null) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function formatDuration(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}시간 ${m}분` : m ? `${m}분 ${s % 60}초` : `${s % 60}초`;
}

export const since = (iso) => formatDuration((Date.now() - Date.parse(iso)) / 1000);
export const formatTime = (iso) => new Date(iso).toLocaleString('ko-KR');

// 내용이 같으면 다시 그리지 않아 입력 선택/버튼 상태가 폴링마다 풀리지 않게 한다.
export function setHtml(el, html) {
  if (el.dataset.html === html) return;
  el.innerHTML = html;
  el.dataset.html = html;
}

// /api/streams 응답에 담긴 MediaMTX 상태를 화면 상단 배너로 표시한다.
export function showMediaMtxStatus({ running, lastError }) {
  const banner = document.querySelector('#mtx-banner');
  banner.hidden = running;
  banner.textContent = running ? '' : `MediaMTX 가 실행 중이 아닙니다. 자동 재시작을 기다리는 중입니다. ${lastError}`;
}
