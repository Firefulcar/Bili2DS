// ============================================================
// B站视频·DeepSeek总结 - Browser Extension (MV3)
// B站视频页面 UI + 中继 + 剪切板写入
// 支持字幕 / ASR 语音识别后备
// ============================================================

// ─── Inject styles ───
const style = document.createElement('style');
style.textContent = `
.bili-sub-btn {
    position: fixed;
    right: 20px;
    top: 55%;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    cursor: grab;
    user-select: none;
    /* 入场动画 */
    animation: bili-panel-enter 0.45s cubic-bezier(0.22,0.61,0.36,1) both;
}
@keyframes bili-panel-enter {
    from { opacity: 0; transform: translateX(24px); }
    to   { opacity: 1; transform: translateX(0); }
}
.bili-sub-btn--dragging { cursor: grabbing; }
.bili-sub-btn--dragging > * { pointer-events: none; }
.bili-sub-btn--drag-done > * { pointer-events: none; }
.bili-sub-btn button { cursor: pointer; }
.bili-sub-btn__bubble {
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: #fff;
    font-size: 12px;
    padding: 7px 14px;
    border-radius: 10px;
    white-space: nowrap;
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 0.25s cubic-bezier(0.22,0.61,0.36,1), transform 0.25s cubic-bezier(0.22,0.61,0.36,1);
    pointer-events: none;
    max-width: 280px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.18);
    border: 1px solid rgba(255,255,255,0.08);
    position: relative;
}
/* 气泡下方小三角 */
.bili-sub-btn__bubble::after {
    content: '';
    position: absolute;
    bottom: -5px;
    left: 50%;
    transform: translateX(-50%);
    width: 0; height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 5px solid rgba(0, 0, 0, 0.72);
}
.bili-sub-btn__bubble--show {
    opacity: 1;
    transform: translateY(0);
}
.bili-sub-btn__main {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: none;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s;
    outline: none;
    line-height: 1;
}
.bili-sub-btn__main:hover { transform: scale(1.1); }
.bili-sub-btn__main:active { transform: scale(0.92); }
.bili-sub-btn__main svg { width: 22px; height: 22px; fill: #fff; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.1)); }
/* ── 5 个按钮各自独立的 loading 动画 ── */
.bili-sub-btn__main--loading {
    pointer-events: none !important;
    cursor: wait;
}

/* ① 复制（圆）— 轻柔呼吸缩放 */
.bili-sub-btn__copy.bili-sub-btn__main--loading {
    animation: bili-loading-breathe 1.2s cubic-bezier(0.45,0,0.55,1) infinite;
}
@keyframes bili-loading-breathe {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(0.86); }
}

/* ② 设置（圆）— 不透明度闪烁 */
.bili-sub-btn__settings.bili-sub-btn__main--loading {
    animation: bili-loading-flicker 0.9s ease-in-out infinite;
}
@keyframes bili-loading-flicker {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.35; }
}

/* ③ DeepSeek 复述（矩形）— 光泽扫过 */
.bili-sub-btn__ds-retell.bili-sub-btn__main--loading {
    position: relative;
    overflow: hidden;
}
.bili-sub-btn__ds-retell.bili-sub-btn__main--loading::after {
    content: '';
    position: absolute;
    top: 0; left: -100%;
    width: 100%; height: 100%;
    background: linear-gradient(90deg, transparent 0%, rgba(77,107,254,0.10) 40%, rgba(77,107,254,0.18) 50%, rgba(77,107,254,0.10) 60%, transparent 100%);
    animation: bili-loading-shimmer 1.4s ease-in-out infinite;
    pointer-events: none;
    z-index: 0;
}
@keyframes bili-loading-shimmer {
    0%   { left: -100%; }
    100% { left: 100%; }
}

/* ④ 快速模式（矩形）— 文字呼吸 */
.bili-sub-btn__ds-continue.bili-sub-btn__main--loading {
    animation: bili-loading-textpulse 1.0s ease-in-out infinite;
}
@keyframes bili-loading-textpulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.40; }
}

/* ⑤ 专家模式问询（矩形，实心蓝）— 波浪式明暗 */
.bili-sub-btn__ds-expert.bili-sub-btn__main--loading {
    animation: bili-loading-wave 1.5s ease-in-out infinite;
}
@keyframes bili-loading-wave {
    0%   { opacity: 1; }
    25%  { opacity: 0.72; }
    50%  { opacity: 0.50; }
    75%  { opacity: 0.72; }
    100% { opacity: 1; }
}

/* ── reduced motion ── */
@media (prefers-reduced-motion: reduce) {
    .bili-sub-btn__main--loading {
        animation: none !important;
        opacity: 0.45;
    }
    .bili-sub-btn__ds-retell.bili-sub-btn__main--loading::after {
        animation: none !important;
        display: none;
    }
}

/* ── Row 1: 复制 + 设置 并排 ── */
.bili-sub-btn__row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
}

/* ── 复制按钮 ── */
.bili-sub-btn__copy {
    background: linear-gradient(135deg, #fb7299, #ff6b8b);
    box-shadow: 0 4px 20px rgba(251,114,153,0.50), 0 0 0 0 rgba(251,114,153,0.4);
    animation: bili-pink-pulse 2.5s ease-in-out infinite;
}
@keyframes bili-pink-pulse {
    0%,100% { box-shadow: 0 4px 20px rgba(251,114,153,0.50), 0 0 0 0 rgba(251,114,153,0.4); }
    50%     { box-shadow: 0 4px 24px rgba(251,114,153,0.55), 0 0 0 8px rgba(251,114,153,0); }
}
.bili-sub-btn__copy:hover {
    box-shadow: 0 6px 28px rgba(251,114,153,0.60);
}

/* ── 长方形按钮（统一宽度，90% 原尺寸）── */
.bili-sub-btn__ds {
    width: 152px; height: 42px; border-radius: 12px; padding: 0 14px;
    font-size: 12px; font-weight: 600; letter-spacing: 0.3px;
    border: 1px solid transparent; display: flex; align-items: center; justify-content: center; gap: 6px;
    cursor: pointer; transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s, background 0.2s, border-color 0.2s;
}
.bili-sub-btn__ds svg { width: 16px; height: 16px; flex-shrink: 0; }

/* Retell — 白底紫字 */
.bili-sub-btn__ds-retell {
    background: #fff; color: #4D6BFE; border-color: #d0d8f0;
    box-shadow: 0 2px 10px rgba(77,107,254,0.08);
}
.bili-sub-btn__ds-retell:hover {
    border-color: #4D6BFE; box-shadow: 0 4px 18px rgba(77,107,254,0.18); background: #f5f7ff;
    transform: scale(1.04);
}
.bili-sub-btn__ds-retell svg { fill: #4D6BFE; }
.bili-sub-btn__ds-retell { position: relative; overflow: visible; padding-right: 42px; }
.bili-sub-btn__avatar {
    position: absolute;
    top: -16px; right: -10px;
    width: 48px; height: 48px;
    border-radius: 50%;
    border: 2.5px solid rgba(255,255,255,0.95);
    box-shadow: 0 3px 12px rgba(77,107,254,0.30);
    object-fit: cover;
    pointer-events: none;
}

/* Continue — 白底蓝字 */
.bili-sub-btn__ds-continue {
    background: #fff; color: #3b6fff; border-color: #d0d8f0;
    box-shadow: 0 2px 10px rgba(59,111,255,0.06);
}
.bili-sub-btn__ds-continue:hover {
    border-color: #3b6fff; box-shadow: 0 4px 18px rgba(59,111,255,0.15); background: #f0f4ff;
    transform: scale(1.04);
}
.bili-sub-btn__ds-continue svg { fill: #3b6fff; }

/* Expert — 蓝底白字 */
.bili-sub-btn__ds-expert {
    background: #3b6fff; color: #fff; border-color: #3b6fff;
    box-shadow: 0 2px 10px rgba(59,111,255,0.25);
}
.bili-sub-btn__ds-expert:hover {
    background: #2a5aeb; border-color: #2a5aeb;
    box-shadow: 0 4px 20px rgba(59,111,255,0.35);
    transform: scale(1.04);
}
.bili-sub-btn__ds-expert svg { fill: #fff; }

/* ── 设置 + 徽章容器 ── */
.bili-sub-btn__settings-wrap {
    position: relative;
    display: inline-flex;
}

/* ── 设置按钮 ── */
.bili-sub-btn__settings {
    width: 48px; height: 48px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.18);
    background: rgba(0,0,0,0.50);
    color: #fff; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), background 0.2s, box-shadow 0.2s;
    outline: none;
    box-shadow: 0 2px 12px rgba(0,0,0,0.20);
}
.bili-sub-btn__settings:hover {
    background: rgba(0,0,0,0.70);
    transform: scale(1.1);
    box-shadow: 0 4px 18px rgba(0,0,0,0.30);
}
.bili-sub-btn__settings svg { width: 20px; height: 20px; fill: #fff; }
.bili-sub-btn__settings:disabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }

/* ── ASR 绿钩徽章（独立元素，视觉附着在设置按钮右上角）── */
.bili-sub-btn__asr-badge {
    position: absolute;
    top: -4px; right: -4px;
    width: 20px; height: 20px;
    border-radius: 50%;
    background: #10b981;
    border: 2.5px solid rgba(0,0,0,0.55);
    display: none;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    line-height: 1;
    cursor: default;
    box-shadow: 0 2px 6px rgba(16,185,129,0.40);
    transition: transform 0.15s;
    z-index: 1;
}
.bili-sub-btn__asr-badge:hover { transform: scale(1.15); }
.bili-sub-btn__asr-badge--on {
    display: flex;
    animation: bili-badge-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
}
@keyframes bili-badge-pop {
    from { transform: scale(0); opacity: 0; }
    to   { transform: scale(1); opacity: 1; }
}

.bili-sub-btn__progress-wrap {
    width: 100%; height: 4px;
    background: rgba(255,255,255,0.12);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 6px;
    display: none;
}
.bili-sub-btn__progress-wrap--show { display: block; }
.bili-sub-btn__progress-bar {
    height: 100%;
    background: #3b6fff;
    border-radius: 2px;
    width: 0%;
    transition: width 0.4s ease;
}
.bili-sub-btn__progress-label {
    font-size: 10px;
    color: rgba(255,255,255,0.5);
    text-align: center;
    margin-top: 3px;
    display: none;
}
.bili-sub-btn__progress-label--show { display: block; }
`;
document.head.appendChild(style);

