# Capture Studio: Recorder & Screenshots

> A modern, privacy-focused Chrome Extension (Manifest V3) for high-quality screen recording, tab capture, audio mixing, and full-page scrolling screenshots.

---

## 🌟 Key Features

- **🎥 Flexible Screen & Tab Recording**
  - Record active browser tabs, specific application windows, or full displays.
  - Native display selection via Chrome's media picker interface.

- **🎙️ Dual Audio Recording**
  - Capture system/tab audio (when available from OS/browser).
  - Mix optional microphone audio seamlessly alongside capture track.

- **📸 Full Page & Viewport Screenshots**
  - Capture exact visible viewport in one click.
  - Automatically scroll and stitch entire tall pages into high-resolution PNG screenshots.

- **🎞️ Built-in Local Gallery & Preview**
  - Instant playback and high-res image viewing inside a dedicated preview studio.
  - Download, rename, copy, or delete recordings and screenshots.

- **🔒 100% Private & On-Device Storage**
  - Local storage powered by IndexedDB.
  - Zero external servers, no tracking, no analytics, and no remote data uploads.

---

## 🚀 Installation Guide (Load Unpacked)

1. **Clone or Download Repository**:
   ```bash
   git clone git@github.com:warlette/screen-recorder.git
   ```
2. **Open Chrome Extensions Manager**:
   Navigate to `chrome://extensions` in your Google Chrome browser.
3. **Enable Developer Mode**:
   Toggle the **Developer Mode** switch in the top right corner.
4. **Load Extension**:
   Click **Load unpacked** and select the root directory of this project (`screen-recorder`).

---

## 🛠️ Architecture & Tech Stack

Built in strict compliance with Chrome Extension **Manifest V3** standards:

- **Service Worker (`background/service-worker.js`)**: Manages session state, duration timers, badge indicators, and extension messaging without background polling.
- **Offscreen Documents (`offscreen/`)**: Handles `MediaRecorder`, Canvas stitching, and Web Audio mixing in a hidden DOM context as mandated by MV3 background limitations.
- **Content Script (`content/scroller.js`)**: Automates controlled vertical scrolling and canvas alignment for seamless full-page screenshots.
- **IndexedDB (`utils/db.js`)**: Efficient local storage for large media blobs (WebM videos and PNG images).

---

## 📁 Repository Structure

```
screen-recorder/
├── manifest.json                    # Extension Manifest V3 configuration
├── background/
│   └── service-worker.js            # Background service worker & event router
├── popup/                           # Extension popup interface
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── offscreen/                         # Offscreen document for DOM & audio/media APIs
│   ├── offscreen.html
│   └── offscreen.js
├── desktop-recorder/                # Window/Screen recording picker UI
├── preview/                         # Full-featured Media Gallery & Studio
│   ├── preview.html
│   ├── preview.js
│   └── preview.css
├── content/                         # Injected content scripts (full-page scrolling)
│   └── scroller.js
├── utils/                           # Database & helper utilities
│   └── db.js                        # IndexedDB wrapper
├── icons/                           # Extension icons (16, 48, 128 px)
└── privacy-policy.html              # Privacy policy documentation
```

---

## 🔒 Privacy & Permissions

This extension requests minimal permissions required for capture operations:

| Permission | Purpose |
| --- | --- |
| `storage` | Tracks transient state in `chrome.storage.session`. |
| `activeTab` | User-initiated page access for viewport and full-page screenshots. |
| `scripting` | Temporarily injects scrolling logic during full-page screenshot capture. |
| `tabCapture` | Captures audio/video streams from the active tab. |
| `offscreen` | Runs media rendering, Web Audio mixing, and canvas stitching contexts. |

No user data, media, or browsing history is ever transmitted off your machine.

---

## 📄 License

MIT License. See file headers or standard repository license for details.
