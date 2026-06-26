# Privacy Policy for Bili2DS

**Last updated: 2025-06-26**

Bili2DS is a browser extension that extracts subtitles from Bilibili videos and sends them to DeepSeek AI for summarization.

## Data Collection

**This extension does NOT collect, store, or transmit any personal data.**

- All user settings (Deepgram API Key, prompt preferences) are stored **locally in your browser** via `chrome.storage.sync` and never leave your device.
- Subtitle text and AI summaries are processed entirely within your local browser and are never sent to any third-party server other than the services you explicitly authorize.
- No analytics, no tracking, no telemetry, no advertising SDKs.

## Third-Party Services

The extension interfaces with the following services, **only when you explicitly initiate the action**:

| Service | Data Sent | Purpose |
|---------|-----------|---------|
| DeepSeek (chat.deepseek.com) | Subtitle text | AI summarization, using your own logged-in account |
| Deepgram API (api.deepgram.com) | Audio data | Speech-to-text for videos without subtitles (optional, requires your own API Key) |

All communication with these services is direct from your browser. No intermediary server is involved.

## Data Storage

- Settings are saved in your browser's local storage.
- Uninstalling the extension removes all stored data permanently.

## Contact

For questions about this privacy policy, please open an issue on GitHub: https://github.com/Firefulcar/Bili2DS/issues

## Changes

This privacy policy may be updated from time to time. The latest version will always be available at this URL.
