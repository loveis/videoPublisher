// 프로젝트 루트의 .env 를 process.env 로 로딩 — 다른 모듈이 설정을 읽기 전에 가장 먼저 import 해야 한다
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// npm start 뿐 아니라 node src/server.js, VS Code 디버거 등 어떤 방식·작업 폴더로 실행해도 같은 .env 를 쓰도록 경로를 고정.
const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
