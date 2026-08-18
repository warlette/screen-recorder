import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('/Users/warlette/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const root = '/Users/warlette/Devs/my-projects/chrome-extension/screen-recorder';
const out = path.join(root, 'store-assets');
const shots = path.join(out, 'screenshots');
const iconDir = path.join(root, 'icons');
await fs.mkdir(shots, { recursive: true });

const fontRegular = (await fs.readFile('/Users/warlette/.codex/skills/canvas-design/canvas-fonts/InstrumentSans-Regular.ttf')).toString('base64');
const fontBold = (await fs.readFile('/Users/warlette/.codex/skills/canvas-design/canvas-fonts/InstrumentSans-Bold.ttf')).toString('base64');

const C = {
  ink: '#08090C', surface: '#111218', raised: '#1A1B23', ivory: '#F8F6F0',
  secondary: '#C4C0B5', muted: '#827E74', gold: '#D4AF37', goldLight: '#F6E6B4',
  goldDark: '#9E7D2B', red: '#EF4444', blue: '#4E7CF6'
};

function defs() {
  return `<defs>
    <style>
      @font-face{font-family:Instrument;src:url(data:font/ttf;base64,${fontRegular})}
      @font-face{font-family:Instrument;src:url(data:font/ttf;base64,${fontBold});font-weight:700}
      text{font-family:Instrument,Arial,sans-serif}
    </style>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F6E6B4"/><stop offset=".5" stop-color="#D4AF37"/><stop offset="1" stop-color="#9E7D2B"/>
    </linearGradient>
    <radialGradient id="aura" cx="50%" cy="45%" r="58%">
      <stop offset="0" stop-color="#D4AF37" stop-opacity=".15"/><stop offset="1" stop-color="#08090C" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity=".55"/>
    </filter>
  </defs>`;
}

function mark(x, y, size, { label = false } = {}) {
  const s = size / 96;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <rect width="96" height="96" rx="24" fill="#0A0B0E" stroke="url(#gold)" stroke-width="2"/>
    <path d="M18 20h60" stroke="#F6E6B4" stroke-width="2" stroke-linecap="round" opacity=".78"/>
    <rect x="24" y="30" width="48" height="33" rx="7" fill="#111218" stroke="#F6E6B4" stroke-width="4"/>
    <path d="M40 73h16M48 63v10" stroke="#D4AF37" stroke-width="4" stroke-linecap="round"/>
    <circle cx="62" cy="41" r="6" fill="#EF4444" stroke="#F8F6F0" stroke-width="2"/>
  </g>${label ? `<text x="${x + size + 18}" y="${y + size * .62}" fill="${C.ivory}" font-size="26" font-weight="700" letter-spacing=".8">Capture Studio</text>` : ''}`;
}

function bg(w, h) {
  return `<rect width="${w}" height="${h}" fill="${C.ink}"/>
    <rect width="${w}" height="${h}" fill="url(#aura)"/>
    <path d="M0 72H${w}" stroke="#D4AF37" stroke-opacity=".18"/>
    <path d="M${Math.round(w*.08)} 72H${Math.round(w*.42)}" stroke="url(#gold)" stroke-opacity=".72"/>
    <path d="M0 ${h-48}H${w}" stroke="#D4AF37" stroke-opacity=".12"/>`;
}

function browser(x, y, w, h, title = 'Capture Studio') {
  return `<g filter="url(#shadow)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${C.surface}" stroke="#D4AF37" stroke-opacity=".28"/>
    <path d="M${x} ${y+48}H${x+w}" stroke="#D4AF37" stroke-opacity=".2"/>
    <circle cx="${x+22}" cy="${y+24}" r="6" fill="#EF4444"/><circle cx="${x+42}" cy="${y+24}" r="6" fill="#D4AF37"/><circle cx="${x+62}" cy="${y+24}" r="6" fill="#6BAA75"/>
    <text x="${x+86}" y="${y+31}" fill="${C.secondary}" font-size="14">${title}</text>
  </g>`;
}

function header(w, index, title, subtitle) {
  return `${mark(64, 18, 40, { label: true })}
    <text x="64" y="170" fill="${C.goldLight}" font-size="15" font-weight="700" letter-spacing="3">0${index} / 05</text>
    <text x="64" y="232" fill="${C.ivory}" font-size="48" font-weight="700" letter-spacing="-1.3">${title}</text>
    <text x="66" y="272" fill="${C.secondary}" font-size="19">${subtitle}</text>`;
}

function popupUI(x, y, w, h, active = 'record') {
  const tabW = (w - 48) / 3;
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${C.surface}" stroke="#D4AF37" stroke-opacity=".36"/>
    ${mark(x+22,y+18,34)}
    <text x="${x+68}" y="${y+42}" fill="${C.ivory}" font-size="16" font-weight="700">CAPTURE STUDIO</text>
    <text x="${x+w-50}" y="${y+39}" fill="${C.gold}" font-size="12">LOCAL</text>
    <path d="M${x} ${y+68}H${x+w}" stroke="#D4AF37" stroke-opacity=".18"/>
    ${['Record','Screenshot','History'].map((t,i)=>`<rect x="${x+18+i*tabW}" y="${y+82}" width="${tabW-8}" height="38" rx="6" fill="${(active==='record'&&i===0)||(active==='shot'&&i===1)||(active==='history'&&i===2)?C.raised:'transparent'}" stroke="#D4AF37" stroke-opacity="${(active==='record'&&i===0)||(active==='shot'&&i===1)||(active==='history'&&i===2)?.35:0}"/><text x="${x+18+i*tabW+(tabW-8)/2}" y="${y+107}" text-anchor="middle" fill="${(active==='record'&&i===0)||(active==='shot'&&i===1)||(active==='history'&&i===2)?C.goldLight:C.secondary}" font-size="13">${t}</text>`).join('')}
  </g>`;
}

function shot1() {
  const w=1280,h=800; return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs()}${bg(w,h)}${header(w,1,'Record any screen.','One deliberate picker. Screen, window, or current tab.')}
    ${browser(548,128,650,570,'Screen Recording — Capture Studio')}
    <g transform="translate(548 176)">
      <rect width="650" height="522" fill="#0A0B0E"/>
      <rect x="78" y="64" width="494" height="374" rx="16" fill="#12131A" stroke="#D4AF37" stroke-opacity=".34"/>
      <path d="M158 64H492" stroke="url(#gold)"/>
      ${mark(281,108,88)}
      <text x="325" y="245" text-anchor="middle" fill="${C.ivory}" font-size="30" font-weight="700">Record screen or window</text>
      <text x="325" y="280" text-anchor="middle" fill="${C.secondary}" font-size="16">Choose one source. The controller minimizes automatically.</text>
      <rect x="150" y="326" width="350" height="54" rx="8" fill="url(#gold)"/>
      <text x="325" y="360" text-anchor="middle" fill="${C.ink}" font-size="16" font-weight="700">Choose Source &amp; Start</text>
    </g>
    <g transform="translate(64 330)">
      <rect width="384" height="250" rx="14" fill="#111218" stroke="#D4AF37" stroke-opacity=".22"/>
      <rect x="24" y="28" width="336" height="170" rx="10" fill="#1A1B23"/>
      <rect x="42" y="48" width="138" height="92" rx="7" fill="#252735" stroke="#F6E6B4" stroke-opacity=".45"/>
      <rect x="198" y="48" width="144" height="92" rx="7" fill="#20222D"/>
      <circle cx="111" cy="94" r="11" fill="#EF4444"/>
      <text x="192" y="226" text-anchor="middle" fill="${C.goldLight}" font-size="14" letter-spacing="1">ONE PICKER · ONE RECORDING</text>
    </g></svg>`;
}

function shot2() {
  const w=1280,h=800; return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${defs()}${bg(w,h)}${header(w,2,'Capture the current tab.','Video and tab audio stay focused on the page you choose.')}
    <g transform="translate(690 122)">${popupUI(0,0,430,568,'record')}
      <text x="30" y="164" fill="${C.muted}" font-size="12" letter-spacing="1.4">RECORD SOURCE</text>
      <rect x="28" y="184" width="374" height="58" rx="9" fill="#08090C" stroke="#D4AF37" stroke-opacity=".24"/>
      <rect x="220" y="190" width="174" height="46" rx="7" fill="#1B1C25" stroke="#D4AF37" stroke-opacity=".42"/>
      <text x="120" y="220" text-anchor="middle" fill="${C.secondary}" font-size="14">Screen / Window</text>
      <text x="307" y="220" text-anchor="middle" fill="${C.goldLight}" font-size="14" font-weight="700">Current Tab</text>
      <text x="30" y="282" fill="${C.muted}" font-size="12" letter-spacing="1.4">AUDIO INPUTS</text>
      <rect x="28" y="302" width="374" height="58" rx="9" fill="#14151D"/>
      <text x="52" y="338" fill="${C.ivory}" font-size="15">Source Audio</text><rect x="350" y="319" width="34" height="20" rx="10" fill="${C.gold}"/><circle cx="374" cy="329" r="7" fill="#0A0B0E"/>
      <rect x="28" y="372" width="374" height="58" rx="9" fill="#14151D"/>
      <text x="52" y="408" fill="${C.ivory}" font-size="15">Microphone Audio</text><rect x="350" y="389" width="34" height="20" rx="10" fill="#2A2B34"/><circle cx="360" cy="399" r="7" fill="#827E74"/>
      <rect x="28" y="470" width="374" height="58" rx="8" fill="url(#gold)"/>
      <text x="215" y="507" text-anchor="middle" fill="${C.ink}" font-size="16" font-weight="700">Start Recording</text>
    </g>
    <g transform="translate(70 370)"><path d="M0 120C120 25 260 26 445 110" fill="none" stroke="#D4AF37" stroke-opacity=".32" stroke-width="2"/><circle cx="0" cy="120" r="8" fill="#EF4444"/><circle cx="445" cy="110" r="8" fill="#D4AF37"/><text x="0" y="164" fill="${C.secondary}" font-size="16">Tab video</text><text x="367" y="154" fill="${C.secondary}" font-size="16">Local WebM</text></g>
    </svg>`;
}

