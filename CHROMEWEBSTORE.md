# Chrome Web Store Submission Copy

## Basic information

- **Name:** Capture Studio: Recorder & Screenshots
- **Version:** 1.0.0
- **Category:** Productivity
- **Language:** English
- **Single purpose:** User-initiated local screen capture.

## Single-purpose description

> Capture Studio enables users to intentionally capture visual content from their browser or display. Users can record a selected tab, window, or screen, or take visible and full-page webpage screenshots, then preview, manage, and export those captures locally on their device.

Recording and screenshots are two formats of the same screen-capture purpose. Every capture begins with an explicit user action or Chrome source-selection prompt. The extension does not monitor browsing activity, capture content in the background without user initiation, or transmit captures to the developer or third parties.

## Short description

Record a selected tab, window, or screen and capture visible or full-page screenshots, with local preview and export.

## Detailed description

Capture Studio records a source you select through Chrome and captures screenshots when you click a capture command.

### Features

- Record the current tab or a screen/window selected in Chrome's native picker.
- Include source audio when Chrome and the selected operating-system source make it available.
- Optionally include microphone audio after granting microphone permission.
- Capture the visible viewport or scroll and stitch the active page into a PNG.
- Preview, rename, copy, download, and delete captures in the built-in gallery.
- Keep capture files and metadata in the extension's local IndexedDB storage until you delete them or remove the extension.

The extension does not upload captures, use analytics, display advertising, or transmit captured content to the developer or third parties. Very tall pages may be scaled to browser canvas limits. Some protected or browser-internal pages cannot be captured. Source-audio support varies by operating system and selected source.

## Permission justifications

| Permission | Justification |
| --- | --- |
| `storage` | Stores temporary recording state and duration in `chrome.storage.session`. Capture files are stored separately in local IndexedDB. |
| `activeTab` | Gives temporary, user-initiated access to the active page for visible/full-page screenshots and page metadata. |
| `scripting` | Injects the local scrolling helper into the active page only after the user clicks **Capture Full Page**. |
| `tabCapture` | Records the current tab after the user selects **Current Tab** and clicks **Start Recording**. |
| `offscreen` | Runs local current-tab `MediaRecorder`, audio mixing, and canvas stitching APIs that require a document context. Screen/window recording uses Chrome's standard `getDisplayMedia` picker in a persistent local extension window. |

The extension requests no persistent host permissions. It does not request `tabs`, `desktopCapture`, or `downloads` permission.

## Privacy Practices dashboard answers

Use answers consistent with the actual dashboard wording at submission time:

- **Does the extension collect or use user data?** Yes, it handles user data locally to provide its capture features.
- **Website content:** Yes. Screenshots and recordings can contain active-page content selected by the user.
- **User-generated content / personal communications:** Yes, potentially. A user-selected recording or screenshot can contain these categories.
- **Audio:** Yes. Source audio and optional microphone audio are processed when the user enables them.
- **Web history:** Do not declare collection of browsing history as a separate product purpose. The current page title is handled only as capture metadata after a user-initiated capture.
- **Data sold, shared, or transferred:** No.
- **Used for advertising, creditworthiness, or unrelated purposes:** No.
- **Remote transmission:** No. Capture data remains on the user's device unless the user explicitly exports it.
- **Limited Use certification:** Certify only while the code and policy continue to comply.

Use the public HTTPS URL of `privacy-policy.html` for the Developer Dashboard privacy-policy field. Dashboard declarations, this listing, and the hosted policy must remain consistent.

## Reviewer test instructions

See `STORE_REVIEW_TEST_INSTRUCTIONS.md` for copy suitable for the Test instructions tab.

## Version history

### 1.0.0

- Initial release with user-initiated screen/tab recording, optional audio, visible/full-page screenshots, and a local capture gallery.
