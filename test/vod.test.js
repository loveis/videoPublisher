// VOD 경로 이름 생성과 FFmpeg 명령 조립 단위 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPathName, buildCommand, safeFileName } from '../src/vod.js';

test('toPathName 은 쓸 수 있는 이름은 그대로, 바뀐 이름에는 해시를 붙인다', () => {
  assert.equal(toPathName('a/b/c.ts'), 'vod/a/b/c');
  assert.match(toPathName('sample clip.mp4'), /^vod\/sample_clip-[0-9a-f]{6}$/);
  assert.match(toPathName('영화/action 2 (4K).mkv'), /^vod\/__\/action_2__4K_-[0-9a-f]{6}$/);
});

test('toPathName 은 한글 이름이 달라도 서로 다른 경로를 만든다', () => {
  assert.notEqual(toPathName('휴가.mp4'), toPathName('여행.mp4'));
});

test('buildCommand 는 H.264 영상을 복사하고 오디오를 Opus 로 맞춘다', () => {
  const cmd = buildCommand({ file: 'D:/media/a b.mp4', loop: false, video: 'h264', audio: 'aac' });
  assert.match(cmd, /-i "D:\/media\/a b\.mp4"/);
  assert.match(cmd, /-c:v copy/);
  assert.match(cmd, /-c:a libopus/);
  assert.doesNotMatch(cmd, /-stream_loop/);
  assert.ok(cmd.endsWith('-f rtsp -rtsp_transport tcp rtsp://127.0.0.1:$RTSP_PORT/$MTX_PATH'));
});

test('buildCommand 는 다른 코덱을 H.264 로 변환하고 반복 옵션을 넣는다', () => {
  const cmd = buildCommand({ file: 'x.mkv', loop: true, video: 'hevc', audio: null });
  assert.match(cmd, /-re -stream_loop -1 -i "x\.mkv"/);
  assert.match(cmd, /-c:v libx264/);
  assert.match(cmd, /-an/);
});

test('buildCommand 는 이미 Opus 인 오디오를 복사한다', () => {
  assert.match(buildCommand({ file: 'x.webm', loop: false, video: 'vp9', audio: 'opus' }), /-c:a copy/);
});

test('safeFileName 은 폴더 경로를 떼고 이름을 유지한다', () => {
  assert.equal(safeFileName('영상 1-2.mp4'), '영상 1-2.mp4');
  assert.equal(safeFileName('C:/x/y/movie.mp4'), 'movie.mp4');
  assert.equal(safeFileName('../../etc/passwd.mp4'), 'passwd.mp4');
  assert.equal(safeFileName('a<b>c.mp4'), 'a_b_c.mp4');
});

test('safeFileName 은 지원하지 않는 형식과 잘못된 이름을 거부한다', () => {
  assert.throws(() => safeFileName('bad.exe'), /지원하지 않는 형식/);
  assert.throws(() => safeFileName('...mp4'), /올바르지 않습니다/);
  assert.throws(() => safeFileName(''), /올바르지 않습니다/);
});
