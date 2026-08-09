/**
 * game3d.js — game loop, input, chase camera, collisions, HUD, state machine.
 * Mirrors 2D's game.js structure, adapted to Three.js world objects.
 */

const LIVES_START = 5;

class Game3D {
  constructor(canvas, minimapCanvas) {
    this.canvas = canvas;
    this.mini = minimapCanvas;
    this.miniCtx = minimapCanvas.getContext('2d');

    const built = createScene(canvas);
    this.renderer = built.renderer;
    this.scene = built.scene;
    this.camera = built.camera;
    this.stars = built.stars;
    this.starTwinkleLayers = built.starTwinkleLayers;
    this.fieldStars = built.fieldStars; // static — scattered through the flight space itself, not rotated

    this.world = null;
    this.ship = null;
    this.bullets = [];
    this.particles = [];
    this.bugs = [];
    this.bugsSquashed = 0;
    this.nextBugSpawnAt = 0; // only one bug alive at a time; this is when the next one is due
    this.MAX_BUGS = 1;
    this.engineHum = null;
    this.cameraPos = new THREE.Vector3(0, 20, 60);
    this.cameraLook = new THREE.Vector3();

    this.input = { left: false, right: false, up: false, down: false, thrust: false, fire: false };
    this.state = 'start';
    this.lives = LIVES_START;
    this.score = 0;
    this.startedAt = 0;
    this.elapsed = 0;
    this.shake = 0;
    this.selectedTower = null;
    this.lastFrame = performance.now();

    this.raycaster = new THREE.Raycaster();
    this.mouseNDC = new THREE.Vector2();

    this._bindInput();
    requestAnimationFrame((now) => this._loop(now));
  }

  // ---- input -----------------------------------------------------------