// ─── Create button UI ───
const wrapper = document.createElement('div');
wrapper.className = 'bili-sub-btn';
wrapper.innerHTML = `
<div class="bili-sub-btn__bubble" id="bili-sub-bubble">
    <span class="bili-sub-btn__bubble-text" id="bili-bubble-text"></span>
    <div class="bili-sub-btn__progress-wrap" id="bili-progress-wrap">
        <div class="bili-sub-btn__progress-bar" id="bili-progress-bar"></div>
    </div>
    <div class="bili-sub-btn__progress-label" id="bili-progress-label"></div>
</div>
<div class="bili-sub-btn__row">
    <button class="bili-sub-btn__main bili-sub-btn__copy" id="bili-sub-btn-copy" title="复制字幕">
        <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
    </button>
    <div class="bili-sub-btn__settings-wrap">
        <button class="bili-sub-btn__main bili-sub-btn__settings" id="bili-sub-btn-settings" title="设置 API Key 和提示词">
            <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.488.488 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
        </button>
        <div class="bili-sub-btn__asr-badge" id="bili-sub-asr-badge" title="语音识别未配置">✓</div>
    </div>
</div>
<button class="bili-sub-btn__main bili-sub-btn__ds bili-sub-btn__ds-retell" id="bili-sub-btn-ds-retell" title="完整复述视频内容，转写为流畅文章">
    DeepSeek 复述
    <img class="bili-sub-btn__avatar" src="${chrome.runtime.getURL('DSloli2.png')}" alt="">
</button>
<button class="bili-sub-btn__main bili-sub-btn__ds bili-sub-btn__ds-continue" id="bili-sub-btn-ds-continue" title="快速梳理要点，简洁中文输出">快速模式</button>
<button class="bili-sub-btn__main bili-sub-btn__ds bili-sub-btn__ds-expert" id="bili-sub-btn-ds-expert" title="五维度深度分析，自动切换 DS 专家模式">专家模式问询</button>
`;
document.body.appendChild(wrapper);

