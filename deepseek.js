// ============================================================
// B站视频·DeepSeek总结 - DeepSeek 端脚本
// 注入 chat.deepseek.com，自动填入字幕并点击发送
// 支持：通用对话 / 新对话 / 一键删除
// ============================================================

(function() {
    'use strict';

    if (window.__biliDSAutoSendInjected) return;
    window.__biliDSAutoSendInjected = true;

    var TAG = '[B站视频·DeepSeek总结] ';
    var MAX_WAIT = 30;
    var OBSERVE_TIMEOUT_MS = MAX_WAIT * 500; // 统一超时
    function log(msg) { console.log(TAG + msg); }
    function warn(msg) { console.warn(TAG + msg); }

    /* ========== Storage ========== */

    var subtitleMode = null;

    function storageGet(keys) {
        return new Promise(function(resolve) {
            chrome.storage.local.get(keys, function(data) {
                if (chrome.runtime.lastError) { console.warn(TAG + 'storage.get error: ' + chrome.runtime.lastError.message); }
                resolve(chrome.runtime.lastError ? {} : data);
            });
        });
    }

    function storageSet(obj) {
        return new Promise(function(resolve) {
            chrome.storage.local.set(obj, function() {
                if (chrome.runtime.lastError) { console.warn(TAG + 'storage.set error: ' + chrome.runtime.lastError.message); }
                resolve();
            });
        });
    }

    function getText() {
        return storageGet(['biliSubtitleText', 'biliSubtitleTimestamp', 'biliSubtitleMode']).then(function(data) {
            if (!data.biliSubtitleText) return null;
            var age = Date.now() - (data.biliSubtitleTimestamp || 0);
            if (age > 15 * 60 * 1000) {
                chrome.storage.local.remove(['biliSubtitleText', 'biliSubtitleTimestamp', 'biliSubtitleMode']);
                return null;
            }
            subtitleMode = data.biliSubtitleMode || null;
            return data.biliSubtitleText || null;
        });
    }

    function clearText() {
        chrome.storage.local.remove(['biliSubtitleText', 'biliSubtitleTimestamp', 'biliSubtitleMode']);
    }

    /* ========== 对话 URL 追踪 ========== */

    function saveModeUrl(url) {
        if (!url) return;
        var key = subtitleMode === 'retell' ? 'biliDSRetellUrl' : 'biliDSContinueUrl';
        log('保存 ' + subtitleMode + ' URL: ' + url);
        storageSet({ [key]: url });
    }

    function captureConversationUrl() {
        // 固定窗口模式（continue / retell）保存 URL
        if (subtitleMode !== 'continue' && subtitleMode !== 'retell') return;

        var cur = location.href;
        if (cur.indexOf('/a/chat/s/') !== -1) {
            saveModeUrl(cur);
            return;
        }

        log('监听对话 URL 跳转...');
        pollForConversationUrl(function(url) { saveModeUrl(url); });
    }

    function pollForConversationUrl(cb) {
        var polls = 0;
        var maxPolls = 60; // 30 秒（每 500ms 一次）
        var interval = setInterval(function() {
            polls++;
            var href = location.href;
            if (href.indexOf('/a/chat/s/') !== -1) {
                clearInterval(interval);
                cb(href);
                return;
            }
            if (polls >= maxPolls) {
                clearInterval(interval);
                warn('未检测到对话 URL 跳转');
            }
        }, 500);

        window.addEventListener('beforeunload', function() {
            clearInterval(interval);
        }, { once: true });
    }

    /* ========== 核心：填入 + 发送 ========== */

    function waitForInput(cb) {
        var tries = 0;
        function check() {
            var el = document.querySelector('#chat-input') ||
                     document.querySelector('textarea') ||
                     document.querySelector('[role="textbox"]');
            if (el) { log('输入框就绪'); cb(el); return; }
            tries++;
            if (tries < MAX_WAIT) setTimeout(check, 500);
            else warn('输入框超时');
        }
        check();
    }

    function enableExpertMode() {
        // DeepSeek 顶部有三种模式：快速模式、专家模式、识图模式
        // 用 XPath 按文字定位，浏览器 C++ 原生引擎，不遍历 DOM
        var tries = 0;
        function tryClick() {
            var xpath = "//*[normalize-space(text())='专家模式']";
            var result = document.evaluate(
                xpath, document, null,
                XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
            );

            for (var i = 0; i < result.snapshotLength; i++) {
                var node = result.snapshotItem(i);
                // 往上层取可点击的容器
                var clickable = node.closest('button, [role="button"], [role="tab"], [role="radio"]');
                if (!clickable) clickable = node.parentElement;
                if (!clickable) continue;

                if (clickable.getAttribute('aria-selected') === 'true' ||
                    clickable.classList.contains('ds-button--active')) {
                    log('专家模式已选中');
                    return true;
                }

                log('找到专家模式开关，点击');
                clickable.click();
                return true;
            }
            return false;
        }

        if (tryClick()) return;

        tries++;
        if (tries < 10) {
            setTimeout(function retryFindExpert() {
                tries++;
                if (tries >= 10) { log('未找到专家模式开关，跳过'); return; }
                if (!tryClick()) {
                    setTimeout(retryFindExpert, 50);
                }
            }, 50);
        }
    }

    function fillAndSend(text) {
        waitForInput(function(input) {
            // 专家模式：切换到专家模式
            if (subtitleMode === 'new') {
                enableExpertMode();
            }

            log('开始填入 ' + text.length + ' 字...');
            input.focus();
            input.click();

            // 清空输入框
            var ns = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
            if (ns && ns.set) ns.set.call(input, '');
            else input.value = '';

            // execCommand('insertText') 为主，clipboard 为后备
            var inserted = false;
            try {
                document.execCommand('selectAll', false, null);
                inserted = document.execCommand('insertText', false, text);
            } catch(e) { /* fall through */ }

            if (inserted) {
                input.dispatchEvent(new Event('input', { bubbles: true }));
                log('文字已填入 (execCommand)，等待发送按钮启用...');
                observeAndClick(input);
            } else {
                // execCommand 失败，尝试 clipboard 路线
                log('execCommand 失败，尝试 clipboard...');
                navigator.clipboard.writeText(text).then(function() {
                    document.execCommand('paste');
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    log('文字已填入 (clipboard)，等待发送按钮启用...');
                    observeAndClick(input);
                }).catch(function() {
                    // 全部失败，手动设置 value
                    var nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
                    if (nativeSetter && nativeSetter.set) {
                        nativeSetter.set.call(input, text);
                    } else {
                        input.value = text;
                    }
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    log('文字已填入 (value setter)，等待发送按钮启用...');
                    observeAndClick(input);
                });
            }
        });
    }

    function observeAndClick(input) {
        var observer = null;
        var found = false;

        function cleanup() {
            if (observer) { observer.disconnect(); observer = null; }
        }
        // 页面离开时清理
        window.addEventListener('beforeunload', cleanup, { once: true });

        // 从 input 往上遍历找包含发送按钮的容器
        var container = input;
        while (container && container !== document.body) {
            container = container.parentElement;
            if (!container) break;

            var btns = container.querySelectorAll('div[role="button"]');
            if (btns.length >= 1 && btns.length <= 10) {
                log('找到输入容器，内含 ' + btns.length + ' 个按钮');

                var states = {};
                btns.forEach(function(btn, idx) {
                    states[idx] = {
                        el: btn,
                        disabled: btn.hasAttribute('disabled') ||
                                  btn.getAttribute('aria-disabled') === 'true' ||
                                  getComputedStyle(btn).pointerEvents === 'none'
                    };
                });

                observer = new MutationObserver(function() {
                    if (found) return;

                    // React 会替换 DOM 元素，每次回调重新查询按钮状态
                    var freshBtns = container.querySelectorAll('div[role="button"]');

                    freshBtns.forEach(function(btn, idx) {
                        if (found) return;
                        var nowDisabled = btn.hasAttribute('disabled') ||
                                          btn.getAttribute('aria-disabled') === 'true';
                        if (states[idx] && states[idx].disabled && !nowDisabled) {
                            log('按钮[' + idx + '] disabled→enabled，点击发送');
                            found = true;
                            cleanup();
                            setTimeout(function() {
                                btn.click();
                                clearText();
                                captureConversationUrl();
                            }, 300);
                        }
                        states[idx] = { el: btn, disabled: nowDisabled };
                    });

                    // 兜底：所有按钮都 enabled
                    if (!found) {
                        var allEnabled = true;
                        freshBtns.forEach(function(b) {
                            if (b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true') allEnabled = false;
                        });
                        if (allEnabled) {
                            log('所有按钮 enabled，点击最后一个');
                            found = true;
                            cleanup();
                            setTimeout(function() {
                                freshBtns[freshBtns.length - 1].click();
                                clearText();
                                captureConversationUrl();
                            }, 300);
                        }
                    }
                });

                observer.observe(container, {
                    attributes: true,
                    attributeFilter: ['disabled', 'aria-disabled', 'class'],
                    subtree: true
                });

                setTimeout(function() {
                    if (!found) { cleanup(); log('监听超时，请手动发送'); clearText(); }
                }, OBSERVE_TIMEOUT_MS);

                return;
            }
        }

        log('未找到按钮容器，请手动发送');
        clearText();
    }

    // ─── 入口 ───
    log('脚本启动，URL: ' + location.href);

    // 检测失效对话页面，自动跳到首页新建对话
    var bodyText = (document.body.textContent || '').trim();
    if (bodyText.indexOf('该对话不存在') !== -1 || bodyText.indexOf('对话不存在') !== -1) {
        if (!sessionStorage.getItem('_bili_ds_retry')) {
            log('检测到失效对话，跳转到 DeepSeek 首页...');
            sessionStorage.setItem('_bili_ds_retry', '1');
            location.replace('https://chat.deepseek.com/');
            return;
        } else {
            sessionStorage.removeItem('_bili_ds_retry');
            log('已重试过，不再跳转');
        }
    }

    getText().then(function(text) {
        if (text) {
            log('检测到字幕数据 (' + text.length + ' 字)，稍等页面渲染...');
            setTimeout(function() { fillAndSend(text); }, 1500);
        } else {
            log('无待发送数据，正常退出');
        }
    });
})();
