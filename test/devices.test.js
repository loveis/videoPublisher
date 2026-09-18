// dshow 출력 파싱(카메라 목록, 해상도/프레임 옵션) 단위 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeviceList, parseOptions } from '../src/devices.js';

test('parseDeviceList 는 video 장치만 추출한다', () => {
  const text = [
    '[dshow @ 0000] "Live Streamer CAM 313" (video)',
    '[dshow @ 0000]   Alternative name "@device_pnp_usb#vid_07ca"',
    '[dshow @ 0000] "HD Webcam" (video)',
    '[dshow @ 0000] "OBS Virtual Camera" (none)',
    '[dshow @ 0000] "마이크(Realtek(R) Audio)" (audio)',
    'Error opening input file dummy.',
  ].join('\r\n');
  assert.deepEqual(parseDeviceList(text), [{ name: 'Live Streamer CAM 313' }, { name: 'HD Webcam' }]);
});

test('parseOptions 는 해상도별로 프레임을 묶고 큰 해상도부터 정렬한다', () => {
  const text = [
    '[dshow @ 0000]   pixel_format=yuyv422  min s=640x480 fps=30 max s=640x480 fps=30',
    '[dshow @ 0000]   pixel_format=yuyv422  min s=1280x720 fps=30 max s=1280x720 fps=30',
    '[dshow @ 0000]   pixel_format=nv12  min s=1280x720 fps=30 max s=1280x720 fps=30',
    '[dshow @ 0000]   pixel_format=yuyv422  min s=1280x720 fps=10 max s=1280x720 fps=10',
  ].join('\n');
  assert.deepEqual(parseOptions(text), [
    { width: 1280, height: 720, fps: [30, 10] },
    { width: 640, height: 480, fps: [30] },
  ]);
});

test('parseOptions 는 프레임 범위를 일반적인 값으로 펼치고 소수 fps 는 반올림한다', () => {
  const text = '  vcodec=mjpeg  min s=1920x1080 fps=5 max s=1920x1080 fps=29.97';
  assert.deepEqual(parseOptions(text), [{ width: 1920, height: 1080, fps: [30, 25, 24, 20, 15, 10, 5] }]);
});

test('parseOptions 는 옵션이 없으면 빈 배열을 돌려준다', () => {
  assert.deepEqual(parseOptions('Error opening input file video=HD Webcam.'), []);
});
