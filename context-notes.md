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
