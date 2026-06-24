// ============================================================
// B站视频·DS — Background Service Worker
// 中继 Deepgram REST API（绕过 CORS）+ 设置页入口
// ============================================================

'use strict';

async function transcribeWithDeepgram(audioData, apiKey, sampleRate) {
    const url = 'https://api.deepgram.com/v1/listen' +
        '?model=nova-3' +
        '&language=zh' +
        '&encoding=linear16' +
        '&sample_rate=' + (sampleRate || 44100) +
        '&channels=1' +
        '&smart_format=true' +
        '&punctuate=true' +
        '&utterances=true';

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
        transcribeWithDeepgram(message.audioData, message.apiKey, message.sampleRate || 44100)
            .then(r => sendResponse(r))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
    if (message && message.type === 'OPEN_OR_FOCUS_DS') {
        var targetUrl = message.url || 'https://chat.deepseek.com/';
        chrome.tabs.query({ url: '*://chat.deepseek.com/*' }, function(tabs) {
            if (tabs.length > 0) {
                // 已有 DS 标签页，切过去
                var tab = tabs[0];
                chrome.tabs.update(tab.id, { url: targetUrl, active: true });
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
