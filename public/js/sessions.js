// 세션 탭: MediaMTX 프로토콜별 접속 세션(송출/시청) 목록과 강제 종료
import { api, escapeHtml, formatBytes, since, setHtml } from './api.js';

const $ = (sel) => document.querySelector(sel);
// MediaMTX 세션 API 이름 → 표시 이름. 꺼진 프로토콜(또는 암호화 미사용)의 API 는 404 라 건너뛴다.
const SESSION_APIS = {
  rtspsessions: 'RTSP', rtspssessions: 'RTSPS', rtmpconns: 'RTMP', rtmpsconns: 'RTMPS',
  hlssessions: 'HLS', webrtcsessions: 'WebRTC', srtconns: 'SRT',
};

export function init() {
  $('#session-table').addEventListener('click', onClick);
}

async function fetchAll() {
  const lists = await Promise.all(
    Object.entries(SESSION_APIS).map(async ([kind, label]) => {
      try {
        const { items } = await api('GET', `/api/mtx/${kind}/list?itemsPerPage=1000`);
        return items.map((item) => ({ ...item, kind, label }));
      } catch (err) {
        if (err.status === 404) return [];
        throw err;
      }
    }),
  );
  return lists.flat().sort((a, b) => a.path.localeCompare(b.path) || a.created.localeCompare(b.created));
}

export async function refresh() {
  const items = await fetchAll();
  const publishers = items.filter((i) => i.state === 'publish').length;
  $('#session-summary').textContent = `· 송출 ${publishers} · 시청 ${items.length - publishers}`;
  if (items.length === 0) {
    setHtml($('#session-table'), '<tr><td class="muted">접속한 세션이 없습니다.</td></tr>');
    return;
  }
  setHtml(
    $('#session-table'),
    `<thead><tr><th>프로토콜</th><th>경로</th><th>구분</th><th>원격 주소</th><th>접속 시간</th><th>수신</th><th>송신</th><th></th></tr></thead>
     <tbody>${items.map(renderRow).join('')}</tbody>`,
  );
}

function renderRow(s) {
  const publishing = s.state === 'publish';
  // 이 앱의 FFmpeg 는 같은 PC(127.0.0.1)에서 publish 한다. 끊으면 해당 송출이 멈춘다.
  const own = publishing && /^(127\.0\.0\.1|\[::1\])/.test(s.remoteAddr);
  return `<tr>
    <td>${s.label}</td>
    <td>${escapeHtml(s.path)}</td>
    <td>${publishing ? `<span class="badge live">송출</span>${own ? ' <span class="muted">(이 앱)</span>' : ''}` : '시청'}</td>
    <td class="mono">${escapeHtml(s.remoteAddr)}</td>
    <td>${since(s.created)}</td>
    <td>${formatBytes(s.inboundBytes)}</td>
    <td>${formatBytes(s.outboundBytes)}</td>
    <td><button type="button" class="danger small" data-kick="${s.kind}/${s.id}" data-own="${own}">끊기</button></td>
  </tr>`;
}

async function onClick(e) {
  const { kick, own } = e.target.dataset;
  if (!kick) return;
  const msg = own === 'true' ? '이 앱의 카메라 송출 연결입니다. 끊으면 송출이 멈춥니다. 계속할까요?' : '이 세션을 끊을까요?';
  if (!confirm(msg)) return;
  await api('POST', `/api/mtx/${kick.replace('/', '/kick/')}`);
  await refresh();
}
