/**
 * Offscreen Script: Handles MediaRecorder stream capture, Web Audio mixing,
 * and Full-Page Canvas Image Stitching.
 */

let mediaRecorder = null;
let recordedChunks = [];
let mediaStream = null;
let micStream = null;
let audioContext = null;
let recordingStartTime = 0;
let timerInterval = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_RECORDING') {
    startRecording(message)
      .then((info) => sendResponse({ success: true, ...info }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open
  }

  if (message.action === 'STOP_RECORDING') {
    stopRecording()
      .then((captureId) => sendResponse({ success: true, captureId }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'STITCH_SCREENSHOT') {
    stitchScreenshot(message)
      .then((captureId) => sendResponse({ success: true, captureId }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function startRecording({ streamId, sourceType = 'desktop', captureAudio = true, captureMic = false }) {
  recordedChunks = [];
  let displayStream = null;
  let systemAudioActive = false;

  if (sourceType !== 'tab') {
    throw new Error('The offscreen recorder only handles current-tab capture.');
  }

  const tabConstraints = {
    audio: captureAudio ? {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    } : false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
        maxFrameRate: 60
      }
    }
  };
  displayStream = await navigator.mediaDevices.getUserMedia(tabConstraints);
  systemAudioActive = displayStream.getAudioTracks().length > 0;

  if (!displayStream) {
    throw new Error('Unable to acquire screen capture media stream.');
  }

  try {
    // 2. Microphone stream if requested
    let micAudioStream = null;
    let micAudioActive = false;
    if (captureMic) {
      try {
        micAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStream = micAudioStream;
        micAudioActive = micAudioStream.getAudioTracks().length > 0;
      } catch (micErr) {
        console.warn('Microphone permission denied or unavailable:', micErr.message || micErr);
      }
    }

    // 3. Audio Mixing via Web Audio API
    const hasDisplayAudio = displayStream.getAudioTracks().length > 0;
    const hasMicAudio = micAudioStream && micAudioStream.getAudioTracks().length > 0;

    let finalTracks = [...displayStream.getVideoTracks()];

    if (hasDisplayAudio || hasMicAudio) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioDestination = audioContext.createMediaStreamDestination();

      if (hasDisplayAudio) {
        const displayAudioSource = audioContext.createMediaStreamSource(new MediaStream([displayStream.getAudioTracks()[0]]));
        displayAudioSource.connect(audioDestination);
        
        // Pass system/tab audio to user speakers during capture
        displayAudioSource.connect(audioContext.destination);
      }

      if (hasMicAudio) {
        const micAudioSource = audioContext.createMediaStreamSource(micAudioStream);
        micAudioSource.connect(audioDestination);
      }

      finalTracks.push(...audioDestination.stream.getAudioTracks());
    }
    
    mediaStream = new MediaStream(finalTracks);

    // Listen for stream end (e.g. user clicks Chrome's native "Stop Sharing" floating bar)
    const videoTrack = displayStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        console.log('Video track ended externally');
        chrome.runtime.sendMessage({ action: 'EXTERNAL_STOP_RECORDING' });
      };
    }

    // 4. Determine supported MIME type
    const mimeType = getSupportedMimeType();
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.start(1000); // collect 1s slice chunks
    recordingStartTime = Date.now();

    // Start timer notifications to service worker
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const durationSec = Math.floor((Date.now() - recordingStartTime) / 1000);
      chrome.runtime.sendMessage({ action: 'RECORDING_TIMER_UPDATE', durationSec });
    }, 1000);

    return { systemAudioActive, micAudioActive };
  } catch (err) {
    console.error('Failed to start media recorder in offscreen:', err.message || err);
    throw err;
  }
}

function getSupportedMimeType() {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return 'video/webm';
}

async function stopRecording() {
  clearInterval(timerInterval);
  timerInterval = null;

  return new Promise((resolve, reject) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      return reject(new Error('No active recording in progress.'));
    }

    const durationSec = Math.floor((Date.now() - recordingStartTime) / 1000);

    mediaRecorder.onstop = async () => {
      try {
        const mimeType = mediaRecorder.mimeType || 'video/webm';
        const blob = new Blob(recordedChunks, { type: mimeType });

        // Clean up tracks & audio context
        if (mediaStream) {
          mediaStream.getTracks().forEach(t => t.stop());
        }
        if (micStream) {
          micStream.getTracks().forEach(t => t.stop());
        }
        if (audioContext && audioContext.state !== 'closed') {
          audioContext.close();
        }

        // Save to IndexedDB
        const title = `Recording ${new Date().toLocaleString()}`;
        const captureId = await window.DB.saveCapture({
          type: 'video',
          title,
          mimeType,
          blob,
          duration: durationSec
        });

        recordedChunks = [];
        mediaRecorder = null;
        mediaStream = null;
        micStream = null;

        resolve(captureId);
      } catch (err) {
        reject(err);
      }
    };

    mediaRecorder.stop();
  });
}

/**
 * Stitch screenshot slices into a single canvas PNG
 */
async function stitchScreenshot({ slices, totalWidth, totalHeight, devicePixelRatio = 1, title }) {
  return new Promise(async (resolve, reject) => {
    try {
      const MAX_CANVAS_DIM = 16384;
      
      let scale = 1;
      let finalCanvasWidth = totalWidth * devicePixelRatio;
      let finalCanvasHeight = totalHeight * devicePixelRatio;

      if (finalCanvasHeight > MAX_CANVAS_DIM) {
        scale = MAX_CANVAS_DIM / finalCanvasHeight;
        finalCanvasWidth = Math.floor(finalCanvasWidth * scale);
        finalCanvasHeight = MAX_CANVAS_DIM;
      }

      const canvas = document.createElement('canvas');
      canvas.width = finalCanvasWidth;
      canvas.height = finalCanvasHeight;
      const ctx = canvas.getContext('2d');

      for (const slice of slices) {
        const img = await loadImage(slice.dataUrl);
        const drawY = slice.y * devicePixelRatio * scale;
        const drawW = finalCanvasWidth;
        const drawH = img.height * scale;

        // Draw the complete viewport at its real scroll position. Canvas
        // clipping handles the final viewport and overlapping bottom slice
        // without stretching it or leaving an unpainted tail.
        ctx.drawImage(img, 0, 0, img.width, img.height, 0, drawY, drawW, drawH);
      }

      canvas.toBlob(async (blob) => {
        if (!blob) {
          return reject(new Error('Failed to create screenshot image blob. Page may be too large.'));
        }

        const captureId = await window.DB.saveCapture({
          type: 'image',
          title: title || `Full Page Screenshot ${new Date().toLocaleString()}`,
          mimeType: 'image/png',
          blob,
          width: canvas.width,
          height: canvas.height
        });

        resolve(captureId);
      }, 'image/png');
    } catch (err) {
      reject(err);
    }
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
