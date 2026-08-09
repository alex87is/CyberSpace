/**
 * game.js — game loop, input, camera, collisions, HUD and state machine.
 */

const LIVES_START = 5;

class Game {
  constructor(canvas, minimapCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mini = minimapCanvas;
    this.miniCtx = minimapCanvas.getContext('2d');

    this.starfield = new Starfield(WORLD.width, WORLD.height);
    this.world = null; // built on (re)start
    this.ship = null;
    this.bullets = [];
    this.particles = [];
    this.camera = { x: 0, y: 0 };

    this.input = { left: false, right: false, thrust: false, fire: false };
    this.engineHum = null;
    this.state = 'start'; // start | playing | paused | gameover | win
    this.lives = LIVES_START;
    this.score = 0;
    this.startedAt = 0;
    this.elapsed = 0;
    this.shake = 0;
    this.selectedDevice = null;
    this.lastFrame = performance.now();

    this._bindInput();
    this._resize();
    window.addEventListener('resize', () => this._resize());

    requestAnimationFrame((now) => this._loop(now));
  }

  // ---- setup --------------------------------------------------------

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewW = w;
    this.viewH = h;
  }

  _bindInput() {
    const keyMap = {
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      ArrowUp: 'thrust',
      KeyW: 'thrust',
      Space: 'fire',
    };
    window.addEventListener('keydown', (e) => {
      if (keyMap[e.code]) {
        this.input[keyMap[e.code]] = true;
        if (e.code === 'Space') e.preventDefault();
      }
      if (e.code === 'KeyP' || e.code === 'Escape') this.togglePause();
      if (e.code === 'Enter') {
        if (this.state === 'start') this.start();
        else if (this.state === 'gameover' || this.state === 'win') this.start();
      }
      if (e.code === 'KeyR' && (this.state === 'gameover' || this.state === 'win')) this.start();
    });
    window.addEventListener('keyup', (e) => {
      if (keyMap[e.code]) this.input[keyMap[e.code]] = false;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing') return;
      if (e.button === 0) this.input.fire = true;
    });
    window.addEventListener('mouseup', () => (this.input.fire = false));

    this.canvas.addEventListener('click', (e) => this._handleClick(e));
  }

  _handleClick(e) {
    if (this.state !== 'playing' || !this.world) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left + this.camera.x;
    const my = e.clientY - rect.top + this.camera.y;
    const hitDevice = this.world.devices.find((d) => d.containsPoint(mx, my));
    if (hitDevice) {
      this.selectedDevice = hitDevice;
      this._renderInspector(hitDevice);
    }
  }

  // ---- state machine --------------------------------------------------

  start() {
    this.world = buildWorld(DEVICES);
    // spawn roughly centered among the four "hub" devices so the player
    // sees a green link immediately without the HUD corners colliding
    // with a device box.
    this.spawnX = 1600;
    this.spawnY = 970;
    this.ship = new Ship(this.spawnX, this.spawnY);
    this.bullets = [];
    this.particles = [];
    if (this.engineHum) {
      this.engineHum.stop();
      this.engineHum = null;
    }
    this.viewZoom = 1;
    this.lives = LIVES_START;
    this.score = 0;
    this.startedAt = performance.now() / 1000;
    this.elapsed = 0;
    this.selectedDevice = null;
    this._hideInspector();
    this.state = 'playing';
    this._setScreen('playing');
  }

  // Builds the world without spawning a ship or entering the 'playing'
  // state, and centers the camera on an actual device (so something is
  // guaranteed to be in frame, not just empty ground between them) — used
  // to show a live, animated preview of the space behind the "desktop
  // only" message on phones/tablets, without making it playable. Zooming
  // out to fit all 10 devices left everything tiny and unreadable on a
  // phone screen; a close, legible view of a few devices reads much
  // better than a distant view of all of them. _draw() already runs every
  // frame regardless of state and already tolerates a null ship, so no
  // separate ambient render path is needed.
  buildAmbientWorld() {
    this.world = buildWorld(DEVICES);
    this.viewZoom = 0.45;
    const hub = this.world.devices[0];
    this.camera.x = hub.x - this.viewW / this.viewZoom / 2;
    this.camera.y = hub.y - this.viewH / this.viewZoom / 2;
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this._setScreen('paused');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this._setScreen('playing');
    }
  }

  loseLife() {
    this.lives--;
    this.shake = 0.4;
    document.getElementById('hud-lives').classList.add('hit');
    setTimeout(() => document.getElementById('hud-lives').classList.remove('hit'), 250);
    if (this.lives <= 0) {
      this.state = 'gameover';
      this._setScreen('gameover');
      SFX.gameover();
    } else {
      // send the ship back to its launch point rather than letting it carry
      // on from wherever it got hit
      this.ship.x = this.spawnX;
      this.ship.y = this.spawnY;
      this.ship.vx = 0;
      this.ship.vy = 0;
      this.ship.angle = -Math.PI / 2;
    }
  }

  checkWin() {
    if (this.world.turrets.every((t) => !t.alive)) {
      this.state = 'win';
      this._setScreen('win');
      SFX.win();
    }
  }

  _setScreen(state) {
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('visible'));
    const el = document.getElementById('screen-' + state);
    if (el) el.classList.add('visible');
    document.getElementById('hud').classList.toggle('visible', state === 'playing' || state === 'paused');
    if (state === 'gameover') {
      document.getElementById('final-score').textContent = this.score;
    }
    if (state === 'win') {
      document.getElementById('win-score').textContent = this.score;
      document.getElementById('win-time').textContent = this.elapsed.toFixed(1) + 's';
    }
  }

  // ---- loop -------------------------------------------------------------

  _loop(now) {
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    const t = now / 1000;

    if (this.state === 'playing') {
      this.elapsed = t - this.startedAt;
      this._update(dt, t);
    }
    this._draw(t);
    requestAnimationFrame((n) => this._loop(n));
  }

  _update(dt, t) {
    const ship = this.ship;
    ship.update(dt, this.input, t);

    // camera follow, clamped to world
    const targetX = clamp(ship.x - this.viewW / 2, 0, Math.max(0, WORLD.width - this.viewW));
    const targetY = clamp(ship.y - this.viewH / 2, 0, Math.max(0, WORLD.height - this.viewH));
    this.camera.x += (targetX - this.camera.x) * Math.min(1, dt * 6);
    this.camera.y += (targetY - this.camera.y) * Math.min(1, dt * 6);

    // soft collision vs device boxes (keep ship from flying through them)
    for (const dev of this.world.devices) {
      const nx = clamp(ship.x, dev.left, dev.right);
      const ny = clamp(ship.y, dev.top, dev.bottom);
      const d = dist(ship.x, ship.y, nx, ny);
      if (d < ship.radius && d > 0.001) {
        const pushX = (ship.x - nx) / d;
        const pushY = (ship.y - ny) / d;
        ship.x = nx + pushX * ship.radius;
        ship.y = ny + pushY * ship.radius;
        ship.vx *= 0.4;
        ship.vy *= 0.4;
      }
    }

    // engine hum: only while thrust is actually held
    if (ship.thrusting && !this.engineHum) this.engineHum = SFX.startHum({ freq: 85, vol: 0.05 });
    if (!ship.thrusting && this.engineHum) {
      this.engineHum.stop();
      this.engineHum = null;
    }
    if (this.engineHum) this.engineHum.setFreq(85 + Math.hypot(ship.vx, ship.vy) * 0.12);

    // fire
    if (this.input.fire && ship.canFire()) {
      this.bullets.push(ship.fire());
      SFX.fire();
    }

    // bullets
    for (const b of this.bullets) b.update(dt);
    this.bullets = this.bullets.filter((b) => !b.dead);

    // bullets vs turret emitters
    for (const turret of this.world.turrets) {
      if (!turret.alive) continue;
      for (const b of this.bullets) {
        if (b.dead) continue;
        if (turret.emitterHit(b.x, b.y, 2.6)) {
          turret.hit();
          b.dead = true;
          this.score += 150;
          this._explode(turret.port.x, turret.port.y, '#ff6a6a', 26);
          SFX.explode(true);
          this.checkWin();
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);

    // red beams vs ship
    for (const turret of this.world.turrets) {
      if (!turret.alive) continue;
      const hitInfo = turret.distanceTo(t, ship.x, ship.y);
      if (hitInfo.dist < ship.radius + 4) {
        if (ship.hit()) {
          this._explode(ship.x, ship.y, '#66c2ff', 18);
          SFX.shipHit();
          this.loseLife();
        }
      }
    }

    // particles
    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter((p) => !p.dead);

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);

    this._updateHud();
  }

  _explode(x, y, color, count) {
    for (let i = 0; i < count; i++) this.particles.push(new Particle(x, y, color));
  }

  _updateHud() {
    document.getElementById('hud-score').textContent = this.score;
    document.getElementById('hud-time').textContent = this.elapsed.toFixed(1) + 's';
    const remaining = this.world.turrets.filter((t) => t.alive).length;
    const total = this.world.turrets.length;
    document.getElementById('hud-objective').textContent = `${total - remaining}/${total}`;
    const livesEl = document.getElementById('hud-lives');
    livesEl.innerHTML = '';
    for (let i = 0; i < LIVES_START; i++) {
      const span = document.createElement('span');
      span.className = 'life-icon' + (i < this.lives ? '' : ' spent');
      span.textContent = '▲';
      livesEl.appendChild(span);
    }
  }

  // ---- rendering ----------------------------------------------------

  _draw(t) {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake * 16, (Math.random() - 0.5) * this.shake * 16);
    }

    this.starfield.draw(ctx, this.camera, this.viewW, this.viewH, t);

    if (this.world) {
      ctx.save();
      const zoom = this.viewZoom || 1;
      ctx.scale(zoom, zoom);
      ctx.translate(-this.camera.x, -this.camera.y);

      for (const link of this.world.links) link.draw(ctx, t);
      for (const turret of this.world.turrets) turret.draw(ctx, t);
      for (const dev of this.world.devices) {
        dev.draw(ctx, t);
        if (dev === this.selectedDevice) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.setLineDash([4, 3]);
          ctx.lineWidth = 1.5;
          ctx.strokeRect(dev.left - 4, dev.top - 4, dev.width + 8, dev.height + 8);
          ctx.restore();
        }
      }
      for (const p of this.particles) p.draw(ctx);
      for (const b of this.bullets) b.draw(ctx);
      if (this.ship) this.ship.draw(ctx, t);

      ctx.restore();
    }

    ctx.restore();

    this._drawMinimap(t);
  }

  _drawMinimap(t) {
    const ctx = this.miniCtx;
    const w = this.mini.width;
    const h = this.mini.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(5,8,18,0.75)';
    ctx.fillRect(0, 0, w, h);
    if (!this.world) return;
    const sx = w / WORLD.width;
    const sy = h / WORLD.height;

    for (const link of this.world.links) {
      ctx.strokeStyle = 'rgba(92,242,154,0.5)';
      ctx.beginPath();
      ctx.moveTo(link.a.x * sx, link.a.y * sy);
      ctx.lineTo(link.b.x * sx, link.b.y * sy);
      ctx.stroke();
    }
    for (const dev of this.world.devices) {
      const hasLiveTurret = this.world.turrets.some((tu) => tu.device === dev && tu.alive);
      ctx.fillStyle = hasLiveTurret ? (Math.sin(t * 8) > 0 ? '#ff4d5e' : '#7a0f16') : '#4fd1ff';
      ctx.beginPath();
      ctx.arc(dev.x * sx, dev.y * sy, hasLiveTurret ? 3.2 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // viewport rect
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.camera.x * sx, this.camera.y * sy, this.viewW * sx, this.viewH * sy);
    // ship
    if (this.ship) {
      ctx.fillStyle = '#ffe98a';
      ctx.beginPath();
      ctx.arc(this.ship.x * sx, this.ship.y * sy, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- device inspector panel ---------------------------------------

  _renderInspector(dev) {
    const panel = document.getElementById('inspector');
    const rows = dev.data.fields
      .map((f) => {
        if (f.type === 'info') {
          return `<div class="insp-row insp-info"><span class="insp-led led-info"></span><b>${f.id}</b> ${f.label} ${f.value}</div>`;
        }
        const cls = f.consistent ? 'led-ok' : 'led-bad';
        const detail = f.consistent
          ? `${f.proto} ${f.detail} &rarr; peer OK`
          : `${f.proto} ${f.detail} &mdash; <span class="insp-issue">${f.issue}</span>`;
        return `<div class="insp-row"><span class="insp-led ${cls}"></span><b>${f.id}</b> ${f.ip}/${f.mask} vrf:${f.vrf}<br><span class="insp-detail">${detail}</span></div>`;
      })
      .join('');
    panel.innerHTML = `
      <div class="insp-head">
        <span>${dev.data.name}${dev.data.asNumber ? ' &middot; AS' + dev.data.asNumber : ''}</span>
        <button id="insp-close">&times;</button>
      </div>
      <div class="insp-body">${rows}</div>
    `;
    panel.classList.add('visible');
    document.getElementById('insp-close').addEventListener('click', () => this._hideInspector());
  }

  _hideInspector() {
    this.selectedDevice = null;
    document.getElementById('inspector').classList.remove('visible');
  }
}
