/**
 * entities3d.js — 3D world objects built from the shared js/data.js
 * topology: glowing data-tower devices, floating glass status cubes,
 * green cable links between healthy peers, and red sweeping laser
 * turrets on the broken fields. Mirrors 2D's entities.js structure but
 * everything lives in 3D space now.
 */

const SCALE = 0.06;
const WORLD3_W = WORLD.width * SCALE;
const WORLD3_D = WORLD.height * SCALE;

// Map a 2D data.js (x,y) into centered 3D (x,z) ground coordinates.
function worldToScene(x, y) {
  return { x: x * SCALE - WORLD3_W / 2, z: y * SCALE - WORLD3_D / 2 };
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function hexToThreeColor(hex) {
  return new THREE.Color(hex);
}

class Tower {
  constructor(data) {
    this.data = data;
    this.id = data.id;
    const p = worldToScene(data.x, data.y);
    this.x = p.x;
    this.z = p.z;
    const type = DEVICE_TYPES[data.type] || DEVICE_TYPES.router;
    this.color = type.color;

    const seed = hashStr(data.id);
    this.width = 5 + (seed % 4);
    this.height = 16 + data.fields.length * 6.5 + ((seed >> 4) % 6);

    const ifaceFields = data.fields.filter((f) => f.type === 'iface');
    const broken = ifaceFields.filter((f) => !f.consistent).length;
    this.hasIssue = broken > 0;
    const warnRatio = ifaceFields.length ? (broken / ifaceFields.length) * 0.85 : 0;

    this.texInfo = makeTowerTexture({ accent: this.color, warnRatio, seed: seed || 1 });
    const tex = this.texInfo.tex;
    // repeat.x=2 just wraps the same panel around the box's 4 side faces;
    // repeat.y stays 1 so the full stack of rack segments stretches once
    // over the tower's height instead of tiling the same segments several
    // times up a tall tower (which was the "one repeating texture" look).
    tex.repeat.set(2, 1);

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.6,
      color: 0x07070c,
      roughness: 0.55,
      metalness: 0.25,
    });
    const geo = new THREE.BoxGeometry(this.width, this.height, this.width);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(this.x, this.height / 2, this.z);
    this.mesh.userData.tower = this;

    const edges = new THREE.EdgesGeometry(geo);
    this.mesh.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: this.color, transparent: true, opacity: 0.45 })));

    // outward direction from the canyon center — where this tower's cube/turret faces
    const len = Math.hypot(this.x, this.z) || 1;
    this.outward = { x: this.x / len, z: this.z / len };

    // live "server rack" motion: the whole panel slowly scrolls (trailing
    // log/data feel) and a handful of LEDs flicker on a staggered timer.
    this.scrollSpeed = 0.045 + (seed % 10) / 260;
    this._flickerAccum = (seed % 100) / 100;
    this.flickerInterval = 0.18 + (seed % 7) / 22;
  }

  update(dt) {
    this.texInfo.tex.offset.y -= dt * this.scrollSpeed;
    this._flickerAccum += dt;
    if (this._flickerAccum >= this.flickerInterval) {
      this._flickerAccum = 0;
      flickerTowerBlocks(this.texInfo.ctx, this.texInfo.blocks, 3 + ((Math.random() * 4) | 0), '#020409');
      this.texInfo.tex.needsUpdate = true;
    }
  }

  addTo(scene) {
    scene.add(this.mesh);
  }
}

