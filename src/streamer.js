// 송출(스트림)별 FFmpeg 프로세스를 시작/중지하고 설정과 상태를 보관
import { spawn } from 'node:child_process';

const streams = new Map();

// WebRTC 브라우저 호환을 위해 H.264 baseline(B-frame 없음), GOP 2초로 인코딩해 MediaMTX 에 RTSP publish.
export function buildFfmpegArgs({ camera, width, height, fps, bitrate }, publishUrl) {
  return [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'dshow', '-rtbufsize', '256M',
    '-video_size', `${width}x${height}`, '-framerate', String(fps),
    '-i', `video=${camera}`,
    '-an',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
    '-profile:v', 'baseline', '-pix_fmt', 'yuv420p',
    '-b:v', `${bitrate}k`, '-maxrate', `${bitrate}k`, '-bufsize', `${bitrate * 2}k`,
    '-g', String(fps * 2),
    '-f', 'rtsp', '-rtsp_transport', 'tcp', publishUrl,
  ];
}

export function startStream(config, publishUrl) {
  const proc = spawn('ffmpeg', buildFfmpegArgs(config, publishUrl), { stdio: ['ignore', 'ignore', 'pipe'] });
  const stream = { ...config, startedAt: Date.now(), error: null, stopped: false, proc };
  let stderr = '';
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (d) => (stderr = (stderr + d).slice(-2000)));
  proc.on('error', (err) => (stream.error = err.message));
  proc.on('exit', (code) => {
    stream.proc = null;
    if (!stream.stopped) stream.error = stderr.trim() || `FFmpeg 종료 (code ${code})`;
  });
  streams.set(config.name, stream);
}

export function stopStream(name) {
  const stream = streams.get(name);
  if (!stream) return false;
  stream.stopped = true;
  stream.proc?.kill();
  streams.delete(name);
  return true;
}

export function updateStream(name, fields) {
  Object.assign(streams.get(name), fields);
}

export function stopAll() {
  for (const name of [...streams.keys()]) stopStream(name);
}

export function listStreams() {
  return [...streams.values()].map(({ proc, stopped, ...s }) => ({ ...s, running: proc !== null }));
}
