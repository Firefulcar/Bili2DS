// ============================================================
// B站视频·DS问询总结助手 — 设置页脚本
// ============================================================

'use strict';

const DEFAULTS = {
    promptContinue: '你是一位资深视频内容分析师。以下是B站视频的字幕文本，格式为"[MM:SS] 字幕内容"，请你完成分析。\n\n**重要**：这是一段新视频的字幕，请完全忽略之前对话中的所有内容。\n\n## 任务\n1. 快速梳理视频的核心话题和逻辑脉络\n2. 提取 3-8 个关键要点，按重要性排序\n3. 用简洁中文输出，每个要点控制在 30 字以内\n\n## 输出格式\n### 视频主旨\n（一句话概括）\n\n### 核心要点\n- 要点一\n- 要点二\n- …\n\n### 一句话总结\n（视频最想传达的一件事）\n\n## 字幕内容\n{{text}}',
    promptExpert: '你是一位深度内容分析专家，擅长从视频、播客、课程中提炼结构化知识。\n\n以下是B站视频的字幕文本（含时间戳），请进行专家级分析：\n\n## 分析维度\n1. **核心论点**：视频的中心思想是什么？支撑论据有哪些？\n2. **知识结构**：内容可以归为哪几个知识模块？用思维导图式层级呈现\n3. **关键洞察**：视频中提到的反常识观点、独特视角或深度认知\n4. **可执行建议**：观众看完后可以立刻做什么？\n5. **不足与补充**：视频未覆盖的角度，或可以进一步探讨的方向\n\n## 输出要求\n- 使用 Markdown 层级结构（## / ### / - ）\n- 保留时间戳引用关键语句（如 "在 03:25 处提到…"）\n- 分析深度优先，避免简单复述\n- 如有数据或案例，单独标注\n\n## 字幕内容\n{{text}}',
    promptRetell: '你是一位出色的内容转述者。请将以下B站视频字幕转化为一篇流畅的书面文章。\n\n## 要求\n1. **完整复述**：不遗漏任何重要信息，保持原文的事实准确性和逻辑顺序\n2. **语言重构**：去除口语化冗余（"嗯""那个""就是说"等），将对话体转为书面体，但保留原意\n3. **结构优化**：\n   - 用自然段落组织内容，而非逐句翻译\n   - 必要时添加小标题划分章节\n   - 同类信息合并，避免碎片化\n4. **时间戳处理**：原文中的 [MM:SS] 标记仅作参考，不要出现在最终输出中\n5. **语气**：用演讲者本人的口吻，保持原有的情感基调和表达风格\n\n## 输出格式\n以文章形式输出，包含：\n- 标题（根据内容提炼）\n- 正文（段落 + 适当小标题）\n\n## 字幕内容\n{{text}}'
};

const STORAGE_KEY = 'deepgramApiKey';
const STORAGE_PC = 'promptContinue';
const STORAGE_PE = 'promptExpert';
const STORAGE_PR = 'promptRetell';
const STORAGE_FW_R = 'fixedWindowRetell';
const STORAGE_FW_C = 'fixedWindowQuick';
const STORAGE_FW_E = 'fixedWindowExpert';

// DOM refs
const $ = id => document.getElementById(id);
const apiKeyInput = $('api-key');
const btnToggle = $('btn-toggle');
const btnSaveKey = $('btn-save-key');
const btnTestKey = $('btn-test-key');
const btnClearKey = $('btn-clear-key');
const statusKey = $('status-key');
const promptContinue = $('prompt-continue');
const promptExpert = $('prompt-expert');
const btnSaveC = $('btn-save-continue');
const btnResetC = $('btn-reset-continue');
const btnSaveE = $('btn-save-expert');
const btnResetE = $('btn-reset-expert');
const promptRetell = $('prompt-retell');
const btnSaveR = $('btn-save-retell');
const btnResetR = $('btn-reset-retell');
const toggleRetell = $('toggle-retell');
const toggleContinue = $('toggle-continue');
const toggleExpert = $('toggle-expert');
const statusC = $('status-continue');
const statusE = $('status-expert');
const statusR = $('status-retell');
const statusDot = $('status-dot');
const statusText = $('status-text');