class DataCube {
  constructor(tower, field, statusColor, label) {
    this.tower = tower;
    this.field = field;
    const dist = tower.width * 0.5 + 3.4;
    this.x = tower.x + tower.outward.x * dist;
    this.z = tower.z + tower.outward.z * dist;
    this.y = 4 + (hashStr(tower.id + field.id) % 5) * 2.2;

    const size = 2.4;
    const group = new THREE.Group();

    const glassGeo = new THREE.BoxGeometry(size, size, size);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x1c2740,
      transparent: true,
      opacity: 0.28,
      roughness: 0.15,
      metalness: 0.05,
    });
    group.add(new THREE.Mesh(glassGeo, glassMat));

    const edges = new THREE.EdgesGeometry(glassGeo);
    group.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: statusColor, transparent: true, opacity: 0.85 })));

    this.colorCss = colorToCss(statusColor);
    this.label = label;
    this.ipLine = `${field.ip}/${field.mask}`;
    this.logLines = [];
    for (let i = 0; i < 5; i++) this.logLines.push(this._randomLogLine());
    this.pulse = 0;

    this.faceInfo = makeCubeFaceTexture({ color: this.colorCss, label, ipLine: this.ipLine, logLines: this.logLines });
    const faceMat = new THREE.MeshBasicMaterial({ map: this.faceInfo.tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const faceGeo = new THREE.PlaneGeometry(size * 0.92, size * 0.92);
    const front = new THREE.Mesh(faceGeo, faceMat);
    front.position.z = size / 2 + 0.03;
    group.add(front);
    const back = new THREE.Mesh(faceGeo, faceMat);
    back.position.z = -(size / 2 + 0.03);
    back.rotation.y = Math.PI;
    group.add(back);

    group.position.set(this.x, this.y, this.z);
    group.userData.dataCube = this;
    this.group = group;
    this.spinSpeed = 0.15 + (hashStr(field.id) % 10) / 40;

    // trailing-log timer: staggered per cube so they don't all update in lockstep
    const seed = hashStr(tower.id + field.id);
    this._flickerAccum = (seed % 100) / 100;
    this.flickerInterval = 0.55 + (seed % 9) / 12;
  }

  // A short synthetic log line flavored by this field's real state, used to
  // fake a scrolling status feed on the cube face. Mixes in generated
  // "Cyber"-named hosts, varied IPs, and real top-10 bash commands
  // (flavor.js) alongside the protocol-state lines for variety.
  _randomLogLine() {
    const rand = Math.random;
    const f = this.field;
    if (f.consistent) {
      const opts = [
        `${f.proto} keepalive ok`,
        `peer ${f.peer ? f.peer.device : 'n/a'} up`,
        `tx ${randGlyphs(4)} rx ${randGlyphs(4)}`,
        `vrf ${f.vrf} stable`,
        `$ ${randCommand(rand)}`,
        `ssh admin@${randHostname(rand)}`,
        `route via ${randIpMaybeMasked(rand)}`,
      ];
      return opts[(Math.random() * opts.length) | 0];
    }
    const opts = [
      `${f.proto} retry #${1 + ((Math.random() * 9) | 0)}`,
      `WARN ${(f.issue || '').slice(0, 20)}`,
      `no response ${randGlyphs(4)}`,
      `vrf ${f.vrf} check`,
      `$ ${randCommand(rand)}`,
      `timeout to ${randHostname(rand)}`,
      `no arp for ${randIpMaybeMasked(rand, 0.2)}`,
    ];
    return opts[(Math.random() * opts.length) | 0];
  }

  update(t, dt) {
    this.group.rotation.y = t * this.spinSpeed;
    this.group.position.y = this.y + Math.sin(t * 0.8 + this.x) * 0.3;

    let dirty = false;
    this._flickerAccum += dt;
    if (this._flickerAccum >= this.flickerInterval) {
      this._flickerAccum = 0;
      this.logLines.shift();
      this.logLines.push(this._randomLogLine());
      this.pulse = 1;
      dirty = true;
    } else if (this.pulse > 0.01) {
      this.pulse = Math.max(0, this.pulse - dt * 2.2);
      dirty = true;
    }
    if (dirty) {
      drawCubeFace(this.faceInfo.ctx, 256, 256, {
        color: this.colorCss,
        label: this.label,
        ipLine: this.ipLine,
        logLines: this.logLines,
        pulse: this.pulse,
      });
      this.faceInfo.tex.needsUpdate = true;
    }
  }

  addTo(scene) {
    scene.add(this.group);
  }
}

