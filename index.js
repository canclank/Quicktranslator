// Quick Translator (간편 번역기) — SillyTavern extension
// 가벼움 우선: 템플릿 fetch 없음, 옵저버/타이머 없음, 번역 기록은 메모리에만 존재.

const MODULE = 'quickTranslator';
const MAX_HISTORY = 5;

const LANGS = [
    ['auto', '자동 감지'],
    ['Korean', '한국어'],
    ['English', 'English'],
    ['Japanese', '日本語'],
    ['Simplified Chinese', '中文(简体)'],
    ['Traditional Chinese', '中文(繁體)'],
    ['Spanish', 'Español'],
    ['French', 'Français'],
    ['German', 'Deutsch'],
    ['Russian', 'Русский'],
    ['Portuguese', 'Português'],
    ['Italian', 'Italiano'],
    ['Vietnamese', 'Tiếng Việt'],
    ['Thai', 'ไทย'],
    ['Indonesian', 'Bahasa Indonesia'],
];
const LABEL = Object.fromEntries(LANGS);

const DEFAULT_PROMPT = 'Translate the following {{source}} text into {{target}}.\n\n{{text}}';
const DEFAULT_RULES = 'Output ONLY the translated text. No explanations, notes, quotation marks, or romanization. Preserve line breaks, *asterisks*, "quotes", and all formatting exactly as in the original.';

const DEFAULTS = {
    profileId: '',
    sourceLang: 'Korean',
    targetLang: 'English',
    prompt: DEFAULT_PROMPT,
    rules: DEFAULT_RULES,
    maxTokens: 1024,
    showInWand: true,
    showFloating: false,
    fabX: 8,
    fabY: 64,
};

const ctx = () => SillyTavern.getContext();
let S;

// ---- 세션 상태 (메모리 전용, 닫으면 삭제) ----
let history = [];
let selected = -1;
let lastSource = '';
let busy = false;
let abortCtl = null;
let session = 0;

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches;

// 패널 크기가 바뀔 때 채팅이 맨 아래였다면 맨 아래 유지 (모바일에서 최신 메시지가 가려지지 않게)
function keepChatBottom(fn) {
    const c = $('chat');
    const stick = c && c.scrollHeight - c.scrollTop - c.clientHeight < 40;
    fn();
    if (stick) c.scrollTop = c.scrollHeight;
}
const save = () => ctx().saveSettingsDebounced();

function loadSettings() {
    const es = ctx().extensionSettings;
    es[MODULE] = Object.assign({}, DEFAULTS, es[MODULE]);
    S = es[MODULE];
}

// ---------------- 번역 요청 ----------------
function buildMessages(text) {
    const src = S.sourceLang === 'auto' ? 'the source language (auto-detect)' : S.sourceLang;
    const fill = (s) => String(s || '')
        .replaceAll('{{source}}', src)
        .replaceAll('{{target}}', S.targetLang);
    let user = fill(S.prompt);
    user = user.includes('{{text}}') ? user.replaceAll('{{text}}', text) : `${user}\n\n${text}`;
    const sys = fill(S.rules).trim();
    return { sys, user };
}

