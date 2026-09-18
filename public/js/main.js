// 관리 화면 진입점: 로그인/로그아웃, 탭 전환, 활성 탭 주기 갱신
import { api, setUnauthorizedHandler } from './api.js';
import * as streams from './streams.js';
import * as sessions from './sessions.js';
import * as recordings from './recordings.js';
import * as settings from './settings.js';
import * as info from './info.js';

const $ = (sel) => document.querySelector(sel);
// poll: true 인 탭만 2초마다 갱신(설정 탭은 편집 중 값이 덮이지 않게 수동 갱신).
const TABS = {
  streams: { mod: streams, poll: true },
  sessions: { mod: sessions, poll: true },
  recordings: { mod: recordings, poll: true },
  settings: { mod: settings, poll: false },
  info: { mod: info, poll: true },
};
let active = 'streams';
let pollTimer = null;
let initialized = false;

function showLogin() {
  clearInterval(pollTimer);
  $('#main-view').hidden = true;
  $('#login-view').hidden = false;
}
setUnauthorizedHandler(showLogin);

async function refresh() {
  try {
    await TABS[active].mod.refresh();
  } catch (err) {
    console.error(err);
  }
}

async function showMain() {
  $('#login-view').hidden = true;
  $('#main-view').hidden = false;
  if (!initialized) {
    for (const { mod } of Object.values(TABS)) mod.init?.();
    initialized = true;
  }
  await selectTab(active);
  clearInterval(pollTimer);
  pollTimer = setInterval(() => TABS[active].poll && refresh(), 2000);
}

async function selectTab(name) {
  active = name;
  for (const btn of document.querySelectorAll('#tabs button')) btn.classList.toggle('active', btn.dataset.tab === name);
  for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== name;
  await refresh();
}

$('#tabs').addEventListener('click', (e) => {
  if (e.target.dataset.tab) selectTab(e.target.dataset.tab);
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('#login-error').textContent = '';
  try {
    await api('POST', '/api/login', { username: f.username.value, password: f.password.value });
    f.reset();
    await showMain();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('POST', '/api/logout');
  showLogin();
});

// 이미 로그인된 세션이면 바로 메인 화면으로.
fetch('/api/streams').then((res) => (res.ok ? showMain() : showLogin()));