// ─── 恢复上次拖拽位置（限定在屏幕内）───
chrome.storage.local.get(['biliPanelLeft', 'biliPanelTop'], function(data) {
    if (data.biliPanelLeft !== undefined && data.biliPanelTop !== undefined) {
        var clamped = clampPanelPosition(data.biliPanelLeft, data.biliPanelTop);
        wrapper.style.right = 'auto';
        wrapper.style.left = clamped.left + 'px';
        wrapper.style.top = clamped.top + 'px';
    }
});

// ─── 整体拖拽（任意位置按住拖动，轻点仍是点击，禁止拖出屏幕）───
let dragState = null; // null | 'watching' | 'dragging'
let dragStartMouseX, dragStartMouseY;
let dragStartLeft, dragStartTop;
var DRAG_THRESHOLD = 5; // 移动超过 5px 才算拖拽
var PANEL_MIN_VISIBLE = 30; // 拖拽后至少保留 30px 在屏幕内

function clampPanelPosition(left, top) {
    var pw = wrapper.offsetWidth;
    var ph = wrapper.offsetHeight;
    var maxLeft = window.innerWidth - PANEL_MIN_VISIBLE;
    var maxTop = window.innerHeight - PANEL_MIN_VISIBLE;
    var minLeft = PANEL_MIN_VISIBLE - pw;
    var minTop = PANEL_MIN_VISIBLE - ph;
    return {
        left: Math.max(minLeft, Math.min(maxLeft, left)),
        top: Math.max(minTop, Math.min(maxTop, top))
    };
}

