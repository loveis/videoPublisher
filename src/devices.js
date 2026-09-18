// FFmpeg dshow 로 PC 에 연결된 카메라 목록과 카메라별 해상도/프레임 옵션을 조회
import { spawn } from 'node:child_process';

const COMMON_FPS = [5, 10, 15, 20, 24, 25, 30, 50, 60];
const optionsCache = new Map();

// ffmpeg 의 dshow 조회 명령은 항상 exit code 1 로 끝나므로 종료 코드 대신 stderr 를 그대로 돌려준다.
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-hide_banner', ...args]);
    let out = '';
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (d) => (out += d));
    proc.on('error', reject);
    proc.on('close', () => resolve(out));
  });
}

export function parseDeviceList(text) {
  const devices = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/\] "(.+)" \(video\)\s*$/);
    if (m) devices.push({ name: m[1] });
  }
  return devices;
}

export function parseOptions(text) {
  const byRes = new Map();
  const re = /min s=(\d+)x(\d+) fps=([\d.]+) max s=(\d+)x(\d+) fps=([\d.]+)/;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(re);
    if (!m) continue;
    const [width, height] = [Number(m[4]), Number(m[5])];
    const minFps = Math.round(Number(m[3]));
    const maxFps = Math.round(Number(m[6]));
    const key = `${width}x${height}`;
    if (!byRes.has(key)) byRes.set(key, { width, height, fps: new Set() });
    const fps = byRes.get(key).fps;
    fps.add(minFps).add(maxFps);
    for (const f of COMMON_FPS) if (f > minFps && f < maxFps) fps.add(f);
  }
  return [...byRes.values()]
    .map((r) => ({ ...r, fps: [...r.fps].sort((a, b) => b - a) }))
    .sort((a, b) => b.width * b.height - a.width * a.height);
}

export async function listCameras() {
  return parseDeviceList(await runFfmpeg(['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']));
}

// 송출 중인 카메라는 옵션 조회가 실패(빈 결과)하므로, 성공한 결과만 캐시해 두고 재사용한다.
export async function getCameraOptions(name) {
  const options = parseOptions(
    await runFfmpeg(['-f', 'dshow', '-list_options', 'true', '-i', `video=${name}`]),
  );
  if (options.length > 0) optionsCache.set(name, options);
  return optionsCache.get(name) ?? [];
}