function colorToCss(c) {
  return '#' + new THREE.Color(c).getHexString();
}

class GreenLink3D {
  constructor(cubeA, cubeB) {
    this.a = cubeA;
    this.b = cubeB;
    this.phase = Math.random() * Math.PI * 2;
    this._rebuild();
  }

  _rebuild() {
    const a = new THREE.Vector3(this.a.x, this.a.y, this.a.z);
    const b = new THREE.Vector3(this.b.x, this.b.y, this.b.z);
    const mid = a.clone().lerp(b, 0.5);
    mid.y = Math.min(a.y, b.y) * 0.4;
    this.curve = new THREE.CatmullRomCurve3([a, mid, b]);
    const geo = new THREE.TubeGeometry(this.curve, 24, 0.14, 6, false);
    const mat = new THREE.MeshBasicMaterial({ color: 0x5cf29a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.Mesh(geo, mat);

    const pulseGeo = new THREE.SphereGeometry(0.32, 8, 8);
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0xd6ffe6, blending: THREE.AdditiveBlending, depthWrite: false });
    this.pulse = new THREE.Mesh(pulseGeo, pulseMat);
  }

  update(t) {
    const tt = (t * 0.18 + this.phase) % 1;
    const p = this.curve.getPointAt(tt < 0 ? tt + 1 : tt);
    this.pulse.position.copy(p);
  }

  addTo(scene) {
    scene.add(this.mesh);
    scene.add(this.pulse);
  }
}

class Turret3D {
  constructor(cube) {
    this.cube = cube;
    this.field = cube.field;
    this.alive = true;
    this.origin = new THREE.Vector3(cube.x, cube.y + 1.6, cube.z);
    const seed = hashStr(cube.tower.id + cube.field.id);
    this.baseAngle = Math.atan2(cube.tower.outward.z, cube.tower.outward.x);
    this.sweepSpeed = 0.7 + (seed % 10) / 10;
    this.sweepAmp = (Math.PI / 180) * (30 + (seed % 20));
    this.driftSpeed = 0.1 + ((seed >> 3) % 10) / 70;
    this.driftAmp = (Math.PI / 180) * (24 + ((seed >> 3) % 14));
    this.phase = (seed % 628) / 100;
    this.length = 46;
    // half the angular width of the danger arc — a bold, wide wedge, not a line
    this.halfWidth = (Math.PI / 180) * (22 + ((seed >> 5) % 14)); // 22-35deg
    this.currentOffset = 0;

    // Every turret sweeps a circle-segment arc within a plane through its
    // origin. Roughly half sweep flat (horizontal, like the original ground-
    // hugging fan) and half stand the arc up so it scans vertically.
    this.vertical = (seed & 1) === 1;
    this.axisA = new THREE.Vector3(Math.cos(this.baseAngle), 0, Math.sin(this.baseAngle));
    this.axisB = this.vertical
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(-Math.sin(this.baseAngle), 0, Math.cos(this.baseAngle));
    this.normalAxis = this.axisA.clone().cross(this.axisB).normalize();
    const basis = new THREE.Matrix4().makeBasis(this.axisA, this.axisB, this.normalAxis);
    this.baseQuat = new THREE.Quaternion().setFromRotationMatrix(basis);

    const emitterGeo = new THREE.IcosahedronGeometry(1.1, 0);
    const emitterMat = new THREE.MeshBasicMaterial({ color: 0xff2d3d });
    this.emitterMesh = new THREE.Mesh(emitterGeo, emitterMat);
    this.emitterMesh.position.copy(this.origin);

    // A wide, bold circle-segment (pie-slice) wedge instead of a thin beam
    // line — one flat, solid, highly-opaque color (not a soft additive
    // glow/gradient) so it reads as a solid hazard at a glance.
    const beamGeo = new THREE.RingGeometry(0.6, this.length, 48, 1, -this.halfWidth, this.halfWidth * 2);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xff3040,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.beamMesh = new THREE.Mesh(beamGeo, beamMat);
    this.beamMesh.position.copy(this.origin);

    this.light = new THREE.PointLight(0xff2d3d, 1.6, 22, 2);
    this.light.position.copy(this.origin);
  }

