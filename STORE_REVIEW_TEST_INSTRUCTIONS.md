# Chrome Web Store reviewer test instructions

No account, payment, or test credentials are required. All features work locally.

## Recording a tab

1. Open a normal HTTPS webpage (browser-internal and Chrome Web Store pages are intentionally unsupported).
2. Open the extension, select **Current Tab**, and click **Start Recording**.
3. If desired, enable source audio. Chrome/OS support varies by source.
4. Return to the extension and click **Stop & Save**.
5. Confirm that a local preview tab opens and the WebM can be played, renamed, downloaded, and deleted.

## Recording a screen or window

1. Select **Screen / Window** and click **Start Recording**.
2. In the small recording controller, click **Choose Source & Start**.
3. Choose one source in Chrome's single native picker. The controller minimizes after recording begins.
4. Stop from the extension or Chrome's sharing indicator.
5. Confirm that one preview opens and the recording is present in the local gallery.

## Optional microphone

1. Turn on **Microphone Audio** and grant the browser permission.
2. Start a recording and speak briefly.
3. Stop and confirm that microphone audio is present. Denying the permission turns the option off and other capture features remain usable.

## Screenshots

1. On a normal webpage, click **Capture Visible Area** and confirm that a PNG preview opens.
2. Return to the webpage, note its current scroll position, then click **Capture Full Page**.
3. Confirm that the page is restored to its original scroll position and that a stitched PNG opens.
4. Confirm that the PNG can be copied, renamed, downloaded, and deleted.

## Privacy verification

- Captures and metadata are stored in the extension's local IndexedDB only.
- The extension makes no network requests and includes no analytics, advertising, remote code, or external service.
- It requests no persistent host permissions; active-page access follows an explicit user action.