// ─── Helpers ───
function show(el, msg, type) {
    el.textContent = msg;
    el.className = 'status-msg status-msg--show status-msg--' + (type || 'ok');
    setTimeout(() => { el.className = 'status-msg'; }, 3000);
}
function updateStatusDot(hasKey) {
    if (hasKey) {
        statusDot.className = 'status-dot status-dot--on';
        statusText.textContent = 'API Key 已配置 — 语音识别可用';
    } else {
        statusDot.className = 'status-dot';
        statusText.textContent = '未配置 API Key — 无法使用语音识别';
    }
}

// ─── Load ───
chrome.storage.sync.get([STORAGE_KEY, STORAGE_PC, STORAGE_PE, STORAGE_PR, STORAGE_FW_R, STORAGE_FW_C, STORAGE_FW_E], data => {
    if (chrome.runtime.lastError) {
        console.warn('[B站·DS 设置] 加载失败:', chrome.runtime.lastError.message);
    }
    if (data[STORAGE_KEY]) apiKeyInput.value = data[STORAGE_KEY];
    promptContinue.value = data[STORAGE_PC] || DEFAULTS.promptContinue;
    promptExpert.value = data[STORAGE_PE] || DEFAULTS.promptExpert;
    promptRetell.value = data[STORAGE_PR] || DEFAULTS.promptRetell;
    // 固定窗口：复述/快速默认开，专家默认关
    toggleRetell.checked = data[STORAGE_FW_R] !== undefined ? data[STORAGE_FW_R] : true;
    toggleContinue.checked = data[STORAGE_FW_C] !== undefined ? data[STORAGE_FW_C] : true;
    toggleExpert.checked = data[STORAGE_FW_E] !== undefined ? data[STORAGE_FW_E] : false;
    updateStatusDot(!!data[STORAGE_KEY]);
});

// ─── Toggle fixed window ───
function saveToggle(key, el) {
    chrome.storage.sync.set({ [key]: el.checked }, () => {
        if (chrome.runtime.lastError) console.warn('[B站·DS 设置] toggle保存失败:', chrome.runtime.lastError.message);
    });
}
toggleRetell.addEventListener('change', () => saveToggle(STORAGE_FW_R, toggleRetell));
toggleContinue.addEventListener('change', () => saveToggle(STORAGE_FW_C, toggleContinue));
toggleExpert.addEventListener('change', () => saveToggle(STORAGE_FW_E, toggleExpert));

// ─── Toggle visibility ───
btnToggle.addEventListener('click', () => {
    const show = apiKeyInput.type === 'password';
    apiKeyInput.type = show ? 'text' : 'password';
    btnToggle.innerHTML = show
        ? '<span style="position:relative;display:inline-block;">👁<span style="position:absolute;top:48%;left:-5%;width:115%;height:2px;background:#999;transform:rotate(-45deg);border-radius:1px;"></span></span>'
        : '👁';
    btnToggle.title = show ? '隐藏' : '显示';
});

// ─── API Key ───
btnSaveKey.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) return show(statusKey, '请输入 API Key', 'err');
    chrome.storage.sync.set({ [STORAGE_KEY]: key }, () => {
        if (chrome.runtime.lastError) { show(statusKey, '保存失败: ' + chrome.runtime.lastError.message, 'err'); return; }
        show(statusKey, '已保存', 'ok');
        updateStatusDot(true);
    });
});
btnClearKey.addEventListener('click', () => {
    chrome.storage.sync.remove(STORAGE_KEY, () => {
        if (chrome.runtime.lastError) { show(statusKey, '清除失败: ' + chrome.runtime.lastError.message, 'err'); return; }
        apiKeyInput.value = '';
        show(statusKey, '已清除', 'err');
        updateStatusDot(false);
    });
});
btnTestKey.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) return show(statusKey, '请先输入 API Key', 'err');
    show(statusKey, '测试中...', 'ok');
    btnTestKey.disabled = true;
    chrome.runtime.sendMessage({ type: 'TEST_DEEPGRAM_KEY', apiKey: key }, resp => {
        btnTestKey.disabled = false;
        if (chrome.runtime.lastError) return show(statusKey, '通信失败', 'err');
        if (resp && resp.success) {
            show(statusKey, '连接成功', 'ok');
            chrome.storage.sync.set({ [STORAGE_KEY]: key }, () => {
                if (chrome.runtime.lastError) console.warn('[B站·DS 设置] 自动保存失败:', chrome.runtime.lastError.message);
            });
            updateStatusDot(true);
        } else {
            show(statusKey, '失败: ' + ((resp && resp.error) || '未知'), 'err');
        }
    });
});