function clean(out) {
    return String(out ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

async function callModel(sys, user, signal) {
    const c = ctx();
    const max = Number(S.maxTokens) || 1024;
    if (S.profileId) {
        const svc = c.ConnectionManagerRequestService;
        if (!svc) throw new Error('이 버전에서는 연결 프로필을 쓸 수 없습니다. 실리태번을 업데이트하세요.');
        const msgs = [];
        if (sys) msgs.push({ role: 'system', content: sys });
        msgs.push({ role: 'user', content: user });
        const r = await svc.sendRequest(S.profileId, msgs, max, {
            stream: false, signal, extractData: true, includePreset: true, includeInstruct: true,
        });
        return clean(typeof r === 'string' ? r : r?.content);
    }
    // 프로필 미선택 → 현재 연결된 API 사용
    const r = await c.generateRaw({ prompt: user, systemPrompt: sys, responseLength: max });
    return clean(r);
}

async function translate(text, append) {
    if (busy || !text) return;
    if (!append || text !== lastSource) { history = []; selected = -1; }
    lastSource = text;
    const my = session;
    setBusy(true, '번역 중…');
    abortCtl = new AbortController();
    try {
        const { sys, user } = buildMessages(text);
        const out = await callModel(sys, user, abortCtl.signal);
        if (my !== session) return; // 도중에 창을 닫음
        if (!out) throw new Error('빈 응답');
        history.push(out);
        if (history.length > MAX_HISTORY) history.shift();
        selected = history.length - 1;
        renderList();
        setBusy(false, '');
    } catch (e) {
        if (my !== session) return;
        setBusy(false, e?.name === 'AbortError' ? '취소됨' : '실패: ' + (e?.message || e));
    } finally {
        abortCtl = null;
    }
}

async function testConnection() {
    const out = $('qtr_test_result');
    out.textContent = '테스트 중…';
    const t = performance.now();
    try {
        const r = await callModel('', 'Reply with exactly: OK', null);
        const sec = ((performance.now() - t) / 1000).toFixed(1);
        out.textContent = r ? `✓ 성공 (${sec}s): ${r.slice(0, 60)}` : '✗ 빈 응답';
    } catch (e) {
        out.textContent = '✗ 실패: ' + (e?.message || e);
    }
}

// ---------------- 패널 ----------------
function setBusy(b, msg) {
    busy = b;
    $('qtr_panel').classList.toggle('qtr-busy', b);
    $('qtr_status').textContent = msg;
}

function renderList() {
    const list = $('qtr_list');
    const frag = document.createDocumentFragment();
    history.forEach((t, i) => {
        const d = document.createElement('div');
        d.className = 'qtr-item' + (i === selected ? ' sel' : '');
        d.dataset.i = i;
        const n = document.createElement('span');
        n.className = 'qtr-num';
        n.textContent = i + 1;
        d.append(n, t);
        frag.append(d);
    });
    keepChatBottom(() => list.replaceChildren(frag));
    $('qtr_count').textContent = history.length ? `${history.length}/${MAX_HISTORY}` : '';
}

function updateLangLabel() {
    $('qtr_langs').textContent = `${LABEL[S.sourceLang]} → ${LABEL[S.targetLang]}`;
    $('qtr_src').placeholder = `${LABEL[S.sourceLang]} 입력 (Ctrl+Enter 번역)`;
}

function insertToChat(i) {
    const t = history[i ?? selected];
    if (t == null) return;
    const ta = $('send_textarea');
    ta.value = t;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    if (!isTouch) ta.focus();
}

function openPanel() {
    const p = $('qtr_panel');
    keepChatBottom(() => {
        p.style.display = '';
        p.classList.remove('qtr-fold');
    });
    applyLaunchers();
    if (!isTouch) $('qtr_src').focus(); // 모바일은 키보드 자동 팝업 안 함
}

function closePanel() {
    session++;
    abortCtl?.abort();
    history = []; selected = -1; lastSource = '';
    $('qtr_list').replaceChildren();
    $('qtr_count').textContent = '';
    $('qtr_src').value = '';
    setBusy(false, '');
    $('qtr_panel').style.display = 'none';
    applyLaunchers();
}

function togglePanel() {
    $('qtr_panel').style.display === 'none' ? openPanel() : closePanel();
}

function buildPanel() {
    const p = document.createElement('div');
    p.id = 'qtr_panel';
    p.style.display = 'none';
    p.innerHTML = `
<div id="qtr_head">
  <span id="qtr_title">번역 <small id="qtr_langs"></small></span>
  <span id="qtr_count"></span>
  <i id="qtr_fold" class="fa-solid fa-chevron-down" title="접기/펼치기"></i>
  <i id="qtr_close" class="fa-solid fa-xmark" title="닫기 (기록 삭제)"></i>
</div>
<div id="qtr_body">
  <textarea id="qtr_src" class="text_pole" rows="2"></textarea>
  <div class="qtr-row">
    <div id="qtr_go" class="menu_button qtr-act">번역</div>
    <div id="qtr_re" class="menu_button qtr-act">새로 번역</div>
    <div id="qtr_ins" class="menu_button">채팅창에 입력</div>
    <span id="qtr_status"></span>
  </div>
  <div id="qtr_list"></div>
</div>`;
    const fab = document.createElement('div');
    fab.id = 'qtr_fab';
    fab.className = 'fa-solid fa-language';
    fab.title = '번역기 (끌어서 이동)';
    const wrap = document.createElement('div');
    wrap.id = 'qtr_wrap';
    wrap.append(fab, p);
    // 입력창 영역 맨 위에 붙임 → 키보드/퀵리플라이/테마와 상관없이 입력창 바로 위에 따라다님
    $('send_form').parentElement.prepend(wrap);
    bindFab(fab, wrap);

    $('qtr_head').addEventListener('click', (e) => {
        if (e.target.id === 'qtr_close') return closePanel();
        keepChatBottom(() => p.classList.toggle('qtr-fold'));
    });
    $('qtr_go').addEventListener('click', () => translate($('qtr_src').value.trim(), false));
    $('qtr_re').addEventListener('click', () => translate(lastSource || $('qtr_src').value.trim(), true));
    $('qtr_ins').addEventListener('click', () => insertToChat());
    $('qtr_src').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('qtr_go').click(); }
    });
    const list = $('qtr_list');
    list.addEventListener('click', (e) => {
        const it = e.target.closest('.qtr-item');
        if (!it) return;
        selected = +it.dataset.i;
        list.querySelector('.sel')?.classList.remove('sel');
        it.classList.add('sel');
    });
    list.addEventListener('dblclick', (e) => {
        const it = e.target.closest('.qtr-item');
        if (it) insertToChat(+it.dataset.i);
    });
    updateLangLabel();
}