function shot3() {
  const w=1280,h=800; return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${defs()}${bg(w,h)}${header(w,3,'Capture the full page.','Scroll, stitch, restore—then inspect one continuous PNG.')}
    ${browser(560,116,650,612,'Full Page Screenshot — Capture Studio')}
    <g transform="translate(560 164)"><rect width="650" height="564" fill="#050508"/>
      <rect x="118" y="22" width="414" height="520" rx="8" fill="#F8F6F0"/>
      <rect x="118" y="22" width="414" height="58" fill="#111827"/><rect x="146" y="43" width="96" height="12" rx="6" fill="#D4AF37"/>
      <rect x="152" y="112" width="186" height="20" rx="4" fill="#151824"/><rect x="152" y="146" width="320" height="8" rx="4" fill="#B9BCC5"/><rect x="152" y="164" width="278" height="8" rx="4" fill="#D4D6DB"/>
      <rect x="152" y="202" width="98" height="72" rx="8" fill="#F2E8C9"/><rect x="268" y="202" width="98" height="72" rx="8" fill="#ECEEF3"/><rect x="384" y="202" width="98" height="72" rx="8" fill="#F2E8C9"/>
      <rect x="152" y="310" width="330" height="14" rx="4" fill="#171923"/><rect x="152" y="342" width="330" height="104" rx="8" fill="#E8EAF0"/>
      <rect x="152" y="470" width="210" height="8" rx="4" fill="#C6C8CF"/><rect x="152" y="488" width="298" height="8" rx="4" fill="#D4D6DB"/>
      <path d="M94 42v480" stroke="#D4AF37" stroke-dasharray="4 10"/><circle cx="94" cy="42" r="6" fill="#D4AF37"/><circle cx="94" cy="522" r="6" fill="#EF4444"/>
    </g>
    <g transform="translate(68 354)">${popupUI(0,0,390,330,'shot')}<rect x="24" y="150" width="342" height="86" rx="10" fill="#1A1B23" stroke="#D4AF37" stroke-opacity=".25"/><text x="195" y="184" text-anchor="middle" fill="${C.ivory}" font-size="17" font-weight="700">Full Page Capture</text><text x="195" y="211" text-anchor="middle" fill="${C.secondary}" font-size="13">Visible width · automatic restoration</text><rect x="24" y="254" width="342" height="48" rx="8" fill="url(#gold)"/><text x="195" y="285" text-anchor="middle" fill="${C.ink}" font-size="14" font-weight="700">Capture Full Page</text></g>
    </svg>`;
}

function shot4() {
  const w=1280,h=800; return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${defs()}${bg(w,h)}${header(w,4,'Preview &amp; export.','Inspect, rename, download, or delete.')}
    ${browser(466,112,744,620,'Media Preview — Capture Studio')}
    <g transform="translate(466 160)">
      <rect width="744" height="572" fill="#07080B"/>
      <rect width="744" height="66" fill="#0D0E14"/><path d="M0 66h744" stroke="#D4AF37" stroke-opacity=".25"/>
      ${mark(22,15,34)}<text x="68" y="38" fill="${C.goldLight}" font-size="16" font-weight="700">Capture Studio</text>
      <rect x="445" y="16" width="80" height="34" rx="6" fill="#14151D"/><text x="485" y="38" text-anchor="middle" fill="${C.secondary}" font-size="12">Copy</text>
      <rect x="535" y="16" width="82" height="34" rx="6" fill="#14151D" stroke="#EF4444" stroke-opacity=".4"/><text x="576" y="38" text-anchor="middle" fill="#EF7A7A" font-size="12">Delete</text>
      <rect x="627" y="16" width="92" height="34" rx="6" fill="url(#gold)"/><text x="673" y="38" text-anchor="middle" fill="${C.ink}" font-size="12" font-weight="700">Download</text>
      <rect x="24" y="96" width="492" height="400" rx="10" fill="#050508" stroke="#D4AF37" stroke-opacity=".2"/>
      <rect x="54" y="126" width="432" height="242" rx="8" fill="#171923"/><circle cx="270" cy="247" r="38" fill="#D4AF37"/><path d="M258 225l30 22-30 22z" fill="#08090C"/>
      <rect x="54" y="394" width="432" height="6" rx="3" fill="#2A2B34"/><rect x="54" y="394" width="184" height="6" rx="3" fill="#D4AF37"/>
      <text x="54" y="438" fill="${C.ivory}" font-size="17" font-weight="700">Product walkthrough</text><text x="54" y="465" fill="${C.secondary}" font-size="13">Video · 02:18 · 34.2 MB</text>
      <rect x="540" y="96" width="180" height="400" rx="10" fill="#111218"/>
      <text x="560" y="128" fill="${C.goldLight}" font-size="13" font-weight="700" letter-spacing="1">ALL CAPTURES</text>
      ${[0,1,2,3].map((i)=>`<rect x="552" y="${150+i*76}" width="156" height="62" rx="7" fill="${i===0?'#1D1E29':'#14151D'}" stroke="#D4AF37" stroke-opacity="${i===0?.28:0}"/><rect x="564" y="${164+i*76}" width="34" height="34" rx="6" fill="#0A0B0E"/><circle cx="581" cy="${181+i*76}" r="6" fill="${i<2?C.red:C.gold}"/><text x="608" y="${176+i*76}" fill="${C.ivory}" font-size="11">${i<2?'Recording':'Screenshot'} ${i+1}</text><text x="608" y="${194+i*76}" fill="${C.muted}" font-size="10">Today · local</text>`).join('')}
    </g>
    </svg>`;
}

