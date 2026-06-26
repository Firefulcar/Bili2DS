// ============================================================
// B站视频·DeepSeek总结 - 页面脚本 (page context)
// 负责 B站 API + 音频下载 + M4S→PCM 解码 + ASR 请求
// ============================================================

(function() {
    'use strict';

    if (window.__biliSubCopierInjected) return;
    window.__biliSubCopierInjected = true;

    var FETCH_TIMEOUT = 15000;
    var ASR_RESPONSE_TIMEOUT = 180000; // 3 分钟

    /* ========== Helpers ========== */

    function fetchWithTimeout(url, opts) {
        opts = opts || {};
        var controller = new AbortController();
        var timer = setTimeout(function() { controller.abort(); }, FETCH_TIMEOUT);
        return fetch(url, Object.assign({}, opts, { signal: controller.signal }))
            .then(function(r) { clearTimeout(timer); return r; })
            .catch(function(e) { clearTimeout(timer); throw e; });
    }

    function getVideoInfo() {
        try {
            var s = window.__INITIAL_STATE__;
            if (!s || !s.videoData) return null;
            return { aid: s.videoData.aid, cid: s.videoData.cid, bvid: s.videoData.bvid };
        } catch(e) { return null; }
    }

    function formatTime(sec) {
        var n = Number(sec);
        if (isNaN(n) || n < 0) return '00:00';
        var m = Math.floor(n / 60), s = Math.floor(n % 60);
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    function reportProgress(stage, message, percent, label) {
        window.postMessage({ type: 'BILIBILI_ASR_PROGRESS', stage: stage, message: message, percent: percent, label: label }, '*');
    }

    /* ========== Subtitle API ========== */

    async function fetchSubtitles() {
        var info = getVideoInfo();
        if (!info) throw new Error('无法获取视频信息');

        var url = 'https://api.bilibili.com/x/player/wbi/v2?aid=' + info.aid + '&cid=' + info.cid;
        var resp = await fetchWithTimeout(url, { credentials: 'include' });
        var json = await resp.json();
        if (json.code !== 0) throw new Error('API code=' + json.code);

        var sub = json.data && json.data.subtitle;
        if (!sub) throw new Error('该视频无字幕数据');

        var list = sub.subtitles;
        if (!list || list.length === 0) throw new Error('该视频无可用字幕');

        var picked = null;
        var pri = ['zh-CN', 'zh-Hans', 'zh-Hant', 'zh', 'ai-zh'];
        for (var p = 0; p < pri.length && !picked; p++) {
            for (var i = 0; i < list.length; i++) {
                if (list[i].lan === pri[p]) { picked = list[i]; break; }
            }
        }
        if (!picked) picked = list[0];
        if (!picked || !picked.subtitle_url) throw new Error('字幕 URL 为空');

        var subUrl = picked.subtitle_url;
        if (subUrl.startsWith('//')) subUrl = 'https:' + subUrl;

        var subResp = await fetchWithTimeout(subUrl);
        var subJson = await subResp.json();
        var body = subJson.body || [];
        if (body.length === 0) throw new Error('字幕内容为空');

        var lines = [];
        body.forEach(function(item) {
            lines.push('[' + formatTime(item.from) + '] ' + (item.content || ''));
        });
        return { text: lines.join('\n'), source: 'subtitle' };
    }

    /* ========== Audio ========== */

    function getAudioInfo() {
        try {
            var p = window.__playinfo__;
            if (!p || !p.data || !p.data.dash) return null;
            var a = p.data.dash.audio;
            if (!a || a.length === 0) return null;
            // 优先选 mp4a codec（兼容性最好），其次按带宽
            var best = null;
            for (var i = 0; i < a.length; i++) {
                var codecs = (a[i].codecs || '').toLowerCase();
                if (codecs.indexOf('mp4a') !== -1) { best = a[i]; break; }
            }
            if (!best) {
                best = a[0];
                for (var i = 1; i < a.length; i++) { if (a[i].bandwidth > best.bandwidth) best = a[i]; }
            }
            return { url: best.baseUrl, backupUrls: best.backupUrl || [], bandwidth: best.bandwidth, codecs: best.codecs };
        } catch(e) { return null; }
    }

    /* ========== M4S/AAC → PCM 解码 ========== */

    async function decodeToPCM(audioBuffer) {
        var ctx = null;
        var offlineCtx = null;
        try {
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) throw new Error('AudioContext API 不可用，请使用支持的浏览器');
            ctx = new AudioCtx();
            var audioData = await ctx.decodeAudioData(audioBuffer.slice(0));
            var duration = audioData.duration;
            var srcSampleRate = audioData.sampleRate;
            var srcChannels = audioData.numberOfChannels;
            var targetSampleRate = 16000;

            console.log('[B站视频·DS] 解码:', duration.toFixed(1) + 's,', srcSampleRate + 'Hz,', srcChannels + 'ch');

            if (duration < 0.5) throw new Error('音频时长过短（' + duration.toFixed(1) + 's），可能下载失败');

            // 重采样到 16kHz mono
            var outLength = Math.ceil(duration * targetSampleRate);
            offlineCtx = new OfflineAudioContext(1, outLength, targetSampleRate);
            var source = offlineCtx.createBufferSource();
            source.buffer = audioData;
            source.connect(offlineCtx.destination);
            source.start(0);

            var rendered = await offlineCtx.startRendering();
            var floatData = rendered.getChannelData(0);

            var peak = 0;
            var int16 = new Int16Array(floatData.length);
            for (var i = 0; i < floatData.length; i++) {
                var v = floatData[i];
                var s = v < -1 ? -1 : v > 1 ? 1 : v;
                int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                var abs = s < 0 ? -s : s;
                if (abs > peak) peak = abs;
            }
            console.log('[B站视频·DS] 峰值:', peak.toFixed(4), '重采样: ' + targetSampleRate + 'Hz mono');
            if (peak < 0.001) throw new Error('音频解码后为静音');

            console.log('[B站视频·DS] PCM:', (int16.length * 2 / 1024 / 1024).toFixed(2), 'MB,', targetSampleRate + 'Hz');
            return { buffer: int16.buffer, sampleRate: targetSampleRate, channels: 1, duration: duration };
        } finally {
            if (offlineCtx) { offlineCtx = null; }
            if (ctx) { ctx.close().catch(function() {}); }
        }
    }

    /* ========== ASR Pipeline (REST) ========== */

    function transcribeViaBackground(pcmBuffer, apiKey, sampleRate, channels) {
        return new Promise(function(resolve, reject) {
            var id = 'asr_' + Date.now();
            var resolved = false;

            var timeout = setTimeout(function() {
                if (!resolved) { resolved = true; window.removeEventListener('message', onResp); reject(new Error('语音识别超时')); }
            }, ASR_RESPONSE_TIMEOUT);

            function onResp(e) {
                if (e.origin !== window.location.origin || !e.data) return;
                if (e.data.type !== 'BILIBILI_ASR_RESULT' || e.data.id !== id) return;
                if (resolved) return;
                resolved = true;
                clearTimeout(timeout);
                window.removeEventListener('message', onResp);
                if (e.data.success) resolve({ text: e.data.text, source: 'asr' });
                else reject(new Error(e.data.error || '识别失败'));
            }
            window.addEventListener('message', onResp);

            // slice(0) 显式拷贝，避免跨世界 transfer 导致 ArrayBuffer 损坏
            var copy = pcmBuffer.slice(0);
            var sizeMB = (copy.byteLength / 1024 / 1024).toFixed(2);
            console.log('[B站视频·DS] PCM:', sizeMB, 'MB,', sampleRate + 'Hz,', (channels || 1) + 'ch');

            window.postMessage({
                type: 'BILIBILI_ASR_REQUEST', id: id,
                audioData: copy, apiKey: apiKey,
                sampleRate: sampleRate,
                channels: channels || 1
            }, '*'); // 不用 transfer，用 structured clone 拷贝
        });
    }

    async function transcribeAudio(apiKey) {
        var info = getAudioInfo();
        if (!info || !info.url) throw new Error('无法获取音频流');

        reportProgress('downloading', '正在下载音频...', 5, '下载中');
        var resp = null;
        var urls = [info.url].concat(info.backupUrls || []);
        var lastErr;

        for (var i = 0; i < urls.length; i++) {
            try {
                resp = await fetchWithTimeout(urls[i], {
                    credentials: 'include',
                    headers: { 'Referer': window.location.href }
                });
                if (resp.ok) break;
                lastErr = new Error('HTTP ' + resp.status);
            } catch(e) { lastErr = e; }
        }
        if (!resp || !resp.ok) throw new Error('下载失败: ' + (lastErr ? lastErr.message : 'unknown'));

        var raw = await resp.arrayBuffer();
        console.log('[B站视频·DS] 下载:', (raw.byteLength / 1024 / 1024).toFixed(2), 'MB');

        reportProgress('decoding', '正在解码音频...', 30, '解码中');
        var pcm = await decodeToPCM(raw);

        reportProgress('encoding', '正在发送 (' + (pcm.buffer.byteLength / 1024 / 1024).toFixed(1) + ' MB)...', 40, '编码中');
        reportProgress('transcribing', '正在语音识别 (' + pcm.duration.toFixed(0) + 's)...', 45, 'Deepgram 识别中');
        return await transcribeViaBackground(pcm.buffer, apiKey, pcm.sampleRate, pcm.channels);
    }

    /* ========== Core handler ========== */

    /** 检查字幕/ASR 文本是否有效（非空、非纯时间戳/空白） */
    function isTextEmpty(text) {
        if (!text || typeof text !== 'string') return true;
        var stripped = text.replace(/\[\d{2}:\d{2}\]/g, '').replace(/[\s\r\n]+/g, '').trim();
        return stripped.length === 0;
    }

    async function handleRequest(onSuccess, enableAsr, apiKey, doneType) {
        try {
            var result = await fetchSubtitles();
            if (isTextEmpty(result.text)) throw new Error('字幕内容为空');
            onSuccess(result.text);
        } catch (subErr) {
            console.log('[B站视频·DS] 字幕失败:', subErr.message);
            if (!enableAsr) {
                window.postMessage({ type: doneType, success: false, error: subErr.message }, '*');
                return;
            }
            try {
                var asr = await transcribeAudio(apiKey);
                if (isTextEmpty(asr.text)) {
                    window.postMessage({ type: doneType, success: false, error: '语音识别结果为空，该视频可能无语音或音频异常' }, '*');
                    return;
                }
                onSuccess(asr.text);
            } catch (asrErr) {
                console.error('[B站视频·DS] ASR 失败:', asrErr.message);
                window.postMessage({ type: doneType, success: false, error: 'ASR: ' + asrErr.message }, '*');
            }
        }
    }

    /* ========== Message listener ========== */

    window.addEventListener('message', function(e) {
        if (e.origin !== window.location.origin) return;
        if (!e.data) return;

        var apiKey = e.data.deepgramApiKey || '';
        var enableAsr = e.data.enableAsr === true && apiKey.length > 0;
        var pc = e.data.promptContinue || '';
        var pe = e.data.promptExpert || '';
        var pr = e.data.promptRetell || '';

        switch (e.data.type) {
            case 'BILIBILI_FETCH_SUBTITLE':
                handleRequest(function(t) {
                    window.postMessage({ type: 'BILIBILI_SUBTITLE_DONE', success: true, text: t }, '*');
                }, enableAsr, apiKey, 'BILIBILI_SUBTITLE_DONE');
                break;
            case 'BILIBILI_DS_CONTINUE':
                handleRequest(function(t) {
                    var p = pc ? pc.replace('{{text}}', t) : t;
                    window.postMessage({ type: 'BILIBILI_DS_CONTINUE_DONE', success: true, text: p }, '*');
                }, enableAsr, apiKey, 'BILIBILI_DS_CONTINUE_DONE');
                break;
            case 'BILIBILI_DS_RETELL':
                handleRequest(function(t) {
                    var p = pr ? pr.replace('{{text}}', t) : t;
                    window.postMessage({ type: 'BILIBILI_DS_RETELL_DONE', success: true, text: p }, '*');
                }, enableAsr, apiKey, 'BILIBILI_DS_RETELL_DONE');
                break;
            case 'BILIBILI_DS_NEW':
                handleRequest(function(t) {
                    var p = pe ? pe.replace('{{text}}', t) : t;
                    window.postMessage({ type: 'BILIBILI_DS_NEW_DONE', success: true, text: p }, '*');
                }, enableAsr, apiKey, 'BILIBILI_DS_NEW_DONE');
                break;
        }
    });

    console.log('[B站视频·DS] 页面脚本就绪 (PCM 模式)');

    /** 调试用：保存当前视频的音频为 WAV 文件。
     *  在浏览器控制台执行: __biliDumpAudio()
     *  浏览器会下载一个 .wav 文件，用于后续本地调试 Deepgram 参数。 */
    window.__biliDumpAudio = async function() {
        console.log('[Dump] 开始获取音频...');
        var info = getAudioInfo();
        if (!info || !info.url) { console.error('[Dump] 无法获取音频流'); return; }
        console.log('[Dump] 音频 URL:', info.url.substring(0, 80) + '...');

        var resp = await fetch(info.url, { credentials: 'include', headers: { 'Referer': window.location.href } });
        if (!resp.ok) { console.error('[Dump] 下载失败 HTTP', resp.status); return; }
        var raw = await resp.arrayBuffer();
        console.log('[Dump] 下载:', (raw.byteLength / 1024 / 1024).toFixed(2), 'MB');

        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var audioData = await ctx.decodeAudioData(raw.slice(0));
        var channels = audioData.numberOfChannels;
        var sampleRate = audioData.sampleRate;
        var duration = audioData.duration;
        console.log('[Dump] 解码:', duration.toFixed(1) + 's,', sampleRate + 'Hz,', channels + 'ch');

        // 合并所有声道为交错 PCM
        var chanData = [];
        var samplesPerChan = audioData.length;
        for (var ch = 0; ch < channels; ch++) {
            var f = audioData.getChannelData(ch);
            var i16 = new Int16Array(samplesPerChan);
            for (var i = 0; i < samplesPerChan; i++) {
                var s = f[i]; if (s < -1) s = -1; else if (s > 1) s = 1;
                i16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            chanData.push(i16);
        }
        var totalSamples = samplesPerChan * channels;
        var pcm = new Int16Array(totalSamples);
        var off = 0;
        for (var i = 0; i < samplesPerChan; i++) {
            for (var ch = 0; ch < channels; ch++) {
                pcm[off++] = chanData[ch][i];
            }
        }

        // 写 WAV 头 + PCM 数据
        var dataSize = pcm.length * 2;
        var wav = new ArrayBuffer(44 + dataSize);
        var v = new DataView(wav);
        function wStr(off, s) { for (var i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); }
        wStr(0, 'RIFF');
        v.setUint32(4, 36 + dataSize, true);
        wStr(8, 'WAVE');
        wStr(12, 'fmt ');
        v.setUint32(16, 16, true);        // fmt chunk size
        v.setUint16(20, 1, true);         // PCM
        v.setUint16(22, channels, true);
        v.setUint32(24, sampleRate, true);
        v.setUint32(28, sampleRate * channels * 2, true);
        v.setUint16(32, channels * 2, true);
        v.setUint16(34, 16, true);
        wStr(36, 'data');
        v.setUint32(40, dataSize, true);
        new Uint8Array(wav, 44, dataSize).set(new Uint8Array(pcm.buffer));

        var blob = new Blob([wav], { type: 'audio/wav' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'bilibili_audio_' + sampleRate + 'Hz_' + channels + 'ch.wav';
        a.click();
        URL.revokeObjectURL(url);
        ctx.close();
        console.log('[Dump] 已触发下载: ' + a.download + ' (' + (wav.byteLength / 1024 / 1024).toFixed(2) + ' MB)');
        console.log('[Dump] 下一步: 用这个 WAV 文件搭配 test_deepgram.html 调试 Deepgram 参数');
    };
})();
