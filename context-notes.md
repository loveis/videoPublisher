# Context Notes

## 2026-09-18 초기 설계
- **미디어 서버로 MediaMTX 채택.** RTSP와 WebRTC(WHEP)를 한 바이너리로 제공하고, `/v3/paths/list` API의 readers[].type으로
  프로토콜별 접속자 수(rtspSession / webRTCSession)를 셀 수 있음. 향후 WebRTC 확장 요구도 이걸로 충족.
- **캡처/인코딩은 FFmpeg dshow → libx264.** WebRTC 호환을 위해 baseline 프로파일, B-frame 없음, zerolatency.
  GOP = fps*2 (2초)로 신규 접속자 첫 화면 대기를 짧게.
- 카메라 옵션은 `ffmpeg -f dshow -list_options true` 출력을 파싱. 카메라가 송출 중이면 조회가 실패하므로 결과를 캐시.
- 프로토콜 선택(RTSP/WebRTC)은 MediaMTX가 두 가지를 항상 서빙하되, 선택한 프로토콜의 URL과 접속자 수만 UI에 노출.
  (프로토콜별 접근 차단까지는 요구사항에 없어 하지 않음)
- 인증은 요구사항대로 admin/admin 고정, 메모리 세션 토큰 쿠키. 서버 재시작 시 재로그인 필요.
- URL의 호스트는 `PUBLIC_HOST` 환경변수 우선, 없으면 가상 어댑터를 제외한 첫 LAN IPv4.
- 오디오는 범위 밖(영상만 송출).

## 2026-09-18 백엔드 구현 중 결정
- Express 5 사용: async 라우트 예외를 에러 미들웨어로 전달해 줌(4 는 unhandled rejection).
- 이 PC 에는 다른 프로젝트(sa-dev)의 MediaMTX 도커가 8554/8889/8189/9997 을 점유 중.
  기본 포트는 표준값을 유지하되 `RTSP_PORT`, `WEBRTC_PORT`, `WEBRTC_UDP_PORT`, `MEDIAMTX_API_PORT` 환경변수로 변경 가능.
  MediaMTX 에는 `MTX_*` 환경변수로 mediamtx.yml 값을 덮어써 전달(설정 파일 생성 불필요).
- MediaMTX 의 WebRTC 플레이어 페이지는 `/name` 이 302 이므로 URL 을 `/name/` 로 표시.
- 검증: RTSP(TCP/UDP) 2명 접속 시 rtsp=2, headless Chrome 으로 WebRTC 페이지 접속 시 webrtc=1 확인.
  ffprobe 결과 h264 Constrained Baseline 1280x720 30fps.
- setup 스크립트: PATH 의 GNU tar(Git Bash)는 zip 을 못 풀어 System32\tar.exe(bsdtar)를 명시 호출.

## 2026-09-18 UI / E2E
- 관리 UI 는 빌드 없는 정적 HTML/JS(public/). 2초 폴링, 내용이 같으면 다시 그리지 않음(URL 선택/복사 표시 유지).
- 스트림 이름을 비우면 placeholder 로 제안한 camN 을 사용.
- E2E(puppeteer-core, scratchpad 에서만 설치): 로그인 실패/성공 → 1080p30 4Mbps 송출 → WebRTC 탭 재생(1920x1080) →
  접속자 1명 표시 → 중지까지 확인. headless 에서 백그라운드 탭 타이머가 멈춰 UI 반영이 늦을 수 있어 테스트는 API 로 교차 확인.
- 링크 로컬(169.254.x) 주소도 URL 호스트 자동 감지에서 제외.
- MediaMTX 가 실행 폴더에 MoQ 용 auto.crt/auto.key 를 생성 → .gitignore.

## 2026-09-18 설정 파일 분리
- 설정은 `.env`(Git 제외) + `.env.example`(커밋). Node 내장 `--env-file-if-exists` 로 로딩해 dotenv 의존성 없음 → Node 22.9+ 필요.
- 관리자 계정도 `ADMIN_USERNAME`/`ADMIN_PASSWORD` 로 분리(기본 admin/admin).
- `.env` 에 빈 값(`PORT=`)이 오면 기본값을 쓰도록 `??` 대신 `||` 사용.
- 이 PC 의 `.env` 는 sa-dev MediaMTX 도커와의 충돌을 피해 1xxxx 포트로 설정해 둠.
- MediaMTX 의 RTP/RTCP(8000/8001 UDP), MoQ(8892/8893) 포트는 설정 대상에 넣지 않음(현재 충돌 없음).
- (수정) `--env-file-if-exists` 는 `npm start` 로 실행할 때만 적용돼, `node src/server.js`/디버거 실행 시 기본 포트 8554 로
  떠서 bind 오류가 났음. `src/env.js` 에서 `process.loadEnvFile()` 로 프로젝트 루트 .env 를 직접 로딩하고 server.js 첫 import 로 둠.
  ESM 은 import 를 먼저 평가하므로 server.js 본문에서 로딩하면 mediamtx.js 의 포트 상수가 먼저 계산돼 버림 → 별도 모듈 필요.
  요구 Node 버전은 20.12+ 로 완화.

## 2026-09-18 2차: MediaMTX 기능 표출 + 설정 UI (사용자 결정)
- 설정 범위: 주요 항목(한글 설명 폼) + 고급(전체 항목 자동 폼). 저장: API 즉시 반영 + mediamtx.yml 기록.
  포트는 .env 에서 제거하고 mediamtx.yml(=UI)로 이관. 표출: 전체 프로토콜 URL, 세션+킥, 녹화/재생, 서버 정보/메트릭.

