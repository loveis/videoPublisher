// 관리 웹 서버: 로그인, 카메라 송출 관리, MediaMTX 설정·세션·녹화·정보 API 제공
import './env.js';
import express from 'express';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { listCameras, getCameraOptions } from './devices.js';
import {
  startMediaMtx, stopMediaMtx, mediaMtxStatus, mtxApi, getGlobalConfig, getPathStats,
  applyConfig, setPathConfig, removePathConfig, MtxError,
} from './mediamtx.js';
import { startStream, stopStream, stopAll, listStreams, updateStream } from './streamer.js';
import { VOD_DIR, listFiles, probe, listRegistered, register, unregister, toPathName } from './vod.js';
import { portOf, streamUrls, playbackBase } from './urls.js';

const PORT = Number(process.env.PORT || 8080);
const ADMIN = { username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD || 'admin' };
// 관리 서버가 API 로 쓰고(api/apiAddress), FFmpeg 가 RTSP 로 publish(rtsp) 하므로 UI 에서 바꾸면 안 되는 항목.
const PROTECTED_KEYS = ['api', 'apiAddress', 'rtsp'];
const CONFIG_SECTIONS = ['global', 'pathdefaults'];
const sessions = new Set();

// 다른 PC 에서 접속할 URL 의 호스트. Hyper-V/WSL/VM 가상 어댑터와 링크 로컬(169.254.x)은 외부에서 닿지 않으므로 제외.
function publicHost() {
  if (process.env.PUBLIC_HOST) return process.env.PUBLIC_HOST;
  for (const [ifname, addrs] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|virtual|vmware|wsl|loopback/i.test(ifname)) continue;
    const v4 = addrs.find((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'));
    if (v4) return v4.address;
  }
  return 'localhost';
}

function getSid(req) {
  return req.headers.cookie?.match(/(?:^|;\s*)sid=([a-f0-9]+)/)?.[1];
}

const app = express();
app.use(express.json());
app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));

// ---- 인증 ----
app.post('/api/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (username !== ADMIN.username || password !== ADMIN.password) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }
  const sid = crypto.randomBytes(24).toString('hex');
  sessions.add(sid);
  res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; SameSite=Strict; Path=/`);
  res.json({ ok: true });
});

app.use('/api', (req, res, next) => {
  if (sessions.has(getSid(req))) return next();
  res.status(401).json({ error: '로그인이 필요합니다.' });
});

app.post('/api/logout', (req, res) => {
  sessions.delete(getSid(req));
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// ---- 카메라 ----
app.get('/api/cameras', async (req, res) => {
  res.json(await listCameras());
});

app.get('/api/cameras/:name/options', async (req, res) => {
  res.json(await getCameraOptions(req.params.name));
});

// ---- 송출 ----
app.get('/api/streams', async (req, res) => {
  const mediamtx = mediaMtxStatus();
  const streams = listStreams();
  if (!mediamtx.running) {
    return res.json({ mediamtx, available: [], streams: streams.map((s) => ({ ...s, ready: false, viewers: {}, urls: {} })) });
  }
  const [conf, stats] = await Promise.all([getGlobalConfig(), getPathStats()]);
  const host = publicHost();
  res.json({
    mediamtx,
    available: Object.keys(streamUrls('_', host, conf)),
    streams: streams.map((s) => ({
      ...s,
      ready: stats[s.name]?.ready ?? false,
      viewers: stats[s.name]?.viewers ?? {},
      urls: streamUrls(s.name, host, conf),
    })),
  });
});

app.post('/api/streams', async (req, res) => {
  const { name, camera, protocols, record } = req.body ?? {};
  const [width, height, fps, bitrate] = ['width', 'height', 'fps', 'bitrate'].map((k) => Number(req.body?.[k]));
  const fail = (error) => res.status(400).json({ error });

  if (!/^[A-Za-z0-9_-]{1,32}$/.test(name ?? '')) return fail('스트림 이름은 영문/숫자/_/- 1~32자여야 합니다.');
  const streams = listStreams();
  if (streams.some((s) => s.name === name)) return fail(`'${name}' 이름의 송출이 이미 있습니다.`);
  if (streams.some((s) => s.camera === camera)) return fail('이 카메라는 이미 송출 중입니다.');
  if (!(await listCameras()).some((c) => c.name === camera)) return fail('존재하지 않는 카메라입니다.');
  const option = (await getCameraOptions(camera)).find((o) => o.width === width && o.height === height);
  if (!option || !option.fps.includes(fps)) return fail('카메라가 지원하지 않는 해상도/프레임입니다.');
  if (!Number.isInteger(bitrate) || bitrate < 100 || bitrate > 20000) return fail('비트레이트는 100~20000 kbps 여야 합니다.');
  const conf = await getGlobalConfig();
  const available = Object.keys(streamUrls('_', 'h', conf));
  if (!Array.isArray(protocols) || protocols.length === 0 || !protocols.every((p) => available.includes(p))) {
    return fail('사용 가능한 프로토콜을 하나 이상 선택하세요.');
  }

  if (record) await setPathConfig(name, { record: true });
  const publishUrl = `rtsp://127.0.0.1:${portOf(conf.rtspAddress)}/${name}`;
  startStream({ name, camera, width, height, fps, bitrate, protocols, record: Boolean(record) }, publishUrl);
  res.status(201).json({ ok: true });
});

