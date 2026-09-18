// MediaMTX 전역 설정으로 스트림의 프로토콜별 시청 URL 과 부가 서버 URL 을 계산
export const PROTOCOLS = ['rtsp', 'rtsps', 'rtmp', 'rtmps', 'hls', 'webrtc', 'srt'];

// ":8554", "0.0.0.0:8554", "[::]:8554" → "8554"
export function portOf(address) {
  return address.split(':').pop();
}

// 반환: { rtsp?, rtsps?, rtmp?, rtmps?, hls?, webrtc?, srt? } — 켜져 있는 프로토콜만 포함.
export function streamUrls(name, host, conf) {
  const urls = {};
  if (conf.rtsp) {
    if (conf.rtspEncryption !== 'strict') urls.rtsp = `rtsp://${host}:${portOf(conf.rtspAddress)}/${name}`;
    if (conf.rtspEncryption !== 'no') urls.rtsps = `rtsps://${host}:${portOf(conf.rtspsAddress)}/${name}`;
  }
  if (conf.rtmp) {
    if (conf.rtmpEncryption !== 'strict') urls.rtmp = `rtmp://${host}:${portOf(conf.rtmpAddress)}/${name}`;
    if (conf.rtmpEncryption !== 'no') urls.rtmps = `rtmps://${host}:${portOf(conf.rtmpsAddress)}/${name}`;
  }
  if (conf.hls) urls.hls = `${conf.hlsEncryption ? 'https' : 'http'}://${host}:${portOf(conf.hlsAddress)}/${name}/`;
  if (conf.webrtc) urls.webrtc = `${conf.webrtcEncryption ? 'https' : 'http'}://${host}:${portOf(conf.webrtcAddress)}/${name}/`;
  if (conf.srt) urls.srt = `srt://${host}:${portOf(conf.srtAddress)}?streamid=read:${name}`;
  return urls;
}

// 녹화 다운로드용 playback 서버 주소 (꺼져 있으면 null)
export function playbackBase(host, conf) {
  if (!conf.playback) return null;
  return `${conf.playbackEncryption ? 'https' : 'http'}://${host}:${portOf(conf.playbackAddress)}`;
}
