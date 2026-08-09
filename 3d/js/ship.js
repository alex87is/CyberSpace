/**
 * ship.js — the player's craft, its bullets, and hit/explosion particles.
 */

const SHIP_SCALE = 0.65; // shrink the whole mesh; radius/fire offset below match it

function buildShipMesh() {
  const group = new THREE.Group();

  const bodyGeo = new THREE.ConeGeometry(0.9, 3.2, 7);
  bodyGeo.rotateX(Math.PI / 2); // apex now points along +Z ("forward")
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe6f6ff, emissive: 0x2f6fa0, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.35 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  const wingGeo = new THREE.BoxGeometry(2.6, 0.12, 1.1);
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x123047, emissive: 0x4fd1ff, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.5 });
  const wing = new THREE.Mesh(wingGeo, wingMat);
  wing.position.set(0, 0, -0.4);
  group.add(wing);

  const finGeo = new THREE.BoxGeometry(0.12, 1.0, 0.9);
  const fin = new THREE.Mesh(finGeo, wingMat);
  fin.position.set(0, 0.45, -0.9);
  group.add(fin);

  const glowGeo = new THREE.SphereGeometry(0.35, 8, 8);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x8fe0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const engineGlow = new THREE.Mesh(glowGeo, glowMat);
  engineGlow.position.set(0, 0, -1.7);
  group.add(engineGlow);

  const light = new THREE.PointLight(0x6fd4ff, 1.4, 26, 2);
  light.position.set(0, 0.5, 0);
  group.add(light);

  group.scale.setScalar(SHIP_SCALE); // smaller, easier to see around/aim past
  return { group, engineGlow };
}

class Ship3D {
  constructor(x, y, z) {
    const built = buildShipMesh();
    this.group = built.group;
    this.engineGlow = built.engineGlow;
    this.group.position.set(x, y, z);

    // Orientation stored as yaw/pitch (roll left purely cosmetic, tracked separately).
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.velocity = new THREE.Vector3();
    this.radius = 1.6 * SHIP_SCALE; // collision hitbox follows the smaller mesh
    this.thrusting = false;
    this.invulnUntil = 0;
    this.fireCooldown = 0;

    this._forward = new THREE.Vector3(0, 0, 1);
    this._quat = new THREE.Quaternion();
  }

  get position() {
    return this.group.position;
  }

  forward() {
    this._quat.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
    return this._forward.clone().applyQuaternion(this._quat);
  }

  update(dt, input, t, bounds) {
    const YAW_SPEED = 1.7;
    const PITCH_SPEED = 1.3;
    const ROLL_TARGET = 0.55;
    const THRUST = 34; // acceleration while holding thrust — bounded by MAX_SPEED, not infinite
    const DRAG = 1.15; // brings the ship to a real stop soon after you let go, for aiming
    const MAX_SPEED = 55;

    if (input.left) this.yaw += YAW_SPEED * dt;
    if (input.right) this.yaw -= YAW_SPEED * dt;
    if (input.up) this.pitch += PITCH_SPEED * dt;
    if (input.down) this.pitch -= PITCH_SPEED * dt;
    this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch));

    const rollTarget = (input.left ? ROLL_TARGET : 0) + (input.right ? -ROLL_TARGET : 0);
    this.roll += (rollTarget - this.roll) * Math.min(1, dt * 4);

    // The ship sits still by default — it only moves while thrust is held,
    // and coasts to a stop (not a dead stop instantly) once released, so
    // aiming at a stationary or slow-drifting target is actually possible.
    this.thrusting = !!input.thrust;
    const fwd = this.forward();
    if (this.thrusting) {
      this.velocity.addScaledVector(fwd, THRUST * dt);
      if (this.velocity.length() > MAX_SPEED) this.velocity.setLength(MAX_SPEED);
    }
    this.velocity.multiplyScalar(Math.max(0, 1 - DRAG * dt));
    if (this.velocity.lengthSq() < 0.0004) this.velocity.set(0, 0, 0);

    this.group.position.addScaledVector(this.velocity, dt);
    this.group.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.group.position.x));
    this.group.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, this.group.position.z));
    this.group.position.y = Math.max(bounds.minY, Math.min(bounds.maxY, this.group.position.y));

    this._quat.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
    this.group.quaternion.copy(this._quat);

    this.engineGlow.material.opacity = this.thrusting ? 0.95 : 0.35 + Math.sin(t * 6) * 0.1;
    this.engineGlow.scale.setScalar(this.thrusting ? 1.3 + Math.random() * 0.4 : 0.8);

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
    this.fireCooldown = 0.2;
    const fwd = this.forward();
    const pos = this.group.position.clone().addScaledVector(fwd, 2.2 * SHIP_SCALE); // just ahead of the (smaller) nose
    const vel = fwd.clone().multiplyScalar(120).add(this.velocity.clone().multiplyScalar(0.3));
    return new Bullet3D(pos, vel);
  }
}

class Bullet3D {
  constructor(pos, vel) {
    this.position = pos;
    this.velocity = vel;
    this.life = 1.4;
    this.dead = false;
    const geo = new THREE.SphereGeometry(0.28, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe98a, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(pos);
  }
  update(dt) {
    this.position.addScaledVector(this.velocity, dt);
    this.mesh.position.copy(this.position);
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
}

class Particle3D {
  constructor(pos, color) {
    const a = Math.random() * Math.PI * 2;
    const b = Math.random() * Math.PI - Math.PI / 2;
    const s = 8 + Math.random() * 24;
    this.velocity = new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)).multiplyScalar(s);
    this.position = pos.clone();
    this.life = 0.4 + Math.random() * 0.6;
    this.maxLife = this.life;
    const geo = new THREE.SphereGeometry(0.18 + Math.random() * 0.22, 5, 5);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(pos);
  }
  update(dt) {
    this.velocity.multiplyScalar(0.92);
    this.position.addScaledVector(this.velocity, dt);
    this.mesh.position.copy(this.position);
    this.life -= dt;
    this.mesh.material.opacity = Math.max(0, this.life / this.maxLife);
  }
  get dead() {
    return this.life <= 0;
  }
}
