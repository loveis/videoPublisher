// 설정 탭: MediaMTX 설정을 주요 항목(그룹 폼) / 고급(전체 항목 자동 폼)으로 편집하고 바뀐 값만 저장
import { api, escapeHtml } from './api.js';
import { GROUPS } from './config-schema.js';

const $ = (sel) => document.querySelector(sel);
// 라즈베리파이 카메라 전용 항목과 경로 이름은 이 앱(Windows)에서 의미가 없어 고급 폼에서도 숨긴다.
const HIDDEN = (key) => key.startsWith('rpiCamera') || key === 'name';
let config = null;
let mode = 'main';

export function init() {
  $('#settings-tabs').addEventListener('click', (e) => {
    if (!e.target.dataset.mode) return;
    mode = e.target.dataset.mode;
    for (const b of document.querySelectorAll('#settings-tabs button')) b.classList.toggle('active', b.dataset.mode === mode);
    render();
  });
  $('#settings-filter').addEventListener('input', applyFilter);
  $('#settings-body').addEventListener('submit', save);
}

export async function refresh() {
  config = await api('GET', '/api/config');
  render();
}

const valueOf = (section, key) => (section === 'global' ? config.global : config.pathDefaults)[key];

function render() {
  $('#settings-filter').hidden = mode !== 'advanced';
  $('#settings-body').innerHTML = mode === 'main' ? renderMain() : renderAdvanced();
  applyFilter();
}

function renderMain() {
  return GROUPS.map(
    (g) => `<form class="config-group">
      <h3>${escapeHtml(g.title)}</h3>
      ${g.desc ? `<p class="muted">${escapeHtml(g.desc)}</p>` : ''}
      <div class="fields">${g.fields.map((f) => renderField({ section: 'global', ...f })).join('')}</div>
      <div class="row"><button class="primary">저장</button><span class="result"></span></div>
    </form>`,
  ).join('');
}

function renderAdvanced() {
  const block = (section, title, values) => `<form class="config-group">
      <h3>${title}</h3>
      <div class="fields">${Object.keys(values)
        .filter((k) => !HIDDEN(k))
        .map((key) => renderField({ section, key, label: key }))
        .join('')}</div>
      <div class="row"><button class="primary">저장</button><span class="result"></span></div>
    </form>`;
  return block('global', '전역 설정 (global)', config.global) + block('pathdefaults', '경로 기본값 (pathDefaults)', config.pathDefaults);
}

// 입력 형식: bool → 체크박스, number → 숫자, options → 선택, multi → 체크박스 묶음,
// list → 쉼표 구분 텍스트(문자열 배열), json → JSON 텍스트(객체/객체 배열/null), 그 외 → 텍스트.
function inferType(value) {
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string')) return 'list';
  if (value !== null && typeof value === 'object') return 'json';
  if (value === null) return 'json';
  return 'text';
}

function renderField({ section, key, label, desc, options, type }) {
  const value = valueOf(section, key);
  if (value === undefined) return '';
  type ??= options ? 'select' : inferType(value);
  const locked = section === 'global' && config.protectedKeys.includes(key);
  const attrs = `data-key="${key}" data-section="${section}" data-type="${type}" data-orig="${escapeHtml(JSON.stringify(value))}" ${locked ? 'disabled' : ''}`;
  let input;
  if (type === 'bool') {
    input = `<input type="checkbox" ${attrs} ${value ? 'checked' : ''}>`;
  } else if (type === 'number') {
    input = `<input type="number" ${attrs} value="${value}">`;
  } else if (type === 'select') {
    // 현재 값이 선택지에 없으면(예: 직접 yml 에 쓴 값) 그대로 보이도록 추가한다.
    const opts = options.includes(value) ? options : [value, ...options];
    input = `<select ${attrs}>${opts.map((o) => `<option ${o === value ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`;
  } else if (type === 'multi') {
    input = `<span class="checks" ${attrs}>${options
      .map((o) => `<label class="check"><input type="checkbox" value="${o}" ${value.includes(o) ? 'checked' : ''} ${locked ? 'disabled' : ''}> ${o}</label>`)
      .join('')}</span>`;
  } else if (type === 'list') {
    input = `<input ${attrs} value="${escapeHtml(value.join(', '))}" placeholder="쉼표로 구분">`;
  } else if (type === 'json') {
    input = `<textarea rows="${Math.min(8, JSON.stringify(value, null, 2).split('\n').length)}" ${attrs}>${escapeHtml(JSON.stringify(value, null, 2))}</textarea>`;
  } else {
    input = `<input ${attrs} value="${escapeHtml(value)}">`;
  }
  const name = label === key ? `<code>${key}</code>` : `${escapeHtml(label)} <code>${key}</code>`;
  return `<div class="field" data-search="${key.toLowerCase()} ${escapeHtml((label ?? '').toLowerCase())}">
    <div class="field-label">${name}${locked ? ' <span class="muted">(변경 불가)</span>' : ''}${desc ? `<small>${escapeHtml(desc)}</small>` : ''}</div>
    <div class="field-input">${input}</div>
  </div>`;
}

function readField(el) {
  const { type } = el.dataset;
  if (type === 'bool') return el.checked;
  if (type === 'number') return Number(el.value);
  if (type === 'multi') return [...el.querySelectorAll('input:checked')].map((i) => i.value);
  if (type === 'list') return el.value.split(',').map((s) => s.trim()).filter(Boolean);
  if (type === 'json') {
    try {
      return JSON.parse(el.value);
    } catch {
      throw new Error(`${el.dataset.key}: JSON 형식이 올바르지 않습니다.`);
    }
  }
  return el.value;
}

// 폼에서 원래 값과 달라진 항목만 구역(global/pathdefaults)별로 모아 저장한다.
async function save(e) {
  e.preventDefault();
  const form = e.target;
  const result = form.querySelector('.result');
  const patches = {};
  try {
    for (const el of form.querySelectorAll('[data-key]:not([disabled])')) {
      const value = readField(el);
      if (JSON.stringify(value) === el.dataset.orig) continue;
      (patches[el.dataset.section] ??= {})[el.dataset.key] = value;
    }
  } catch (err) {
    return showResult(result, err.message, true);
  }
  if (Object.keys(patches).length === 0) return showResult(result, '변경된 항목이 없습니다.');

  const button = form.querySelector('button');
  const index = [...$('#settings-body').children].indexOf(form);
  button.disabled = true;
  showResult(result, '적용 중…');
  try {
    for (const [section, patch] of Object.entries(patches)) await api('PATCH', `/api/config/${section}`, patch);
    config = await api('GET', '/api/config');
    render();
    // render 로 폼이 새로 그려졌으므로 같은 위치의 새 폼에 결과를 표시한다.
    const changed = Object.values(patches).flatMap(Object.keys).join(', ');
    showResult($('#settings-body').children[index].querySelector('.result'), `저장했습니다: ${changed}`);
  } catch (err) {
    showResult(result, err.message, true);
    button.disabled = false;
  }
}

function showResult(el, text, isError = false) {
  el.textContent = text;
  el.classList.toggle('error', isError);
}

function applyFilter() {
  const q = mode === 'advanced' ? $('#settings-filter').value.trim().toLowerCase() : '';
  for (const field of document.querySelectorAll('#settings-body .field')) {
    field.hidden = q !== '' && !field.dataset.search.includes(q);
  }
}