  sweepOffset(t) {
    const drift = Math.sin(t * this.driftSpeed + this.phase) * this.driftAmp;
    const sweep = Math.sin(t * this.sweepSpeed * 1.8 + this.phase * 1.7) * this.sweepAmp;
    return drift + sweep;
  }

  beamEnd(t) {
    const o = this.sweepOffset(t);
    return this.origin
      .clone()
      .addScaledVector(this.axisA, Math.cos(o) * this.length)
      .addScaledVector(this.axisB, Math.sin(o) * this.length);
  }

  update(t) {
    if (!this.alive) {
      this.beamMesh.visible = false;
      return;
    }
    this.currentOffset = this.sweepOffset(t);
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.currentOffset);
    this.beamMesh.quaternion.copy(this.baseQuat).multiply(rot);
  }

  // True if `point` (with an effective collision radius) falls inside the
  // swept wedge: within range, within the arc's angular width of the
  // current sweep direction, and close enough to the sweep plane.
  hitTest(point, extraRadius) {
    if (!this.alive) return false;
    const rel = point.clone().sub(this.origin);
    const a = rel.dot(this.axisA);
    const b = rel.dot(this.axisB);
    const n = rel.dot(this.normalAxis);
    if (Math.abs(n) > extraRadius + 0.9) return false; // out of the wedge's slab
    const planarR = Math.hypot(a, b);
    if (planarR > this.length + extraRadius) return false;
    const angle = Math.atan2(b, a);
    let diff = Math.abs(angle - this.currentOffset);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    const angularTolerance = extraRadius / Math.max(planarR, 1.5);
    return diff <= this.halfWidth + angularTolerance;
  }

  hit() {
    this.alive = false;
    this.field.consistent = true;
    this.field.status = 'up';
    this.emitterMesh.visible = false;
    this.light.intensity = 0;
  }

  addTo(scene) {
    scene.add(this.emitterMesh);
    scene.add(this.beamMesh);
    scene.add(this.light);
  }
}

// Build the full 3D world (towers, cubes, links, turrets) from DEVICES.
function buildWorld3D(deviceData) {
  const cloned = structuredClone(deviceData);
  const towers = cloned.map((d) => new Tower(d));
  const byId = Object.fromEntries(towers.map((t) => [t.id, t]));

  const cubes = []; // one per iface field
  const cubeByKey = {};
  for (const tower of towers) {
    for (const field of tower.data.fields) {
      if (field.type !== 'iface') continue;
      const statusColor = field.consistent ? 0x5cf29a : 0xff4d5e;
      const cube = new DataCube(tower, field, statusColor, `${tower.data.name} ${field.id}`);
      cubes.push(cube);
      cubeByKey[tower.id + '#' + field.id] = cube;
    }
  }

  const links = [];
  const seenPairs = new Set();
  const turrets = [];

  for (const tower of towers) {
    for (const field of tower.data.fields) {
      if (field.type !== 'iface') continue;
      const cube = cubeByKey[tower.id + '#' + field.id];
      if (field.consistent) {
        if (!field.peer) continue;
        const key = [tower.id + '#' + field.id, field.peer.device + '#' + field.peer.field].sort().join('|');
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        const peerCube = cubeByKey[field.peer.device + '#' + field.peer.field];
        if (!peerCube) continue;
        links.push(new GreenLink3D(cube, peerCube));
      } else {
        turrets.push(new Turret3D(cube));
      }
    }
  }

  return { towers, cubes, links, turrets, byId };
}
