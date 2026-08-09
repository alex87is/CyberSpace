/**
 * entities.js — everything that gets drawn and simulated in the world:
 * devices (with their LEDs), green consistency links, red laser turrets,
 * the player ship, bullets and particles.
 */

// ---- layout constants for a device "box" --------------------------------
const BOX_WIDTH = 210;
const ROW_H = 30;
const HEADER_H = 30;
const PAD = 10;

class Device {
  constructor(data) {
    this.data = data;
    this.id = data.id;
    this.x = data.x;
    this.y = data.y;
    const type = DEVICE_TYPES[data.type] || DEVICE_TYPES.router;
    this.badge = type.badge;
    this.color = type.color;
    this.width = BOX_WIDTH;
    this.height = HEADER_H + data.fields.length * ROW_H + PAD * 2;
    this.flicker = Math.random() * Math.PI * 2;

    // Precompute a screen/world-space anchor for every field row: LED
    // position (inside the box) and a port position (on whichever edge
    // faces "outward", used as the origin of lasers/beams).
    this.rows = data.fields.map((field, i) => {
      const rowY = this.top + HEADER_H + PAD + i * ROW_H + ROW_H / 2;
      return { field, ledX: this.left + 22, ledY: rowY, rowY };
    });
  }

  get left() {
    return this.x - this.width / 2;
  }
  get top() {
    return this.y - this.height / 2;
  }
  get right() {
    return this.left + this.width;
  }
  get bottom() {
    return this.top + this.height;
  }

  // Exit point for a given row, on whichever edge points toward (tx,ty).
  // Falls back to a fixed "outward from map center" side when no target is given.
  portFor(row, towardX, towardY) {
    let onRight;
    if (towardX === undefined) {
      onRight = this.x >= WORLD.width / 2;
    } else {
      onRight = towardX >= this.x;
    }
    return { x: onRight ? this.right + 4 : this.left - 4, y: row.rowY, onRight };
  }

  fieldRow(fieldId) {
    return this.rows.find((r) => r.field.id === fieldId);
  }

  draw(ctx, t) {
    const { left, top, width, height } = this;
    // outer glow
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(8,14,28,0.88)';
    roundRect(ctx, left, top, width, height, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // header
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, left, top, width, HEADER_H, 8, true);
    ctx.fillStyle = hexToRgba(this.color, 0.18);
    ctx.fill();
    ctx.fillStyle = this.color;
    ctx.font = 'bold 11px "Segoe UI", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(`[${this.badge}]`, left + 8, top + HEADER_H / 2 + 1);
    ctx.fillStyle = '#dff2ff';
    ctx.font = '11px "Segoe UI", monospace';
    ctx.fillText(this.data.name, left + 46, top + HEADER_H / 2 + 1);
    ctx.restore();

    // rows
    ctx.font = '10px "Segoe UI", monospace';
    ctx.textBaseline = 'middle';
    this.rows.forEach((row) => {
      const f = row.field;
      let ledColor, blink, label;
      if (f.type === 'info') {
        ledColor = '#4fa6ff';
        blink = 0.75 + 0.25 * Math.sin(t * 1.2 + this.flicker);
        label = `${f.id}  ${f.value}`;
      } else if (f.consistent) {
        ledColor = '#5cf29a';
        blink = 0.6 + 0.4 * Math.sin(t * 1.6 + this.flicker);
        label = `${f.id}  ${f.ip}/${f.mask}`;
      } else {
        ledColor = '#ff4d5e';
        // urgent fast blink for the inconsistent field
        blink = 0.5 + 0.5 * Math.sin(t * 8 + this.flicker);
        label = `${f.id}  ${f.ip}/${f.mask} ⚠`;
      }
      ctx.save();
      ctx.shadowColor = ledColor;
      ctx.shadowBlur = f.consistent === false ? 10 : 5;
      ctx.fillStyle = hexToRgba(ledColor, blink);
      ctx.beginPath();
      ctx.arc(row.ledX, row.ledY, f.consistent === false ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = f.consistent === false ? '#ffb3ba' : '#a9c4e0';
      ctx.fillText(label, row.ledX + 12, row.rowY);
    });
  }

  containsPoint(x, y) {
    return x >= this.left && x <= this.right && y >= this.top && y <= this.bottom;
  }
}

class GreenLink {
  constructor(devA, rowA, devB, rowB) {
    this.a = devA.portFor(rowA, devB.x, devB.y);
    this.b = devB.portFor(rowB, devA.x, devA.y);
    this.phase = Math.random() * Math.PI * 2;
  }