function shot5() {
  const w=1280,h=800; return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${defs()}${bg(w,h)}${header(w,5,'Local by design.','Your captures stay in browser storage until you export or delete them.')}
    <g transform="translate(630 136)">
      <circle cx="250" cy="250" r="216" fill="#111218" stroke="#D4AF37" stroke-opacity=".16"/>
      <circle cx="250" cy="250" r="166" fill="#0A0B0E" stroke="#D4AF37" stroke-opacity=".32"/>
      ${mark(186,118,128)}
      <path d="M250 270v92" stroke="#D4AF37" stroke-width="4" stroke-linecap="round"/><path d="M222 338l28 28 28-28" fill="none" stroke="#D4AF37" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="134" y="382" width="232" height="76" rx="12" fill="#1A1B23" stroke="#D4AF37" stroke-opacity=".35"/>
      <text x="250" y="415" text-anchor="middle" fill="${C.goldLight}" font-size="14" font-weight="700" letter-spacing="1.4">INDEXEDDB</text>
      <text x="250" y="440" text-anchor="middle" fill="${C.secondary}" font-size="13">On this device</text>
    </g>
    <g transform="translate(70 346)">
      ${[['NO TRACKERS','No analytics or ads'],['NO UPLOADS','No remote capture server'],['YOUR CONTROL','Download or delete anytime']].map((a,i)=>`<g transform="translate(0 ${i*104})"><rect width="450" height="82" rx="12" fill="#111218" stroke="#D4AF37" stroke-opacity=".2"/><circle cx="38" cy="41" r="12" fill="#0A0B0E" stroke="#D4AF37"/><path d="M32 41l4 4 8-9" fill="none" stroke="#F6E6B4" stroke-width="2"/><text x="68" y="35" fill="${C.goldLight}" font-size="13" font-weight="700" letter-spacing="1.4">${a[0]}</text><text x="68" y="58" fill="${C.secondary}" font-size="14">${a[1]}</text></g>`).join('')}
    </g></svg>`;
}

function smallPromo() {
  const w=440,h=280; return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${defs()}<rect width="440" height="280" fill="#08090C"/><rect width="440" height="280" fill="url(#aura)"/><path d="M26 32h142M272 248h142" stroke="url(#gold)"/><rect x="86" y="42" width="268" height="196" rx="28" fill="#111218" stroke="#D4AF37" stroke-opacity=".22"/><rect x="118" y="70" width="204" height="140" rx="20" fill="#0A0B0E" stroke="#D4AF37" stroke-opacity=".38"/>${mark(172,92,96)}<circle cx="326" cy="58" r="7" fill="#EF4444"/><circle cx="114" cy="222" r="4" fill="#D4AF37"/></svg>`;
}