// ---------------- 마법봉 / 플로팅 ----------------
function buildWand() {
    const w = document.createElement('div');
    w.id = 'qtr_wand';
    w.className = 'list-group-item flex-container flexGap5';
    w.innerHTML = '<div class="fa-solid fa-language extensionsMenuExtensionButton"></div>번역기';
    w.addEventListener('click', togglePanel);
    $('extensionsMenu')?.append(w);
}

function setFabPos(x, y) {
    const f = $('qtr_fab');
    f.style.setProperty('--qtr-x', x + 'px');
    f.style.setProperty('--qtr-y', y + 'px');
}

// 탭 = 열기/닫기, 8px 이상 끌면 이동. move 처리는 누르고 있을 때만 동작.
function bindFab(fab, wrap) {
    let d = null;
    let raf = 0;
    fab.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        const wr = wrap.getBoundingClientRect();
        const top = $('chat')?.getBoundingClientRect().top ?? 0;
        d = {
            sx: e.clientX, sy: e.clientY, ox: S.fabX, oy: S.fabY, x: S.fabX, y: S.fabY, moved: false,
            maxX: Math.max(0, wr.width - 44), maxY: Math.max(0, wr.top - top - 44),
        };
        fab.setPointerCapture(e.pointerId);
    });
    fab.addEventListener('pointermove', (e) => {
        if (!d) return;
        const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
        if (!d.moved && Math.abs(dx) + Math.abs(dy) < 8) return;
        d.moved = true;
        d.x = Math.min(d.maxX, Math.max(0, d.ox - dx));
        d.y = Math.min(d.maxY, Math.max(0, d.oy - dy));
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (d) setFabPos(d.x, d.y); });
    });
    const end = (e) => {
        if (!d) return;
        const r = d; d = null;
        if (r.moved) {
            S.fabX = Math.round(r.x); S.fabY = Math.round(r.y);
            setFabPos(S.fabX, S.fabY);
            save();
        } else if (e.type === 'pointerup') {
            togglePanel();
        }
    };
    fab.addEventListener('pointerup', end);
    fab.addEventListener('pointercancel', end);
    setFabPos(S.fabX, S.fabY);
}

function applyLaunchers() {
    const w = $('qtr_wand');
    if (w) w.style.display = S.showInWand ? '' : 'none';
    // 패널이 열려 있으면 플로팅 버튼은 숨김 (패널과 겹침 방지, 패널의 ×로 닫기)
    const open = $('qtr_panel').style.display !== 'none';
    $('qtr_fab').style.display = S.showFloating && !open ? '' : 'none';
}

