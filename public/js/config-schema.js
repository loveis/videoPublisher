// 설정 탭 '주요 설정'에 보여 줄 MediaMTX 항목 목록 — 그룹, 한글 이름·설명, 입력 형식(select/multi/list/json)
// section: 'global' (전역) | 'pathdefaults' (모든 경로 기본값). type 을 생략하면 현재 값의 타입으로 정한다.
const ENC = ['no', 'optional', 'strict'];

export const GROUPS = [
  {
    title: '일반',
    fields: [
      { key: 'logLevel', label: '로그 수준', options: ['error', 'warn', 'info', 'debug'] },
      { key: 'readTimeout', label: '읽기 타임아웃', desc: '예: 10s' },
      { key: 'writeTimeout', label: '쓰기 타임아웃', desc: '예: 10s' },
      { key: 'writeQueueSize', label: '쓰기 큐 크기', desc: '느린 시청자를 위한 패킷 버퍼 수' },
      { key: 'udpMaxPayloadSize', label: 'UDP 최대 페이로드', desc: '바이트' },
    ],
  },
  {
    title: 'RTSP',
    desc: '카메라 송출이 RTSP 로 들어오므로 RTSP 자체는 끌 수 없습니다.',
    fields: [
      { key: 'rtsp', label: 'RTSP 사용' },
      { key: 'rtspTransports', label: '전송 방식', type: 'multi', options: ['udp', 'multicast', 'tcp'] },
      { key: 'rtspEncryption', label: '암호화(RTSPS)', options: ['no', 'optional'], desc: "optional 은 RTSP 와 RTSPS 를 함께 제공. 인증서가 필요합니다. strict 는 카메라 송출을 막아 사용할 수 없습니다." },
      { key: 'rtspAddress', label: 'RTSP 주소' },
      { key: 'rtspsAddress', label: 'RTSPS 주소' },
      { key: 'rtpAddress', label: 'RTP(UDP) 주소' },
      { key: 'rtcpAddress', label: 'RTCP(UDP) 주소' },
      { key: 'rtspServerKey', label: 'TLS 키 파일' },
      { key: 'rtspServerCert', label: 'TLS 인증서 파일' },
      { key: 'rtspAuthMethods', label: '인증 방식', type: 'multi', options: ['basic', 'digest'] },
    ],
  },
  {
    title: 'RTMP',
    fields: [
      { key: 'rtmp', label: 'RTMP 사용' },
      { key: 'rtmpEncryption', label: '암호화(RTMPS)', options: ENC, desc: 'optional/strict 는 인증서가 필요합니다.' },
      { key: 'rtmpAddress', label: 'RTMP 주소' },
      { key: 'rtmpsAddress', label: 'RTMPS 주소' },
      { key: 'rtmpServerKey', label: 'TLS 키 파일' },
      { key: 'rtmpServerCert', label: 'TLS 인증서 파일' },
    ],
  },
  {
    title: 'HLS',
    fields: [
      { key: 'hls', label: 'HLS 사용' },
      { key: 'hlsAddress', label: 'HLS 주소' },
      { key: 'hlsEncryption', label: 'HTTPS 사용', desc: '인증서가 필요합니다.' },
      { key: 'hlsServerKey', label: 'TLS 키 파일' },
      { key: 'hlsServerCert', label: 'TLS 인증서 파일' },
      { key: 'hlsVariant', label: 'HLS 방식', options: ['mpegts', 'fmp4', 'lowLatency'], desc: 'lowLatency 가 가장 지연이 짧습니다.' },
      { key: 'hlsSegmentCount', label: '세그먼트 개수' },
      { key: 'hlsSegmentDuration', label: '세그먼트 길이', desc: '예: 1s' },
      { key: 'hlsPartDuration', label: '파트 길이(lowLatency)', desc: '예: 200ms' },
      { key: 'hlsAlwaysRemux', label: '시청자 없어도 항상 변환' },
      { key: 'hlsAllowOrigins', label: '허용 Origin(CORS)', type: 'list' },
    ],
  },
  {
    title: 'WebRTC',
    fields: [
      { key: 'webrtc', label: 'WebRTC 사용' },
      { key: 'webrtcAddress', label: 'WebRTC(HTTP) 주소' },
      { key: 'webrtcEncryption', label: 'HTTPS 사용', desc: '인증서가 필요합니다.' },
      { key: 'webrtcServerKey', label: 'TLS 키 파일' },
      { key: 'webrtcServerCert', label: 'TLS 인증서 파일' },
      { key: 'webrtcLocalUDPAddress', label: '미디어 UDP 주소' },
      { key: 'webrtcLocalTCPAddress', label: '미디어 TCP 주소', desc: 'UDP 가 막힌 환경용. 비우면 사용 안 함.' },
      { key: 'webrtcIPsFromInterfaces', label: '네트워크 카드 IP 자동 사용' },
      { key: 'webrtcAdditionalHosts', label: '추가 공개 호스트/IP', type: 'list', desc: 'NAT 뒤에서 외부 접속 시 공인 IP 입력' },
      { key: 'webrtcICEServers2', label: 'ICE(STUN/TURN) 서버', type: 'json', desc: '예: [{"url":"stun:stun.l.google.com:19302"}]' },
    ],
  },
  {
    title: 'SRT',
    fields: [
      { key: 'srt', label: 'SRT 사용' },
      { key: 'srtAddress', label: 'SRT(UDP) 주소' },
    ],
  },
  {
    title: 'MoQ (Media over QUIC, 실험적)',
    fields: [
      { key: 'moq', label: 'MoQ 사용' },
      { key: 'moqHTTP2Address', label: 'HTTP/2 주소' },
      { key: 'moqHTTP3Address', label: 'HTTP/3 주소' },
      { key: 'moqQUICAddress', label: 'QUIC 주소' },
    ],
  },
  {
    title: '녹화 / 재생',
    desc: '녹화 on/off 는 송출 탭에서 스트림별로 합니다. 아래 "모든 스트림 녹화"를 켜면 전체가 녹화됩니다.',
    fields: [
      { key: 'record', section: 'pathdefaults', label: '모든 스트림 녹화' },
      { key: 'recordPath', section: 'pathdefaults', label: '녹화 경로', desc: '%path, %Y-%m-%d_%H-%M-%S-%f 등 사용. 상대 경로는 앱 폴더 기준.' },
      { key: 'recordFormat', section: 'pathdefaults', label: '녹화 형식', options: ['fmp4', 'mpegts'] },
      { key: 'recordPartDuration', section: 'pathdefaults', label: '파트 길이', desc: '디스크 기록 주기. 예: 1s' },
      { key: 'recordSegmentDuration', section: 'pathdefaults', label: '파일 분할 길이', desc: '예: 1h' },
      { key: 'recordDeleteAfter', section: 'pathdefaults', label: '자동 삭제 기간', desc: '예: 1d. 0s 면 삭제 안 함.' },
      { key: 'playback', label: '재생(다운로드) 서버 사용' },
      { key: 'playbackAddress', label: '재생 서버 주소' },
    ],
  },
  {
    title: '스트림 기본값',
    fields: [
      { key: 'maxReaders', section: 'pathdefaults', label: '최대 시청자 수', desc: '0 = 무제한' },
      { key: 'overridePublisher', section: 'pathdefaults', label: '다른 송출이 같은 경로를 덮어쓰기 허용' },
    ],
  },
  {
    title: '모니터링',
    fields: [
      { key: 'metrics', label: 'Prometheus 메트릭 사용' },
      { key: 'metricsAddress', label: '메트릭 주소' },
      { key: 'pprof', label: 'pprof(성능 분석) 사용' },
      { key: 'pprofAddress', label: 'pprof 주소' },
    ],
  },
  {
    title: '인증',
    desc: '주의: authInternalUsers 에서 127.0.0.1 의 api 권한과 publish 권한을 지우면 이 앱이 동작하지 않습니다.',
    fields: [
      { key: 'authMethod', label: '인증 방식', options: ['internal', 'http', 'jwt'] },
      { key: 'authInternalUsers', label: '내부 사용자/권한', type: 'json' },
      { key: 'authHTTPAddress', label: 'HTTP 인증 서버 URL' },
      { key: 'authJWTJWKS', label: 'JWT JWKS URL' },
    ],
  },
];
