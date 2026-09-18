# 미디어 송출기 체크리스트

## Plan
PC 카메라(dshow)를 FFmpeg로 H.264 인코딩 → MediaMTX로 publish → RTSP/WebRTC로 시청.
관리 웹(Node/Express, admin/admin)에서 카메라·해상도·프레임·비트레이트·프로토콜을 골라 송출하고,
생성된 URL과 프로토콜별 접속자 수를 보여준다.

## Tasks
- [x] MediaMTX 다운로드 스크립트 + 설정 파일
- [x] 카메라 목록 / 해상도·프레임 옵션 파싱 (+ 단위 테스트)
- [x] MediaMTX 프로세스 관리 + 접속자 수 조회
- [x] FFmpeg 송출 프로세스 관리 (시작/중지/상태)
- [x] Express 서버: 로그인(admin/admin), REST API
- [x] 관리 UI (로그인, 송출 설정, 송출 목록, URL, 접속자 수)
- [x] 테스트 실행
- [x] 실제 카메라로 송출 → RTSP 재생 확인 (ffprobe)
- [x] WebRTC 플레이어 페이지 응답 확인
- [x] README

---

## 2차: MediaMTX 기능 전체 표출 + 설정 UI

### Plan
- MediaMTX API 를 관리 서버가 인증 후 프록시(`/api/mtx/*`)해서 UI 가 세션·녹화·정보를 직접 조회.
- 설정 변경은 API patch(즉시 반영, 검증) → 성공 시 `mediamtx.yml` 에 기록(yaml Document API 로 주석 유지).
- `mediamtx.yml` 은 PC 별 파일(gitignore), 저장소에는 `mediamtx.example.yml` → 없으면 시작 시 복사.
- 포트는 .env 에서 제거, URL 은 MediaMTX 현재 설정에서 계산.
- UI 탭: 송출 / 세션 / 녹화 / 설정(주요·고급) / 서버 정보.

### Tasks
- [ ] mediamtx.example.yml 분리, yml 로딩/저장 모듈(yaml), .env 포트 제거, 이 PC 의 yml 에 1xxxx 포트 이관
- [ ] MediaMTX API 인증 프록시 + 설정 patch 시 yml 저장
- [ ] 스트림별 전체 프로토콜 URL(RTSP/RTSPS/RTMP/RTMPS/HLS/WebRTC/SRT) + 프로토콜별 접속자 수
- [ ] 스트림별 녹화 on/off
- [ ] UI 탭 구조 + 송출 탭 갱신
- [ ] 세션 탭: 프로토콜별 세션 목록 + 강제 종료
- [ ] 녹화 탭: 녹화 목록, 다운로드(playback), 삭제
- [ ] 설정 탭: 주요 항목(한글 설명) + 고급(전체 자동 폼)
- [ ] 서버 정보 탭: 버전/가동시간/통계 + 메트릭
- [ ] 단위 테스트(URL 계산, 포트 파싱) + E2E 검증
- [ ] README / context-notes 갱신
