/**
 * textures.js — procedural canvas textures for the 3D scene, styled after the
 * reference mood: black-glass data towers covered in glowing cyan/white
 * readouts, magenta/purple circuit-trace flooring, and translucent
 * glass data-cubes with amber/cyan status text.
 *
 * No external image assets: everything is drawn on an off-screen <canvas>
 * wrapped in a THREE.CanvasTexture. Towers and cubes keep their canvas/ctx
 * around (see entities3d.js) so they can redraw live — LEDs flicker, log
 * lines scroll — by calling the draw* functions again and flagging
 * `tex.needsUpdate = true`, instead of paying for a whole new texture.
 */

const GLYPHS = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&+-=.:/';

function randGlyphs(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += GLYPHS[(Math.random() * GLYPHS.length) | 0];
  return s;
}

// A blank canvas + its CanvasTexture wrapper, ready for repeated drawing.
function makeCanvasTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx, tex };
}

// A thin divider bar between rack segments: an accent hairline, a small
// "U01"-style unit label, and a corner rivet dot — reads as a seam between
// distinct equipment units instead of one continuous panel.
// hostname is printed on every divider (not just the 'readout' segment
// kind) so it shows up on every tower regardless of which segment kinds
// that particular tower happened to roll — the tall towers are exactly
// where this needs to be visible since they have the most dividers.
function drawRackDivider(ctx, y, w, accent, label, hostname) {
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(4, y);
  ctx.lineTo(w - 4, y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(180,210,230,0.4)';
  ctx.font = '9px monospace';
  ctx.fillText(label, 6, y - 3);
  if (hostname) {
    ctx.fillStyle = 'rgba(150,190,220,0.35)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(hostname, w - 14, y - 3);
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = 'rgba(150,180,210,0.3)';
  ctx.beginPath();
  ctx.arc(w - 9, y - 5, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

// Rows of small circular status LEDs, like a switch's link/activity lights.
function drawLedSegment(ctx, x0, y0, w, h, accent, warnRatio, rand, blocks) {
  ctx.fillStyle = 'rgba(150,190,220,0.45)';
  ctx.font = '9px monospace';
  ctx.fillText('STATUS', x0 + 8, y0 + 10);
  const rowH = 15;
  const rows = Math.max(2, Math.floor((h - 16) / rowH));
  for (let r = 0; r < rows; r++) {
    const y = y0 + 20 + r * rowH;
    const cols = 5 + Math.floor(rand() * 3);
    for (let c = 0; c < cols; c++) {
      const cx = x0 + 12 + c * ((w - 24) / (cols - 1 || 1));
      const isWarn = rand() < warnRatio;
      const lit = rand() > 0.25;
      const color = !lit ? '#132030' : isWarn ? (rand() > 0.5 ? '#ffcf6b' : '#ff4d4d') : rand() > 0.85 ? '#e8fbff' : accent;
      const alpha = lit ? 0.55 + rand() * 0.35 : 0.5;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (lit) blocks.push({ x: cx - 2.4, y: y - 2.4, w: 4.8, h: 4.8, color, alpha, isWarn, isDot: true });
    }
  }
}

// A row of small square network ports (RJ45-style), some lit/connected.
function drawPortSegment(ctx, x0, y0, w, h, accent, rand, blocks) {
  ctx.fillStyle = 'rgba(150,190,220,0.45)';
  ctx.font = '9px monospace';
  ctx.fillText('PORTS', x0 + 8, y0 + 10);
  const portW = 13;
  const portH = 9;
  const gap = 7;
  const cols = Math.max(1, Math.floor((w - 20) / (portW + gap)));
  const rows = Math.max(1, Math.floor((h - 22) / (portH + 11)));
  let n = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = x0 + 10 + c * (portW + gap);
      const py = y0 + 18 + r * (portH + 11);
      const connected = rand() > 0.4;
      ctx.strokeStyle = connected ? accent : 'rgba(120,150,180,0.35)';
      ctx.globalAlpha = connected ? 0.9 : 0.5;
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, portW, portH);
      if (connected) {
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.7 + rand() * 0.2;
        ctx.fillRect(px + 2, py + 2, portW - 4, portH - 4);
        blocks.push({ x: px + 2, y: py + 2, w: portW - 4, h: portH - 4, color: accent, alpha: 0.8, isWarn: false });
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(150,190,220,0.55)';
      ctx.font = '7px monospace';
      ctx.fillText(String(n).padStart(2, '0'), px, py + portH + 8);
      n++;
    }
  }
}

// A few lines of monospace IP/subnet readouts, like an interface summary.
function drawReadoutSegment(ctx, x0, y0, w, h, accent, rand, blocks) {
  ctx.fillStyle = 'rgba(150,190,220,0.45)';
  ctx.font = '9px monospace';
  ctx.fillText('IFACE', x0 + 8, y0 + 10);
  const lineH = 15;
  const lines = Math.max(2, Math.floor((h - 18) / lineH));
  ctx.font = '10px monospace';
  for (let i = 0; i < lines; i++) {
    const y = y0 + 24 + i * lineH;
    // mix plain IPs, masked subnets, hostnames, and shell commands instead
    // of the same "10.x.x.x/mask" pattern on every line
    const roll = rand();
    let text;
    if (roll < 0.55) text = randIpMaybeMasked(rand);
    else if (roll < 0.8) text = randHostname(rand);
    else text = randCommand(rand).slice(0, 22);
    const bright = rand() > 0.7;
    ctx.globalAlpha = bright ? 0.9 : 0.55;
    ctx.fillStyle = bright ? accent : 'rgba(180,210,230,0.5)';
    ctx.fillText(text, x0 + 8, y);
    if (bright) blocks.push({ x: x0 + 6, y: y - 8, w: 118, h: 11, color: accent, alpha: 0.15, isWarn: false, isGlow: true });
  }
  ctx.globalAlpha = 1;
}

// The original mixed-width lit-block rows, confined to one segment instead
// of tiling the whole tower — still used as one of the segment "kinds" for
// variety alongside the LED/port/readout panels.
function drawBlockSegment(ctx, x0, y0, w, h, accent, warnRatio, rand, blocks) {
  const rowH = 14;
  const rows = Math.max(1, Math.floor(h / rowH));
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * rowH;
    const isWarn = rand() < warnRatio;
    const cols = 2 + Math.floor(rand() * 3);
    let x = x0 + 6;
    for (let c = 0; c < cols; c++) {
      const bw = 14 + rand() * 46;
      if (x + bw > x0 + w - 6) break;
      const lit = rand() > 0.22;
      if (lit) {
        const bright = rand() > 0.85;
        const color = isWarn ? (bright ? '#ffcf6b' : '#ff4d4d') : bright ? '#e8fbff' : accent;
        const alpha = bright ? 0.95 : 0.55 + rand() * 0.3;
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.fillRect(x, y + 2, bw, rowH - 5);
        blocks.push({ x, y: y + 2, w: bw, h: rowH - 5, color, alpha, isWarn });
      }
      x += bw + 4 + rand() * 10;
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * Draws a tower's data-panel readout into an existing context and returns
 * the list of lit "LED"/port/glow elements (position/size/color) so the
 * caller can flicker a handful of them later without redrawing the whole
 * panel. The panel is split into distinct rack-unit segments — LEDs,
 * ports, IP readouts, or plain status blocks — each separated by a
 * divider bar, so a tall tower reads as stacked equipment instead of one
 * pattern repeating up its height.
 */
function drawTowerPanel(ctx, w, h, { accent, warnRatio, seed }) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#020409';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(120,160,200,0.08)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= w; x += w / 4) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  let rng = seed * 9301 + 49297;
  const rand = () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };

  // every tower gets its own generated hostname, printed on every divider
  // (see drawRackDivider) so it's visible regardless of segment kind —
  // and at least one guaranteed 'readout' segment, so the tall towers
  // reliably show hostnames/commands/IPs and not just LEDs and ports.
  const hostname = randHostname(rand);

  const blocks = [];
  const segH = 148;
  const segCount = Math.max(3, Math.floor(h / segH));
  const kinds = ['leds', 'ports', 'readout', 'blocks'];
  let kindCursor = (seed % kinds.length + kinds.length) % kinds.length;
  for (let s = 0; s < segCount; s++) {
    const y0 = s * segH;
    // cycle through kinds with a little randomness so neighbors usually
    // differ but it's not a strict repeating sequence either
    kindCursor = (kindCursor + 1 + (rand() < 0.3 ? 1 : 0)) % kinds.length;
    const kind = s === 1 ? 'readout' : kinds[kindCursor];
    drawRackDivider(ctx, y0 + 14, w, accent, 'U' + String(s + 1).padStart(2, '0'), hostname);
    const innerY = y0 + 16;
    const innerH = segH - 20;
    if (kind === 'leds') drawLedSegment(ctx, 0, innerY, w, innerH, accent, warnRatio, rand, blocks);
    else if (kind === 'ports') drawPortSegment(ctx, 0, innerY, w, innerH, accent, rand, blocks);
    else if (kind === 'readout') drawReadoutSegment(ctx, 0, innerY, w, innerH, accent, rand, blocks);
    else drawBlockSegment(ctx, 0, innerY, w, innerH, accent, warnRatio, rand, blocks);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 10; i++) {
    const y = Math.floor(rand() * h);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  return blocks;
}

/**
 * A tall data-tower face: a stack of rack-unit segments (status LEDs,
 * network ports, IP readouts, mixed status blocks) separated by divider
 * bars — like a server rack's front panel melted into a skyscraper's
 * windows. accent: base hex color of the healthy elements (cyan/green
 * range). warnRatio: fraction rendered in alarm color (red/orange) — used
 * for the tower belonging to the device with the inconsistency.
 */
function makeTowerTexture({ accent = '#5ad9ff', warnRatio = 0, seed = 1 } = {}) {
  const w = 256;
  const h = 1024;
  const { canvas, ctx, tex } = makeCanvasTexture(w, h);
  tex.wrapS = THREE.RepeatWrapping;
  // stays RepeatWrapping (not clamped) so the live vertical scroll offset
  // in Tower.update() keeps wrapping seamlessly — repeat.y is set to 1 in
  // entities3d.js so only one copy of the panel is ever visible at once,
  // it's just the scroll that wraps around that single copy over time.
  tex.wrapT = THREE.RepeatWrapping;
  const blocks = drawTowerPanel(ctx, w, h, { accent, warnRatio, seed });
  return { tex, canvas, ctx, blocks };
}

// Randomly toggles a few of a tower's LED/port/glow elements on/off in
// place — cheap per-tick "blinking lights" without regenerating the panel.
function flickerTowerBlocks(ctx, blocks, count, bgColor) {
  for (let i = 0; i < count && blocks.length; i++) {
    const b = blocks[(Math.random() * blocks.length) | 0];
    const on = Math.random() > 0.3;
    ctx.globalAlpha = 1;
    ctx.fillStyle = on ? b.color : bgColor;
    if (on) ctx.globalAlpha = b.isGlow ? 0.15 : 0.55 + Math.random() * 0.4;
    if (b.isDot) {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, b.w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * Large tileable circuit-board ground texture: near-black base packed with
 * bright right-angle traces in cyan, green, and violet/magenta — glowing
 * "via" dots at every path end and small lit component pads scattered
 * along the way, for a dense, lively lit-PCB floor.
 */
function makeGroundTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#040308';
  ctx.fillRect(0, 0, size, size);

  const grid = 32;
  const cells = size / grid;

  // faint full backing grid so the gaps between bright traces read as a
  // bare circuit substrate instead of flat black
  ctx.strokeStyle = 'rgba(90, 130, 170, 0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath();
    ctx.moveTo(i * grid, 0);
    ctx.lineTo(i * grid, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * grid);
    ctx.lineTo(size, i * grid);
    ctx.stroke();
  }

  function tracePath(color, glow, lineWidth, count, padChance) {
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.lineWidth = lineWidth;
    for (let i = 0; i < count; i++) {
      let gx = Math.floor(Math.random() * cells);
      let gy = Math.floor(Math.random() * cells);
      const steps = 3 + Math.floor(Math.random() * 8);
      ctx.beginPath();
      ctx.moveTo(gx * grid, gy * grid);
      for (let s = 0; s < steps; s++) {
        if (Math.random() > 0.5) gx += Math.random() > 0.5 ? 1 : -1;
        else gy += Math.random() > 0.5 ? 1 : -1;
        gx = Math.max(0, Math.min(cells, gx));
        gy = Math.max(0, Math.min(cells, gy));
        ctx.lineTo(gx * grid, gy * grid);
        // small lit component pad along the path, like an IC footprint
        if (Math.random() < padChance) {
          const padSize = grid * (0.3 + Math.random() * 0.4);
          ctx.save();
          ctx.shadowBlur = glow * 0.6;
          ctx.fillStyle = color;
          ctx.fillRect(gx * grid - padSize / 2, gy * grid - padSize / 2, padSize, padSize);
          ctx.restore();
        }
      }
      ctx.stroke();
      // via dot at the end
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(gx * grid, gy * grid, lineWidth * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  // brighter and denser than before, in the game's neon palette: cyan and
  // green traces dominate, violet/magenta thread through as accents
  tracePath('rgba(120,235,255,0.85)', 12, 2, 32, 0.07);
  tracePath('rgba(140,255,190,0.75)', 10, 1.8, 28, 0.06);
  tracePath('rgba(195,110,255,0.75)', 11, 2.2, 26, 0.06);
  tracePath('rgba(255,110,220,0.55)', 8, 1.4, 20, 0.05);
  tracePath('rgba(100,170,255,0.4)', 6, 1.2, 18, 0.03);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Draws a glass data-cube face: device/field label, a highlighted IP line
 * (pulse 0-1 brightens a flash box behind it), and a trailing log of short
 * status lines below — echoing the floating status-cube reference.
 */
function drawCubeFace(ctx, w, h, { color, label, ipLine, logLines, pulse = 0 }) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(6,10,20,0.35)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  ctx.fillStyle = color;
  ctx.font = 'bold 14px monospace';
  ctx.fillText(label, 14, 24);

  // IP/status line — flashes brighter for a moment each time it updates
  const ipY = 48;
  if (pulse > 0.01) {
    ctx.fillStyle = `rgba(255,255,255,${(0.22 * pulse).toFixed(3)})`;
    ctx.fillRect(9, ipY - 14, w - 18, 20);
  }
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = color;
  ctx.fillText(ipLine, 14, ipY);

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.moveTo(12, ipY + 10);
  ctx.lineTo(w - 12, ipY + 10);
  ctx.stroke();

  ctx.font = '11px monospace';
  ctx.globalAlpha = 0.85;
  logLines.forEach((line, i) => ctx.fillText(line, 14, ipY + 32 + i * 17));
  ctx.globalAlpha = 1;
}

function makeCubeFaceTexture({ color = '#ffb454', label = 'STATUS', ipLine = '', logLines = [] } = {}) {
  const w = 256;
  const h = 256;
  const { canvas, ctx, tex } = makeCanvasTexture(w, h);
  drawCubeFace(ctx, w, h, { color, label, ipLine, logLines, pulse: 0 });
  return { tex, canvas, ctx };
}

/**
 * Soft round glow sprite for star points — a plain white circle fading to
 * transparent, tinted per-star via THREE.PointsMaterial vertexColors and
 * additively blended, so stars read as glowing dots like everything else
 * in the scene (bullets, engine glow, cube pulses) instead of flat squares.
 */
function makeStarSpriteTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}
