document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const captureAudio = params.get('audio') !== 'false';
  const captureMic = params.get('mic') === 'true';
  const statusText = document.getElementById('statusText');
  const btnStart = document.getElementById('btnStart');
  const btnCancel = document.getElementById('btnCancel');

  let mediaRecorder = null;
  let displayStream = null;
  let micStream = null;
  let audioContext = null;
  let recordedChunks = [];
  let recordingStartTime = 0;
  let timerInterval = null;
  let stopPromise = null;
  let stoppingFromExtension = false;

  btnStart.addEventListener('click', startDesktopRecording);
  btnCancel.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'DESKTOP_RECORDING_CANCELLED' });
    window.close();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action !== 'STOP_DESKTOP_RECORDING') return false;

    stoppingFromExtension = true;
    stopDesktopRecording()
      .then((captureId) => sendResponse({ success: true, captureId }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  });

  async function startDesktopRecording() {
    btnStart.disabled = true;
    btnCancel.disabled = true;
    statusText.textContent = 'Choose one screen, window, or tab in Chrome’s picker.';

    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { max: 60 } },
        audio: captureAudio ? { suppressLocalAudioPlayback: false } : false
      });

      if (captureMic) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (micErr) {
          console.warn('Microphone unavailable:', micErr.message || micErr);
        }
      }

      const finalStream = await buildRecordingStream(displayStream, micStream);
      const mimeType = getSupportedMimeType();
      mediaRecorder = new MediaRecorder(finalStream, { mimeType });
      recordedChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data?.size > 0) recordedChunks.push(event.data);
      };

      const videoTrack = displayStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = async () => {
          if (stoppingFromExtension || !mediaRecorder || mediaRecorder.state === 'inactive') return;
          try {
            const captureId = await stopDesktopRecording();
            await chrome.runtime.sendMessage({ action: 'DESKTOP_RECORDING_ENDED', captureId });
            window.close();
          } catch (err) {
            await chrome.runtime.sendMessage({ action: 'DESKTOP_RECORDING_CANCELLED' });
            showError(err);
          }
        };
      }

      mediaRecorder.start(1000);
      recordingStartTime = Date.now();
      timerInterval = setInterval(() => {
        const durationSec = Math.floor((Date.now() - recordingStartTime) / 1000);
        chrome.runtime.sendMessage({ action: 'RECORDING_TIMER_UPDATE', durationSec });
      }, 1000);

      const started = await chrome.runtime.sendMessage({ action: 'DESKTOP_RECORDING_STARTED' });
      if (!started?.success) throw new Error(started?.error || 'Unable to update recording state.');

      statusText.textContent = 'Recording… Use the extension button to stop and save.';
      try {
        const currentWindow = await chrome.windows.getCurrent();
        if (currentWindow?.id) {
          await chrome.windows.update(currentWindow.id, { state: 'minimized' });
        }
      } catch (minimizeErr) {
        // Recording is already active; failure to minimize is non-fatal.
        console.warn('Could not minimize recorder window:', minimizeErr.message || minimizeErr);
      }
    } catch (err) {
      cleanupStreams();
      await chrome.runtime.sendMessage({ action: 'DESKTOP_RECORDING_CANCELLED' });
      showError(err);
    }
  }

  async function buildRecordingStream(screenStream, microphoneStream) {
    const finalTracks = [...screenStream.getVideoTracks()];
    const hasScreenAudio = screenStream.getAudioTracks().length > 0;
    const hasMicAudio = microphoneStream?.getAudioTracks().length > 0;

    if (hasScreenAudio || hasMicAudio) {
      audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      if (hasScreenAudio) {
        const source = audioContext.createMediaStreamSource(
          new MediaStream([screenStream.getAudioTracks()[0]])
        );
        source.connect(destination);
        source.connect(audioContext.destination);
      }

      if (hasMicAudio) {
        audioContext.createMediaStreamSource(microphoneStream).connect(destination);
      }

      finalTracks.push(...destination.stream.getAudioTracks());
    }

    return new MediaStream(finalTracks);
  }

  function stopDesktopRecording() {
    if (stopPromise) return stopPromise;
    stopPromise = new Promise((resolve, reject) => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        reject(new Error('No active desktop recording.'));
        return;
      }

      clearInterval(timerInterval);
      const duration = Math.floor((Date.now() - recordingStartTime) / 1000);

      mediaRecorder.onstop = async () => {
        try {
          const mimeType = mediaRecorder.mimeType || 'video/webm';
          const blob = new Blob(recordedChunks, { type: mimeType });
          const captureId = await window.DB.saveCapture({
            type: 'video',
            title: `Recording ${new Date().toLocaleString()}`,
            mimeType,
            blob,
            duration
          });
          cleanupStreams();
          resolve(captureId);
          setTimeout(() => window.close(), 100);
        } catch (err) {
          reject(err);
        }
      };

      mediaRecorder.stop();
    });
    return stopPromise;
  }

  function cleanupStreams() {
    clearInterval(timerInterval);
    displayStream?.getTracks().forEach((track) => track.stop());
    micStream?.getTracks().forEach((track) => track.stop());
    if (audioContext && audioContext.state !== 'closed') audioContext.close();
  }

  function getSupportedMimeType() {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) || 'video/webm';
  }

  function showError(err) {
    statusText.textContent = `Unable to start: ${err.message || err}`;
    btnStart.disabled = false;
    btnCancel.disabled = false;
  }
});
