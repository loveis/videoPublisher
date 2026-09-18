// GitHub 릴리스에서 MediaMTX Windows 바이너리를 bin/ 에 내려받아 압축을 푸는 설치 스크립트
import { mkdir, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const VERSION = 'v1.21.0';
const binDir = path.resolve('bin');
const exe = path.join(binDir, 'mediamtx.exe');

try {
  await access(exe);
  console.log(`이미 설치됨: ${exe}`);
  process.exit(0);
} catch {}

const url = `https://github.com/bluenviron/mediamtx/releases/download/${VERSION}/mediamtx_${VERSION}_windows_amd64.zip`;
console.log(`다운로드: ${url}`);
const res = await fetch(url);
if (!res.ok) throw new Error(`다운로드 실패: HTTP ${res.status}`);

await mkdir(binDir, { recursive: true });
const zip = path.join(binDir, 'mediamtx.zip');
await writeFile(zip, Buffer.from(await res.arrayBuffer()));
// Windows 10+ 기본 bsdtar 는 zip 도 풀 수 있다. PATH 의 GNU tar(Git Bash)는 zip 을 못 풀어 경로를 명시.
// 번들 mediamtx.yml 은 쓰지 않으므로 exe 만 추출.
const tar = path.join(process.env.SystemRoot,'System32', 'tar.exe');
execFileSync(tar, ['-xf', zip, '-C', binDir, 'mediamtx.exe']);
console.log(`설치 완료: ${exe}`);
