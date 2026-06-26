// ============================================================
// B站视频·DS — Background Service Worker
// 中继 Deepgram REST API（绕过 CORS）+ 设置页入口
// ============================================================

'use strict';

async function transcribeWithDeepgram(audioData, apiKey, sampleRate, channels) {
    const url = 'https://api.deepgram.com/v1/listen' +
        '?model=nova-3' +
        '&language=zh' +
        '&encoding=linear16' +
        '&sample_rate=' + (sampleRate || 44100) +
        '&channels=' + (channels || 1) +
        '&smart_format=true' +
        '&punctuate=true' +
        '&utterances=true';

    console.log('[B站视频·DS BG] 请求(v2), sampleRate:', sampleRate, 'channels:', channels);

    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': 'Token ' + apiKey, 'Content-Type': 'application/octet-stream' },
        body: audioData
    });

    const respText = await resp.text();
    if (!resp.ok) throw new Error('Deepgram HTTP ' + resp.status + ': ' + respText.substring(0, 300));

    const json = JSON.parse(respText);
    const results = json.results;
    if (!results) throw new Error('Deepgram 无 results');
    const channelsArr = results.channels;
    if (!channelsArr || !channelsArr.length) throw new Error('Deepgram channels 为空');
    const alt = channelsArr[0].alternatives && channelsArr[0].alternatives[0];
    if (!alt) throw new Error('Deepgram alternatives 为空');

    const utterances = results.utterances || [];
    const fullTranscript = alt.transcript || '';
    const confidence = alt.confidence;
    const detectedLang = (channelsArr[0].detected_language) || 'N/A';

    console.log('[B站视频·DS BG] 识别结果:', fullTranscript.length, '字, utterances:', utterances.length, ', confidence:', confidence, ', detected_language:', detectedLang);

    return {
        success: true, utterances: utterances, fullTranscript: fullTranscript,
        _debug: { confidence: confidence, detected_language: detectedLang, duration: (json.metadata && json.metadata.duration) || 0 }
    };
}

/** 直接发送原始音频给 Deepgram，不指定 encoding/sample_rate，由 Deepgram 自动检测 */
async function transcribeRawWithDeepgram(audioData, apiKey, contentType) {
    const url = 'https://api.deepgram.com/v1/listen' +
        '?model=nova-3' +
        '&language=zh' +
        '&smart_format=true' +
        '&punctuate=true' +
        '&utterances=true';

    console.log('[B站视频·DS BG] 原始音频请求, size:', (audioData.byteLength / 1024 / 1024).toFixed(2) + 'MB, Content-Type:', contentType);

    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': 'Token ' + apiKey,
            'Content-Type': contentType || 'audio/mp4'
        },
        body: audioData
    });

    const respText = await resp.text();
    console.log('[B站视频·DS BG] Deepgram 响应状态:', resp.status, 'body前200字:', respText.substring(0, 200));
    if (!resp.ok) throw new Error('Deepgram HTTP ' + resp.status + ': ' + respText.substring(0, 300));

    const json = JSON.parse(respText);
    const results = json.results;
    if (!results) throw new Error('Deepgram 无 results');
    const channels = results.channels;
    if (!channels || !channels.length) throw new Error('Deepgram channels 为空');
    const alt = channels[0].alternatives && channels[0].alternatives[0];
    if (!alt) throw new Error('Deepgram alternatives 为空');

    const utterances = results.utterances || [];
    const fullTranscript = alt.transcript || '';

    return { success: true, utterances: utterances, fullTranscript: fullTranscript };
}

chrome.action.onClicked.addListener(() => { chrome.runtime.openOptionsPage(); });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'OPEN_OPTIONS') {
        chrome.runtime.openOptionsPage();
        return false;
    }
    if (message && message.type === 'TEST_DEEPGRAM_KEY') {
        fetch('https://api.deepgram.com/v1/projects', {
            headers: { 'Authorization': 'Token ' + message.apiKey, 'Content-Type': 'application/json' }
        }).then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            sendResponse({ success: true });
        }).catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
    if (message && message.type === 'TRANSCRIBE_AUDIO') {
        if (message.rawAudio) {
            console.log('[B站视频·DS BG] 收到原始音频请求, audioData:', (message.audioData ? (message.audioData.byteLength / 1024 / 1024).toFixed(2) + 'MB' : 'NULL'), 'contentType:', message.contentType);
            transcribeRawWithDeepgram(message.audioData, message.apiKey, message.contentType)
                .then(r => sendResponse(r))
                .catch(e => sendResponse({ success: false, error: e.message }));
        } else {
            console.log('[B站视频·DS BG] 收到 PCM 请求, audioData:', (message.audioData ? (message.audioData.byteLength / 1024 / 1024).toFixed(2) + 'MB' : 'NULL'), 'sampleRate:', message.sampleRate, 'channels:', message.channels);
            transcribeWithDeepgram(message.audioData, message.apiKey, message.sampleRate || 44100, message.channels || 1)
                .then(r => sendResponse(r))
                .catch(e => sendResponse({ success: false, error: e.message }));
        }
        return true;
    }
    if (message && message.type === 'OPEN_OR_FOCUS_DS') {
        var targetUrl = message.url || 'https://chat.deepseek.com/';
        chrome.tabs.query({ url: '*://chat.deepseek.com/*' }, function(tabs) {
            if (tabs.length > 0) {
                // 已有 DS 标签页
                var tab = tabs[0];
                // 如果当前 URL 与目标 URL 相同，chrome.tabs.update 不会触发页面重载，
                // 导致 deepseek.js 无法重新执行以读取新存储的字幕文本。
                // 此时显式 reload，确保内容脚本重新运行。
                if (tab.url === targetUrl || tab.url.replace(/\/$/, '') === targetUrl.replace(/\/$/, '')) {
                    chrome.tabs.reload(tab.id);
                } else {
                    chrome.tabs.update(tab.id, { url: targetUrl, active: true });
                }
                chrome.windows.update(tab.windowId, { focused: true });
                sendResponse({ existed: true });
            } else {
                // 没有则新建
                chrome.tabs.create({ url: targetUrl });
                sendResponse({ existed: false });
            }
        });
        return true;
    }
});
