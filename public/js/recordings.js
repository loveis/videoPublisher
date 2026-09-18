// 녹화 탭: 경로별 녹화 구간 목록, playback 서버로 MP4 다운로드, 구간 삭제
import { api, escapeHtml, formatDuration, formatTime, setHtml } from './api.js';

const $ = (sel) => document.querySelector(sel);
let lastData = null;

export function init() {
  $('#recording-list').addEventListener('click', onClick);
}

export async function refresh() {
  const data = await api('GET', '/api/recordings');
  lastData = data;
  $('#recording-note').textContent = data.playback
    ? '연속으로 녹화된 세그먼트는 하나의 구간으로 묶여 MP4 한 파일로 내려받습니다. 녹화는 송출 탭에서 스트림별로 켜고 끕니다.'
    : '재생 서버(playback)가 꺼져 있어 다운로드할 수 없습니다. 설정 > 녹화/재생에서 켜세요.';
  if (data.recordings.length === 0) {
    setHtml($('#recording-list'), '<p class="muted">녹화 파일이 없습니다.</p>');
    return;
  }
  setHtml($('#recording-list'), data.recordings.map(renderRecording).join(''));
}

function renderRecording(rec, ri) {
  const rows = rec.spans
    .map(
      (span, si) => `<tr>
        <td>${formatTime(span.start)}</td>
        <td>${span.duration == null ? '-' : formatDuration(span.duration)}</td>
        <td>${span.segments.length}</td>
        <td class="actions">
          ${span.downloadUrl ? `<a class="button" href="${escapeHtml(span.downloadUrl)}" target="_blank" rel="noopener">다운로드</a>` : ''}
          <button type="button" class="danger small" data-delete="${ri}/${si}">삭제</button>
        </td>
      </tr>`,
    )
    .join('');
  return `<h3>${escapeHtml(rec.name)}</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>시작</th><th>길이</th><th>세그먼트</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

async function onClick(e) {
  const target = e.target.dataset.delete;
  if (!target) return;
  const [ri, si] = target.split('/').map(Number);
  const rec = lastData.recordings[ri];
  const span = rec.spans[si];
  if (!confirm(`${rec.name} 의 ${formatTime(span.start)} 녹화(${span.segments.length}개 세그먼트)를 삭제할까요?`)) return;
  try {
    await api('DELETE', `/api/recordings/${encodeURIComponent(rec.name)}`, { segments: span.segments });
  } catch (err) {
    alert(err.message);
  }
  await refresh();
}
