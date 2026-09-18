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