function marquee() {
  const w=1400,h=560; return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${defs()}<rect width="1400" height="560" fill="#08090C"/><rect width="1400" height="560" fill="url(#aura)"/><path d="M0 62h470M930 498h470" stroke="url(#gold)" opacity=".72"/><g transform="translate(104 118)">${mark(0,0,112)}<text x="0" y="180" fill="${C.goldLight}" font-size="16" font-weight="700" letter-spacing="4">CAPTURE STUDIO</text><text x="0" y="242" fill="${C.ivory}" font-size="54" font-weight="700" letter-spacing="-1.4">Record. Capture.</text><text x="0" y="302" fill="${C.ivory}" font-size="54" font-weight="700" letter-spacing="-1.4">Keep it local.</text><text x="2" y="350" fill="${C.secondary}" font-size="20">Screen · Window · Tab · Full page</text></g><g transform="translate(770 72)" filter="url(#shadow)"><rect width="520" height="416" rx="28" fill="#111218" stroke="#D4AF37" stroke-opacity=".3"/><rect x="38" y="42" width="444" height="278" rx="18" fill="#1A1B23"/><rect x="66" y="70" width="180" height="126" rx="12" fill="#242632" stroke="#F6E6B4" stroke-opacity=".48"/><rect x="274" y="70" width="180" height="126" rx="12" fill="#20222C"/><rect x="66" y="220" width="388" height="72" rx="12" fill="#0A0B0E"/><circle cx="156" cy="133" r="18" fill="#EF4444"/><circle cx="364" cy="133" r="18" fill="#D4AF37"/><path d="M88 256h342" stroke="#D4AF37" stroke-dasharray="5 10"/><rect x="134" y="344" width="252" height="16" rx="8" fill="url(#gold)"/></g></svg>`;
}

async function render(svg, file, options={}) {
  let img = sharp(Buffer.from(svg));
  if (options.resize) img = img.resize(options.resize.width, options.resize.height, { fit: 'fill' });
  await img.png({ compressionLevel: 9, palette: false }).toFile(file);
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">${defs()}${mark(16,16,96)}</svg>`;
}

await render(iconSvg(), path.join(iconDir, 'icon-128.png'));
await render(iconSvg(), path.join(iconDir, 'icon-48.png'), { resize: { width:48, height:48 } });
await render(iconSvg(), path.join(iconDir, 'icon-16.png'), { resize: { width:16, height:16 } });
await render(iconSvg(), path.join(out, 'store-icon-128.png'));
await render(shot1(), path.join(shots, '01-record-screen-window.png'));
await render(shot2(), path.join(shots, '02-record-current-tab.png'));
await render(shot3(), path.join(shots, '03-full-page-screenshot.png'));
await render(shot4(), path.join(shots, '04-preview-and-export.png'));
await render(shot5(), path.join(shots, '05-private-local-storage.png'));
await render(smallPromo(), path.join(out, 'promo-small-440x280.png'));
await render(marquee(), path.join(out, 'promo-marquee-1400x560.png'));

console.log('Generated Chrome Web Store asset pack.');
