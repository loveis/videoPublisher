# 미디어 송출기 (video-publisher)

PC에 연결된 카메라 영상을 MediaMTX 로 송출하고, 웹 관리 화면에서 **송출·접속 세션·녹화·MediaMTX 설정·서버 상태**를 관리하는 앱입니다.
시청은 RTSP / RTMP / HLS / WebRTC / SRT (+ 암호화 시 RTSPS / RTMPS) 로 할 수 있습니다.

```
카메라 ──dshow──▶ FFmpeg(H.264) ──RTSP publish──▶ MediaMTX ──▶ RTSP · RTMP · HLS · WebRTC · SRT 시청자
                                                      └──▶ 녹화 파일 ──▶ playback 서버(MP4 다운로드)
관리 웹(Node/Express) ── MediaMTX API ──▶ 설정 변경(즉시 반영 + mediamtx.yml 저장), 세션 조회/강제 종료, 녹화 관리
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
copy .env.example .env # 관리 웹 설정 파일 생성 (Git Bash 에서는 cp .env.example .env)
```

### 2. 설정 파일
설정은 두 파일로 나뉩니다. 둘 다 PC 별 파일이라 Git 에 올라가지 않습니다.

| 파일 | 내용 | 수정 방법 |
|---|---|---|
| `.env` | 관리 웹 포트, 관리자 계정, 송출 URL 호스트 | 직접 편집 후 재시작 |
| `mediamtx.yml` | MediaMTX 전체 설정(포트, 프로토콜, 녹화, 인증 등) | **관리 화면 > 설정 탭** (또는 직접 편집) |

`.env` 항목:

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | 8080 | 관리 웹 포트 |
| `ADMIN_USERNAME` | admin | 관리자 아이디 |
| `ADMIN_PASSWORD` | admin | 관리자 비밀번호 |
| `PUBLIC_HOST` | 자동 감지 | 송출 URL 에 표시할 호스트(IP/도메인). 자동 감지된 IP 가 틀리면 지정 |

`mediamtx.yml` 은 처음 실행할 때 `mediamtx.example.yml` 을 복사해 만들어집니다. 기본 포트는 다음과 같습니다.

| 서버 | 기본 포트 | 서버 | 기본 포트 |
|---|---|---|---|
| RTSP | 8554 (RTP/RTCP UDP 8000/8001) | SRT | 8890 (UDP) |
| RTMP | 1935 | 재생(playback) | 9996 |
| HLS | 8888 | API (127.0.0.1 전용) | 9997 |
| WebRTC | 8889 (미디어 UDP 8189) | 메트릭 / pprof | 9998 / 9999 (꺼짐) |

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

## 관리 화면
`http://<이 PC IP>:8080` 에 접속해 `.env` 의 관리자 계정으로 로그인합니다.

| 탭 | 기능 |
|---|---|
| 송출 | 카메라·해상도·프레임·비트레이트·시청 프로토콜 선택, 송출 시작/중지, 녹화 on/off(송출 중에도 가능), 프로토콜별 시청 URL 과 접속자 수 |
| 세션 | 모든 프로토콜의 접속 세션(송출/시청, 원격 주소, 접속 시간, 송수신량) 목록과 강제 종료 |
| 녹화 | 스트림별 녹화 구간 목록, MP4 다운로드(playback 서버), 삭제 |
| 설정 | **주요 설정**: 그룹별(일반/RTSP/RTMP/HLS/WebRTC/SRT/MoQ/녹화·재생/스트림 기본값/모니터링/인증) 한글 설명 폼<br>**고급**: MediaMTX 의 전역·경로 기본값 전체 항목(라즈베리파이 카메라 전용 항목 제외)과 검색 |
| 서버 정보 | MediaMTX 버전·가동 시간, 프로토콜 서버별 상태·주소·암호화, 경로별 소스·트랙·시청자·송수신량, Prometheus 메트릭 조회 |

### 시청 URL 예시
| 프로토콜 | URL | 재생 방법 |
|---|---|---|
| RTSP | `rtsp://<IP>:8554/<이름>` | VLC `미디어 > 네트워크 스트림 열기`, `ffplay` |
| RTMP | `rtmp://<IP>:1935/<이름>` | VLC, `ffplay` |
| HLS | `http://<IP>:8888/<이름>/` | 브라우저 (플레이어 페이지). 스트림 주소는 `.../index.m3u8` |
| WebRTC | `http://<IP>:8889/<이름>/` | 브라우저 (플레이어 페이지) |
| SRT | `srt://<IP>:8890?streamid=read:<이름>` | VLC, `ffplay` |

### 설정 변경 시 동작
- 저장하면 MediaMTX API 로 즉시 반영하고, 성공한 항목만 `mediamtx.yml` 에 기록합니다(파일의 주석은 유지).
- 포트·프로토콜·암호화를 바꾸면 해당 서버가 재시작되어 진행 중인 송출·시청이 끊길 수 있습니다.
- 새 설정으로 MediaMTX 가 죽으면(예: 이미 사용 중인 포트, 인증서 없는 암호화) 파일에 저장하지 않고 이전 설정으로 자동 재시작합니다. 이때 카메라 송출도 끊기므로 송출 탭에서 다시 시작하세요.
- 앱 동작에 필요한 `api`, `apiAddress`, `rtsp` 는 변경할 수 없고, `rtspEncryption: strict` 는 선택할 수 없습니다(카메라가 평문 RTSP 로 publish).
- RTSPS / RTMPS / HTTPS 를 켜려면 인증서(`server.key`, `server.crt`)를 직접 준비해 해당 키/인증서 경로를 지정해야 합니다.

## 문제 해결
| 증상 | 원인 / 조치 |
|---|---|
| `MediaMTX 실행 실패 … npm run setup` | MediaMTX 가 설치되지 않음 → `npm run setup` |
| 화면 상단에 "MediaMTX 가 실행 중이 아닙니다" 와 `bind: Only one usage of each socket address` | 포트가 이미 사용 중(다른 MediaMTX, Docker 등) → `mediamtx.yml` 에서 해당 `…Address` 포트를 바꾼 뒤 저장(자동 재로딩) |
| 카메라 목록이 비어 있음 | `ffmpeg -list_devices true -f dshow -i dummy` 로 FFmpeg 가 카메라를 보는지 확인 |
| 다른 PC 에서 재생이 안 됨 | 방화벽 허용 여부, 표시된 URL 의 IP 가 맞는지 확인 (틀리면 `.env` 의 `PUBLIC_HOST` 지정) |
| 송출 목록에 `오류` 표시 | 아래 붉은 글씨로 FFmpeg 에러가 표시됨. 다른 프로그램이 카메라를 쓰고 있지 않은지, MediaMTX 가 재시작되지 않았는지 확인 |
| 메트릭이 안 보임 | 설정 > 모니터링에서 Prometheus 메트릭을 켜세요 |

## 알려진 제약
- 영상만 송출합니다(오디오 없음).
- 세션은 메모리에 있어 서버를 재시작하면 다시 로그인해야 합니다.
- 시청 프로토콜 선택은 관리 화면에 표시할 URL 을 정합니다. MediaMTX 는 켜진 프로토콜을 모든 스트림에 제공합니다.
- MoQ 는 설정만 제공하고 시청 URL 은 표시하지 않습니다(실험적 기능).
- MediaMTX 가 재시작되면(설정 적용 실패 등) 카메라 송출은 자동으로 다시 시작되지 않습니다.

## 테스트
```bash
npm test
```
