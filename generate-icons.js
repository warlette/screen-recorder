const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const buf = Buffer.concat([typeBuf, data]);
  
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function generateKinPakuPng(size) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;  // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdrChunk = createChunk('IHDR', ihdrData);

  const rowSize = 1 + size * 4;
  const rawData = Buffer.alloc(size * rowSize);
  
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size * 0.42;
  const goldRingWidth = Math.max(1, size * 0.08);
  const innerDotRadius = size * 0.22;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter 0
    for (let x = 0; x < size; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Kin-paku Obsidian Dark #0A0B0E base
      let r = 10, g = 11, b = 14, a = 255;
      
      const insideCard = (x >= 1 && x < size - 1 && y >= 1 && y < size - 1);
      
      if (insideCard) {
        if (dist <= outerRadius) {
          if (dist >= outerRadius - goldRingWidth) {
            // Kin-paku Metallic Gold Leaf #D4AF37
            r = 212; g = 175; b = 55;
          } else if (dist <= innerDotRadius) {
            // Recording Red Core #EF4444
            r = 239; g = 68; b = 68;
          } else {
            // Deep Slate Surface #14151D
            r = 20; g = 21; b = 29;
          }
        }
      } else {
        a = 0; // Transparent rounded corners
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const pngBuf = generateKinPakuPng(size);
  const filePath = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(filePath, pngBuf);
  console.log(`Generated Kin-paku Icon ${filePath}`);
});