  _bindInput() {
    const keyMap = {
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'up', KeyW: 'up',
      ArrowDown: 'down', KeyS: 'down',
      ShiftLeft: 'thrust', ShiftRight: 'thrust',
      Space: 'fire',
    };
    window.addEventListener('keydown', (e) => {
      if (keyMap[e.code]) {
        this.input[keyMap[e.code]] = true;
        if (e.code === 'Space') e.preventDefault();
      }
      if (e.code === 'KeyP' || e.code === 'Escape') this.togglePause();
      if (e.code === 'Enter') {
        if (this.state === 'start' || this.state === 'gameover' || this.state === 'win') this.start();
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
    this.mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);
    const towerMeshes = this.world.towers.map((t) => t.mesh);
    const hits = this.raycaster.intersectObjects(towerMeshes, false);
    if (hits.length) {
      const tower = hits[0].object.userData.tower;
      this.selectedTower = tower;
      this._renderInspector(tower);
    }
  }

  // ---- state machine -----------------------------------------------------

  start() {
    this._clearWorld();
    this.world = buildWorld3D(DEVICES);
    for (const tower of this.world.towers) tower.addTo(this.scene);
    for (const cube of this.world.cubes) cube.addTo(this.scene);
    for (const link of this.world.links) link.addTo(this.scene);
    for (const turret of this.world.turrets) turret.addTo(this.scene);

    const spawnZ = WORLD3_D / 2 - 12;
    this.spawnPos = new THREE.Vector3(0, 7, spawnZ);
    this.spawnYaw = Math.PI; // face the canyon center
    this.ship = new Ship3D(this.spawnPos.x, this.spawnPos.y, this.spawnPos.z);
    this.ship.yaw = this.spawnYaw;
    this.scene.add(this.ship.group);

    this.bullets = [];
    this.particles = [];
    this.bugs = [];
    this.bugsSquashed = 0;
    const nowT = performance.now() / 1000;
    this.nextBugSpawnAt = nowT + 5 + Math.random() * 4;
    this.lives = LIVES_START;
    this.score = 0;
    this.startedAt = nowT;
    this.elapsed = 0;
    this.selectedTower = null;
    this._hideInspector();
    this.state = 'playing';
    this._setScreen('playing');
  }

  // Builds and displays the world (towers/cubes/links/turrets) without
  // spawning a ship or starting the game loop's collision/scoring logic —
  // used to show a live, animated preview of the space behind the
  // "desktop only" message on phones/tablets, without making it playable.
  buildAmbientWorld() {
    this._clearWorld();
    this.world = buildWorld3D(DEVICES);
    for (const tower of this.world.towers) tower.addTo(this.scene);
    for (const cube of this.world.cubes) cube.addTo(this.scene);
    for (const link of this.world.links) link.addTo(this.scene);
    for (const turret of this.world.turrets) turret.addTo(this.scene);
  }

  // Slow establishing-shot orbit plus the same per-object animation the
  // real game uses (tower flicker, cube pulse/logs, link pulse, turret
  // sweep) — everything except ship/collision/scoring logic.
  _updateAmbient(t) {
    for (const tower of this.world.towers) tower.update(0.016);
    for (const cube of this.world.cubes) cube.update(t, 0.016);
    for (const link of this.world.links) link.update(t);
    for (const turret of this.world.turrets) turret.update(t);

    // Stay put roughly in the middle of the tower cluster (not out past its
    // edge — the canyon's fog fades anything much farther than ~80 units
    // away to nothing, which is exactly why a distant establishing shot
    // showed up blank) and slowly pan the look-target around, so nearby
    // towers stay close and clearly lit as the "camera" scans the space.
    const angle = t * 0.05;
    this.camera.position.set(Math.sin(angle) * 18, 16, Math.cos(angle) * 18 - 5);
    const lookAngle = angle + 1.1;
    this.camera.lookAt(Math.sin(lookAngle) * 48, 12, Math.cos(lookAngle) * 48 - 5);
  }

  _clearWorld() {
    if (!this.world) return;
    for (const tower of this.world.towers) this.scene.remove(tower.mesh);
    for (const cube of this.world.cubes) this.scene.remove(cube.group);
    for (const link of this.world.links) {
      this.scene.remove(link.mesh);
      this.scene.remove(link.pulse);
    }
    for (const turret of this.world.turrets) {
      this.scene.remove(turret.emitterMesh);
      this.scene.remove(turret.beamMesh);
      this.scene.remove(turret.light);
    }
    if (this.ship) this.scene.remove(this.ship.group);
    for (const b of this.bullets) this.scene.remove(b.mesh);
    for (const p of this.particles) this.scene.remove(p.mesh);
    for (const bug of this.bugs) bug.removeFrom(this.scene);
    if (this.engineHum) {
      this.engineHum.stop();
      this.engineHum = null;
    }
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
    const el = document.getElementById('hud-lives');
    el.classList.add('hit');
    setTimeout(() => el.classList.remove('hit'), 250);
    if (this.lives <= 0) {
      this.state = 'gameover';
      this._setScreen('gameover');
      SFX.gameover();
    } else {
      // send the ship back to its launch point rather than letting it carry
      // on from wherever it got hit
      this.ship.group.position.copy(this.spawnPos);
      this.ship.velocity.set(0, 0, 0);
      this.ship.yaw = this.spawnYaw;
      this.ship.pitch = 0;
      this.ship.roll = 0;
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
    if (state === 'gameover') document.getElementById('final-score').textContent = this.score;
    if (state === 'win') {
      document.getElementById('win-score').textContent = this.score;
      document.getElementById('win-time').textContent = this.elapsed.toFixed(1) + 's';
    }
  }

  // ---- loop ---------------------------------------------------------------

  _loop(now) {
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    const t = now / 1000;

    this._updateSky(dt, t);

    if (this.state === 'playing') {
      this.elapsed = t - this.startedAt;
      this._update(dt, t);
    } else if (this.world && !this.ship) {
      this._updateAmbient(t);
    }
    this.renderer.render(this.scene, this.camera);
    this._drawMinimap();
    requestAnimationFrame((n) => this._loop(n));
  }

  // Runs every frame regardless of state (start screen, playing, paused,
  // mobile ambient preview, ...) so the sky is always alive: a very slow
  // drift for the whole field, plus each bright "signal" star layer
  // twinkling on its own out-of-phase cycle.
  _updateSky(dt, t) {
    if (this.stars) this.stars.rotation.y += dt * 0.0025;
    for (const layer of this.starTwinkleLayers) {
      layer.points.rotation.y += dt * 0.0025;
      layer.points.material.opacity = 0.55 + Math.sin(t * layer.speed + layer.phase) * 0.35;
    }
  }

  _update(dt, t) {
    const ship = this.ship;
    const bounds = {
      minX: -WORLD3_W / 2 - 10, maxX: WORLD3_W / 2 + 10,
      minZ: -WORLD3_D / 2 - 10, maxZ: WORLD3_D / 2 + 10,
      minY: 2, maxY: 75,
    };
    ship.update(dt, this.input, t, bounds);

    // soft cylinder collision vs tower bodies (and the tower's own live animation)
    for (const tower of this.world.towers) {
      tower.update(dt);
      const dx = ship.position.x - tower.x;
      const dz = ship.position.z - tower.z;
      const dist = Math.hypot(dx, dz);
      const minDist = tower.width * 0.62 + ship.radius;
      const withinHeight = ship.position.y < tower.height + 2;
      if (dist < minDist && withinHeight && dist > 0.001) {
        const push = (minDist - dist);
        ship.position.x += (dx / dist) * push;
        ship.position.z += (dz / dist) * push;
        ship.velocity.multiplyScalar(0.35);
      }
    }

    // chase camera
    const fwd = ship.forward();
    const desiredPos = ship.position.clone().addScaledVector(fwd, -9).add(new THREE.Vector3(0, 3.2, 0));
    this.cameraPos.lerp(desiredPos, Math.min(1, dt * 5));
    const desiredLook = ship.position.clone().addScaledVector(fwd, 14);
    this.cameraLook.lerp(desiredLook, Math.min(1, dt * 6));
    this.camera.position.copy(this.cameraPos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 1.4;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 1.4;
    }
    this.camera.lookAt(this.cameraLook);

    // engine hum: only while thrust is actually held, pitched up a little
    // with speed so it isn't a flat drone
    if (ship.thrusting && !this.engineHum) this.engineHum = SFX.startHum({ freq: 85, vol: 0.05 });
    if (!ship.thrusting && this.engineHum) {
      this.engineHum.stop();
      this.engineHum = null;
    }
    if (this.engineHum) this.engineHum.setFreq(85 + ship.velocity.length() * 1.4);

    if (this.input.fire && ship.canFire()) {
      const b = ship.fire();
      this.bullets.push(b);
      this.scene.add(b.mesh);
      SFX.fire();
    }

    for (const b of this.bullets) b.update(dt);
    for (const b of this.bullets) {
      if (b.dead) continue;
      for (const turret of this.world.turrets) {
        if (!turret.alive) continue;
        if (b.position.distanceTo(turret.origin) <= 1.6) {
          turret.hit();
          b.dead = true;
          this.score += 150;
          this._explode(turret.origin, 0xff6a6a, 26);
          SFX.explode(true);
          this.checkWin();
        }
      }
    }
    for (const b of this.bullets) if (b.dead) this.scene.remove(b.mesh);
    this.bullets = this.bullets.filter((b) => !b.dead);

    for (const turret of this.world.turrets) {
      turret.update(t);
      if (!turret.alive) continue;
      if (turret.hitTest(ship.position, ship.radius)) {
        if (ship.hit()) {
          this._explode(ship.position, 0x66c2ff, 18);
          SFX.shipHit();
          this.loseLife();
        }
      }
    }

    for (const cube of this.world.cubes) cube.update(t, dt);
    for (const link of this.world.links) link.update(t);

    // bugs: at most one alive at a time, spawned from a random still-broken
    // turret once the cooldown timer elapses
    if (this.bugs.length < this.MAX_BUGS && t >= this.nextBugSpawnAt) {
      const aliveTurrets = this.world.turrets.filter((tu) => tu.alive);
      if (aliveTurrets.length) {
        const turret = aliveTurrets[(Math.random() * aliveTurrets.length) | 0];
        const bug = new Bug3D(turret.origin);
        bug.addTo(this.scene);
        this.bugs.push(bug);
        SFX.bugSpawn();
      }
    }
    for (const bug of this.bugs) {
      if (!bug.alive) continue;
      const dist = bug.update(dt, t, ship.position);
      if (dist < ship.radius + bug.radius) {
        bug.alive = false;
        this.nextBugSpawnAt = t + 4 + Math.random() * 4;
        this._explode(bug.position, 0xff2d8a, 16);
        SFX.bugKill();
        if (ship.hit()) {
          this._explode(ship.position, 0x66c2ff, 18);
          SFX.shipHit();
          this.loseLife();
        }
      }
    }
    for (const b of this.bullets) {
      if (b.dead) continue;
      for (const bug of this.bugs) {
        if (!bug.alive) continue;
        if (b.position.distanceTo(bug.position) <= bug.radius + 0.6) {
          bug.alive = false;
          b.dead = true;
          this.nextBugSpawnAt = t + 4 + Math.random() * 4;
          this.score += 60;
          this.bugsSquashed++;
          this._explode(bug.position, 0xff2d8a, 20);
          SFX.bugKill();
        }
      }
    }
    for (const b of this.bullets) if (b.dead) this.scene.remove(b.mesh);
    this.bullets = this.bullets.filter((b) => !b.dead);
    for (const bug of this.bugs) if (!bug.alive) bug.removeFrom(this.scene);
    this.bugs = this.bugs.filter((bug) => bug.alive);

    for (const p of this.particles) p.update(dt);
    for (const p of this.particles) if (p.dead) this.scene.remove(p.mesh);
    this.particles = this.particles.filter((p) => !p.dead);

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);

    this._updateHud();
  }

  _explode(pos, color, count) {
    for (let i = 0; i < count; i++) {
      const p = new Particle3D(pos, color);
      this.particles.push(p);
      this.scene.add(p.mesh);
    }
  }

  _updateHud() {
    document.getElementById('hud-score').textContent = this.score;
    document.getElementById('hud-time').textContent = this.elapsed.toFixed(1) + 's';
    const remaining = this.world.turrets.filter((t) => t.alive).length;
    const total = this.world.turrets.length;
    document.getElementById('hud-objective').textContent = `${total - remaining}/${total}`;
    document.getElementById('hud-bugs').textContent = this.bugsSquashed;
    const livesEl = document.getElementById('hud-lives');
    livesEl.innerHTML = '';
    for (let i = 0; i < LIVES_START; i++) {
      const span = document.createElement('span');
      span.className = 'life-icon' + (i < this.lives ? '' : ' spent');
      span.textContent = '▲';
      livesEl.appendChild(span);
    }
  }

  // ---- minimap (top-down, reuses XZ ground positions) --------------------

  _drawMinimap() {
    const ctx = this.miniCtx;
    const w = this.mini.width;
    const h = this.mini.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(5,8,18,0.75)';
    ctx.fillRect(0, 0, w, h);
    if (!this.world) return;

    const pad = 14;
    const sx = (w - pad * 2) / WORLD3_W;
    const sz = (h - pad * 2) / WORLD3_D;
    const toMap = (x, z) => ({ x: pad + (x + WORLD3_W / 2) * sx, y: pad + (z + WORLD3_D / 2) * sz });

    for (const link of this.world.links) {
      const a = toMap(link.a.x, link.a.z);
      const b = toMap(link.b.x, link.b.z);
      ctx.strokeStyle = 'rgba(92,242,154,0.5)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const tower of this.world.towers) {
      const p = toMap(tower.x, tower.z);
      const hasLiveTurret = this.world.turrets.some((tu) => tu.cube.tower === tower && tu.alive);
      ctx.fillStyle = hasLiveTurret ? (Math.sin(performance.now() / 130) > 0 ? '#ff4d5e' : '#7a0f16') : '#4fd1ff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, hasLiveTurret ? 3.2 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const bug of this.bugs) {
      const p = toMap(bug.position.x, bug.position.z);
      ctx.fillStyle = '#ff2d8a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.ship) {
      const p = toMap(this.ship.position.x, this.ship.position.z);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(-this.ship.yaw + Math.PI);
      ctx.fillStyle = '#ffe98a';
      ctx.strokeStyle = 'rgba(10,8,0,0.8)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      // sharp dart/arrowhead: a narrow forward point with swept-back wings
      // and a concave tail notch, so heading reads unambiguously at a glance
      ctx.moveTo(0, -7); // nose
      ctx.lineTo(3, 4.5); // right wingtip
      ctx.lineTo(0, 2); // tail notch (concave)
      ctx.lineTo(-3, 4.5); // left wingtip
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---- device inspector panel ---------------------------------------------

  _renderInspector(tower) {
    const panel = document.getElementById('inspector');
    const rows = tower.data.fields
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
        <span>${tower.data.name}${tower.data.asNumber ? ' &middot; AS' + tower.data.asNumber : ''}</span>
        <button id="insp-close">&times;</button>
      </div>
      <div class="insp-body">${rows}</div>
    `;
    panel.classList.add('visible');
    document.getElementById('insp-close').addEventListener('click', () => this._hideInspector());
  }

  _hideInspector() {
    this.selectedTower = null;
    document.getElementById('inspector').classList.remove('visible');
  }
}
