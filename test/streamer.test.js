// 카메라 캡처 FFmpeg 명령 조립 단위 테스트 (윈도우 dshow / 리눅스 v4l2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFfmpegArgs } from '../src/streamer.js';

const config = { camera: 'HD Webcam', width: 1280, height: 720, fps: 30, bitrate: 2000 };
const url = 'rtsp://127.0.0.1:8554/cam1';

test('윈도우에서는 dshow 장치 이름으로 입력을 만든다', () => {
  const args = buildFfmpegArgs(config, url, 'win32').join(' ');
  assert.match(args, /-f dshow -rtbufsize 256M -video_size 1280x720 -framerate 30 -i video=HD Webcam/);
});

test('리눅스에서는 v4l2 장치 파일로 입력을 만든다', () => {
  const args = buildFfmpegArgs({ ...config, camera: '/dev/video0' }, url, 'linux').join(' ');
  assert.match(args, /-f v4l2 -video_size 1280x720 -framerate 30 -i \/dev\/video0/);
  assert.doesNotMatch(args, /dshow/);
});

test('인코딩 옵션과 송출 주소는 플랫폼과 무관하게 같다', () => {
  for (const platform of ['win32', 'linux']) {
    const args = buildFfmpegArgs(config, url, platform).join(' ');
    assert.match(args, /-c:v libx264 -preset veryfast -tune zerolatency -profile:v baseline -pix_fmt yuv420p/);
    assert.match(args, /-b:v 2000k -maxrate 2000k -bufsize 4000k -g 60/);
    assert.ok(args.endsWith(`-f rtsp -rtsp_transport tcp ${url}`));
  }
});
