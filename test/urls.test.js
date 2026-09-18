// MediaMTX 설정 → 프로토콜별 시청 URL 계산 단위 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portOf, streamUrls, playbackBase } from '../src/urls.js';

const base = {
  rtsp: true, rtspEncryption: 'no', rtspAddress: ':8554', rtspsAddress: ':8322',
  rtmp: true, rtmpEncryption: 'no', rtmpAddress: ':1935', rtmpsAddress: ':1936',
  hls: true, hlsEncryption: false, hlsAddress: ':8888',
  webrtc: true, webrtcEncryption: false, webrtcAddress: ':8889',
  srt: true, srtAddress: ':8890',
  playback: true, playbackEncryption: false, playbackAddress: ':9996',
};

test('portOf 는 주소 형식과 무관하게 포트만 돌려준다', () => {
  assert.equal(portOf(':8554'), '8554');
  assert.equal(portOf('0.0.0.0:8554'), '8554');
  assert.equal(portOf('[::]:8554'), '8554');
});

test('streamUrls 는 켜진 프로토콜의 URL 을 모두 만든다', () => {
  assert.deepEqual(streamUrls('cam1', '10.0.0.5', base), {
    rtsp: 'rtsp://10.0.0.5:8554/cam1',
    rtmp: 'rtmp://10.0.0.5:1935/cam1',
    hls: 'http://10.0.0.5:8888/cam1/',
    webrtc: 'http://10.0.0.5:8889/cam1/',
    srt: 'srt://10.0.0.5:8890?streamid=read:cam1',
  });
});

test('streamUrls 는 꺼진 프로토콜을 빼고, 암호화 설정에 따라 보안 URL 을 넣는다', () => {
  const conf = { ...base, rtmp: false, srt: false, rtspEncryption: 'optional', hlsEncryption: true, webrtc: false };
  assert.deepEqual(streamUrls('cam1', 'h', conf), {
    rtsp: 'rtsp://h:8554/cam1',
    rtsps: 'rtsps://h:8322/cam1',
    hls: 'https://h:8888/cam1/',
  });
});

test('streamUrls 는 strict 암호화면 평문 URL 을 뺀다', () => {
  const urls = streamUrls('c', 'h', { ...base, rtmpEncryption: 'strict' });
  assert.equal(urls.rtmp, undefined);
  assert.equal(urls.rtmps, 'rtmps://h:1936/c');
});

test('playbackBase 는 playback 이 꺼져 있으면 null', () => {
  assert.equal(playbackBase('h', base), 'http://h:9996');
  assert.equal(playbackBase('h', { ...base, playback: false }), null);
});
