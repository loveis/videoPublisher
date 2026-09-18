// 서버 정보 탭: MediaMTX 버전·가동 시간, 프로토콜 서버 상태, 경로별 통계, Prometheus 메트릭
import { api, escapeHtml, formatBytes, since, setHtml, PROTOCOL_LABEL } from './api.js';

const $ = (sel) => document.querySelector(sel);
// [표시 이름, 켜짐 여부 키, 주소 키들, 암호화 키]
const SERVERS = [
  ['RTSP', 'rtsp', ['rtspAddress', 'rtspsAddress', 'rtpAddress', 'rtcpAddress'], 'rtspEncryption'],
  ['RTMP', 'rtmp', ['rtmpAddress', 'rtmpsAddress'], 'rtmpEncryption'],
  ['HLS', 'hls', ['hlsAddress'], 'hlsEncryption'],
  ['WebRTC', 'webrtc', ['webrtcAddress', 'webrtcLocalUDPAddress', 'webrtcLocalTCPAddress'], 'webrtcEncryption'],
  ['SRT', 'srt', ['srtAddress'], null],
  ['MoQ', 'moq', ['moqHTTP2Address', 'moqHTTP3Address', 'moqQUICAddress'], null],
  ['재생(playback)', 'playback', ['playbackAddress'], 'playbackEncryption'],
  ['API', 'api', ['apiAddress'], 'apiEncryption'],
  ['메트릭', 'metrics', ['metricsAddress'], 'metricsEncryption'],
  ['pprof', 'pprof', ['pprofAddress'], 'pprofEncryption'],
];
const SOURCE_LABEL = { rtspSession: 'RTSP', rtmpConn: 'RTMP', srtConn: 'SRT', webRTCSession: 'WebRTC' };
let metricsText = '';

export function init() {
  $('#load-metrics').addEventListener('click', loadMetrics);
  $('#metrics-filter').addEventListener('input', renderMetrics);
}

export async function refresh() {
  const [info, paths, { global: conf }] = await Promise.all([
    api('GET', '/api/mtx/info'),
    api('GET', '/api/mtx/paths/list?itemsPerPage=1000'),
    api('GET', '/api/config'),
  ]);
  const readers = paths.items.reduce((n, p) => n + p.readers.length, 0);
  setHtml(
    $('#info-summary'),
    `<h2>MediaMTX</h2>
     <div class="stats">
       <div><span>버전</span><b>${escapeHtml(info.version)}</b></div>
       <div><span>가동 시간</span><b>${since(info.started)}</b></div>
       <div><span>경로</span><b>${paths.items.length}</b></div>
       <div><span>송출 중</span><b>${paths.items.filter((p) => p.ready).length}</b></div>
       <div><span>시청자</span><b>${readers}</b></div>
     </div>`,
  );
  setHtml(
    $('#info-servers'),
    `<thead><tr><th>서버</th><th>상태</th><th>주소</th><th>암호화</th></tr></thead><tbody>${SERVERS.map(
      ([label, on, addrs, enc]) => `<tr>
        <td>${label}</td>
        <td>${conf[on] ? '<span class="badge live">켜짐</span>' : '<span class="muted">꺼짐</span>'}</td>
        <td class="mono">${addrs.map((a) => `${a.replace(/Address$/, '')}=${escapeHtml(conf[a] || '-')}`).join('<br>')}</td>
        <td>${enc ? encLabel(conf[enc]) : '-'}</td>
      </tr>`,
    ).join('')}</tbody>`,
  );
  setHtml(
    $('#info-paths'),
    paths.items.length
      ? `<thead><tr><th>이름</th><th>상태</th><th>소스</th><th>트랙</th><th>시청자</th><th>수신</th><th>송신</th></tr></thead><tbody>${paths.items
          .map((p) => {
            const byProto = {};
            for (const r of p.readers) byProto[r.type] = (byProto[r.type] ?? 0) + 1;
            return `<tr>
              <td>${escapeHtml(p.name)}</td>
              <td>${p.ready ? `<span class="badge live">송출 중</span> ${since(p.readyTime)}` : '<span class="muted">대기</span>'}</td>
              <td>${p.source ? SOURCE_LABEL[p.source.type] ?? escapeHtml(p.source.type) : '-'}</td>
              <td>${escapeHtml((p.tracks ?? []).join(', '))}</td>
              <td>${p.readers.length} ${Object.entries(byProto).map(([t, n]) => `<span class="muted">${escapeHtml(readerLabel(t))} ${n}</span>`).join(' ')}</td>
              <td>${formatBytes(p.inboundBytes ?? p.bytesReceived)}</td>
              <td>${formatBytes(p.outboundBytes ?? p.bytesSent)}</td>
            </tr>`;
          })
          .join('')}</tbody>`
      : '<tr><td class="muted">경로가 없습니다.</td></tr>',
  );
}

// 암호화 값은 bool(HTTP 계열) 또는 'no'|'optional'|'strict'(RTSP/RTMP) 이다.
function encLabel(v) {
  return { true: '사용', false: '미사용', no: '미사용', optional: '선택(평문+암호화)', strict: '암호화만' }[String(v)] ?? escapeHtml(String(v));
}

function readerLabel(type) {
  const map = { rtspSession: 'rtsp', rtspsSession: 'rtsps', rtmpConn: 'rtmp', rtmpsConn: 'rtmps', hlsSession: 'hls', webRTCSession: 'webrtc', srtConn: 'srt' };
  return PROTOCOL_LABEL[map[type]] ?? type;
}

async function loadMetrics() {
  try {
    metricsText = await api('GET', '/api/metrics');
  } catch (err) {
    metricsText = err.message;
  }
  renderMetrics();
}

function renderMetrics() {
  const filter = $('#metrics-filter').value.trim().toLowerCase();
  const lines = String(metricsText).split('\n');
  $('#metrics').textContent = (filter ? lines.filter((l) => l.toLowerCase().includes(filter)) : lines).join('\n');
}
