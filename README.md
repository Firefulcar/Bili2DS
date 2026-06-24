# B站视频 · DS 问询总结助手

> 一键获取 B 站视频字幕（含语音识别后备），发送至 DeepSeek 网页版对话分析。**无需 DeepSeek API Key**。

[![Manifest](https://img.shields.io/badge/Manifest-V3-blue)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## 使用演示

![使用教程](teach.gif)

## 功能

B 站视频页右侧出现浮动按钮面板：

| 按钮 | 功能 |
|------|------|
| 🎀 复制字幕 | 获取字幕（或语音识别后备），一键复制到剪切板 |
| ⚙ 设置 | 配置 Deepgram API Key 和自定义提示词（右上角绿钩 = 语音识别已就绪） |
| DeepSeek 复述 | AI 完整复述视频内容，转写为流畅书面文章 |
| 快速模式 | 简洁中文列出核心要点，快速了解视频内容 |
| 专家模式问询 | 五维度深度分析，自动切换 DS 专家模式 |

**智能窗口管理：** DeepSeek 标签页已打开时自动切过去，不会反复开新标签。固定窗口模式下多个视频可复用同一对话上下文。

## 安装

### 使用前提

- **B 站网页端处于登录状态** — 扩展通过 B 站 API 获取字幕，需要登录 Cookie
- **DeepSeek 网页端处于登录态** — 扩展通过已登录的 DS 网页完成对话，无需 API Key

### Chrome / Edge

1. 下载或克隆本项目
   ```bash
   git clone https://github.com/Firefulcar1/bilibili-subtitle-copier.git
   ```
2. 打开 `chrome://extensions/`（Chrome）或 `edge://extensions/`（Edge）
3. 开启 **「开发者模式」**
4. 点击 **「加载解压缩的扩展」**，选择项目文件夹
5. 打开任意 [B 站视频页面](https://www.bilibili.com/video/)，右侧出现浮动按钮面板

### 配置 Deepgram（可选）

> ⚠️ **这是可选配置。** 绝大多数 B 站视频已有官方 AI 字幕，无需配置此项。只有当视频无字幕时才自动启用语音识别后备。

1. 点击齿轮图标进入设置页
2. 注册 [Deepgram](https://console.deepgram.com/signup)（新用户 $200 免费额度，约 400 小时音频）
3. 填入 API Key，保存后右上角出现绿色对勾即就绪

## 项目结构

```
├── manifest.json       # MV3 扩展配置
├── content.js          # B站视频页 UI + 消息中继 + 剪切板
├── page-script.js      # 页面注入脚本（字幕 API / 音频下载 / M4S 解码 / ASR）
├── background.js       # Service Worker（Deepgram REST API，绕 CORS）
├── deepseek.js         # DeepSeek 页面脚本（自动填入 + 发送）
├── options.html        # 设置页面
├── options.js          # 设置页逻辑
├── DSloli2.png         # 扩展图标
├── teach.gif           # 使用演示
└── LICENSE
```

### 数据流

```
B站页面 (content.js)
  ├─ 获取字幕 ──→ page-script.js ──→ B站 API
  │                └─ 字幕失败 ──→ 下载音频 → M4S解码 → Deepgram ASR
  ├─ 复制 ──→ clipboard API
  └─ 发送 DS ──→ storage.local ──→ 切到/打开 DeepSeek 标签页
                                         ↓
DeepSeek页面 (deepseek.js)
  └─ 读取 storage.local → 填入输入框 → 监听发送按钮 → 自动点击
```

## 性能优化

- **零拷贝音频传输：** ArrayBuffer transfer 替代 base64 编解码，内存峰值降低 50%
- **XPath 精准定位：** 专家模式用浏览器原生 XPath 引擎定位按钮，替代全页 DOM 遍历

## 隐私

- **所有数据仅保存在本地浏览器**（chrome.storage）
- 无后端服务器、无数据收集
- Deepgram API Key 仅用于语音识别请求，不传给第三方
- DeepSeek 对话通过你已登录的 DS 网页完成

## 许可

MIT License — 详见 [LICENSE](LICENSE)
