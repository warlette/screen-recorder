/**
 * IndexedDB storage utility for recordings and full-page screenshots.
 */
const DB_NAME = 'ScreenRecorderDB';
const DB_VERSION = 1;
const STORE_CAPTURES = 'captures';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_CAPTURES)) {
        const store = db.createObjectStore(STORE_CAPTURES, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveCapture(captureData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAPTURES, 'readwrite');
    const store = tx.objectStore(STORE_CAPTURES);
    
    // Ensure item has ID and timestamp
    const item = {
      id: captureData.id || `cap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: captureData.timestamp || Date.now(),
      title: captureData.title || (captureData.type === 'video' ? 'Screen Recording' : 'Page Screenshot'),
      type: captureData.type, // 'video' or 'image'
      mimeType: captureData.mimeType,
      blob: captureData.blob, // Blob object
      dataUrl: captureData.dataUrl || null, // Optional Data URL for images
      duration: captureData.duration || 0,
      width: captureData.width || 0,
      height: captureData.height || 0
    };

    const req = store.put(item);
    req.onsuccess = () => resolve(item.id);
    req.onerror = () => reject(req.error);
  });
}

async function getCapture(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAPTURES, 'readonly');
    const store = tx.objectStore(STORE_CAPTURES);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllCaptures() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAPTURES, 'readonly');
    const store = tx.objectStore(STORE_CAPTURES);
    const index = store.index('timestamp');
    const req = index.getAll();
    req.onsuccess = () => resolve(req.result.reverse()); // latest first
    req.onerror = () => reject(req.error);
  });
}

async function deleteCapture(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAPTURES, 'readwrite');
    const store = tx.objectStore(STORE_CAPTURES);
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

if (typeof window !== 'undefined') {
  window.DB = {
    saveCapture,
    getCapture,
    getAllCaptures,
    deleteCapture
  };
}
