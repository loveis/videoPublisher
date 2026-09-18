// 관리 웹 서버: admin 로그인, 카메라/옵션 조회, 송출 시작·중지, 송출 URL 과 접속자 수 제공
import express from 'express';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { listCameras, getCameraOptions } from './devices.js';
import { startMediaMtx, stopMediaMtx, getPathStats, RTSP_PORT, WEBRTC_PORT } from './mediamtx.js';
import { startStream, stopStream, stopAll, listStreams } from './streamer.js';

const PORT = Number(process.env.PORT || 8080);
const ADMIN = { username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD || 'admin' };
const PROTOCOLS = ['rtsp', 'webrtc'];
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

function streamUrls(name, host) {
  return {
    rtsp: `rtsp://${host}:${RTSP_PORT}/${name}`,
    webrtc: `http://${host}:${WEBRTC_PORT}/${name}/`,
  };
}

function getSid(req) {
  return req.headers.cookie?.match(/(?:^|;\s*)sid=([a-f0-9]+)/)?.[1];
}

const app = express();
app.use(express.json());
app.use(express.static(path.resolve('public')));

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

app.get('/api/cameras', async (req, res) => {
  res.json(await listCameras());
});

app.get('/api/cameras/:name/options', async (req, res) => {
  res.json(await getCameraOptions(req.params.name));
});

app.get('/api/streams', async (req, res) => {
  const stats = await getPathStats();
  const host = publicHost();
  res.json(
    listStreams().map((s) => ({
      ...s,
      ready: stats[s.name]?.ready ?? false,
      viewers: stats[s.name]?.viewers ?? { rtsp: 0, webrtc: 0 },
      urls: streamUrls(s.name, host),
    })),
  );
});

app.post('/api/streams', async (req, res) => {
  const { name, camera, protocols } = req.body ?? {};
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
  if (!Array.isArray(protocols) || protocols.length === 0 || !protocols.every((p) => PROTOCOLS.includes(p))) {
    return fail('프로토콜을 하나 이상 선택하세요.');
  }

  startStream({ name, camera, width, height, fps, bitrate, protocols });
  res.status(201).json({ ok: true });
});

app.delete('/api/streams/:name', (req, res) => {
  if (!stopStream(req.params.name)) return res.status(404).json({ error: '송출을 찾을 수 없습니다.' });
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
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
