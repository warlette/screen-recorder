/**
 * Preview Player & Viewer Controller.
 * Handles Video Playback, AI Meeting Summaries, Timestamped Transcripts,
 * and Gallery Navigation.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  let currentCaptureId = urlParams.get('id');
  let currentItem = null;
  let zoomScale = 1.0;

  // Elements
  const captureTitleInput = document.getElementById('captureTitleInput');
  const captureMeta = document.getElementById('captureMeta');

  const btnCopy = document.getElementById('btnCopy');
  const btnDelete = document.getElementById('btnDelete');
  const btnDownload = document.getElementById('btnDownload');

  const loadingSpinner = document.getElementById('loadingSpinner');
  const videoContainer = document.getElementById('videoContainer');
  const videoPlayer = document.getElementById('videoPlayer');

  const imageContainer = document.getElementById('imageContainer');
  const imageViewer = document.getElementById('imageViewer');

  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnResetZoom = document.getElementById('btnResetZoom');
  const zoomLevelText = document.getElementById('zoomLevel');

  const errorState = document.getElementById('errorState');
  const sidebarList = document.getElementById('sidebarList');
  const toast = document.getElementById('toast');

  // View Tabs
  const viewTabBtns = document.querySelectorAll('.view-tab-btn');
  const viewPanels = document.querySelectorAll('.view-panel');

  // Meeting Intelligence Elements
  const transcriptCount = document.getElementById('transcriptCount');
  const transcriptList = document.getElementById('transcriptList');
  const transcriptSearch = document.getElementById('transcriptSearch');
  const btnExportTranscript = document.getElementById('btnExportTranscript');

  const summaryOverview = document.getElementById('summaryOverview');
  const summaryKeyPoints = document.getElementById('summaryKeyPoints');
  const summaryActionItems = document.getElementById('summaryActionItems');
  const btnExportSummary = document.getElementById('btnExportSummary');

  // Handle Inner View Tabs Switching
  viewTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.getAttribute('data-view');
      viewTabBtns.forEach(b => b.classList.remove('active'));
      viewPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetView).classList.add('active');
    });
  });

  // Load initial capture
  await loadCapture(currentCaptureId);
  await refreshSidebarList();

  // Title rename
  captureTitleInput.addEventListener('change', async () => {
    if (!currentItem) return;
    currentItem.title = captureTitleInput.value.trim() || 'Untitled Media';
    await window.DB.saveCapture(currentItem);
    showToast('Title updated');
    await refreshSidebarList();
  });

  // Download Media
  btnDownload.addEventListener('click', () => {
    if (!currentItem || !currentItem.blob) {
      showToast('No media file to download.');
      return;
    }

    const objectUrl = URL.createObjectURL(currentItem.blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    
    const ext = currentItem.type === 'video' ? 'webm' : 'png';
    const sanitizeTitle = (currentItem.title || 'capture').replace(/[^a-z0-9_-]/gi, '_');
    a.download = `${sanitizeTitle}.${ext}`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    showToast('Download started!');
  });

  // Copy Image to Clipboard
  btnCopy.addEventListener('click', async () => {
    if (!currentItem || currentItem.type !== 'image' || !currentItem.blob) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': currentItem.blob })
      ]);
      showToast('Image copied to clipboard!');
    } catch (err) {
      showToast('Failed to copy to clipboard.');
    }
  });

  // Delete Capture
  btnDelete.addEventListener('click', async () => {
    if (!currentItem) return;
    if (confirm(`Are you sure you want to delete "${currentItem.title}"?`)) {
      await window.DB.deleteCapture(currentItem.id);
      showToast('Item deleted.');
      
      const remaining = await window.DB.getAllCaptures();
      if (remaining.length > 0) {
        await loadCapture(remaining[0].id);
        await refreshSidebarList();
      } else {
        showError('No media captures found.');
        await refreshSidebarList();
      }
    }
  });

  // Export Transcript
  btnExportTranscript.addEventListener('click', () => {
    if (!currentItem || !currentItem.transcript || currentItem.transcript.length === 0) {
      showToast('No transcript available to export.');
      return;
    }

    const textLines = currentItem.transcript.map(t => `[${t.timestamp}] ${t.text}`).join('\n');
    const blob = new Blob([textLines], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = objectUrl;
    const sanitizeTitle = (currentItem.title || 'transcript').replace(/[^a-z0-9_-]/gi, '_');
    a.download = `${sanitizeTitle}_transcript.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    showToast('Transcript exported!');
  });

  // Copy AI Summary
  btnExportSummary.addEventListener('click', async () => {
    if (!currentItem || !currentItem.summary) {
      showToast('No summary available to copy.');
      return;
    }

    const s = currentItem.summary;
    const summaryText = `AI MEETING SUMMARY\n\nOverview:\n${s.overview}\n\nKey Points:\n${s.keyPoints.join('\n')}\n\nAction Items:\n${s.actionItems.join('\n')}`;

    try {
      await navigator.clipboard.writeText(summaryText);
      showToast('Summary copied to clipboard!');
    } catch (e) {
      showToast('Failed to copy summary.');
    }
  });

  // Transcript Search Filter
  transcriptSearch.addEventListener('input', () => {
    if (!currentItem || !currentItem.transcript) return;
    renderTranscriptList(currentItem.transcript, transcriptSearch.value.trim().toLowerCase());
  });

  // Zoom Controls for Screenshots
  btnZoomIn.addEventListener('click', () => {
    zoomScale = Math.min(zoomScale + 0.25, 3.0);
    updateZoom();
  });

  btnZoomOut.addEventListener('click', () => {
    zoomScale = Math.max(zoomScale - 0.25, 0.25);
    updateZoom();
  });

  btnResetZoom.addEventListener('click', () => {
    zoomScale = 1.0;
    updateZoom();
  });

  function updateZoom() {
    imageViewer.style.transform = `scale(${zoomScale})`;
    zoomLevelText.textContent = `${Math.round(zoomScale * 100)}%`;
  }

  /**
   * Load specific capture item by ID
   */
  async function loadCapture(id) {
    hideAllViews();
    loadingSpinner.classList.remove('hidden');

    if (!id) {
      const all = await window.DB.getAllCaptures();
      if (all && all.length > 0) {
        id = all[0].id;
      } else {
        showError('No captures available.');
        return;
      }
    }

    try {
      currentItem = await window.DB.getCapture(id);
      if (!currentItem) {
        showError('Capture item not found.');
        return;
      }

      currentCaptureId = currentItem.id;
      captureTitleInput.value = currentItem.title || 'Untitled Media';
      document.title = `${currentItem.title} - Studio Capture`;

      loadingSpinner.classList.add('hidden');

      if (currentItem.type === 'video') {
        const videoUrl = URL.createObjectURL(currentItem.blob);
        videoPlayer.src = videoUrl;
        videoContainer.classList.remove('hidden');
        btnCopy.classList.add('hidden');
        
        const durationStr = formatDuration(currentItem.duration);
        captureMeta.textContent = `Video • ${durationStr} • ${formatBytes(currentItem.blob?.size || 0)}`;

        // Render AI Intelligence & Transcript
        const transcript = currentItem.transcript || [];
        transcriptCount.textContent = transcript.length;
        renderTranscriptList(transcript);

        const summary = currentItem.summary || { overview: 'No summary generated.', keyPoints: [], actionItems: [] };
        renderSummary(summary);
      } else if (currentItem.type === 'image') {
        const imageUrl = URL.createObjectURL(currentItem.blob);
        imageViewer.src = imageUrl;
        imageContainer.classList.remove('hidden');
        btnCopy.classList.remove('hidden');

        zoomScale = 1.0;
        updateZoom();

        captureMeta.textContent = `PNG Image • ${currentItem.width || '?'}x${currentItem.height || '?'} • ${formatBytes(currentItem.blob?.size || 0)}`;
      }
    } catch (err) {
      console.error('Error loading capture:', err);
      showError('Failed to load media file.');
    }
  }

  /**
   * Render Timestamped Interactive Transcript List
   */
  function renderTranscriptList(transcript = [], filterQuery = '') {
    transcriptList.innerHTML = '';

    if (!transcript || transcript.length === 0) {
      transcriptList.innerHTML = '<div class="empty-state">No spoken audio detected during this recording.</div>';
      return;
    }

    const filtered = filterQuery
      ? transcript.filter(t => t.text.toLowerCase().includes(filterQuery))
      : transcript;

    if (filtered.length === 0) {
      transcriptList.innerHTML = '<div class="empty-state">No matching transcript lines found.</div>';
      return;
    }

    filtered.forEach((entry) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'transcript-item';

      itemEl.innerHTML = `
        <span class="timestamp-tag" title="Click to jump to ${entry.timestamp}">${entry.timestamp}</span>
        <span class="transcript-text">${escapeHtml(entry.text)}</span>
      `;

      // Jump video playback to exact timestamp on click!
      itemEl.querySelector('.timestamp-tag').addEventListener('click', () => {
        if (videoPlayer && !isNaN(entry.timeSec)) {
          videoPlayer.currentTime = entry.timeSec;
          videoPlayer.play();
          
          // Switch to video tab view
          document.querySelector('.view-tab-btn[data-view="view-video"]').click();
          showToast(`Jumped to ${entry.timestamp}`);
        }
      });

      transcriptList.appendChild(itemEl);
    });
  }

  /**
   * Render AI Meeting Summary
   */
  function renderSummary(summary) {
    summaryOverview.textContent = summary.overview || 'Meeting overview unavailable.';

    // Key points
    summaryKeyPoints.innerHTML = '';
    if (summary.keyPoints && summary.keyPoints.length > 0) {
      summary.keyPoints.forEach(pt => {
        const li = document.createElement('li');
        li.textContent = pt;
        summaryKeyPoints.appendChild(li);
      });
    } else {
      summaryKeyPoints.innerHTML = '<li>No specific key points generated.</li>';
    }

    // Action items
    summaryActionItems.innerHTML = '';
    if (summary.actionItems && summary.actionItems.length > 0) {
      summary.actionItems.forEach(act => {
        const li = document.createElement('li');
        li.textContent = act;
        summaryActionItems.appendChild(li);
      });
    } else {
      summaryActionItems.innerHTML = '<li>No action items assigned.</li>';
    }
  }

  /**
   * Populate sidebar gallery list
   */
  async function refreshSidebarList() {
    try {
      const items = await window.DB.getAllCaptures();
      sidebarList.innerHTML = '';

      if (!items || items.length === 0) {
        sidebarList.innerHTML = '<div class="sidebar-sub" style="padding:10px;">No captures saved.</div>';
        return;
      }

      items.forEach((item) => {
        const el = document.createElement('div');
        el.className = `sidebar-item ${item.id === currentCaptureId ? 'active' : ''}`;
        
        const dateStr = new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
        const iconSvg = item.type === 'video'
          ? `<svg class="sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`
          : `<svg class="sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;

        el.innerHTML = `
          ${iconSvg}
          <div class="sidebar-info">
            <span class="sidebar-title">${escapeHtml(item.title)}</span>
            <span class="sidebar-sub">${dateStr} • ${item.type === 'video' ? formatDuration(item.duration) : 'Screenshot'}</span>
          </div>
        `;

        el.addEventListener('click', () => {
          if (item.id !== currentCaptureId) {
            history.pushState(null, '', `preview.html?id=${item.id}`);
            loadCapture(item.id);
            refreshSidebarList();
          }
        });

        sidebarList.appendChild(el);
      });
    } catch (e) {
      sidebarList.innerHTML = '<div class="sidebar-sub">Failed to load gallery.</div>';
    }
  }

  function hideAllViews() {
    loadingSpinner.classList.add('hidden');
    videoContainer.classList.add('hidden');
    imageContainer.classList.add('hidden');
    errorState.classList.add('hidden');
  }

  function showError(msg) {
    hideAllViews();
    errorState.classList.remove('hidden');
    errorState.querySelector('p').textContent = msg;
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2500);
  }

  function formatDuration(sec = 0) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
