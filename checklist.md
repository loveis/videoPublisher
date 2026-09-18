# 미디어 송출기 체크리스트

## Plan
PC 카메라(dshow)를 FFmpeg로 H.264 인코딩 → MediaMTX로 publish → RTSP/WebRTC로 시청.
관리 웹(Node/Express, admin/admin)에서 카메라·해상도·프레임·비트레이트·프로토콜을 골라 송출하고,
생성된 URL과 프로토콜별 접속자 수를 보여준다.

## Tasks
- [x] MediaMTX 다운로드 스크립트 + 설정 파일
- [x] 카메라 목록 / 해상도·프레임 옵션 파싱 (+ 단위 테스트)
- [ ] MediaMTX 프로세스 관리 + 접속자 수 조회
- [ ] FFmpeg 송출 프로세스 관리 (시작/중지/상태)
- [ ] Express 서버: 로그인(admin/admin), REST API
- [ ] 관리 UI (로그인, 송출 설정, 송출 목록, URL, 접속자 수)
- [ ] 테스트 실행
- [ ] 실제 카메라로 송출 → RTSP 재생 확인 (ffprobe)
- [ ] WebRTC 플레이어 페이지 응답 확인
- [ ] README
