# 도커 빌드 · 배포 가이드

리눅스용 이미지(`loveis/mediamtx-manager`)를 만들고 실행하는 방법입니다.
앱 자체의 사용법은 저장소 루트의 [README.md](../README.md) 를 보세요.

## 이미지에 들어가는 것
| 구성 | 내용 |
|---|---|
| 베이스 | `node:22-bookworm-slim` (Debian) |
| MediaMTX | 리눅스 바이너리 `v1.21.0` → `/app/bin/mediamtx` (빌드할 때 내려받음) |
| FFmpeg | 데비안 패키지 (카메라 캡처·인코딩, VOD 송출) |
| v4l-utils | 리눅스 카메라(`/dev/video*`)의 해상도·프레임 조회 |
| 앱 | `/app` (Node 관리 서버 + 관리 화면) |

윈도우에서 쓰던 DirectShow 대신 리눅스에서는 **V4L2**(`/dev/video0` 등)로 카메라를 잡습니다.
컨테이너에 장치를 넘겨 주지 않으면 카메라 목록은 비어 있고, VOD·녹화·설정·세션 기능은 그대로 동작합니다.

## 1. 빌드
빌드 컨텍스트는 **저장소 루트**입니다(Dockerfile 만 `docker/` 에 있음).

```bash
# 저장소 루트에서
docker build -f docker/Dockerfile -t loveis/mediamtx-manager:1.0.0 -t loveis/mediamtx-manager:latest .
```

윈도우 PC 에서 리눅스 서버용으로 만들거나, 다른 CPU 아키텍처가 필요하면 buildx 를 씁니다.

```bash
# amd64 서버용 (Docker Desktop 의 기본 빌드도 linux/amd64 입니다)
docker buildx build --platform linux/amd64 -f docker/Dockerfile -t loveis/mediamtx-manager:1.0.0 --load .

# amd64 + arm64 를 한 번에 만들어 레지스트리로 바로 올리기
docker buildx build --platform linux/amd64,linux/arm64 -f docker/Dockerfile -t loveis/mediamtx-manager:1.0.0 --push .
```

MediaMTX 버전을 바꾸려면 `--build-arg MEDIAMTX_VERSION=v1.21.0` 을 주면 됩니다.

## 2. 실행
### 호스트 네트워크 (리눅스 서버 권장)
WebRTC 와 RTSP 는 UDP 를 쓰기 때문에 포트를 하나하나 매핑하는 것보다 호스트 네트워크가 간단하고 안정적입니다.

```bash
docker run -d --name mediamtx-manager --restart unless-stopped \
  --network host \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD=change-me \
  -v /srv/mediamtx/config:/config \
  -v /srv/mediamtx/media:/media \
  -v /srv/mediamtx/recordings:/app/recordings \
  loveis/mediamtx-manager:1.0.0
```

카메라까지 쓰려면 장치를 넘겨 줍니다(여러 개면 `--device` 를 여러 번).

```bash
  --device /dev/video0:/dev/video0
```

### 포트 매핑 (윈도우/맥 Docker Desktop)
`--network host` 는 리눅스 도커에서만 동작합니다. 그 외에는 포트를 직접 열고,
**`PUBLIC_HOST` 에 호스트 IP 를 반드시 지정**하세요. 지정하지 않으면 컨테이너 내부 IP 가 시청 URL 에 찍혀 외부에서 접속하지 못합니다.

```bash
docker run -d --name mediamtx-manager \
  -p 8080:8080 -p 8554:8554 -p 1935:1935 -p 8888:8888 -p 8889:8889 -p 9996:9996 \
  -p 8000:8000/udp -p 8001:8001/udp -p 8189:8189/udp -p 8890:8890/udp \
  -e PUBLIC_HOST=192.168.0.10 \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD=change-me \
  -v mediamtx-config:/config -v mediamtx-media:/media -v mediamtx-recordings:/app/recordings \
  loveis/mediamtx-manager:1.0.0
```

### docker compose
[docker-compose.yml](docker-compose.yml) 에 위 두 가지 방식이 모두 들어 있습니다.

