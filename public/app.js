// 관리 화면 동작: 로그인, 카메라/옵션 선택, 송출 시작·중지, 송출 목록과 접속자 수 주기적 갱신
const $ = (sel) => document.querySelector(sel);
const form = $('#stream-form');
const PROTOCOL_LABEL = { rtsp: 'RTSP', webrtc: 'WebRTC' };
let cameraOptions = [];
let pollTimer = null;

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') {
    showLogin();
    throw new Error(data.error);
  }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function showLogin() {
  clearInterval(pollTimer);
  $('#main-view').hidden = true;
  $('#login-view').hidden = false;
}

async function showMain() {
  $('#login-view').hidden = true;
  $('#main-view').hidden = false;
  await loadCameras();
  await refreshStreams();
  clearInterval(pollTimer);
  pollTimer = setInterval(refreshStreams, 2000);
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('#login-error').textContent = '';
  try {
    await api('POST', '/api/login', { username: f.username.value, password: f.password.value });
    f.reset();
    await showMain();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('POST', '/api/logout');
  showLogin();
});

// ---- 카메라 / 옵션 ----
async function loadCameras() {
  const cameras = await api('GET', '/api/cameras');
  form.camera.innerHTML = cameras.length
    ? cameras.map((c) => `<option>${escapeHtml(c.name)}</option>`).join('')
    : '<option value="">카메라 없음</option>';
  await loadOptions();
}

async function loadOptions() {
  form.resolution.innerHTML = '<option value="">조회 중…</option>';
  form.fps.innerHTML = '';
  cameraOptions = form.camera.value
    ? await api('GET', `/api/cameras/${encodeURIComponent(form.camera.value)}/options`)
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

form.camera.addEventListener('change', loadOptions);
form.resolution.addEventListener('change', updateFps);
$('#refresh-cameras').addEventListener('click', loadCameras);

form.addEventListener('submit', async (e) => {
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
    });
    form.streamName.value = '';
    await refreshStreams();
  } catch (err) {
    $('#stream-error').textContent = err.message;
  } finally {
    $('#start-btn').disabled = false;
  }
});

// ---- 송출 목록 ----
async function refreshStreams() {
  const streams = await api('GET', '/api/streams');
  const box = $('#streams');
  const html = streams.length
    ? streams.map(renderStream).join('')
    : '<p class="muted">송출 중인 스트림이 없습니다.</p>';
  // 변경이 없으면 다시 그리지 않아 URL 선택/복사 표시가 폴링마다 풀리지 않게 한다.
  if (box.dataset.html !== html) {
    box.innerHTML = html;
    box.dataset.html = html;
  }
  if (!form.streamName.value) form.streamName.placeholder = nextStreamName(streams);
}

function renderStream(s) {
  const [cls, label] = !s.running ? ['error', '오류'] : s.ready ? ['live', '송출 중'] : ['starting', '연결 중'];
  const urls = s.protocols
    .map(
      (p) => `
      <div class="url-row">
        <span class="proto">${PROTOCOL_LABEL[p]}</span>
        <input readonly value="${escapeHtml(s.urls[p])}">
        <button type="button" data-copy="${escapeHtml(s.urls[p])}">복사</button>
        <span class="viewers">접속 <b>${s.viewers[p]}</b>명</span>
      </div>`,
    )
    .join('');
  return `
    <div class="stream">
      <div class="stream-head">
        <strong>${escapeHtml(s.name)}</strong>
        <span class="badge ${cls}">${label}</span>
        <span class="spec">${escapeHtml(s.camera)} · ${s.width}×${s.height} · ${s.fps}fps · ${s.bitrate}kbps</span>
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

$('#streams').addEventListener('click', async (e) => {
  const { stop, copy } = e.target.dataset;
  if (stop) {
    await api('DELETE', `/api/streams/${encodeURIComponent(stop)}`);
    await refreshStreams();
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
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// 이미 로그인된 세션이면 바로 메인 화면으로.
fetch('/api/streams').then((res) => (res.ok ? showMain() : showLogin()));
