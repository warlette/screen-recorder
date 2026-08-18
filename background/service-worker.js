/**
 * Background Service Worker for Screen Recorder & Full Page Capture Extension.
 * Handles recording state machines, offscreen document lifecycle, screenshot orchestration,
 * and preview navigation.
 */

// Initialize state on startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.set({ recordingState: 'idle', recordingContext: null });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handledActions = new Set([
    'GET_RECORDING_STATE',
    'START_RECORDING_REQUEST',
    'PREPARE_DESKTOP_RECORDING',
    'DESKTOP_RECORDING_STARTED',
    'DESKTOP_RECORDING_CANCELLED',
    'DESKTOP_RECORDING_ENDED',
    'STOP_RECORDING_REQUEST',
    'EXTERNAL_STOP_RECORDING',
    'RECORDING_TIMER_UPDATE',
    'CAPTURE_FULL_PAGE',
    'CAPTURE_VISIBLE_TAB'
  ]);
  if (!handledActions.has(message.action)) return false;

  (async () => {
    try {
      if (message.action === 'GET_RECORDING_STATE') {
        const { recordingState = 'idle', durationSec = 0 } = await chrome.storage.session.get(['recordingState', 'durationSec']);
        sendResponse({ recordingState, durationSec });
        return;
      }

      if (message.action === 'START_RECORDING_REQUEST') {
        const result = await handleStartRecording(message);
        sendResponse(result);
        return;
      }

      if (message.action === 'PREPARE_DESKTOP_RECORDING') {
        const { recordingState = 'idle' } = await chrome.storage.session.get('recordingState');
        if (recordingState !== 'idle') {
          sendResponse({ success: false, error: 'A recording is already active.' });
          return;
        }
        await chrome.storage.session.set({
          recordingState: 'starting',
          recordingContext: 'desktop',
          durationSec: 0
        });
        sendResponse({ success: true });
        return;
      }

      if (message.action === 'DESKTOP_RECORDING_STARTED') {
        await chrome.storage.session.set({
          recordingState: 'recording',
          recordingContext: 'desktop',
          durationSec: 0
        });
        await chrome.action.setBadgeText({ text: 'REC' });
        await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
        sendResponse({ success: true });
        return;
      }

      if (message.action === 'DESKTOP_RECORDING_CANCELLED') {
        await resetRecordingState();
        sendResponse({ success: true });
        return;
      }

      if (message.action === 'DESKTOP_RECORDING_ENDED') {
        await resetRecordingState();
        if (message.captureId) {
          await chrome.tabs.create({ url: `preview/preview.html?id=${message.captureId}` });
        }
        sendResponse({ success: true });
        return;
      }

      if (message.action === 'STOP_RECORDING_REQUEST') {
        const result = await handleStopRecording();
        sendResponse(result);
        return;
      }

      if (message.action === 'EXTERNAL_STOP_RECORDING') {
        await handleStopRecording();
        sendResponse({ success: true });
        return;
      }

      if (message.action === 'RECORDING_TIMER_UPDATE') {
        await chrome.storage.session.set({ durationSec: message.durationSec });
        const minutes = Math.floor(message.durationSec / 60);
        const seconds = message.durationSec % 60;
        const text = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        await chrome.action.setBadgeText({ text });
        await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
        sendResponse({ success: true });
        return;
      }

      if (message.action === 'CAPTURE_FULL_PAGE') {
        const result = await handleFullPageCapture();
        sendResponse(result);
        return;
      }

      if (message.action === 'CAPTURE_VISIBLE_TAB') {
        const result = await handleVisibleTabCapture();
        sendResponse(result);
        return;
      }
    } catch (err) {
      console.error('Error in background message handler:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true;
});

async function resetRecordingState() {
  await chrome.storage.session.set({
    recordingState: 'idle',
    recordingContext: null,
    durationSec: 0
  });
  await chrome.action.setBadgeText({ text: '' });
}

/**
 * Check if a tab URL can be scripted/captured
 */
function isScriptableUrl(url) {
  if (!url) return false;
  const restrictedPrefixes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'https://chrome.google.com/webstore',
    'https://chromewebstore.google.com'
  ];
  return !restrictedPrefixes.some(prefix => url.startsWith(prefix));
}

/**
 * Handle starting screen recording
 */
async function handleStartRecording({ captureMode = 'desktop', captureAudio = true, captureMic = false }) {
  if (captureMode !== 'tab') {
    return { success: false, error: 'Desktop recording must start from the recording controller.' };
  }

  const { recordingState = 'idle' } = await chrome.storage.session.get('recordingState');
  if (recordingState !== 'idle') {
    return { success: false, error: 'Recording is already starting or active.' };
  }

  await chrome.storage.session.set({ recordingState: 'starting', durationSec: 0 });

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      await chrome.storage.session.set({ recordingState: 'idle' });
      return { success: false, error: 'No active tab found.' };
    }

    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    if (!streamId) {
      await chrome.storage.session.set({ recordingState: 'idle' });
      return { success: false, error: 'Failed to obtain tab media stream.' };
    }

    await setupOffscreenDocument();

    const response = await chrome.runtime.sendMessage({
      action: 'START_RECORDING',
      streamId,
      sourceType: 'tab',
      captureAudio,
      captureMic
    });

    if (response && response.success) {
      await chrome.storage.session.set({ recordingState: 'recording', recordingContext: 'offscreen' });
      await chrome.action.setBadgeText({ text: 'REC' });
      await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
      return { success: true };
    }

    await chrome.storage.session.set({ recordingState: 'idle' });
    return { success: false, error: response?.error || 'Failed to start tab recorder' };
  } catch (err) {
    await chrome.storage.session.set({ recordingState: 'idle' });
    return { success: false, error: err.message };
  }
}

