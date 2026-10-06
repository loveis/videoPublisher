// 카메라 목록과 해상도/프레임 옵션 조회 — 윈도우는 FFmpeg DirectShow, 리눅스는 V4L2(/dev/video*)
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';

const COMMON_FPS = [5, 10, 15, 20, 24, 25, 30, 50, 60];
const V4L2_SYS_DIR = '/sys/class/video4linux';
const isWindows = process.platform === 'win32';
const optionsCache = new Map();

// 장치 조회 명령은 종료 코드가 0 이 아닐 수 있어(특히 ffmpeg dshow) 코드 대신 출력만 사용한다.
function run(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    let out = '';
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (out += d));
    proc.on('error', reject);
    proc.on('close', () => resolve(out));
  });
}

// ---- 윈도우 (DirectShow) ----
export function parseDeviceList(text) {
  const devices = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/\] "(.+)" \(video\)\s*$/);
    if (m) devices.push({ id: m[1], name: m[1] });
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
    addOption(byRes, width, height, [minFps, maxFps, ...COMMON_FPS.filter((f) => f > minFps && f < maxFps)]);
  }
  return sortOptions(byRes);
}

// ---- 리눅스 (V4L2) ----
// v4l2-ctl --list-formats-ext 출력에서 해상도(Size)와 그 해상도가 지원하는 프레임(Interval)을 모은다.
export function parseV4l2Options(text) {
  const byRes = new Map();
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const size = line.match(/Size:\s+Discrete\s+(\d+)x(\d+)/);
    if (size) {
      current = { width: Number(size[1]), height: Number(size[2]) };
      continue;
    }
    const fps = line.match(/Interval:\s+Discrete\s+[\d.]+s\s+\(([\d.]+)\s*fps\)/);
    if (fps && current) addOption(byRes, current.width, current.height, [Math.round(Number(fps[1]))]);
  }
  return sortOptions(byRes);
}

function addOption(byRes, width, height, fpsList) {
  const key = `${width}x${height}`;
  if (!byRes.has(key)) byRes.set(key, { width, height, fps: new Set() });
  for (const f of fpsList) byRes.get(key).fps.add(f);
}

function sortOptions(byRes) {
  return [...byRes.values()]
    .map((r) => ({ ...r, fps: [...r.fps].sort((a, b) => b - a) }))
    .sort((a, b) => b.width * b.height - a.width * a.height);
}

// 웹캠 하나가 /dev/video0(영상)과 /dev/video1(메타데이터)처럼 여러 노드를 만들기도 한다.
// 실제로 쓸 수 있는 해상도가 있는 노드만 카메라로 보여 준다.
async function listV4l2Cameras() {
  let nodes;
  try {
    nodes = (await readdir(V4L2_SYS_DIR)).filter((n) => /^video\d+$/.test(n)).sort();
  } catch {
    return []; // 카메라가 없는 서버/컨테이너
  }
  const cameras = [];
  for (const node of nodes) {
    const id = `/dev/${node}`;
    if ((await getCameraOptions(id)).length === 0) continue;
    const name = await readFile(`${V4L2_SYS_DIR}/${node}/name`, 'utf8').catch(() => node);
    cameras.push({ id, name: `${name.trim()} (${id})` });
  }
  return cameras;
}

// ---- 공통 ----
export async function listCameras() {
  if (!isWindows) return listV4l2Cameras();
  return parseDeviceList(await run('ffmpeg', ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']));
}

// 송출 중인 카메라는 옵션 조회가 실패(빈 결과)하므로, 성공한 결과만 캐시해 두고 재사용한다.
export async function getCameraOptions(id) {
  const options = isWindows
    ? parseOptions(await run('ffmpeg', ['-hide_banner', '-f', 'dshow', '-list_options', 'true', '-i', `video=${id}`]))
    : parseV4l2Options(await run('v4l2-ctl', ['-d', id, '--list-formats-ext']).catch(() => ''));
  if (options.length > 0) optionsCache.set(id, options);
  return optionsCache.get(id) ?? [];
}
