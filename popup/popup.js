/**
 * Popup UI Interaction Controller.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const tabBtns = document.querySelectorAll('.tab-nav .tab-btn');
  const panels = document.querySelectorAll('.panel');
  const segmentBtns = document.querySelectorAll('.segment-btn');

  const btnStartRecord = document.getElementById('btnStartRecord');
  const btnStopRecord = document.getElementById('btnStopRecord');
  const chkAudio = document.getElementById('chkAudio');
  const chkMic = document.getElementById('chkMic');

  const recordingStatus = document.getElementById('recordingStatus');
  const recordingTimer = document.getElementById('recordingTimer');
  const recordingOptions = document.getElementById('recordingOptions');

  const btnCaptureFullPage = document.getElementById('btnCaptureFullPage');
  const btnCaptureVisible = document.getElementById('btnCaptureVisible');
  const btnOpenGallery = document.getElementById('btnOpenGallery');

  const recentList = document.getElementById('recentList');
  const toast = document.getElementById('toast');

  let currentCaptureMode = 'desktop';

  // Segment Mode Toggle (Screen/Window vs Current Tab)
  segmentBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      segmentBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCaptureMode = btn.getAttribute('data-mode') || 'desktop';
    });
  });

  // Prompt Microphone permission in visible Popup context if mic toggle is checked
  chkMic.addEventListener('change', async () => {
    if (chkMic.checked) {
      await requestMicPermission();
    }
  });

  async function requestMicPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop tracks immediately after granting permission
      stream.getTracks().forEach(t => t.stop());
      showToast('Microphone access granted!');
      return true;
    } catch (err) {
      console.warn('Microphone permission error:', err);
      showToast('Microphone access denied. Unchecking mic option.');
      chkMic.checked = false;
      return false;
    }
  }

  // Tab Navigation
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      tabBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab).classList.add('active');

      if (targetTab === 'tab-recent') {
        loadHistoryList();
      }
    });
  });

  // Check initial recording state from background
  await syncRecordingState();

  // Periodically update timer if active
  setInterval(async () => {
    await syncRecordingState();
  }, 1000);

  // Start Recording
  btnStartRecord.addEventListener('click', async () => {
    // If Microphone is checked, ensure permission is requested in visible popup context first
    if (chkMic.checked) {
      const granted = await requestMicPermission();
      if (!granted) {
        // User denied mic permission, proceed without mic or return
      }
    }

    if (currentCaptureMode === 'desktop') {
      const prepare = await chrome.runtime.sendMessage({ action: 'PREPARE_DESKTOP_RECORDING' });
      if (!prepare?.success) {
        showToast(`Error: ${prepare?.error || 'Unable to prepare recorder'}`);
        return;
      }

      const params = new URLSearchParams({
        audio: String(chkAudio.checked),
        mic: String(chkMic.checked)
      });

      try {
        const recorderWidth = Math.min(960, Math.floor(screen.availWidth * 0.9));
        const recorderHeight = Math.min(720, Math.floor(screen.availHeight * 0.86));
        const recorderLeft = Math.round(
          (screen.availLeft || 0) + (screen.availWidth - recorderWidth) / 2
        );
        const recorderTop = Math.round(
          (screen.availTop || 0) + (screen.availHeight - recorderHeight) / 2
        );

        await chrome.windows.create({
          url: `desktop-recorder/desktop-recorder.html?${params}`,
          type: 'popup',
          width: recorderWidth,
          height: recorderHeight,
          left: recorderLeft,
          top: recorderTop,
          focused: true
        });
        window.close();
      } catch (err) {
        await chrome.runtime.sendMessage({ action: 'DESKTOP_RECORDING_CANCELLED' });
        showToast(`Error: ${err.message}`);
      }
      return;
    }

    showToast('Starting tab recording...');
    
    const response = await chrome.runtime.sendMessage({
      action: 'START_RECORDING_REQUEST',
      captureMode: currentCaptureMode,
      captureAudio: chkAudio.checked,
      captureMic: chkMic.checked
    });

    if (!response || !response.success) {
      if (response?.error && response.error !== 'Screen selection was cancelled.') {
        showToast(`Error: ${response.error}`);
      }
    } else {
      showToast('Recording started!');
    }
    await syncRecordingState();
  });

  // Stop Recording
  btnStopRecord.addEventListener('click', async () => {
    showToast('Stopping recording and compiling video...');
    btnStopRecord.disabled = true;

    const response = await chrome.runtime.sendMessage({ action: 'STOP_RECORDING_REQUEST' });
    btnStopRecord.disabled = false;

    if (!response || !response.success) {
      showToast(`Error: ${response?.error || 'Failed to stop'}`);
    } else {
      window.close(); // Close popup after launching preview
    }
  });

  // Capture Full Page Screenshot
  btnCaptureFullPage.addEventListener('click', async () => {
    showToast('Scrolling page & stitching screenshot...');
    btnCaptureFullPage.disabled = true;

    const response = await chrome.runtime.sendMessage({ action: 'CAPTURE_FULL_PAGE' });
    btnCaptureFullPage.disabled = false;

    if (!response || !response.success) {
      showToast(`Error: ${response?.error || 'Full page capture failed'}`);
    } else {
      window.close();
    }
  });

  // Capture Visible Viewport
  btnCaptureVisible.addEventListener('click', async () => {
    showToast('Capturing viewport...');
    btnCaptureVisible.disabled = true;

    const response = await chrome.runtime.sendMessage({ action: 'CAPTURE_VISIBLE_TAB' });
    btnCaptureVisible.disabled = false;

    if (!response || !response.success) {
      showToast(`Error: ${response?.error || 'Visible capture failed'}`);
    } else {
      window.close();
    }
  });

  // Gallery button
  btnOpenGallery.addEventListener('click', () => {
    chrome.tabs.create({ url: 'preview/preview.html' });
  });

  /**
   * Sync Recording State with Service Worker
   */
  async function syncRecordingState() {
    try {
      const state = await chrome.runtime.sendMessage({ action: 'GET_RECORDING_STATE' });
      if (state && state.recordingState === 'recording') {
        recordingStatus.classList.remove('hidden');
        btnStopRecord.classList.remove('hidden');
        btnStartRecord.classList.add('hidden');
        recordingOptions.classList.add('hidden');

        const sec = state.durationSec || 0;
        const mins = Math.floor(sec / 60);
        const secs = sec % 60;
        recordingTimer.textContent = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
      } else {
        recordingStatus.classList.add('hidden');
        btnStopRecord.classList.add('hidden');
        btnStartRecord.classList.remove('hidden');
        recordingOptions.classList.remove('hidden');
      }
    } catch (e) {
      // SW might be sleeping
    }
  }

  /**
   * Populate History List from IndexedDB
   */
  async function loadHistoryList() {
    try {
      const items = await window.DB.getAllCaptures();
      if (!items || items.length === 0) {
        recentList.innerHTML = '<div class="empty-state"><p>No captures recorded yet.</p></div>';
        return;
      }

      recentList.innerHTML = '';
      items.forEach((item) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'history-item';
        
        const dateStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const iconSvg = item.type === 'video'
          ? `<svg class="history-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`
          : `<svg class="history-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;

        itemEl.innerHTML = `
          <div class="history-info">
            ${iconSvg}
            <div class="history-details">
              <span class="history-title">${escapeHtml(item.title)}</span>
              <span class="history-meta">${dateStr} • ${item.type === 'video' ? formatDuration(item.duration) : `${item.width}x${item.height}`}</span>
            </div>
          </div>
          <div class="history-actions">
            <button class="icon-btn btn-view" title="Open Preview">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </button>
          </div>
        `;

        itemEl.querySelector('.btn-view').addEventListener('click', () => {
          chrome.tabs.create({ url: `preview/preview.html?id=${item.id}` });
        });

        recentList.appendChild(itemEl);
      });
    } catch (err) {
      recentList.innerHTML = '<div class="empty-state"><p>Error loading captures.</p></div>';
    }
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  }

  function formatDuration(sec = 0) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
