# 미디어 송출기 (video-publisher)

PC에 연결된 카메라 영상을 **RTSP / WebRTC** 로 송출하고, 웹 관리 화면에서 송출 URL과 접속자 수를 확인하는 앱입니다.

```
카메라 ──dshow──▶ FFmpeg(H.264) ──RTSP publish──▶ MediaMTX ──▶ RTSP 시청자 (VLC, ffplay …)
                                                      └──▶ WebRTC 시청자 (브라우저)
관리 웹(Node/Express) : 카메라·해상도·프레임·비트레이트·프로토콜 선택, 송출 시작/중지, URL·접속자 수 표시
```

## 요구 사항
- Windows 10/11
- Node.js 20.12 이상 (`.env` 로딩에 내장 `process.loadEnvFile` 사용)
- FFmpeg — PATH 에 `ffmpeg` 가 있어야 하며 libx264 가 포함된 빌드
  - 확인: `ffmpeg -hide_banner -encoders | findstr libx264`

## 실행 가이드

### 1. 설치 (최초 1회)
```bash
npm install
npm run setup          # MediaMTX 바이너리를 bin/ 에 내려받음
copy .env.example .env # 설정 파일 생성 (Git Bash 에서는 cp .env.example .env)
```

### 2. 설정 (`.env`)
`.env` 를 열어 필요한 값만 수정합니다. 값을 비워 두면 기본값이 쓰입니다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | 8080 | 관리 웹 포트 |
| `ADMIN_USERNAME` | admin | 관리자 아이디 |
| `ADMIN_PASSWORD` | admin | 관리자 비밀번호 |
| `PUBLIC_HOST` | 자동 감지 | 송출 URL 에 표시할 호스트(IP/도메인). 자동 감지된 IP 가 틀리면 지정 |
| `RTSP_PORT` | 8554 | RTSP 포트 |
| `WEBRTC_PORT` | 8889 | WebRTC(HTTP) 포트 |
| `WEBRTC_UDP_PORT` | 8189 | WebRTC 미디어(UDP) 포트 |
| `MEDIAMTX_API_PORT` | 9997 | MediaMTX 내부 API 포트 (127.0.0.1 전용) |

`.env` 는 PC 별 설정이라 Git 에 올라가지 않습니다. 새 설정 항목은 `.env.example` 에 추가하세요.

### 3. 실행
```bash
npm start
```
콘솔에 다음처럼 출력되면 정상입니다.
```
관리 화면: http://localhost:8080
송출 URL 호스트: 172.24.24.147
```
종료는 `Ctrl+C` 입니다. 송출 중인 FFmpeg 와 MediaMTX 도 함께 종료됩니다.

처음 실행하면 Windows 방화벽이 `mediamtx.exe` 의 네트워크 허용 여부를 묻습니다. 다른 PC 에서 시청하려면 **허용**해야 합니다.
관리 화면을 다른 PC 에서 열려면 `node.exe` 도 허용해야 합니다.

### 4. 송출
1. `http://<이 PC IP>:8080` 에 접속해 `.env` 의 관리자 계정으로 로그인합니다.
2. 카메라 → 해상도 → 프레임 → 비트레이트 → 스트림 이름 → 프로토콜(RTSP / WebRTC)을 고르고 **송출 시작**을 누릅니다.
3. 송출 목록에 표시되는 URL 을 다른 PC 에서 엽니다.
   - RTSP: `rtsp://<IP>:8554/<이름>` → VLC `미디어 > 네트워크 스트림 열기`, 또는 `ffplay rtsp://...`
   - WebRTC: `http://<IP>:8889/<이름>/` → 브라우저에서 바로 재생
4. 프로토콜별 접속자 수는 2초마다 갱신됩니다.

카메라마다 송출을 하나씩, 여러 카메라를 동시에 송출할 수 있습니다.

## 문제 해결
| 증상 | 원인 / 조치 |
|---|---|
| `MediaMTX 실행 실패 … npm run setup` | MediaMTX 가 설치되지 않음 → `npm run setup` |
| `bind: Only one usage of each socket address` 후 서버 종료 | 포트가 이미 사용 중(다른 MediaMTX, Docker 등) → `.env` 에서 `RTSP_PORT` 등을 다른 값으로 변경 |
| 카메라 목록이 비어 있음 | `ffmpeg -list_devices true -f dshow -i dummy` 로 FFmpeg 가 카메라를 보는지 확인 |
| 다른 PC 에서 재생이 안 됨 | 방화벽 허용 여부, 표시된 URL 의 IP 가 맞는지 확인 (틀리면 `PUBLIC_HOST` 지정) |
| 송출 목록에 `오류` 표시 | 아래 붉은 글씨로 FFmpeg 에러가 표시됨. 다른 프로그램이 카메라를 쓰고 있지 않은지 확인 |

## 알려진 제약
- 영상만 송출합니다(오디오 없음).
- 세션은 메모리에 있어 서버를 재시작하면 다시 로그인해야 합니다.
- 프로토콜 선택은 관리 화면에 표시할 URL/접속자 수를 정합니다. MediaMTX 는 두 프로토콜을 모두 서빙합니다.

## 테스트
```bash
npm test
```