// 송출 중 녹화 on/off — 경로 설정만 바뀌고 publisher 연결은 유지된다.
app.patch('/api/streams/:name', async (req, res) => {
  const { name } = req.params;
  if (!listStreams().some((s) => s.name === name)) return res.status(404).json({ error: '송출을 찾을 수 없습니다.' });
  const record = Boolean(req.body?.record);
  await setPathConfig(name, { record });
  updateStream(name, { record });
  res.json({ ok: true });
});

app.delete('/api/streams/:name', async (req, res) => {
  if (!stopStream(req.params.name)) return res.status(404).json({ error: '송출을 찾을 수 없습니다.' });
  await removePathConfig(req.params.name);
  res.json({ ok: true });
});

// ---- VOD (폴더의 미디어 파일) ----
app.get('/api/vod', async (req, res) => {
  const [conf, stats, files, registered] = await Promise.all([getGlobalConfig(), getPathStats(), listFiles(), listRegistered()]);
  const host = publicHost();
  const byName = new Map(registered.map((r) => [r.name, r]));
  const items = [];
  for (const file of files) {
    const name = toPathName(file);
    const entry = byName.get(name);
    byName.delete(name);
    items.push({
      file,
      name,
      ...(await probe(file)),
      registered: Boolean(entry),
      loop: entry?.loop ?? false,
      missing: false,
      ready: stats[name]?.ready ?? false,
      viewers: stats[name]?.viewers ?? {},
      urls: entry ? streamUrls(name, host, conf) : {},
    });
  }
  // 파일은 없어졌는데 등록만 남아 있는 경로
  for (const entry of byName.values()) {
    items.push({ ...entry, file: entry.file, registered: true, missing: true, viewers: {}, urls: {} });
  }
  res.json({ dir: VOD_DIR, items: items.sort((a, b) => String(a.file).localeCompare(String(b.file))) });
});

app.post('/api/vod', async (req, res) => {
  const { file, loop } = req.body ?? {};
  // 폴더 밖 경로를 등록하지 못하도록 스캔된 목록에 있는 파일만 받는다.
  if (!(await listFiles()).includes(file)) return res.status(400).json({ error: '폴더에 없는 파일입니다.' });
  await register(file, Boolean(loop));
  res.status(201).json({ ok: true });
});

app.delete('/api/vod', async (req, res) => {
  await unregister(req.query.name ?? '');
  res.json({ ok: true });
});

// ---- MediaMTX 설정 ----
app.get('/api/config', async (req, res) => {
  const [global, pathDefaults] = await Promise.all([getGlobalConfig(), mtxApi('GET', '/v3/config/pathdefaults/get')]);
  res.json({ global, pathDefaults: pathDefaults.data, protectedKeys: PROTECTED_KEYS });
});

app.patch('/api/config/:section', async (req, res) => {
  const { section } = req.params;
  const patch = req.body ?? {};
  if (!CONFIG_SECTIONS.includes(section)) return res.status(404).json({ error: '알 수 없는 설정 구역입니다.' });
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: '변경된 항목이 없습니다.' });
  if (section === 'global') {
    const locked = Object.keys(patch).filter((k) => PROTECTED_KEYS.includes(k));
    if (locked.length) return res.status(400).json({ error: `변경할 수 없는 항목입니다: ${locked.join(', ')}` });
    if (patch.rtspEncryption === 'strict') {
      return res.status(400).json({ error: "rtspEncryption 'strict' 는 카메라 송출(평문 RTSP publish)을 막으므로 사용할 수 없습니다." });
    }
  }
  await applyConfig(section, patch);
  res.json({ ok: true });
});

