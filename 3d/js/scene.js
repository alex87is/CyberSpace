/**
 * scene.js — renderer, camera, lighting, fog, starfield and the circuit-lit
 * ground plane. Everything that isn't a game entity lives here.
 */

function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02030a);
  scene.fog = new THREE.FogExp2(0x03040c, 0.0072);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);

  // ---- lighting: mostly self-lit neon city, a little ambient + one cool key light
  scene.add(new THREE.AmbientLight(0x1a2540, 1.4));
  const key = new THREE.DirectionalLight(0x8fd0ff, 0.5);
  key.position.set(60, 120, 40);
  scene.add(key);
  const rim = new THREE.PointLight(0xff5fae, 0.6, 400, 2);
  rim.position.set(-80, 40, -80);
  scene.add(rim);

  // ---- starfield: distant points above the canyon, colored from the same
  // neon palette as the rest of the scene (cyan links, pink rim light,
  // green "ok" glow, amber bullets) instead of plain white, with a few
  // brighter "signal" layers that twinkle out of phase with each other.
  const STAR_PALETTE = [0xbfe0ff, 0xbfe0ff, 0xbfe0ff, 0x4fd1ff, 0xff5fae, 0x5cf29a, 0xffe98a];
  const tmpColor = new THREE.Color();
  const starSprite = makeStarSpriteTexture();

  // shared material for every star layer: a soft round glow sprite,
  // additively blended, so stars read as glowing dots — the same "manner"
  // as the bullets, engine glow, and cube pulses elsewhere in the scene —
  // not flat squares. fog: false is the important part — the canyon's
  // atmospheric fog is tuned for nearby objects and was fully swallowing
  // stars at any real distance, which is why they weren't visible at all
  // before.
  function makeStarMaterial(size, opacity) {
    return new THREE.PointsMaterial({
      size,
      sizeAttenuation: true,
      map: starSprite,
      transparent: true,
      opacity,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
  }

  function addStarPoints(pos, col, size, opacity) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const points = new THREE.Points(geo, makeStarMaterial(size, opacity));
    scene.add(points);
    return points;
  }

  // the distant sky dome: a hemisphere shell well outside the canyon
  function makeStarLayer(count, { rMin, rMax, size, opacity }) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = rMin + Math.random() * (rMax - rMin);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5 + 0.05;
      pos[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
      pos[i * 3 + 1] = Math.cos(phi) * r * 0.6 + 60;
      pos[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * r;
      tmpColor.set(STAR_PALETTE[(Math.random() * STAR_PALETTE.length) | 0]);
      col[i * 3] = tmpColor.r;
      col[i * 3 + 1] = tmpColor.g;
      col[i * 3 + 2] = tmpColor.b;
    }
    return addStarPoints(pos, col, size, opacity);
  }

  // near-field stars scattered directly through the canyon's flight
  // envelope (roughly the same x/z/y range the ship actually flies in),
  // not just a distant backdrop — so there's something to fly past, not
  // only a sky dome overhead.
  function makeFieldStarLayer(count, { xRange, zRange, yMin, yMax, size, opacity }) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * xRange;
      pos[i * 3 + 1] = yMin + Math.random() * (yMax - yMin);
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * zRange;
      tmpColor.set(STAR_PALETTE[(Math.random() * STAR_PALETTE.length) | 0]);
      col[i * 3] = tmpColor.r;
      col[i * 3 + 1] = tmpColor.g;
      col[i * 3 + 2] = tmpColor.b;
    }
    return addStarPoints(pos, col, size, opacity);
  }

  // the bulk field: dense, small, steady
  const stars = makeStarLayer(900, { rMin: 500, rMax: 1400, size: 4, opacity: 0.9 });
  // a few sparser layers of bigger, brighter stars, each independently
  // twinkled (see Game3D's per-frame update) so the sky doesn't pulse
  // as one flat block
  const starTwinkleLayers = [
    { points: makeStarLayer(26, { rMin: 550, rMax: 1350, size: 8, opacity: 1 }), phase: 0, speed: 1.1 },
    { points: makeStarLayer(22, { rMin: 550, rMax: 1350, size: 9, opacity: 1 }), phase: 2.1, speed: 0.9 },
    { points: makeStarLayer(18, { rMin: 550, rMax: 1350, size: 10.5, opacity: 1 }), phase: 4.2, speed: 1.4 },
  ];
  // scattered through the airspace the ship actually flies in (bounds
  // roughly match Game3D's flight clamp, minY:2/maxY:75, with some margin
  // beyond the canyon's width/depth) — static, no rotation, so they feel
  // grounded in the play space rather than part of the distant sky
  const fieldStars = makeFieldStarLayer(260, { xRange: 150, zRange: 110, yMin: 4, yMax: 85, size: 3, opacity: 0.85 });

  // ---- ground: dark circuit-trace floor, tiled
  const groundTex = makeGroundTexture();
  const groundSize = 420;
  groundTex.repeat.set(groundSize / 24, groundSize / 24);
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex,
    emissiveMap: groundTex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.05,
    color: 0x0a0a12,
    roughness: 0.6,
    metalness: 0.2,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  return { renderer, scene, camera, stars, starTwinkleLayers, fieldStars };
}
