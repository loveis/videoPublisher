// VOD: 지정 폴더의 미디어 파일을 스캔·분석하고, 시청 요청이 있을 때만(runOnDemand) FFmpeg 로 송출하는 MediaMTX 경로로 등록
import { readdir, mkdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mtxApi, setPathConfig, removePathConfig, MtxError } from './mediamtx.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const VOD_DIR = path.resolve(ROOT, process.env.VOD_DIR || 'media');
export const PATH_PREFIX = 'vod/';
const MEDIA_EXT = new Set(['.mp4', '.mkv', '.mov', '.m4v', '.ts', '.webm', '.avi', '.flv', '.mp3', '.m4a', '.aac', '.wav']);
const CLOSE_AFTER = '10s';
// ffprobe 는 파일당 수백 ms 가 걸려 목록 폴링마다 다시 하지 않도록 크기·수정시각을 키로 캐시한다.
const probeCache = new Map();

await mkdir(VOD_DIR, { recursive: true });

// 파일 경로를 MediaMTX 경로 이름으로: 확장자를 떼고 폴더 구조는 유지, 허용되지 않는 글자는 _ 로 바꾼다.
// 한글처럼 전부 _ 가 되는 이름끼리 겹치지 않도록, 글자가 바뀐 이름에는 원본 경로의 짧은 해시를 붙인다.
export function toPathName(relative) {
  const withoutExt = relative.replace(/\.[^.]+$/, '');
  const segments = withoutExt.split(/[\\/]/);
  const sanitized = segments.map((s) => s.replace(/[^A-Za-z0-9_-]/g, '_')).join('/');
  if (sanitized === segments.join('/')) return PATH_PREFIX + sanitized;
  const hash = crypto.createHash('sha1').update(relative).digest('hex').slice(0, 6);
  return `${PATH_PREFIX}${sanitized}-${hash}`;
}

// 영상은 H.264 면 복사, 그 외에는 H.264 로 변환. 오디오는 WebRTC 호환을 위해 Opus 로 맞춘다.
export function buildCommand({ file, loop, video, audio }) {
  const args = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-re'];
  if (loop) args.push('-stream_loop', '-1');
  args.push('-i', `"${file}"`);
  args.push(...(video === 'h264' ? ['-c:v', 'copy'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p']));
  if (!audio) args.push('-an');
  else args.push(...(audio === 'opus' ? ['-c:a', 'copy'] : ['-c:a', 'libopus', '-b:a', '128k', '-ar', '48000', '-ac', '2']));
  // $RTSP_PORT, $MTX_PATH 는 MediaMTX 가 실행할 때 채워 준다.
  args.push('-f', 'rtsp', '-rtsp_transport', 'tcp', 'rtsp://127.0.0.1:$RTSP_PORT/$MTX_PATH');
  return args.join(' ');
}

export async function listFiles(dir = VOD_DIR, base = '') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(dir, entry.name), relative)));
    } else if (MEDIA_EXT.has(path.extname(entry.name).toLowerCase())) {
      files.push(relative);
    }
  }
  return files;
}

export async function probe(relative) {
  const absolute = path.join(VOD_DIR, relative);
  const { size, mtimeMs } = await stat(absolute);
  const key = `${size}:${mtimeMs}`;
  const cached = probeCache.get(relative);
  if (cached?.key === key) return cached.info;

  const json = await new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error', '-show_entries', 'stream=codec_type,codec_name:format=duration', '-of', 'json', absolute,
    ]);
    let out = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (d) => (out += d));
    proc.on('error', reject);
    proc.on('close', () => resolve(out));
  });
  const parsed = JSON.parse(json || '{}');
  const stream = (type) => parsed.streams?.find((s) => s.codec_type === type)?.codec_name ?? null;
  const info = { size, duration: Number(parsed.format?.duration) || null, video: stream('video'), audio: stream('audio') };
  probeCache.set(relative, { key, info });
  return info;
}

// 등록된 VOD 는 MediaMTX 경로 설정(mediamtx.yml)에 남으므로 그것을 그대로 목록의 원천으로 쓴다.
export async function listRegistered() {
  const res = await mtxApi('GET', '/v3/config/paths/list?itemsPerPage=1000');
  if (!res.ok) throw new MtxError(res.data?.error ?? `HTTP ${res.status}`, 502);
  return res.data.items
    .filter((item) => item.name.startsWith(PATH_PREFIX) && item.runOnDemand)
    .map((item) => ({
      name: item.name,
      loop: item.runOnDemand.includes('-stream_loop -1'),
      // 등록할 때 넣은 따옴표 안의 원본 파일 경로
      file: item.runOnDemand.match(/-i "(.+?)"/)?.[1] ?? null,
    }));
}

export async function register(relative, loop) {
  const { video, audio } = await probe(relative);
  const file = path.join(VOD_DIR, relative).replace(/\\/g, '/');
  await setPathConfig(toPathName(relative), {
    runOnDemand: buildCommand({ file, loop, video, audio }),
    runOnDemandRestart: Boolean(loop),
    runOnDemandCloseAfter: CLOSE_AFTER,
  });
}

export async function unregister(name) {
  if (!name.startsWith(PATH_PREFIX)) throw new MtxError('VOD 경로가 아닙니다.');
  await removePathConfig(name);
}