/**
 * Handle stopping screen recording
 */
async function handleStopRecording() {
  const {
    recordingState = 'idle',
    recordingContext = 'offscreen'
  } = await chrome.storage.session.get(['recordingState', 'recordingContext']);
  if (recordingState !== 'recording') {
    return { success: false, error: 'No active recording to stop.' };
  }

  await chrome.storage.session.set({ recordingState: 'stopping' });

  try {
    const response = await chrome.runtime.sendMessage({
      action: recordingContext === 'desktop' ? 'STOP_DESKTOP_RECORDING' : 'STOP_RECORDING'
    });
    await resetRecordingState();

    if (response && response.success && response.captureId) {
      await chrome.tabs.create({ url: `preview/preview.html?id=${response.captureId}` });
      return { success: true, captureId: response.captureId };
    } else {
      return { success: false, error: response?.error || 'Failed to stop recording' };
    }
  } catch (err) {
    await resetRecordingState();
    return { success: false, error: err.message };
  }
}

/**
 * Handle full page scrolling capture
 */
async function handleFullPageCapture() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    return { success: false, error: 'No active tab found.' };
  }

  if (!isScriptableUrl(tab.url)) {
    return {
      success: false,
      error: 'Cannot capture Chrome system, extension, or Webstore pages. Please test on a standard website (e.g. https://wikipedia.org).'
    };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/scroller.js']
    });
  } catch (injErr) {
    return { success: false, error: `Failed to access active page: ${injErr.message}` };
  }

  let dims = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      dims = await chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_DIMENSIONS' });
      if (dims) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  if (!dims) {
    return { success: false, error: 'Unable to calculate page dimensions. Try reloading the target page.' };
  }

  const { fullWidth, fullHeight, viewportWidth, viewportHeight, devicePixelRatio, originalScrollY, pageTitle } = dims;

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'PREPARE_PAGE' });
  } catch (e) {}

  const slices = [];
  const maxScrollY = Math.max(0, fullHeight - viewportHeight);
  const capturePositions = [];

  for (let y = 0; y < maxScrollY; y += viewportHeight) {
    capturePositions.push(y);
  }
  capturePositions.push(maxScrollY);

  // Avoid silently returning an incomplete image for unusually tall or
  // infinitely growing pages.
  const MAX_SLICES = 100;
  if (capturePositions.length > MAX_SLICES) {
    return {
      success: false,
      error: `This page requires ${capturePositions.length} screenshots; the safe limit is ${MAX_SLICES}.`
    };
  }

  try {
    for (const requestedY of capturePositions) {
      let actualY = requestedY;
      try {
        const scrollResult = await chrome.tabs.sendMessage(tab.id, {
          action: 'SCROLL_TO',
          y: requestedY
        });
        if (Number.isFinite(scrollResult?.actualY)) {
          actualY = scrollResult.actualY;
        }
      } catch (e) {}

      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        slices.push({
          y: actualY,
          dataUrl,
          width: viewportWidth,
          height: viewportHeight
        });
      } catch (capErr) {
        console.warn('Failed slice capture at Y=', actualY, capErr);
      }
    }
  } finally {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'RESTORE_PAGE',
        originalY: originalScrollY
      });
    } catch (e) {}
  }

  if (slices.length === 0) {
    return { success: false, error: 'No screenshot slices were captured.' };
  }

  await setupOffscreenDocument();
  const stitchResponse = await chrome.runtime.sendMessage({
    action: 'STITCH_SCREENSHOT',
    slices,
    totalWidth: viewportWidth,
    totalHeight: fullHeight,
    devicePixelRatio,
    title: pageTitle
  });

  if (stitchResponse && stitchResponse.success && stitchResponse.captureId) {
    await chrome.tabs.create({ url: `preview/preview.html?id=${stitchResponse.captureId}` });
    return { success: true, captureId: stitchResponse.captureId };
  } else {
    return { success: false, error: stitchResponse?.error || 'Failed to stitch full-page screenshot' };
  }
}

/**
 * Handle visible tab capture
 */
async function handleVisibleTabCapture() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    return { success: false, error: 'No active tab found' };
  }

  if (!isScriptableUrl(tab.url)) {
    return {
      success: false,
      error: 'Cannot capture Chrome system or Webstore pages.'
    };
  }

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

    await setupOffscreenDocument();
    const stitchResponse = await chrome.runtime.sendMessage({
      action: 'STITCH_SCREENSHOT',
      slices: [{ y: 0, dataUrl, width: tab.width || 1280, height: tab.height || 800 }],
      totalWidth: tab.width || 1280,
      totalHeight: tab.height || 800,
      devicePixelRatio: 1,
      title: tab.title || 'Viewport Screenshot'
    });

    if (stitchResponse && stitchResponse.success && stitchResponse.captureId) {
      await chrome.tabs.create({ url: `preview/preview.html?id=${stitchResponse.captureId}` });
      return { success: true, captureId: stitchResponse.captureId };
    } else {
      return { success: false, error: stitchResponse?.error || 'Failed to process screenshot' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Offscreen Document Helpers
 */
async function setupOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
  });
  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['USER_MEDIA', 'BLOBS'],
    justification: 'Record user-selected media and create local screenshot image blobs'
  });
}