wrapper.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragState = 'watching';
    dragStartMouseX = e.clientX;
    dragStartMouseY = e.clientY;
    var rect = wrapper.getBoundingClientRect();
    dragStartLeft = rect.left;
    dragStartTop = rect.top;
});

document.addEventListener('mousemove', function(e) {
    // 鼠标按键已松开（如移出窗口后松手再移入），自动取消拖拽
    if (e.buttons !== 1) {
        dragState = null;
        wrapper.classList.remove('bili-sub-btn--dragging');
        return;
    }
    if (dragState !== 'watching' && dragState !== 'dragging') return;
    e.preventDefault();
    var dx = e.clientX - dragStartMouseX;
    var dy = e.clientY - dragStartMouseY;
    if (dragState === 'watching' && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    if (dragState === 'watching') {
        dragState = 'dragging';
        wrapper.classList.add('bili-sub-btn--dragging');
        wrapper.style.right = 'auto';
        wrapper.style.top = dragStartTop + 'px';
        wrapper.style.left = dragStartLeft + 'px';
    }
    var clamped = clampPanelPosition(dragStartLeft + dx, dragStartTop + dy);
    wrapper.style.left = clamped.left + 'px';
    wrapper.style.top = clamped.top + 'px';
});

document.addEventListener('mouseup', function() {
    if (dragState === 'dragging') {
        wrapper.classList.add('bili-sub-btn--drag-done');
        setTimeout(function() { wrapper.classList.remove('bili-sub-btn--drag-done'); }, 50);
        chrome.storage.local.set({
            biliPanelLeft: parseInt(wrapper.style.left),
            biliPanelTop: parseInt(wrapper.style.top)
        });
    }
    dragState = null;
    wrapper.classList.remove('bili-sub-btn--dragging');
});

const bubble = wrapper.querySelector('#bili-sub-bubble');
const btnCopy = wrapper.querySelector('#bili-sub-btn-copy');
const btnDSContinue = wrapper.querySelector('#bili-sub-btn-ds-continue');
const btnDSExpert = wrapper.querySelector('#bili-sub-btn-ds-expert');
const btnDSRetell = wrapper.querySelector('#bili-sub-btn-ds-retell');
const btnSettings = wrapper.querySelector('#bili-sub-btn-settings');
const asrBadge = wrapper.querySelector('#bili-sub-asr-badge');
const progressWrap = wrapper.querySelector('#bili-progress-wrap');
const progressBar = wrapper.querySelector('#bili-progress-bar');
const progressLabel = wrapper.querySelector('#bili-progress-label');

// ─── Status bubble ───
let bubbleTimer = null;
let bubbleText = wrapper.querySelector('#bili-bubble-text');

function showBubble(msg, duration) {
    bubbleText.textContent = msg;
    bubble.classList.add('bili-sub-btn__bubble--show');
    if (bubbleTimer) clearTimeout(bubbleTimer);
    if (duration > 0) {
        bubbleTimer = setTimeout(function() {
            bubble.classList.remove('bili-sub-btn__bubble--show');
        }, duration);
    }
}
function showProgress(percent, label) {
    progressWrap.classList.add('bili-sub-btn__progress-wrap--show');
    progressBar.style.width = Math.min(100, Math.max(0, percent)) + '%';
    if (label) {
        progressLabel.textContent = label;
        progressLabel.classList.add('bili-sub-btn__progress-label--show');
    }
}
function hideProgress() {
    progressWrap.classList.remove('bili-sub-btn__progress-wrap--show');
    progressLabel.classList.remove('bili-sub-btn__progress-label--show');
    progressBar.style.width = '0%';
}

// ─── Loading lock ───
let loading = false;

function setLoading(lock) {
    loading = lock;
    var allBtns = [btnCopy, btnSettings, btnDSContinue, btnDSExpert, btnDSRetell];
    allBtns.forEach(function(b) {
        if (lock) b.classList.add('bili-sub-btn__main--loading');
        else b.classList.remove('bili-sub-btn__main--loading');
        b.disabled = lock;
    });
}

// ─── Inject page-context script ───
function injectPageScript() {
    var s = document.createElement('script');
    s.src = chrome.runtime.getURL('page-script.js');
    (document.documentElement || document.head).appendChild(s);
}
injectPageScript();

// ─── API Key cache（监听 storage 变化实时刷新）───
let cachedApiKey = null;
let cachedEnableAsr = false;
// 固定窗口默认值：复述/快速 开，专家 关
var cachedFixedWindow = { retell: true, quick: true, expert: false };

var DEFAULTS = {
    promptContinue: `你是一位资深视频内容分析师。以下是B站视频的字幕文本，格式为"[MM:SS] 字幕内容"，请你完成分析。

**重要**：这是一段新视频的字幕，请完全忽略之前对话中的所有内容。

## 任务
1. 快速梳理视频的核心话题和逻辑脉络
2. 提取 3-8 个关键要点，按重要性排序
3. 用简洁中文输出，每个要点控制在 30 字以内

## 输出格式
### 视频主旨
（一句话概括）

### 核心要点
- 要点一
- 要点二
- …

### 一句话总结
（视频最想传达的一件事）

## 字幕内容
{{text}}`,

    promptExpert: `你是一位深度内容分析专家，擅长从视频、播客、课程中提炼结构化知识。

以下是B站视频的字幕文本（含时间戳），请进行专家级分析：

## 分析维度
1. **核心论点**：视频的中心思想是什么？支撑论据有哪些？
2. **知识结构**：内容可以归为哪几个知识模块？用思维导图式层级呈现
3. **关键洞察**：视频中提到的反常识观点、独特视角或深度认知
4. **可执行建议**：观众看完后可以立刻做什么？
5. **不足与补充**：视频未覆盖的角度，或可以进一步探讨的方向

## 输出要求
- 使用 Markdown 层级结构（## / ### / - ）
- 保留时间戳引用关键语句（如 "在 03:25 处提到…"）
- 分析深度优先，避免简单复述
- 如有数据或案例，单独标注

## 字幕内容
{{text}}`,

    promptRetell: `你是一位出色的内容转述者。请将以下B站视频字幕转化为一篇流畅的书面文章。

## 要求
1. **完整复述**：不遗漏任何重要信息，保持原文的事实准确性和逻辑顺序
2. **语言重构**：去除口语化冗余（"嗯""那个""就是说"等），将对话体转为书面体，但保留原意
3. **结构优化**：
   - 用自然段落组织内容，而非逐句翻译
   - 必要时添加小标题划分章节
   - 同类信息合并，避免碎片化
4. **时间戳处理**：原文中的 [MM:SS] 标记仅作参考，不要出现在最终输出中
5. **语气**：用演讲者本人的口吻，保持原有的情感基调和表达风格

## 输出格式
以文章形式输出，包含：
- 标题（根据内容提炼）
- 正文（段落 + 适当小标题）

## 字幕内容
{{text}}`
};
var cachedPrompts = null;
var loadSettingsPending = null; // 防止竞态：多次快速调用只触发一次 storage.get

function loadSettings(callback) {
    if (cachedApiKey !== null && cachedPrompts !== null) {
        callback(cachedApiKey, cachedEnableAsr, cachedPrompts.continue, cachedPrompts.expert, cachedPrompts.retell);
        return;
    }
    // 已有进行中的请求，排队等待
    if (loadSettingsPending) {
        loadSettingsPending.push(callback);
        return;
    }
    loadSettingsPending = [callback];
    chrome.storage.sync.get(['deepgramApiKey', 'promptContinue', 'promptExpert', 'promptRetell', 'fixedWindowRetell', 'fixedWindowQuick', 'fixedWindowExpert'], function(data) {
        if (chrome.runtime.lastError) {
            console.warn('[B站视频·DS] storage.sync.get error:', chrome.runtime.lastError.message);
        }
        cachedApiKey = data.deepgramApiKey || '';
        cachedEnableAsr = cachedApiKey.length > 0;
        cachedPrompts = {
            continue: data.promptContinue || DEFAULTS.promptContinue,
            expert: data.promptExpert || DEFAULTS.promptExpert,
            retell: data.promptRetell || DEFAULTS.promptRetell
        };
        cachedFixedWindow = {
            retell: data.fixedWindowRetell !== undefined ? data.fixedWindowRetell : true,
            quick: data.fixedWindowQuick !== undefined ? data.fixedWindowQuick : true,
            expert: data.fixedWindowExpert !== undefined ? data.fixedWindowExpert : false
        };
        updateAsrIndicator();
        var queue = loadSettingsPending;
        loadSettingsPending = null;
        queue.forEach(function(cb) {
            cb(cachedApiKey, cachedEnableAsr, cachedPrompts.continue, cachedPrompts.expert, cachedPrompts.retell);
        });
    });
}

// 监听 storage 变化（选项页修改后实时更新）
chrome.storage.onChanged.addListener(function(changes, area) {
    if (area === 'sync') {
        if (changes.deepgramApiKey) {
            cachedApiKey = changes.deepgramApiKey.newValue || '';
            cachedEnableAsr = cachedApiKey.length > 0;
            updateAsrIndicator();
        }
        if (changes.promptContinue) {
            if (!cachedPrompts) cachedPrompts = {};
            cachedPrompts.continue = changes.promptContinue.newValue || DEFAULTS.promptContinue;
        }
        if (changes.promptExpert) {
            if (!cachedPrompts) cachedPrompts = {};
            cachedPrompts.expert = changes.promptExpert.newValue || DEFAULTS.promptExpert;
        }
        if (changes.promptRetell) {
            if (!cachedPrompts) cachedPrompts = {};
            cachedPrompts.retell = changes.promptRetell.newValue || DEFAULTS.promptRetell;
        }
        if (changes.fixedWindowRetell) {
            cachedFixedWindow.retell = changes.fixedWindowRetell.newValue !== undefined ? changes.fixedWindowRetell.newValue : true;
        }
        if (changes.fixedWindowQuick) {
            cachedFixedWindow.quick = changes.fixedWindowQuick.newValue !== undefined ? changes.fixedWindowQuick.newValue : true;
        }
        if (changes.fixedWindowExpert) {
            cachedFixedWindow.expert = changes.fixedWindowExpert.newValue !== undefined ? changes.fixedWindowExpert.newValue : false;
        }
    }
});

// ─── ASR 状态指示器（设置按钮右上角绿钩）───
function updateAsrIndicator() {
    if (cachedEnableAsr) {
        asrBadge.classList.add('bili-sub-btn__asr-badge--on');
        asrBadge.title = '语音识别已配置 ✓';
    } else {
        asrBadge.classList.remove('bili-sub-btn__asr-badge--on');
        asrBadge.title = '语音识别未配置 — 点击齿轮设置 API Key';
    }
}
loadSettings(function() {});

// ─── 打开 DeepSeek ───
function openDeepSeek(mode, useFixedWindow) {
    var fw = useFixedWindow !== undefined ? useFixedWindow : true;
    if (fw) {
        var key = mode === 'retell' ? 'biliDSRetellUrl' : 'biliDSContinueUrl';
        chrome.storage.local.get([key], function(data) {
            var dsUrl = data[key] || 'https://chat.deepseek.com/';
            showBubble('正在打开 DeepSeek...', 0);
            chrome.runtime.sendMessage({ type: 'OPEN_OR_FOCUS_DS', url: dsUrl }, function(resp) {
                var msg = (resp && resp.existed) ? '已切换到 DeepSeek' : '已打开 DeepSeek';
                showBubble(msg, 1500);
            });
        });
    } else {
        showBubble('正在打开 DeepSeek（新对话）...', 0);
        chrome.runtime.sendMessage({ type: 'OPEN_OR_FOCUS_DS', url: 'https://chat.deepseek.com/' }, function(resp) {
            var msg = (resp && resp.existed) ? '已切换到 DeepSeek' : '已打开 DeepSeek';
            showBubble(msg, 1500);
        });
    }
}

function postWithApiKey(type) {
    loadSettings(function(apiKey, enableAsr, promptC, promptE, promptR) {
        window.postMessage({
            type: type,
            deepgramApiKey: apiKey,
            enableAsr: enableAsr,
            promptContinue: promptC,
            promptExpert: promptE,
            promptRetell: promptR
        }, '*');
    });
}

// ─── CJK 去空格 ───
function cleanCJKSpaces(text) {
    var prev;
    do {
        prev = text;
        text = text.replace(/([一-鿿㐀-䶿　-〿＀-￯])[\s　]+([一-鿿㐀-䶿　-〿＀-￯])/g, '$1$2');
    } while (text !== prev);
    return text.trim();
}

// ─── Message listener ───
window.addEventListener('message', function(e) {
    if (e.origin !== window.location.origin) return;
    if (!e.data) return;

    switch (e.data.type) {

        case 'BILIBILI_ASR_PROGRESS':
            showBubble(e.data.message, 0);
            if (e.data.percent !== undefined) {
                showProgress(e.data.percent, e.data.label || '');
            }
            break;

        case 'BILIBILI_ASR_REQUEST':
            var asrApiKey = e.data.apiKey;
            var asrSampleRate = e.data.sampleRate || 44100;
            var asrChannels = e.data.channels || 1;
            var asrAudioData = e.data.audioData;
            var asrMsgId = e.data.id;

            console.log('[B站视频·DS CT] 直接调用 Deepgram, audioData:', (asrAudioData ? (asrAudioData.byteLength / 1024 / 1024).toFixed(2) + 'MB' : 'NULL'), 'sampleRate:', asrSampleRate, 'channels:', asrChannels);

            showBubble('正在语音识别...', 0);
            showProgress(45, 'Deepgram 识别中...');

            // 直接从 content script 调 Deepgram，不经过 background SW
            // 避免 chrome.runtime.sendMessage 对大 ArrayBuffer 的 structured clone 截断
            (async function() {
                try {
                    var dgUrl = 'https://api.deepgram.com/v1/listen' +
                        '?model=nova-3' +
                        '&language=zh' +
                        '&encoding=linear16' +
                        '&sample_rate=' + asrSampleRate +
                        '&channels=' + asrChannels +
                        '&smart_format=true' +
                        '&punctuate=true' +
                        '&utterances=true';

                    var dgResp = await fetch(dgUrl, {
                        method: 'POST',
                        headers: { 'Authorization': 'Token ' + asrApiKey, 'Content-Type': 'application/octet-stream' },
                        body: asrAudioData
                    });

                    var dgText = await dgResp.text();
                    if (!dgResp.ok) {
                        window.postMessage({ type: 'BILIBILI_ASR_RESULT', id: asrMsgId, success: false, error: 'Deepgram HTTP ' + dgResp.status + ': ' + dgText.substring(0, 200) }, '*');
                        return;
                    }

                    var dgJson = JSON.parse(dgText);
                    var dgResults = dgJson.results;
                    if (!dgResults) { window.postMessage({ type: 'BILIBILI_ASR_RESULT', id: asrMsgId, success: false, error: 'Deepgram 无 results' }, '*'); return; }
                    var dgCh = dgResults.channels;
                    if (!dgCh || !dgCh.length) { window.postMessage({ type: 'BILIBILI_ASR_RESULT', id: asrMsgId, success: false, error: 'Deepgram channels 为空' }, '*'); return; }
                    var dgAlt = dgCh[0].alternatives && dgCh[0].alternatives[0];
                    if (!dgAlt) { window.postMessage({ type: 'BILIBILI_ASR_RESULT', id: asrMsgId, success: false, error: 'Deepgram alternatives 为空' }, '*'); return; }

                    var dgTranscript = dgAlt.transcript || '';
                    var dgUtterances = dgResults.utterances || [];
                    var dgConfidence = dgAlt.confidence;
                    var dgDetectedLang = (dgCh[0].detected_language) || 'N/A';
                    var dgDur = (dgJson.metadata && dgJson.metadata.duration) || 0;

                    console.log('[B站视频·DS CT] Deepgram 响应:', dgTranscript.length, '字, confidence:', dgConfidence, ', detected_lang:', dgDetectedLang, ', audio_dur:', dgDur + 's');

                    var lines = [];
                    if (dgUtterances.length > 0) {
                        dgUtterances.forEach(function(u) {
                            var t = cleanCJKSpaces(u.transcript || '');
                            if (t.length === 0) return;
                            var m = Math.floor((u.start || 0) / 60);
                            var s = Math.floor((u.start || 0) % 60);
                            lines.push('[' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + '] ' + t);
                        });
                    }
                    var txt = lines.length > 0 ? lines.join('\n') : cleanCJKSpaces(dgTranscript);
                    window.postMessage({ type: 'BILIBILI_ASR_RESULT', id: asrMsgId, success: true, text: txt }, '*');
                } catch (err) {
                    console.error('[B站视频·DS CT] Deepgram 调用失败:', err.message);
                    window.postMessage({ type: 'BILIBILI_ASR_RESULT', id: asrMsgId, success: false, error: err.message }, '*');
                }
            })();
            break;

        case 'BILIBILI_SUBTITLE_DONE':
            setLoading(false);
            hideProgress();
            if (e.data.success) {
                var txt = e.data.text || '';
                if (txt.length > 0) {
                    var copySuccess = false;
                    var copyFallback = function() {
                        if (copySuccess) return;
                        copySuccess = true;
                        var ta = document.createElement('textarea');
                        ta.value = txt;
                        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
                        document.body.appendChild(ta);
                        ta.select();
                        try {
                            var copied = document.execCommand('copy');
                            if (copied) showBubble('复制成功 ✓ (' + txt.split('\n').length + ' 行)', 2500);
                            else throw new Error('execCommand 失败');
                        } catch(e2) {
                            showBubble('复制失败: ' + e2.message, 3000);
                        }
                        ta.remove();
                    };
                    navigator.clipboard.writeText(txt).then(function() {
                        if (copySuccess) return;
                        copySuccess = true;
                        showBubble('复制成功 ✓ (' + txt.split('\n').length + ' 行)', 2500);
                    }).catch(function() {
                        copyFallback();
                    });
                } else {
                    showBubble('识别结果为空', 3000);
                }
            } else {
                var errMsg = e.data.error || '获取失败';
                if (errMsg.indexOf('无字幕') >= 0 && !cachedEnableAsr) {
                    showBubble('无字幕 — 点击 ⚙ 设置 API Key 启用语音识别', 4000);
                } else {
                    showBubble('获取失败: ' + errMsg, 3000);
                }
            }
            break;

        case 'BILIBILI_DS_CONTINUE_DONE':
            setLoading(false);
            hideProgress();
            if (e.data.success) {
                chrome.storage.local.set({
                    biliSubtitleText: e.data.text,
                    biliSubtitleTimestamp: Date.now(),
                    biliSubtitleMode: 'continue'
                });
                openDeepSeek('continue', cachedFixedWindow.quick);
            } else {
                var dsErr = e.data.error || '获取失败';
                if (dsErr.indexOf('无字幕') >= 0 && !cachedEnableAsr) {
                    showBubble('无字幕 — 点击 ⚙ 设置 API Key 启用语音识别', 4000);
                } else {
                    showBubble('获取失败: ' + dsErr, 3000);
                }
            }
            break;

        case 'BILIBILI_DS_RETELL_DONE':
            setLoading(false);
            hideProgress();
            if (e.data.success) {
                chrome.storage.local.set({
                    biliSubtitleText: e.data.text,
                    biliSubtitleTimestamp: Date.now(),
                    biliSubtitleMode: 'retell'
                });
                openDeepSeek('retell', cachedFixedWindow.retell);
            } else {
                var rErr = e.data.error || '获取失败';
                if (rErr.indexOf('无字幕') >= 0 && !cachedEnableAsr) {
                    showBubble('无字幕 — 点击 ⚙ 设置 API Key 启用语音识别', 4000);
                } else {
                    showBubble('获取失败: ' + rErr, 3000);
                }
            }
            break;

        case 'BILIBILI_DS_NEW_DONE':
            setLoading(false);
            hideProgress();
            if (e.data.success) {
                chrome.storage.local.set({
                    biliSubtitleText: e.data.text,
                    biliSubtitleTimestamp: Date.now(),
                    biliSubtitleMode: 'new'
                });
                openDeepSeek('expert', cachedFixedWindow.expert);
            } else {
                var newErr = e.data.error || '获取失败';
                if (newErr.indexOf('无字幕') >= 0 && !cachedEnableAsr) {
                    showBubble('无字幕 — 点击 ⚙ 设置 API Key 启用语音识别', 4000);
                } else {
                    showBubble('获取失败: ' + newErr, 3000);
                }
            }
            break;
    }
});

// ─── Button click handlers ───
btnCopy.addEventListener('click', function() {
    if (loading) return;
    setLoading(true);
    showBubble('获取中...', 0);
    postWithApiKey('BILIBILI_FETCH_SUBTITLE');
});

btnDSContinue.addEventListener('click', function() {
    if (loading) return;
    setLoading(true);
    showBubble('获取字幕中...', 0);
    postWithApiKey('BILIBILI_DS_CONTINUE');
});

btnDSExpert.addEventListener('click', function() {
    if (loading) return;
    setLoading(true);
    showBubble('获取字幕中...', 0);
    postWithApiKey('BILIBILI_DS_NEW');
});

btnDSRetell.addEventListener('click', function() {
    if (loading) return;
    setLoading(true);
    showBubble('获取字幕中...', 0);
    postWithApiKey('BILIBILI_DS_RETELL');
});

btnSettings.addEventListener('click', function() {
    if (loading) return;
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
});
