// 송출 탭: 카메라/해상도/프레임 선택, 송출 시작·중지, 녹화 on/off, 프로토콜별 URL 과 접속자 수
import { api, escapeHtml, setHtml, showMediaMtxStatus, PROTOCOL_LABEL } from './api.js';

const $ = (sel) => document.querySelector(sel);
const form = $('#stream-form');
const DEFAULT_PROTOCOLS = ['rtsp', 'webrtc'];
let cameraOptions = [];
let available = [];

export function init() {
  form.camera.addEventListener('change', loadOptions);
  form.resolution.addEventListener('change', updateFps);
  $('#refresh-cameras').addEventListener('click', loadCameras);
  form.addEventListener('submit', submit);
  $('#streams').addEventListener('click', onListClick);
  $('#streams').addEventListener('change', onListChange);
  loadCameras();
}

// ---- 카메라 / 옵션 ----
async function loadCameras() {
  const cameras = await api('GET', '/api/cameras');
  form.camera.innerHTML = cameras.length
    ? cameras.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')
    : '<option value="">카메라 없음</option>';
  await loadOptions();
}

async function loadOptions() {
  form.resolution.innerHTML = '<option value="">조회 중…</option>';
  form.fps.innerHTML = '';
  cameraOptions = form.camera.value
    ? await api('GET', `/api/camera-options?id=${encodeURIComponent(form.camera.value)}`)
    : [];
  form.resolution.innerHTML = cameraOptions.length
    ? cameraOptions.map((o, i) => `<option value="${i}">${o.width} × ${o.height}</option>`).join('')
    : '<option value="">지원 해상도 없음</option>';
  updateFps();
}

function updateFps() {
  const option = cameraOptions[form.resolution.value];
  form.fps.innerHTML = option ? option.fps.map((f) => `<option>${f}</option>`).join('') : '';
}

// MediaMTX 에서 켜진 프로토콜만 선택지로 보여 준다. 목록이 바뀔 때만 다시 그려 사용자의 체크 상태를 유지.
function renderProtocolChecks(list) {
  if (list.join() === available.join()) return;
  const checked = new Set([...form.querySelectorAll('input[name=protocols]:checked')].map((i) => i.value));
  const initial = available.length === 0;
  available = list;
  $('#protocol-checks').innerHTML = list
    .map((p) => {
      const on = initial ? DEFAULT_PROTOCOLS.includes(p) : checked.has(p);
      return `<label class="check"><input type="checkbox" name="protocols" value="${p}" ${on ? 'checked' : ''}> ${PROTOCOL_LABEL[p]}</label>`;
    })
    .join('');
}

async function submit(e) {
  e.preventDefault();
  const option = cameraOptions[form.resolution.value];
  const protocols = [...form.querySelectorAll('input[name=protocols]:checked')].map((i) => i.value);
  $('#stream-error').textContent = '';
  $('#start-btn').disabled = true;
  try {
    await api('POST', '/api/streams', {
      name: form.streamName.value.trim() || form.streamName.placeholder,
      camera: form.camera.value,
      width: option?.width,
      height: option?.height,
      fps: Number(form.fps.value),
      bitrate: Number(form.bitrate.value),
      protocols,
      record: form.record.checked,
    });
    form.streamName.value = '';
    await refresh();
  } catch (err) {
    $('#stream-error').textContent = err.message;
  } finally {
    $('#start-btn').disabled = false;
  }
}

// ---- 송출 목록 ----
export async function refresh() {
  const data = await api('GET', '/api/streams');
  showMediaMtxStatus(data.mediamtx);
  renderProtocolChecks(data.available);
  setHtml(
    $('#streams'),
    data.streams.length ? data.streams.map(renderStream).join('') : '<p class="muted">송출 중인 스트림이 없습니다.</p>',
  );
  if (!form.streamName.value) form.streamName.placeholder = nextStreamName(data.streams);
}

function renderStream(s) {
  const [cls, label] = !s.running ? ['error', '오류'] : s.ready ? ['live', '송출 중'] : ['starting', '연결 중'];
  // 송출 시작 후 설정에서 꺼진 프로토콜은 URL 이 없으므로 표시하지 않는다.
  const urls = s.protocols
    .filter((p) => s.urls[p])
    .map(
      (p) => `
      <div class="url-row">
        <span class="proto">${PROTOCOL_LABEL[p]}</span>
        <input readonly value="${escapeHtml(s.urls[p])}">
        <button type="button" data-copy="${escapeHtml(s.urls[p])}">복사</button>
        <span class="viewers">접속 <b>${s.viewers[p] ?? 0}</b>명</span>
      </div>`,
    )
    .join('');
  return `
    <div class="stream">
      <div class="stream-head">
        <strong>${escapeHtml(s.name)}</strong>
        <span class="badge ${cls}">${label}</span>
        ${s.record ? '<span class="badge rec">● 녹화 중</span>' : ''}
        <span class="spec">${escapeHtml(s.cameraName ?? s.camera)} · ${s.width}×${s.height} · ${s.fps}fps · ${s.bitrate}kbps</span>
        <label class="check small"><input type="checkbox" data-record="${escapeHtml(s.name)}" ${s.record ? 'checked' : ''}> 녹화</label>
        <button type="button" class="danger" data-stop="${escapeHtml(s.name)}">중지</button>
      </div>
      ${urls}
      ${s.error ? `<p class="error">${escapeHtml(s.error)}</p>` : ''}
    </div>`;
}

function nextStreamName(streams) {
  const names = new Set(streams.map((s) => s.name));
  let i = 1;
  while (names.has(`cam${i}`)) i++;
  return `cam${i}`;
}

async function onListClick(e) {
  const { stop, copy } = e.target.dataset;
  if (stop) {
    await api('DELETE', `/api/streams/${encodeURIComponent(stop)}`);
    await refresh();
  } else if (copy) {
    // clipboard API 는 localhost/HTTPS 에서만 동작하므로, 실패하면 입력칸을 선택해 수동 복사하게 한다.
    try {
      await navigator.clipboard.writeText(copy);
      e.target.textContent = '복사됨';
      setTimeout(() => (e.target.textContent = '복사'), 1500);
    } catch {
      e.target.previousElementSibling.select();
    }
  }
}

async function onListChange(e) {
  const name = e.target.dataset.record;
  if (!name) return;
  e.target.disabled = true;
  try {
    await api('PATCH', `/api/streams/${encodeURIComponent(name)}`, { record: e.target.checked });
  } catch (err) {
    alert(err.message);
  }
  // 실패 시 서버 상태가 그대로라 HTML 이 같아 다시 그려지지 않으므로 캐시를 비워 체크 상태를 되돌린다.
  $('#streams').dataset.html = '';
  await refresh();
}