// ---------------- 설정 ----------------
let profileKey = null;
function fillProfiles() {
    const sel = $('qtr_profile');
    const profiles = ctx().extensionSettings.connectionManager?.profiles || [];
    const key = profiles.map((p) => p.id + p.name).join('|');
    if (key === profileKey) return; // 바뀐 게 없으면 DOM 건드리지 않음
    profileKey = key;
    const opts = ['<option value="">(현재 연결된 API)</option>'];
    for (const p of [...profiles].sort((a, b) => a.name.localeCompare(b.name))) {
        opts.push(`<option value="${p.id}">${escapeHtml(p.name)}</option>`);
    }
    sel.innerHTML = opts.join('');
    sel.value = profiles.some((p) => p.id === S.profileId) ? S.profileId : '';
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function buildSettings() {
    const langOpts = (skipAuto) => LANGS
        .filter(([v]) => !(skipAuto && v === 'auto'))
        .map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    const d = document.createElement('div');
    d.id = 'qtr_settings';
    d.innerHTML = `
<div class="inline-drawer">
  <div class="inline-drawer-toggle inline-drawer-header">
    <b>간편 번역기</b>
    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
  </div>
  <div class="inline-drawer-content">
    <label>연결 프로필</label>
    <div class="flex-container">
      <select id="qtr_profile" class="text_pole flex1"></select>
      <div id="qtr_test" class="menu_button">연결 테스트</div>
    </div>
    <small id="qtr_test_result"></small>
    <div class="flex-container">
      <div class="flex1"><label>입력 언어</label><select id="qtr_srcl" class="text_pole">${langOpts(false)}</select></div>
      <div class="flex1"><label>출력 언어</label><select id="qtr_tgtl" class="text_pole">${langOpts(true)}</select></div>
    </div>
    <label>번역 프롬프트 <small>({{text}} {{source}} {{target}})</small></label>
    <textarea id="qtr_prompt" class="text_pole" rows="4"></textarea>
    <label>반드시 지시할 사항 <small>(시스템 지시로 전달)</small></label>
    <textarea id="qtr_rules" class="text_pole" rows="3"></textarea>
    <label>최대 토큰</label>
    <input id="qtr_max" type="number" class="text_pole" min="16" max="16384">
    <label class="checkbox_label"><input id="qtr_wandchk" type="checkbox"><span>마법봉 메뉴에 표시</span></label>
    <label class="checkbox_label"><input id="qtr_floatchk" type="checkbox"><span>플로팅 버튼 표시</span></label>
    <div class="flex-container">
      <div id="qtr_reset" class="menu_button">프롬프트 초기화</div>
      <div id="qtr_open" class="menu_button">번역창 열기</div>
      <div id="qtr_fabreset" class="menu_button">버튼 위치 초기화</div>
    </div>
  </div>
</div>`;
    $('extensions_settings2').append(d);

    fillProfiles();
    $('qtr_srcl').value = S.sourceLang;
    $('qtr_tgtl').value = S.targetLang;
    $('qtr_prompt').value = S.prompt;
    $('qtr_rules').value = S.rules;
    $('qtr_max').value = S.maxTokens;
    $('qtr_wandchk').checked = S.showInWand;
    $('qtr_floatchk').checked = S.showFloating;

    const bind = (id, key, ev, fn) => $(id).addEventListener(ev, (e) => {
        const el = e.target;
        S[key] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
        save();
        fn?.();
    });
    bind('qtr_profile', 'profileId', 'change');
    bind('qtr_srcl', 'sourceLang', 'change', updateLangLabel);
    bind('qtr_tgtl', 'targetLang', 'change', updateLangLabel);
    bind('qtr_prompt', 'prompt', 'input');
    bind('qtr_rules', 'rules', 'input');
    bind('qtr_max', 'maxTokens', 'change');
    bind('qtr_wandchk', 'showInWand', 'change', applyLaunchers);
    bind('qtr_floatchk', 'showFloating', 'change', applyLaunchers);

    // 프로필 목록은 열 때만 갱신 (상시 감시 없음)
    $('qtr_profile').addEventListener('focus', fillProfiles);
    $('qtr_test').addEventListener('click', testConnection);
    $('qtr_open').addEventListener('click', openPanel);
    $('qtr_fabreset').addEventListener('click', () => {
        S.fabX = DEFAULTS.fabX; S.fabY = DEFAULTS.fabY;
        setFabPos(S.fabX, S.fabY);
        save();
    });
    $('qtr_reset').addEventListener('click', () => {
        S.prompt = DEFAULT_PROMPT; S.rules = DEFAULT_RULES;
        $('qtr_prompt').value = S.prompt; $('qtr_rules').value = S.rules;
        save();
    });
}

jQuery(() => {
    loadSettings();
    buildPanel();
    buildWand();
    buildSettings();
    applyLaunchers();
});