### MediaMTX v1.21 실측 (테스트 패턴으로 확인)
- 설정 항목: global 120개, pathDefaults 92개(이 중 rpiCamera* 는 라즈베리파이 전용 → UI 에서 숨김).
- reader type: rtspSession, rtmpConn, srtConn, hlsSession(HLS 도 시청자별 세션이 잡힘), webRTCSession.
- 세션 API: rtspsessions, rtmpconns, srtconns, webrtcsessions, hlssessions. rtspssessions/rtmpsconns 는 해당 암호화가 켜져야 생김(꺼져 있으면 404).
- 바이트 필드는 inboundBytes/outboundBytes (bytesReceived/bytesSent 는 구 필드).
- 잘못된 값 patch → 400 + 에러 메시지(검증됨). 알 수 없는 키도 400.
- **이미 사용 중인 포트로 patch 하면 200 을 돌려준 뒤 MediaMTX 가 통째로 종료됨.** RTSPS 를 인증서 없이 켜는 것도 같은 부류.
  → patch 후 1.5초 뒤 생존 확인, 죽었으면 yml 에 쓰지 않고(이전 설정 유지) 감시 로직이 재시작. 관리 서버는 MediaMTX 가 죽어도 종료하지 않음.
- **MediaMTX 는 yml 파일 변경을 감지해 전체 재로딩** → API 로만 추가한 경로 설정(스트림별 녹화 등)은 yml 저장 시 사라짐.
  → 스트림별 경로 설정도 yml `paths.<name>` 에 함께 기록하고, 송출 중지 시 제거.
- 송출 중 경로 설정 추가/변경(record on/off)은 publisher 연결을 끊지 않음.
- 보호 항목: api, apiAddress(관리 서버가 사용), rtsp 와 rtspEncryption=strict(FFmpeg 가 RTSP 로 publish) → UI 에서 변경 불가.

### 2차 구현 결과 / 검증
- UI 는 탭별 ES 모듈(public/js/*.js)로 분리. 설정 탭만 폴링하지 않음(편집 중 값 보호).
- 주요 설정 스키마: public/js/config-schema.js. 고급 폼은 값 타입으로 입력 형식 추론(bool/number/list/json/text).
- 녹화 목록은 playback 서버 /list 의 구간(연속 세그먼트 묶음) 단위로 다운로드, 삭제는 구간에 속한 세그먼트를 API 로 삭제.
- E2E(puppeteer, 실제 카메라): 5개 프로토콜 동시 시청 시 각 1명 표시, 세션 5개(이 앱 publisher 표시) + RTMP 킥,
  송출 중 녹화 끄기(송출 유지), 녹화 다운로드(MP4)·삭제, 설정 저장 → yml 반영(주석 유지),
  hlsAddress :8888(도커 점유) → 롤백 메시지 + yml 미변경 + 3초 뒤 복구, 고급 174개 항목·검색, 메트릭 on → 조회.
- 롤백으로 MediaMTX 가 재시작되면 FFmpeg publisher 도 끊겨 스트림이 '오류'가 됨 → 자동 재송출은 아직 없음(후속 후보).
- MediaMTX 재시작 중 API 호출은 ECONNREFUSED → 503 + 안내 메시지(로그 생략).
- yaml 라이브러리는 flow 배열을 `[ a, b ]` 형태로, yes/no 를 true/false 로 다시 씀(의미 동일).

## 2026-09-22 3차: VOD
- MediaMTX 에는 VOD(파일 라이브러리) 기능이 없다. `alwaysAvailable*` 은 소스가 끊겼을 때 재생할 오프라인 영상이라 목적이 다름.
  → 파일마다 `runOnDemand` 경로를 등록해 시청 요청이 있을 때만 FFmpeg 로 RTSP publish 하는 방식 채택(사용자 결정: on-demand).
- 결정: 반복 여부는 파일별 선택, 코덱은 자동(H.264 복사 / 그 외 H.264 변환, 오디오는 Opus), 등록은 파일별 수동.
- MediaMTX 가 runOnDemand 문자열의 따옴표·`$RTSP_PORT`·`$MTX_PATH` 를 처리해 준다(공백 있는 Windows 경로도 확인).
- 경로 이름: 한글 등은 `_` 로 치환되며 서로 겹칠 수 있어, 글자가 바뀐 경우 원본 경로의 sha1 앞 6자리를 붙여 유일하게 만든다.
- `-stream_loop -1 -c copy` 는 반복 지점에서 타임스탬프가 되돌아가 FFmpeg 가 dts 경고를 낸다.
  실제 확인 결과 MediaMTX→WebRTC 재생은 20초 파일을 27초까지 끊김 없이 이어서 재생(문제 없음)했다.
- 등록 정보는 mediamtx.yml `paths.vod/<이름>` 에 저장 → 재시작 후에도 유지되고, 목록의 원천도 MediaMTX 경로 설정이다.
- 테스트는 사용자가 앱을 실제로 사용 중이어서(8080/18554/19997 점유) scratchpad/apptest 에 복사본을 만들고
  포트(2xxxx)·VOD_DIR 을 분리해 진행했다. rtp/rtcp(8000/8001)도 기본값이라 테스트 복사본에서 따로 지정해야 했다.
