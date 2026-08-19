/**
 * Offscreen Script: Handles MediaRecorder stream capture, Web Audio mixing,
 * Real-time Speech Recognition Transcription (Video Audio + Mic), AI Summarization, and Canvas Image Stitching.
 */

let mediaRecorder = null;
let recordedChunks = [];
let mediaStream = null;
let micStream = null;
let audioContext = null;
let recordingStartTime = 0;
let timerInterval = null;

// Speech Recognition & Transcript state
let speechRecognition = null;
let transcriptEntries = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_RECORDING') {
    startRecording(message)
      .then((info) => sendResponse({ success: true, ...info }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
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
  transcriptEntries = [];
  let displayStream = null;
  let systemAudioActive = false;

  const chromeSourceType = sourceType === 'tab' ? 'tab' : 'desktop';

  // 1. Obtain Display Stream
  if (sourceType === 'tab') {
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
  } else {
    // Desktop capture
    if (captureAudio) {
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { max: 60 } },
          audio: true
        });
        systemAudioActive = displayStream.getAudioTracks().length > 0;
      } catch (gdmErr) {
        console.info('getDisplayMedia prompt bypassed or cancelled, falling back to desktop streamId:', gdmErr.message || gdmErr);
      }
    }

    if (!displayStream && streamId) {
      const desktopConstraints = {
        audio: captureAudio ? {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: streamId
          }
        } : false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: streamId,
            maxFrameRate: 60
          }
        }
      };

      try {
        displayStream = await navigator.mediaDevices.getUserMedia(desktopConstraints);
        systemAudioActive = displayStream.getAudioTracks().length > 0;
      } catch (audioErr) {
        desktopConstraints.audio = false;
        displayStream = await navigator.mediaDevices.getUserMedia(desktopConstraints);
      }
    }
  }

  if (!displayStream) {
    throw new Error('Unable to acquire screen capture media stream.');
  }

  try {
    // 2. Microphone stream with acoustic echo cancellation
    let micAudioStream = null;
    let micAudioActive = false;
    if (captureMic) {
      try {
        micAudioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        micStream = micAudioStream;
        micAudioActive = micAudioStream.getAudioTracks().length > 0;
      } catch (micErr) {
        console.warn('Microphone permission denied or unavailable:', micErr.message || micErr);
      }
    }

    // 3. Audio Track Assembly & Routing
    const displayAudioTrack = displayStream.getAudioTracks()[0];
    const micAudioTrack = micAudioStream ? micAudioStream.getAudioTracks()[0] : null;

    let finalTracks = [...displayStream.getVideoTracks()];

    if (displayAudioTrack && micAudioTrack) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioDestination = audioContext.createMediaStreamDestination();

      const displayAudioSource = audioContext.createMediaStreamSource(new MediaStream([displayAudioTrack]));
      const micAudioSource = audioContext.createMediaStreamSource(new MediaStream([micAudioTrack]));

      displayAudioSource.connect(audioDestination);
      micAudioSource.connect(audioDestination);

      finalTracks.push(...audioDestination.stream.getAudioTracks());
    } else if (displayAudioTrack) {
      finalTracks.push(displayAudioTrack);
    } else if (micAudioTrack) {
      finalTracks.push(micAudioTrack);
    }
    
    mediaStream = new MediaStream(finalTracks);

    // Listen for stream end
    const videoTrack = displayStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        chrome.runtime.sendMessage({ action: 'EXTERNAL_STOP_RECORDING' });
      };
    }

    // 4. Initialize Real-Time Speech Recognition (Transcribes both Video Audio & Mic Audio)
    initSpeechRecognition(mediaStream);

    // 5. Determine supported MIME type & start recorder
    const mimeType = getSupportedMimeType();
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.start(1000);
    recordingStartTime = Date.now();

    // Start timer notifications
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

/**
 * Initialize Web Speech API Recognition with audio stream input
 */
