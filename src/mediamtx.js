// MediaMTX 프로세스를 실행/종료하고, API 로 스트림 경로별 프로토콜 접속자 수를 조회
import { spawn } from 'node:child_process';
import path from 'node:path';

// 포트는 환경변수로 바꿀 수 있고, MediaMTX 에는 MTX_* 환경변수로 mediamtx.yml 값을 덮어써 전달한다.
export const RTSP_PORT = Number(process.env.RTSP_PORT ?? 8554);
export const WEBRTC_PORT = Number(process.env.WEBRTC_PORT ?? 8889);
const WEBRTC_UDP_PORT = Number(process.env.WEBRTC_UDP_PORT ?? 8189);
const API_PORT = Number(process.env.MEDIAMTX_API_PORT ?? 9997);
const API = `http://127.0.0.1:${API_PORT}`;

// MediaMTX reader type → UI 프로토콜 키
const READER_PROTOCOL = { rtspSession: 'rtsp', rtspsSession: 'rtsp', webRTCSession: 'webrtc' };

let proc = null;
let stopping = false;

export function startMediaMtx() {
  proc = spawn(path.resolve('bin/mediamtx.exe'), [path.resolve('mediamtx.yml')], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      MTX_RTSPADDRESS: `:${RTSP_PORT}`,
      MTX_WEBRTCADDRESS: `:${WEBRTC_PORT}`,
      MTX_WEBRTCLOCALUDPADDRESS: `:${WEBRTC_UDP_PORT}`,
      MTX_APIADDRESS: `127.0.0.1:${API_PORT}`,
    },
  });
  proc.on('error', (err) => {
    console.error(`MediaMTX 실행 실패: ${err.message} — 먼저 'npm run setup' 을 실행하세요.`);
    process.exit(1);
  });
  // MediaMTX 없이는 송출이 불가능하므로 예기치 않게 죽으면 서버도 종료한다.
  proc.on('exit', (code) => {
    if (stopping) return;
    console.error(`MediaMTX 가 종료되었습니다 (code ${code}).`);
    process.exit(1);
  });
}

export function stopMediaMtx() {
  stopping = true;
  proc?.kill();
}

// 반환: { [pathName]: { ready, viewers: { rtsp, webrtc } } }
export async function getPathStats() {
  const res = await fetch(`${API}/v3/paths/list?itemsPerPage=1000`);
  if (!res.ok) throw new Error(`MediaMTX API 오류: HTTP ${res.status}`);
  const { items } = await res.json();
  const stats = {};
  for (const item of items) {
    const viewers = { rtsp: 0, webrtc: 0 };
    for (const reader of item.readers) {
      const protocol = READER_PROTOCOL[reader.type];
      if (protocol) viewers[protocol]++;
    }
    stats[item.name] = { ready: item.ready, viewers };
  }
  return stats;
}