// ---- 녹화 ----
// playback 서버의 /list 는 연속된 세그먼트를 하나의 구간으로 묶어 준다. 구간 단위로 다운로드하고, 삭제는 구간에 속한 세그먼트를 지운다.
app.get('/api/recordings', async (req, res) => {
  const conf = await getGlobalConfig();
  const base = playbackBase(publicHost(), conf);
  const localBase = conf.playback && !conf.playbackEncryption ? `http://127.0.0.1:${portOf(conf.playbackAddress)}` : null;
  const { data } = await mtxApi('GET', '/v3/recordings/list?itemsPerPage=1000');
  const recordings = [];
  for (const { name, segments } of data?.items ?? []) {
    const starts = segments.map((s) => s.start);
    let spans = starts.map((start) => ({ start, duration: null }));
    if (localBase) {
      const r = await fetch(`${localBase}/list?path=${encodeURIComponent(name)}`);
      if (r.ok) spans = await r.json();
    }
    recordings.push({
      name,
      spans: spans.map(({ start, duration }) => {
        const from = Date.parse(start);
        const to = duration === null ? from : from + duration * 1000;
        return {
          start,
          duration,
          segments: starts.filter((s) => Date.parse(s) >= from && Date.parse(s) <= to),
          downloadUrl: base && duration !== null
            ? `${base}/get?path=${encodeURIComponent(name)}&start=${encodeURIComponent(start)}&duration=${duration}&format=mp4`
            : null,
        };
      }),
    });
  }
  res.json({ playback: base, recordings });
});

app.delete('/api/recordings/:name', async (req, res) => {
  const starts = req.body?.segments ?? [];
  for (const start of starts) {
    const q = `path=${encodeURIComponent(req.params.name)}&start=${encodeURIComponent(start)}`;
    const r = await mtxApi('DELETE', `/v3/recordings/deletesegment?${q}`);
    if (!r.ok) throw new MtxError(r.data?.error ?? `HTTP ${r.status}`);
  }
  res.json({ ok: true, deleted: starts.length });
});

// ---- 서버 정보 / 메트릭 ----
app.get('/api/metrics', async (req, res) => {
  const conf = await getGlobalConfig();
  if (!conf.metrics) return res.status(404).json({ error: '메트릭이 꺼져 있습니다. 설정 > 모니터링에서 켜세요.' });
  const address = conf.metricsAddress.startsWith(':') ? `127.0.0.1${conf.metricsAddress}` : conf.metricsAddress;
  const r = await fetch(`${conf.metricsEncryption ? 'https' : 'http'}://${address}/metrics`);
  res.type('text/plain').status(r.status).send(await r.text());
});

// 그 외 MediaMTX API(세션 목록·강제 종료, 경로 목록, 서버 정보 등)는 로그인한 관리자에게 그대로 중계한다.
// 설정 변경은 yml 저장을 위해 위의 /api/config 로만 받는다.
app.all('/api/mtx/*path', async (req, res) => {
  const sub = req.params.path.join('/');
  if (sub.startsWith('config/') && req.method !== 'GET') {
    return res.status(403).json({ error: '설정 변경은 /api/config 를 사용하세요.' });
  }
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  const hasBody = req.body && Object.keys(req.body).length > 0;
  const r = await mtxApi(req.method, `/v3/${sub}${query}`, hasBody ? req.body : undefined);
  res.status(r.status).json(r.data);
});

app.use((err, req, res, next) => {
  // MediaMTX 가 재시작 중이면 fetch 자체가 실패한다. 예상된 상황이라 로그를 남기지 않는다.
  if (err.cause?.code === 'ECONNREFUSED') {
    return res.status(503).json({ error: 'MediaMTX 에 연결할 수 없습니다(재시작 중일 수 있음). 잠시 후 다시 시도하세요.' });
  }
  if (!(err instanceof MtxError)) console.error(err);
  res.status(err.status ?? 500).json({ error: err.message });
});

startMediaMtx();
app.listen(PORT, () => {
  console.log(`관리 화면: http://localhost:${PORT}`);
  console.log(`송출 URL 호스트: ${publicHost()}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopAll();
    stopMediaMtx();
    process.exit(0);
  });
}