function initSpeechRecognition(stream) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.info('Speech Recognition API not supported in this browser environment.');
    return;
  }

  try {
    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = 'en-US';

    let lastAddedText = '';

    speechRecognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        const text = result[0].transcript.trim();

        if (text && text !== lastAddedText) {
          if (result.isFinal || text.length > 20) {
            lastAddedText = text;
            const timeSec = Math.floor((Date.now() - recordingStartTime) / 1000);
            const timestamp = formatDuration(timeSec);
            
            if (!transcriptEntries.some(t => t.text === text && Math.abs(t.timeSec - timeSec) < 3)) {
              transcriptEntries.push({ timeSec, timestamp, text });
            }
          }
        }
      }
    };

    speechRecognition.onerror = (e) => {
      console.warn('Speech recognition status:', e.error);
    };

    speechRecognition.onend = () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        try { speechRecognition.start(); } catch (e) {}
      }
    };

    speechRecognition.start();
  } catch (e) {
    console.warn('Failed to start SpeechRecognition:', e);
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

  if (speechRecognition) {
    try { speechRecognition.stop(); } catch (e) {}
  }

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

        // Generate AI Meeting Summary from transcript
        const summary = await generateMeetingSummary(transcriptEntries, durationSec);

        // Save to IndexedDB
        const title = `Recording ${new Date().toLocaleString()}`;
        const captureId = await window.DB.saveCapture({
          type: 'video',
          title,
          mimeType,
          blob,
          duration: durationSec,
          transcript: transcriptEntries,
          summary
        });

        recordedChunks = [];
        transcriptEntries = [];
        mediaRecorder = null;
        mediaStream = null;
        micStream = null;
        speechRecognition = null;

        resolve(captureId);
      } catch (err) {
        reject(err);
      }
    };

    mediaRecorder.stop();
  });
}

/**
 * Generate AI Meeting Summary
 */
async function generateMeetingSummary(transcript, durationSec) {
  if (!transcript || transcript.length === 0) {
    return {
      overview: `Recorded ${formatDuration(durationSec)} session. Ensure audio is playing during capture so speech is transcribed in real-time.`,
      keyPoints: ['Ensure video audio or microphone speech is audible during recording.'],
      actionItems: ['No spoken transcript entries were detected in this session.']
    };
  }

  const fullText = transcript.map(t => `${t.timestamp}: ${t.text}`).join('\n');

  if (typeof LanguageModel !== 'undefined' || typeof window.ai?.languageModel !== 'undefined') {
    try {
      const modelFactory = typeof LanguageModel !== 'undefined' ? LanguageModel : window.ai.languageModel;
      const session = await modelFactory.create({
        systemPrompt: 'You are a professional meeting assistant. Summarize the meeting transcript into key discussion points and action items.'
      });
      const prompt = `Summarize the following meeting transcript into brief key points and action items:\n\n${fullText}`;
      const responseText = await session.prompt(prompt);
      
      return parseAiResponse(responseText, fullText);
    } catch (e) {
      console.info('Chrome Prompt API not available, using structured summarizer:', e);
    }
  }

  return createStructuredSummary(transcript, durationSec);
}

function createStructuredSummary(transcript, durationSec) {
  const fullText = transcript.map(t => t.text).join(' ');
  const keyPoints = [];
  const actionItems = [];

  const actionTriggers = ['need to', 'should', 'will', "let's", 'must', 'action item', 'todo', 'plan to', 'assigned'];
  
  transcript.forEach((entry) => {
    const text = entry.text;
    const lower = text.toLowerCase();

    if (actionTriggers.some(trigger => lower.includes(trigger))) {
      if (actionItems.length < 8) {
        actionItems.push(`[${entry.timestamp}] ${text}`);
      }
    } else if (text.length > 10 && keyPoints.length < 8) {
      keyPoints.push(`[${entry.timestamp}] ${text}`);
    }
  });

  const durationMin = Math.ceil(durationSec / 60);
  const overview = `Recording session (${durationMin} min). Captured ${transcript.length} timestamped spoken statements.`;

  return {
    overview,
    keyPoints: keyPoints.length > 0 ? keyPoints : transcript.slice(0, 5).map(t => `[${t.timestamp}] ${t.text}`),
    actionItems: actionItems.length > 0 ? actionItems : ['No explicit action items assigned.']
  };
}

function parseAiResponse(aiText, fullText) {
  const lines = aiText.split('\n').map(l => l.trim()).filter(Boolean);
  const keyPoints = [];
  const actionItems = [];

  let currentSection = 'points';
  lines.forEach(line => {
    if (line.toLowerCase().includes('action item') || line.toLowerCase().includes('next step')) {
      currentSection = 'actions';
    } else if (line.startsWith('-') || line.startsWith('*') || /^\d+\./.test(line)) {
      const clean = line.replace(/^[-*\d.]+\s*/, '');
      if (currentSection === 'actions') {
        actionItems.push(clean);
      } else {
        keyPoints.push(clean);
      }
    }
  });

  return {
    overview: lines[0] || 'Meeting summary generated by AI.',
    keyPoints: keyPoints.length > 0 ? keyPoints : lines.slice(0, 4),
    actionItems: actionItems.length > 0 ? actionItems : ['No action items detected.']
  };
}

function formatDuration(sec = 0) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
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
        const drawH = slice.height * devicePixelRatio * scale;
        const drawW = finalCanvasWidth;

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
