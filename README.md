# 미디어 송출기 (video-publisher)

PC에 연결된 카메라 영상을 **RTSP / WebRTC** 로 송출하고, 웹 관리 화면에서 송출 URL과 접속자 수를 확인하는 앱입니다.

```
카메라 ──dshow──▶ FFmpeg(H.264) ──RTSP publish──▶ MediaMTX ──▶ RTSP 시청자 (VLC, ffplay …)
                                                      └──▶ WebRTC 시청자 (브라우저)
관리 웹(Node/Express) : 카메라·해상도·프레임·비트레이트·프로토콜 선택, 송출 시작/중지, URL·접속자 수 표시
```

## 요구 사항
- Windows 10/11
- Node.js 20 이상
- FFmpeg (PATH 에 `ffmpeg` 가 있어야 함, libx264 포함 빌드)

## 설치 / 실행
```bash
npm install
npm run setup     # MediaMTX 바이너리를 bin/ 에 내려받음 (최초 1회)
npm start         # http://localhost:8080  (admin / admin)
```

처음 실행하면 Windows 방화벽이 `mediamtx.exe` 의 네트워크 허용 여부를 묻습니다. 다른 PC 에서 시청하려면 **허용**해야 합니다.

## 사용법
1. `http://<이 PC IP>:8080` 에 접속해 `admin / admin` 으로 로그인합니다.
2. 카메라 → 해상도 → 프레임 → 비트레이트 → 스트림 이름 → 프로토콜(RTSP / WebRTC)을 고르고 **송출 시작**을 누릅니다.
3. 송출 목록에 표시되는 URL 을 다른 PC 에서 엽니다.
   - RTSP: `rtsp://<IP>:8554/<이름>` → VLC `미디어 > 네트워크 스트림 열기`, 또는 `ffplay rtsp://...`
   - WebRTC: `http://<IP>:8889/<이름>/` → 브라우저에서 바로 재생
4. 프로토콜별 접속자 수는 2초마다 갱신됩니다.

카메라마다 송출을 하나씩, 여러 카메라를 동시에 송출할 수 있습니다.

## 환경 변수
| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | 8080 | 관리 웹 포트 |
| `PUBLIC_HOST` | 자동 감지 | 송출 URL 에 표시할 호스트(IP/도메인). 자동 감지가 틀리면 지정 |
| `RTSP_PORT` | 8554 | RTSP 포트 |
| `WEBRTC_PORT` | 8889 | WebRTC(HTTP) 포트 |
| `WEBRTC_UDP_PORT` | 8189 | WebRTC 미디어(UDP) 포트 |
| `MEDIAMTX_API_PORT` | 9997 | MediaMTX 내부 API 포트(127.0.0.1 전용) |

포트가 이미 사용 중이면(예: 다른 MediaMTX 가 실행 중) 서버가 종료되니, 위 변수로 포트를 바꿔 실행하세요.

```powershell
$env:RTSP_PORT=18554; $env:WEBRTC_PORT=18889; $env:WEBRTC_UDP_PORT=18189; $env:MEDIAMTX_API_PORT=19997; npm start
```

## 알려진 제약
- 영상만 송출합니다(오디오 없음).
- 로그인 계정은 admin/admin 고정이며, 세션은 메모리에 있어 서버를 재시작하면 다시 로그인해야 합니다.
- 프로토콜 선택은 관리 화면에 표시할 URL/접속자 수를 정합니다. MediaMTX 는 두 프로토콜을 모두 서빙합니다.

## 테스트
```bash
npm test
```