// ─── Prompts ───
btnSaveC.addEventListener('click', () => {
    const val = promptContinue.value.trim();
    if (!val) return show(statusC, '不能为空', 'err');
    chrome.storage.sync.set({ [STORAGE_PC]: val }, () => {
        if (chrome.runtime.lastError) { show(statusC, '保存失败: ' + chrome.runtime.lastError.message, 'err'); return; }
        show(statusC, '已保存', 'ok');
    });
});
btnResetC.addEventListener('click', () => {
    promptContinue.value = DEFAULTS.promptContinue;
    chrome.storage.sync.set({ [STORAGE_PC]: DEFAULTS.promptContinue }, () => {
        if (chrome.runtime.lastError) { show(statusC, '恢复失败: ' + chrome.runtime.lastError.message, 'err'); return; }
        show(statusC, '已恢复默认', 'ok');
    });
});
btnSaveE.addEventListener('click', () => {
    const val = promptExpert.value.trim();
    if (!val) return show(statusE, '不能为空', 'err');
    chrome.storage.sync.set({ [STORAGE_PE]: val }, () => {
        if (chrome.runtime.lastError) { show(statusE, '保存失败: ' + chrome.runtime.lastError.message, 'err'); return; }
        show(statusE, '已保存', 'ok');
    });
});
btnResetE.addEventListener('click', () => {
    promptExpert.value = DEFAULTS.promptExpert;
    chrome.storage.sync.set({ [STORAGE_PE]: DEFAULTS.promptExpert }, () => {
        if (chrome.runtime.lastError) { show(statusE, '恢复失败: ' + chrome.runtime.lastError.message, 'err'); return; }
        show(statusE, '已恢复默认', 'ok');
    });
});

btnSaveR.addEventListener('click', () => {
    const val = promptRetell.value.trim();
    if (!val) return show(statusR, '不能为空', 'err');
    chrome.storage.sync.set({ [STORAGE_PR]: val }, () => {
        if (chrome.runtime.lastError) { show(statusR, '保存失败: ' + chrome.runtime.lastError.message, 'err'); return; }
        show(statusR, '已保存', 'ok');
    });
});
btnResetR.addEventListener('click', () => {
    promptRetell.value = DEFAULTS.promptRetell;
    chrome.storage.sync.set({ [STORAGE_PR]: DEFAULTS.promptRetell }, () => {
        if (chrome.runtime.lastError) { show(statusR, '恢复失败: ' + chrome.runtime.lastError.message, 'err'); return; }
        show(statusR, '已恢复默认', 'ok');
    });
});

// ── Sidebar navigation ──
(function() {
    var navItems = document.querySelectorAll('.nav-item');
    var sections = document.querySelectorAll('.js-section');
    if (!navItems.length || !sections.length) return;

    navItems.forEach(function(item) {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            var target = this.getAttribute('data-section');
            if (!target) return;
            navItems.forEach(function(n) { n.classList.remove('nav-item--active'); });
            this.classList.add('nav-item--active');
            sections.forEach(function(s) { s.classList.remove('js-section--active'); });
            var el = document.getElementById('section-' + target);
            if (el) el.classList.add('js-section--active');
        });
    });
})();
