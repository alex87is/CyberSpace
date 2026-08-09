/**
 * starfield.js — layered parallax starfield + faint nav-grid backdrop.
 */

class Starfield {
  constructor(worldW, worldH) {
    this.layers = [
      { count: 140, speed: 0.25, size: [0.6, 1.4], color: '160,190,255', stars: [] },
      { count: 90, speed: 0.5, size: [1, 2], color: '190,220,255', stars: [] },
      { count: 45, speed: 0.85, size: [1.4, 2.8], color: '255,255,255', stars: [] },
    ];
    // Stars live in an oversized field so parallax scroll never runs out.
    const pad = 800;
    for (const layer of this.layers) {
      for (let i = 0; i < layer.count; i++) {
        const [lo, hi] = layer.size;
        layer.stars.push({
          x: Math.random() * (worldW + pad * 2) - pad,
          y: Math.random() * (worldH + pad * 2) - pad,
          r: lo + Math.random() * (hi - lo),
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleSpeed: 0.5 + Math.random() * 1.5,
        });
      }
    }
  }

  draw(ctx, camera, viewW, viewH, t) {
    // Deep-space gradient backdrop.
    const g = ctx.createRadialGradient(
      viewW / 2,
      viewH / 2,
      0,
      viewW / 2,
      viewH / 2,
      Math.max(viewW, viewH) * 0.8
    );
    g.addColorStop(0, '#0a1030');
    g.addColorStop(1, '#020308');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);

    for (const layer of this.layers) {
      const ox = camera.x * layer.speed;
      const oy = camera.y * layer.speed;
      for (const s of layer.stars) {
        const sx = s.x - ox;
        const sy = s.y - oy;
        if (sx < -20 || sy < -20 || sx > viewW + 20 || sy > viewH + 20) continue;
        const tw = 0.55 + 0.45 * Math.sin(t * s.twinkleSpeed + s.twinklePhase);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${layer.color},${tw.toFixed(3)})`;
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Faint far-space nav grid for spatial reference.
    ctx.save();
    ctx.strokeStyle = 'rgba(80,140,220,0.06)';
    ctx.lineWidth = 1;
    const grid = 160;
    const gx = -((camera.x * 0.3) % grid);
    const gy = -((camera.y * 0.3) % grid);
    for (let x = gx; x < viewW; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, viewH);
      ctx.stroke();
    }
    for (let y = gy; y < viewH; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(viewW, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}
