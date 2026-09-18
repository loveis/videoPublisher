// MediaMTX 프로세스 실행·감시(비정상 종료 시 재시작), API 호출, 설정 적용(API 즉시 반영 후 mediamtx.yml 기록)
import { spawn } from 'node:child_process';
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import YAML from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const YML = path.join(ROOT, 'mediamtx.yml');
const RESTART_DELAY_MS = 3000;
const ALIVE_CHECK_DELAY_MS = 1500;

// mediamtx.yml 은 PC 별 설정(Git 제외). 처음 실행이면 예시 설정을 복사한다.
if (!existsSync(YML)) copyFileSync(path.join(ROOT, 'mediamtx.example.yml'), YML);

// 관리 서버가 호출할 API 주소. apiAddress 는 UI 에서 바꿀 수 없는 보호 항목이라 시작 시 한 번만 읽는다.
const apiAddress = YAML.parse(readFileSync(YML, 'utf8')).apiAddress ?? '127.0.0.1:9997';
const API = `http://${apiAddress.startsWith(':') ? `127.0.0.1${apiAddress}` : apiAddress}`;

// MediaMTX reader/source type → 프로토콜 키
const TYPE_PROTOCOL = {
  rtspSession: 'rtsp', rtspsSession: 'rtsps', rtmpConn: 'rtmp', rtmpsConn: 'rtmps',
  hlsSession: 'hls', webRTCSession: 'webrtc', srtConn: 'srt',
};

export class MtxError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

let proc = null;
let shuttingDown = false;
let lastError = '';

export function startMediaMtx() {
  lastError = '';
  proc = spawn(path.join(ROOT, 'bin', 'mediamtx.exe'), [YML], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (d) => {
    process.stdout.write(d);
    const errors = d.match(/ERR .*/g);
    if (errors) lastError = errors.at(-1);
  });
  proc.on('error', (err) => {
    console.error(`MediaMTX 실행 실패: ${err.message} — 먼저 'npm run setup' 을 실행하세요.`);
    process.exit(1);
  });
  // 잘못된 설정(사용 중인 포트 등)으로 죽어도 관리 화면은 살려 두고, yml 기준으로 다시 띄운다.
  proc.on('exit', (code) => {
    proc = null;
    if (shuttingDown) return;
    console.error(`MediaMTX 가 종료되었습니다 (code ${code}). ${RESTART_DELAY_MS / 1000}초 후 재시작합니다.`);
    setTimeout(startMediaMtx, RESTART_DELAY_MS);
  });
}

export function stopMediaMtx() {
  shuttingDown = true;
  proc?.kill();
}

export function mediaMtxStatus() {
  return { running: proc !== null, lastError };
}

// MediaMTX API 호출. 404 등은 JSON 이 아닌 평문을 돌려주므로 { error } 로 감싼다.
export async function mtxApi(method, pathname, body) {
  const res = await fetch(API + pathname, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.trim() };
  }
  return { ok: res.ok, status: res.status, data };
}

async function mtxGet(pathname) {
  const res = await mtxApi('GET', pathname);
  if (!res.ok) throw new MtxError(res.data?.error ?? `MediaMTX API 오류: HTTP ${res.status}`, 502);
  return res.data;
}

export const getGlobalConfig = () => mtxGet('/v3/config/global/get');

// 반환: { [pathName]: { ready, viewers: { [protocol]: count } } }
export async function getPathStats() {
  const { items } = await mtxGet('/v3/paths/list?itemsPerPage=1000');
  const stats = {};
  for (const item of items) {
    const viewers = {};
    for (const { type } of item.readers) {
      const key = TYPE_PROTOCOL[type] ?? type;
      viewers[key] = (viewers[key] ?? 0) + 1;
    }
    stats[item.name] = { ready: item.ready, viewers };
  }
  return stats;
}

function editYml(edit) {
  const doc = YAML.parseDocument(readFileSync(YML, 'utf8'));
  edit(doc);
  writeFileSync(YML, doc.toString());
}

// patch 가 200 이어도 MediaMTX 가 새 설정으로 재시작하다 죽는 경우(사용 중인 포트 등)가 있어 잠시 뒤 생존을 확인한다.
async function ensureAlive() {
  await new Promise((r) => setTimeout(r, ALIVE_CHECK_DELAY_MS));
  const alive = proc !== null && (await mtxApi('GET', '/v3/info').catch(() => ({ ok: false }))).ok;
  if (!alive) {
    throw new MtxError(`MediaMTX 가 새 설정을 적용하지 못하고 종료되었습니다. 설정은 저장하지 않았고 이전 설정으로 재시작합니다.\n${lastError}`, 500);
  }
}

// section: 'global' | 'pathdefaults'. 검증·반영은 MediaMTX 가 하고, 성공한 값만 yml 에 기록한다(주석 유지).
export async function applyConfig(section, patch) {
  const res = await mtxApi('PATCH', `/v3/config/${section}/patch`, patch);
  if (!res.ok) throw new MtxError(res.data?.error ?? `HTTP ${res.status}`);
  await ensureAlive();
  const prefix = section === 'pathdefaults' ? ['pathDefaults'] : [];
  editYml((doc) => {
    for (const [key, value] of Object.entries(patch)) doc.setIn([...prefix, key], value);
  });
}

// 스트림별 경로 설정(녹화 등). MediaMTX 는 yml 이 바뀌면 전체를 다시 읽어 API 로만 넣은 경로 설정이 사라지므로 yml 에도 기록한다.
export async function setPathConfig(name, conf) {
  let res = await mtxApi('PATCH', `/v3/config/paths/patch/${name}`, conf);
  if (!res.ok) res = await mtxApi('POST', `/v3/config/paths/add/${name}`, conf);
  if (!res.ok) throw new MtxError(res.data?.error ?? `HTTP ${res.status}`);
  editYml((doc) => {
    for (const [key, value] of Object.entries(conf)) doc.setIn(['paths', name, key], value);
  });
}

export async function removePathConfig(name) {
  await mtxApi('DELETE', `/v3/config/paths/delete/${name}`);
  const doc = YAML.parseDocument(readFileSync(YML, 'utf8'));
  if (doc.hasIn(['paths', name])) editYml((d) => d.deleteIn(['paths', name]));
}
