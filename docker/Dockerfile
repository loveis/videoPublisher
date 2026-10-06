# 미디어 송출기(MediaMTX Manager) 리눅스 이미지 — Node 관리 서버 + FFmpeg + MediaMTX 바이너리
# 빌드 컨텍스트는 저장소 루트입니다: docker build -f docker/Dockerfile -t loveis/mediamtx-manager .
FROM node:22-bookworm-slim

ARG MEDIAMTX_VERSION=v1.21.0
# buildx 가 자동으로 넣어 주는 값(amd64/arm64). 일반 docker build 에서는 amd64 로 봅니다.
ARG TARGETARCH=amd64

# ffmpeg: 카메라 캡처·인코딩과 VOD 송출, v4l-utils: 카메라 해상도/프레임 조회, curl: MediaMTX 내려받기와 헬스체크
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg v4l-utils curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN set -eux; \
    case "$TARGETARCH" in \
      amd64) mtx_arch=amd64 ;; \
      arm64) mtx_arch=arm64v8 ;; \
      *) echo "지원하지 않는 아키텍처: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/mediamtx.tar.gz \
      "https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_${mtx_arch}.tar.gz"; \
    mkdir -p /app/bin; \
    tar -xzf /tmp/mediamtx.tar.gz -C /app/bin mediamtx; \
    rm /tmp/mediamtx.tar.gz; \
    /app/bin/mediamtx --version

# 의존성을 먼저 설치해 소스만 바뀌면 캐시를 재사용한다.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public
COPY mediamtx.example.yml ./

# 설정·VOD 파일·녹화는 컨테이너 밖(볼륨)에 두어야 컨테이너를 지워도 남는다.
# MEDIAMTX_CONFIG 가 없으면 첫 실행에 mediamtx.example.yml 을 복사해 만든다.
ENV NODE_ENV=production \
    PORT=8080 \
    MEDIAMTX_CONFIG=/config/mediamtx.yml \
    VOD_DIR=/media
RUN mkdir -p /config /media /app/recordings
VOLUME ["/config", "/media", "/app/recordings"]

# 관리 웹 8080 / RTSP 8554(+RTP·RTCP 8000·8001) / RTMP 1935 / HLS 8888 / WebRTC 8889(+ICE 8189) / SRT 8890 / 녹화 재생 9996
EXPOSE 8080 8554 1935 8888 8889 9996 8000/udp 8001/udp 8189/udp 8890/udp

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD curl -fsS "http://127.0.0.1:${PORT}/" > /dev/null || exit 1

CMD ["node", "src/server.js"]
