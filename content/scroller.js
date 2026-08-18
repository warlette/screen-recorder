/**
 * Content Script for Full-Page Scrolling Capture.
 * Fast, optimized layout measurement, viewport scrolling, fixed element handling,
 * and page restoration.
 */

(() => {
  // executeScript() is invoked for each capture. Keep a single listener in the
  // isolated extension world when the same page is captured more than once.
  if (globalThis.__captureStudioScrollerInstalled) return;
  globalThis.__captureStudioScrollerInstalled = true;

  // Register the page-capture message listener.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      if (message.action === 'GET_PAGE_DIMENSIONS') {
        const dimensions = getPageDimensions();
        sendResponse(dimensions);
        return true;
      }

      if (message.action === 'PREPARE_PAGE') {
        preparePageForCapture();
        sendResponse({ success: true });
        return true;
      }

      if (message.action === 'SCROLL_TO') {
        scrollToPosition(message.y)
          .then((actualY) => sendResponse({ success: true, actualY }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
      }

      if (message.action === 'RESTORE_PAGE') {
        restorePageAfterCapture(message.originalY);
        sendResponse({ success: true });
        return true;
      }
    } catch (err) {
      console.error('Error in scroller message handler:', err);
      sendResponse({ success: false, error: err.message });
      return true;
    }
  });

  let hiddenStickyElements = [];
  let originalScrollY = 0;

  function getPageDimensions() {
    originalScrollY = window.scrollY || window.pageYOffset || 0;
    
    const body = document.body || document.documentElement;
    const html = document.documentElement || document.body;

    const fullHeight = Math.max(
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
      html ? html.clientHeight : 0,
      html ? html.scrollHeight : 0,
      html ? html.offsetHeight : 0,
      1
    );

    const fullWidth = Math.max(
      body ? body.scrollWidth : 0,
      body ? body.offsetWidth : 0,
      html ? html.clientWidth : 0,
      html ? html.scrollWidth : 0,
      html ? html.offsetWidth : 0,
      1
    );

    const viewportWidth = window.innerWidth || (html ? html.clientWidth : 1280);
    const viewportHeight = window.innerHeight || (html ? html.clientHeight : 800);
    const devicePixelRatio = window.devicePixelRatio || 1;
    const pageTitle = document.title || 'Page Screenshot';

    return {
      fullWidth,
      fullHeight,
      viewportWidth,
      viewportHeight,
      devicePixelRatio,
      originalScrollY,
      pageTitle
    };
  }

  function preparePageForCapture() {
    originalScrollY = window.scrollY || window.pageYOffset || 0;
    hiddenStickyElements = [];

    // Target relevant header/fixed/sticky containers only (avoids checking 10,000+ DOM nodes)
    const candidates = document.querySelectorAll('header, nav, [class*="header"], [class*="nav"], [class*="sticky"], [class*="fixed"], [id*="header"], [id*="nav"]');
    
    candidates.forEach((el) => {
      try {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'sticky') {
          hiddenStickyElements.push({ element: el, origVisibility: el.style.visibility });
        }
      } catch (e) {}
    });
  }

  async function scrollToPosition(y) {
    window.scrollTo(0, y);

    // Browsers clamp scroll requests at the bottom of the document. The
    // actual offset must be used when placing this viewport on the canvas.
    const actualY = window.scrollY || window.pageYOffset || 0;

    // Hide fixed headers on scrolled positions to avoid multi-slice duplicates
    if (actualY > 0) {
      hiddenStickyElements.forEach(({ element }) => {
        try { element.style.visibility = 'hidden'; } catch (e) {}
      });
    } else {
      hiddenStickyElements.forEach(({ element, origVisibility }) => {
        try { element.style.visibility = origVisibility || ''; } catch (e) {}
      });
    }

    // Respect captureVisibleTab's rate limit and allow lazy content to paint.
    await new Promise((resolve) => setTimeout(resolve, 550));
    return window.scrollY || window.pageYOffset || actualY;
  }

  function restorePageAfterCapture(originalY = 0) {
    hiddenStickyElements.forEach(({ element, origVisibility }) => {
      try { element.style.visibility = origVisibility || ''; } catch (e) {}
    });
    hiddenStickyElements = [];

    window.scrollTo(0, originalY || originalScrollY);
  }
})();
