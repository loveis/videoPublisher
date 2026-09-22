// VOD 탭: 미디어 폴더의 파일 목록, 시청 경로 등록/해제(반복 여부), 등록된 파일의 시청 URL 과 접속자 수
import { api, escapeHtml, formatBytes, formatDuration, setHtml, PROTOCOL_LABEL } from './api.js';

const $ = (sel) => document.querySelector(sel);

export function init() {
  $('#vod-list').addEventListener('click', onClick);
}

export async function refresh() {
  const data = await api('GET', '/api/vod');
  $('#vod-dir').textContent = data.dir;
  setHtml(
    $('#vod-list'),
    data.items.length
      ? `<div class="table-wrap"><table>
          <thead><tr><th>파일</th><th>길이</th><th>크기</th><th>코덱 / 처리</th><th>상태</th><th></th></tr></thead>
          <tbody>${data.items.map(renderItem).join('')}</tbody>
        </table></div>`
      : '<p class="muted">폴더에 미디어 파일이 없습니다. 위 경로에 파일을 넣고 새로고침하세요.</p>',
  );
}

// 영상이 H.264 면 그대로 복사해 보내고, 그 외 코덱은 송출할 때 H.264 로 변환한다(오디오는 Opus).
function codecCell(item) {
  if (item.missing) return '-';
  const video = item.video ? `${item.video} → ${item.video === 'h264' ? '복사' : 'H.264 변환'}` : '영상 없음';
  const audio = item.audio ? `${item.audio} → ${item.audio === 'opus' ? '복사' : 'Opus 변환'}` : '오디오 없음';
  return `${escapeHtml(video)}<br><span class="muted">${escapeHtml(audio)}</span>`;
}

function renderItem(item) {
  const urls = Object.entries(item.urls ?? {})
    .map(
      ([p, url]) => `<div class="url-row">
        <span class="proto">${PROTOCOL_LABEL[p]}</span>
        <input readonly value="${escapeHtml(url)}">
        <button type="button" data-copy="${escapeHtml(url)}">복사</button>
        <span class="viewers">접속 <b>${item.viewers[p] ?? 0}</b>명</span>
      </div>`,
    )
    .join('');
  const status = item.missing
    ? '<span class="badge error">파일 없음</span>'
    : item.registered
      ? `<span class="badge live">등록됨</span>${item.loop ? ' <span class="muted">반복</span>' : ''} ${item.ready ? '<span class="badge starting">재생 중</span>' : '<span class="muted">대기</span>'}`
      : '<span class="muted">미등록</span>';
  const action = item.registered
    ? `<button type="button" class="danger small" data-unregister="${escapeHtml(item.name)}">해제</button>`
    : `<label class="check small"><input type="checkbox" data-loop="${escapeHtml(item.file)}"> 반복</label>
       <button type="button" class="small" data-register="${escapeHtml(item.file)}">등록</button>`;
  return `<tr>
      <td>${escapeHtml(item.file)}${item.registered ? `<br><code>${escapeHtml(item.name)}</code>` : ''}</td>
      <td>${item.duration ? formatDuration(item.duration) : '-'}</td>
      <td>${item.size == null ? '-' : formatBytes(item.size)}</td>
      <td>${codecCell(item)}</td>
      <td>${status}</td>
      <td class="actions">${action}</td>
    </tr>
    ${urls ? `<tr class="urls"><td colspan="6">${urls}</td></tr>` : ''}`;
}

async function onClick(e) {
  const { register, unregister, copy, loop } = e.target.dataset;
  if (loop !== undefined) return; // 반복 체크박스는 등록할 때 함께 읽는다.
  try {
    if (register) {
      const checkbox = $(`[data-loop="${CSS.escape(register)}"]`);
      await api('POST', '/api/vod', { file: register, loop: checkbox?.checked ?? false });
    } else if (unregister) {
      if (!confirm(`${unregister} 등록을 해제할까요? 시청 중인 연결이 끊깁니다.`)) return;
      await api('DELETE', `/api/vod?name=${encodeURIComponent(unregister)}`);
    } else if (copy) {
      try {
        await navigator.clipboard.writeText(copy);
        e.target.textContent = '복사됨';
        setTimeout(() => (e.target.textContent = '복사'), 1500);
      } catch {
        e.target.previousElementSibling.select();
      }
      return;
    } else {
      return;
    }
  } catch (err) {
    alert(err.message);
  }
  await refresh();
}