```bash
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml logs -f
```

실행 뒤 `http://<서버 IP>:8080` 에서 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 로 로그인합니다.

## 3. 환경 변수
| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | 8080 | 관리 웹 포트 |
| `ADMIN_USERNAME` | admin | 관리자 아이디 |
| `ADMIN_PASSWORD` | admin | 관리자 비밀번호 — **운영에서는 반드시 바꾸세요** |
| `PUBLIC_HOST` | 자동 감지 | 시청 URL 에 쓸 호스트/IP. 포트 매핑 방식에서는 필수 |
| `VOD_DIR` | `/media` | VOD 파일 폴더 |
| `MEDIAMTX_CONFIG` | `/config/mediamtx.yml` | MediaMTX 설정 파일 경로. 없으면 예시 설정을 복사해 만듭니다 |

MediaMTX 쪽 설정(포트·프로토콜·녹화·인증)은 환경 변수가 아니라 **관리 화면 > 설정 탭**에서 바꾸며, `/config/mediamtx.yml` 에 저장됩니다.

## 4. 볼륨
| 경로 | 내용 | 없으면 |
|---|---|---|
| `/config` | `mediamtx.yml` | 컨테이너를 지우면 설정이 초기화됩니다 |
| `/media` | VOD 파일(업로드 포함) | 업로드한 영상이 사라집니다 |
| `/app/recordings` | 녹화 파일 | 녹화가 사라집니다 |

## 5. 포트
| 포트 | 용도 | 포트 | 용도 |
|---|---|---|---|
| 8080/tcp | 관리 웹 | 8888/tcp | HLS |
| 8554/tcp | RTSP | 8889/tcp | WebRTC(HTTP) |
| 8000/udp, 8001/udp | RTP · RTCP | 8189/udp | WebRTC(ICE) |
| 1935/tcp | RTMP | 8890/udp | SRT |
| 9996/tcp | 녹화 재생(다운로드) | | |

MediaMTX API(9997)는 컨테이너 안에서만 쓰며 127.0.0.1 에만 열립니다.

## 6. 레지스트리에 올리기
```bash
docker login
docker push loveis/mediamtx-manager:1.0.0
docker push loveis/mediamtx-manager:latest
```

> 도커 저장소 이름은 소문자만 허용합니다. `loveis/mediaMTXManager` 처럼 대문자가 들어가면 레지스트리가 거부하므로
> `loveis/mediamtx-manager` 를 씁니다.

## 7. 업데이트
```bash
docker pull loveis/mediamtx-manager:1.0.0
docker compose -f docker/docker-compose.yml up -d   # 또는 docker rm -f 후 다시 run
```
볼륨(`/config`, `/media`, `/app/recordings`)은 그대로 유지됩니다.

## 8. 문제 해결
| 증상 | 원인 / 조치 |
|---|---|
| 시청 URL 의 IP 가 컨테이너 내부 주소(172.x) | 포트 매핑 방식에서 `PUBLIC_HOST` 미지정 → 호스트 IP 지정 |
| WebRTC 만 재생이 안 됨 | 8189/udp 가 막힘 → 방화벽 확인, 가능하면 `--network host` 사용 |
| 카메라 탭이 비어 있음 | 장치를 안 넘김 → `--device /dev/video0`, 호스트에서 `v4l2-ctl --list-devices` 로 장치 확인 |
| 카메라는 보이는데 송출이 바로 오류 | 다른 프로세스가 같은 카메라를 사용 중이거나 권한 부족 → 컨테이너를 `--group-add video` 또는 권한 있는 사용자로 실행 |
| `bind: address already in use` 로그 후 재시작 반복 | 호스트에서 같은 포트를 쓰는 프로세스가 있음 → 설정 탭에서 포트 변경 또는 기존 프로세스 종료 |
| 관리 웹이 안 열림 | `docker logs mediamtx-manager` 에 `관리 웹 서버를 … 포트로 열 수 없습니다` 가 있는지 확인 |

쿠버네티스 배포는 [../k8s/README.md](../k8s/README.md) 를 보세요.