  draw(ctx, t) {
    const { a, b } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(92,242,154,0.55)';
    ctx.shadowColor = '#5cf29a';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // flowing data pulse
    const len = dist(a.x, a.y, b.x, b.y);
    const speed = 140; // px/sec
    const travel = ((t * speed + this.phase * 60) % (len + 40)) - 20;
    const tt = clamp(travel / len, 0, 1);
    const px = lerp(a.x, b.x, tt);
    const py = lerp(a.y, b.y, tt);
    ctx.fillStyle = '#d6ffe6';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// A red laser turret sits on an inconsistent field's port and sweeps a beam.
class Turret {
  constructor(device, row) {
    this.device = device;
    this.row = row;
    this.field = row.field;
    this.alive = true;
    this.port = device.portFor(row);
    this.baseAngle = this.port.onRight ? 0 : Math.PI;
    // deterministic-ish per-turret variety without a peer to compare against
    const seed = hashStr(device.id + row.field.id);
    this.sweepSpeed = 0.7 + (seed % 10) / 10; // rad/s-ish multiplier
    this.sweepAmp = (Math.PI / 180) * (35 + (seed % 20)); // fast scan amplitude
    this.driftSpeed = 0.12 + ((seed >> 3) % 10) / 60; // slow base drift
    this.driftAmp = (Math.PI / 180) * (25 + ((seed >> 3) % 15));
    this.phase = (seed % 628) / 100;
    this.length = 720;
    this.hitFlash = 0;
    this.destroyedAt = 0;
    this.explodeParticles = [];
  }

  currentAngle(t) {
    const drift = Math.sin(t * this.driftSpeed + this.phase) * this.driftAmp;
    const sweep = Math.sin(t * this.sweepSpeed * 1.8 + this.phase * 1.7) * this.sweepAmp;
    return this.baseAngle + drift + sweep;
  }

  beamEnd(t) {
    const a = this.currentAngle(t);
    return { x: this.port.x + Math.cos(a) * this.length, y: this.port.y + Math.sin(a) * this.length, angle: a };
  }

  // distance from a point to the current beam segment
  distanceTo(t, px, py) {
    const end = this.beamEnd(t);
    return pointToSegmentDist(px, py, this.port.x, this.port.y, end.x, end.y);
  }

  hit() {
    this.alive = false;
    this.destroyedAt = performance.now() / 1000;
    this.field.consistent = true; // "fixed" — LED goes green, field.issue stays for the log
    this.field.status = 'up';
  }

  draw(ctx, t) {
    if (!this.alive) return;
    const end = this.beamEnd(t);
    ctx.save();
    // beam
    const grad = ctx.createLinearGradient(this.port.x, this.port.y, end.x, end.y);
    grad.addColorStop(0, 'rgba(255,70,80,0.95)');
    grad.addColorStop(1, 'rgba(255,70,80,0.05)');
    ctx.strokeStyle = grad;
    ctx.shadowColor = '#ff2d3d';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(this.port.x, this.port.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    // emitter housing
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ff2d3d';
    ctx.beginPath();
    ctx.arc(this.port.x, this.port.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,180,180,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // hit-circle for bullets: the emitter housing itself, not the whole beam.
  emitterHit(px, py, r) {
    return dist(px, py, this.port.x, this.port.y) <= 9 + r;
  }
}

class Ship {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = -Math.PI / 2; // facing "up"
    this.radius = 12;
    this.thrusting = false;
    this.invulnUntil = 0;
    this.fireCooldown = 0;
  }

  update(dt, input, t) {
    const ROT_SPEED = 3.2; // rad/s
    const THRUST = 260; // px/s^2
    const DRAG = 0.62;
    const MAX_SPEED = 420;

    if (input.left) this.angle -= ROT_SPEED * dt;
    if (input.right) this.angle += ROT_SPEED * dt;

    this.thrusting = !!input.thrust;
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    // drag
    this.vx -= this.vx * DRAG * dt;
    this.vy -= this.vy * DRAG * dt;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > MAX_SPEED) {
      this.vx = (this.vx / speed) * MAX_SPEED;
      this.vy = (this.vy / speed) * MAX_SPEED;
    }

    this.x = clamp(this.x + this.vx * dt, 20, WORLD.width - 20);
    this.y = clamp(this.y + this.vy * dt, 20, WORLD.height - 20);

    if (this.fireCooldown > 0) this.fireCooldown -= dt;
  }

  get invulnerable() {
    return performance.now() / 1000 < this.invulnUntil;
  }

  hit() {
    if (this.invulnerable) return false;
    this.invulnUntil = performance.now() / 1000 + 2.0;
    return true;
  }

  canFire() {
    return this.fireCooldown <= 0;
  }

  fire() {
    this.fireCooldown = 0.22;
    return new Bullet(
      this.x + Math.cos(this.angle) * (this.radius + 4),
      this.y + Math.sin(this.angle) * (this.radius + 4),
      Math.cos(this.angle) * 620 + this.vx * 0.3,
      Math.sin(this.angle) * 620 + this.vy * 0.3
    );
  }

  draw(ctx, t) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const blinking = this.invulnerable && Math.floor(t * 12) % 2 === 0;
    if (!blinking) {
      if (this.invulnerable) {
        ctx.save();
        ctx.strokeStyle = 'rgba(120,200,255,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // thruster flame
      if (this.thrusting) {
        const flick = 8 + Math.random() * 6;
        ctx.save();
        ctx.fillStyle = 'rgba(120,190,255,0.85)';
        ctx.shadowColor = '#66c2ff';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(-this.radius, -5);
        ctx.lineTo(-this.radius - flick, 0);
        ctx.lineTo(-this.radius, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      ctx.shadowColor = '#8fd6ff';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#e6f6ff';
      ctx.strokeStyle = '#4fd1ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.radius + 4, 0);
      ctx.lineTo(-this.radius, -this.radius * 0.8);
      ctx.lineTo(-this.radius * 0.4, 0);
      ctx.lineTo(-this.radius, this.radius * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

class Bullet {
  constructor(x, y, vx, vy) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = 0.9;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    if (this.x < 0 || this.y < 0 || this.x > WORLD.width || this.y > WORLD.height) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.fillStyle = '#ffe98a';
    ctx.shadowColor = '#ffe98a';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 220;
    this.vx = Math.cos(a) * s;
    this.vy = Math.sin(a) * s;
    this.life = 0.4 + Math.random() * 0.5;
    this.maxLife = this.life;
    this.color = color;
    this.r = 1.5 + Math.random() * 2.5;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.92;
    this.vy *= 0.92;
    this.life -= dt;
  }
  get dead() {
    return this.life <= 0;
  }
  draw(ctx) {
    const alpha = clamp(this.life / this.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ---- small utilities ------------------------------------------------------

function roundRect(ctx, x, y, w, h, r, topOnly) {
  ctx.beginPath();
  if (topOnly) {
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  } else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Build the full set of devices, green links (deduped) and red turrets from
// DATA. Links are derived from `field.peer` on consistent fields; turrets
// from inconsistent fields. This is the single place that turns the fixed
// dataset in data.js into playable world objects.
function buildWorld(deviceData) {
  // Deep-clone so a playthrough's turret hits (which mutate field.consistent)
  // never touch the shared DEVICES dataset — otherwise a restart would find
  // every previously-fixed inconsistency already "fixed" and spawn 0 turrets.
  const cloned = structuredClone(deviceData);
  const devices = cloned.map((d) => new Device(d));
  const byId = Object.fromEntries(devices.map((d) => [d.id, d]));

  const links = [];
  const seenPairs = new Set();
  const turrets = [];

  for (const dev of devices) {
    for (const row of dev.rows) {
      const f = row.field;
      if (f.type !== 'iface') continue;
      if (f.consistent) {
        if (!f.peer) continue;
        const peerDev = byId[f.peer.device];
        if (!peerDev) continue;
        const key = [dev.id + '#' + f.id, f.peer.device + '#' + f.peer.field].sort().join('|');
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        const peerRow = peerDev.fieldRow(f.peer.field);
        if (!peerRow) continue;
        links.push(new GreenLink(dev, row, peerDev, peerRow));
      } else {
        turrets.push(new Turret(dev, row));
      }
    }
  }

  return { devices, links, turrets, byId };
}
