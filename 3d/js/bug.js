/**
 * bug.js — a literal "bug": a small hostile creature that spawns out of a
 * still-broken device turret and homes in on the ship. One shot kills it;
 * touching the ship costs a life (same rules as the laser beams). Fixing a
 * turret stops it spawning more, so pressure eases as inconsistencies get
 * cleared. Shaped like the classic software-bug icon: oval body, head,
 * antennae, six legs.
 */

function buildBugMesh(color) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x220a14,
    emissive: color,
    emissiveIntensity: 1.15,
    roughness: 0.4,
    metalness: 0.3,
    flatShading: true,
  });
  const limbMat = new THREE.MeshStandardMaterial({
    color: 0x0d0308,
    emissive: color,
    emissiveIntensity: 0.7,
    roughness: 0.6,
  });

  // oval body, flattened top-down like a beetle
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), bodyMat);
  body.scale.set(1, 0.62, 1.35);
  group.add(body);

  // faint segment line down the back
  const spine = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.05, 1.3),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 })
  );
  spine.position.set(0, 0.36, 0);
  group.add(spine);

  // head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), bodyMat);
  head.position.set(0, 0.02, 0.72);
  head.scale.set(0.9, 0.85, 0.8);
  group.add(head);

  // six legs, three splayed pairs along the body
  const legGeo = new THREE.CylinderGeometry(0.045, 0.03, 0.6, 4);
  for (const z of [-0.32, 0.02, 0.36]) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, limbMat);
      leg.position.set(side * 0.42, -0.18, z);
      leg.rotation.z = side * 0.95;
      leg.rotation.x = (Math.random() - 0.5) * 0.3;
      group.add(leg);
    }
  }

  // two antennae
  const antGeo = new THREE.CylinderGeometry(0.025, 0.01, 0.5, 4);
  for (const side of [-1, 1]) {
    const ant = new THREE.Mesh(antGeo, limbMat);
    ant.position.set(side * 0.14, 0.32, 0.95);
    ant.rotation.z = side * 0.5;
    ant.rotation.x = -0.6;
    group.add(ant);
  }

  // two bright eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 6), eyeMat);
    eye.position.set(side * 0.2, 0.12, 0.95);
    group.add(eye);
  }

  return group;
}

class Bug3D {
  constructor(pos) {
    this.position = pos.clone();
    this.velocity = new THREE.Vector3();
    this.radius = 1.0;
    this.alive = true;
    this.jitterSeed = Math.random() * 1000;

    this.mesh = buildBugMesh(0xff2d8a);
    this.mesh.position.copy(this.position);

    this.light = new THREE.PointLight(0xff2d8a, 0.9, 16, 2);
    this.light.position.copy(this.position);
  }

  // Steers toward targetPos with a bit of organic wobble; returns the
  // (un-jittered) distance to the target so the caller can test contact.
  update(dt, t, targetPos) {
    const SPEED = 15;
    const TURN = 2.6;

    const toTarget = targetPos.clone().sub(this.position);
    const dist = toTarget.length();
    if (dist > 0.01) toTarget.normalize();
    const desired = toTarget.multiplyScalar(SPEED);
    this.velocity.lerp(desired, Math.min(1, TURN * dt));
    this.position.addScaledVector(this.velocity, dt);

    const jx = Math.sin(t * 6 + this.jitterSeed) * 0.22;
    const jy = Math.cos(t * 5.3 + this.jitterSeed * 1.7) * 0.16;
    const jz = Math.sin(t * 4.7 + this.jitterSeed * 2.3) * 0.22;
    this.mesh.position.set(this.position.x + jx, this.position.y + jy, this.position.z + jz);
    this.light.position.copy(this.mesh.position);

    // face travel direction, with a glitchy flicker/tumble on top
    if (this.velocity.lengthSq() > 0.01) {
      const lookTarget = this.mesh.position.clone().add(this.velocity);
      this.mesh.up.set(0, 1, 0);
      this.mesh.lookAt(lookTarget);
    }
    this.mesh.visible = Math.random() > 0.04;
    const wobble = Math.sin(t * 9 + this.jitterSeed) * 0.15;
    this.mesh.rotateZ(wobble * dt * 3);
    const s = 0.9 + Math.sin(t * 10 + this.jitterSeed) * 0.1;
    this.mesh.scale.setScalar(s);

    return dist;
  }

  addTo(scene) {
    scene.add(this.mesh);
    scene.add(this.light);
  }

  removeFrom(scene) {
    scene.remove(this.mesh);
    scene.remove(this.light);
  }
}
