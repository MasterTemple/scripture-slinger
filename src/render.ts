import type { Enemy, FloatText, Particle, Projectile, Ring, Star } from './entities';

const TAU = Math.PI * 2;
export const MONO = '"JetBrains Mono", ui-monospace, monospace';
export const SERIF = '"Cinzel", Georgia, serif';
export const BOOK = '"EB Garamond", Georgia, serif';
export const GOLD = '#f2c14e';

function layer(w: number, h: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * dpr);
  c.height = Math.ceil(h * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  return [c, g];
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

export function buildSky(w: number, h: number, dpr: number): HTMLCanvasElement {
  const [c, g] = layer(w, h, dpr);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#05061a');
  sky.addColorStop(0.45, '#151239');
  sky.addColorStop(0.7, '#3a2052');
  sky.addColorStop(0.86, '#8a3f4c');
  sky.addColorStop(1, '#d9824a');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  const mx = w * 0.84;
  const my = h * 0.17;
  const mr = Math.max(18, Math.min(w, h) * 0.045);
  const glow = g.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 5);
  glow.addColorStop(0, 'rgba(255, 236, 190, 0.28)');
  glow.addColorStop(1, 'rgba(255, 236, 190, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#f7ecd0';
  g.beginPath();
  g.arc(mx, my, mr, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(180, 160, 130, 0.25)';
  g.beginPath();
  g.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.22, 0, TAU);
  g.arc(mx + mr * 0.35, my + mr * 0.3, mr * 0.15, 0, TAU);
  g.fill();
  return c;
}

function hills(g: CanvasRenderingContext2D, w: number, h: number, base: number, amp: number, r: () => number) {
  const a1 = r() * 6;
  const a2 = r() * 6;
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w + 8; x += 8) {
    const y = base - amp * (0.5 + 0.3 * Math.sin(x * 0.004 + a1) + 0.2 * Math.sin(x * 0.013 + a2));
    g.lineTo(x, y);
  }
  g.lineTo(w, h);
  g.closePath();
  g.fill();
}

function city(g: CanvasRenderingContext2D, w: number, baseY: number, r: () => number) {
  const width = Math.min(w * 0.7, 900);
  const left = (w - width) / 2;
  const wallH = 22;
  const lights: [number, number][] = [];

  g.fillStyle = '#1e1130';
  g.fillRect(left, baseY - wallH, width, wallH + 40);
  for (let x = left; x < left + width; x += 10) g.fillRect(x, baseY - wallH - 5, 5, 5);

  for (let x = left; x <= left + width; x += width / 8) {
    const th = 38 + r() * 14;
    g.fillRect(x - 9, baseY - th, 18, th);
    for (let cx = x - 9; cx < x + 9; cx += 6) g.fillRect(cx, baseY - th - 4, 3, 4);
    if (r() > 0.4) lights.push([x - 2, baseY - th + 10]);
  }

  // Houses and domes peeking over the wall.
  for (let i = 0; i < 26; i++) {
    const x = left + r() * width;
    const hh = 10 + r() * 16;
    const ww = 12 + r() * 16;
    g.fillRect(x, baseY - wallH - hh, ww, hh);
    if (r() > 0.7) {
      g.beginPath();
      g.arc(x + ww / 2, baseY - wallH - hh, ww / 2, Math.PI, 0);
      g.fill();
    }
    if (r() > 0.5) lights.push([x + ww * r() * 0.7, baseY - wallH - hh + 5]);
  }

  // The temple on its platform.
  const tx = left + width * 0.62;
  const ty = baseY - wallH - 14;
  g.fillRect(tx - 70, ty, 140, 14);
  g.fillRect(tx - 34, ty - 46, 68, 46);
  g.fillRect(tx - 44, ty - 30, 88, 30);
  g.beginPath();
  g.moveTo(tx - 40, ty - 46);
  g.lineTo(tx, ty - 62);
  g.lineTo(tx + 40, ty - 46);
  g.fill();
  g.fillStyle = 'rgba(242, 193, 78, 0.55)';
  for (let i = -2; i <= 2; i++) g.fillRect(tx + i * 12 - 1.5, ty - 40, 3, 26);

  for (const [lx, ly] of lights) {
    g.fillStyle = 'rgba(255, 190, 100, 0.85)';
    g.fillRect(lx, ly, 2.5, 3.5);
  }
}

export function buildLand(w: number, h: number, dpr: number): HTMLCanvasElement {
  const [c, g] = layer(w, h, dpr);
  const r = seeded(7);

  g.fillStyle = '#2b1839';
  hills(g, w, h, h * 0.8, 70, r);
  city(g, w, h * 0.8, r);
  g.fillStyle = '#180d24';
  hills(g, w, h, h * 0.9, 40, r);

  // Foreground ground where David stands.
  g.fillStyle = '#0d0716';
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(0, h - 36);
  g.quadraticCurveTo(w / 2, h - 64, w, h - 36);
  g.lineTo(w, h);
  g.fill();
  return c;
}

export function makeStars(count: number): Star[] {
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random() * 0.7,
    r: Math.random() * 1.3 + 0.3,
    phase: Math.random() * TAU,
  }));
}

export function drawStars(g: CanvasRenderingContext2D, stars: Star[], w: number, h: number, t: number) {
  g.fillStyle = '#fff';
  for (const s of stars) {
    g.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.8 + s.phase)) * (1 - s.y);
    g.beginPath();
    g.arc(s.x * w, s.y * h, s.r, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// David
// ---------------------------------------------------------------------------

export function drawPlayer(g: CanvasRenderingContext2D, x: number, y: number, aim: number, swing: number, t: number) {
  const aura = g.createRadialGradient(x, y, 4, x, y, 70);
  aura.addColorStop(0, 'rgba(242, 193, 78, 0.28)');
  aura.addColorStop(1, 'rgba(242, 193, 78, 0)');
  g.fillStyle = aura;
  g.beginPath();
  g.arc(x, y, 70, 0, TAU);
  g.fill();

  // Rock.
  g.fillStyle = '#241a30';
  g.beginPath();
  g.ellipse(x, y + 32, 40, 12, 0, 0, TAU);
  g.fill();

  // Staff in the left hand.
  g.strokeStyle = '#7a5230';
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - 17, y + 28);
  g.lineTo(x - 15, y - 26);
  g.arc(x - 20, y - 26, 5, 0, Math.PI, true);
  g.stroke();

  // Legs.
  g.strokeStyle = '#c99a6b';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(x - 5, y + 12);
  g.lineTo(x - 7, y + 26);
  g.moveTo(x + 5, y + 12);
  g.lineTo(x + 7, y + 26);
  g.stroke();

  // Tunic and belt.
  g.fillStyle = '#e8dcc0';
  g.beginPath();
  g.moveTo(x - 9, y - 9);
  g.lineTo(x + 9, y - 9);
  g.lineTo(x + 13, y + 15);
  g.lineTo(x - 13, y + 15);
  g.closePath();
  g.fill();
  g.fillStyle = '#8a5a2b';
  g.fillRect(x - 10, y + 1, 20, 3);

  // Left arm to staff.
  g.strokeStyle = '#d9a877';
  g.lineWidth = 3.5;
  g.beginPath();
  g.moveTo(x - 7, y - 6);
  g.lineTo(x - 15, y + 2);
  g.stroke();

  // Head and hair.
  g.fillStyle = '#d9a877';
  g.beginPath();
  g.arc(x, y - 17, 7.5, 0, TAU);
  g.fill();
  g.fillStyle = '#4a2a16';
  g.beginPath();
  g.arc(x, y - 19, 8, Math.PI * 1.05, Math.PI * 1.95);
  g.fill();
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.arc(x + i * 3.2, y - 24, 2.4, 0, TAU);
    g.fill();
  }

  // Sling arm, raised toward the aim.
  const sx = x + 7;
  const sy = y - 6;
  const hx = sx + Math.cos(aim) * 15;
  const hy = sy + Math.sin(aim) * 15;
  g.strokeStyle = '#d9a877';
  g.lineWidth = 3.5;
  g.beginPath();
  g.moveTo(sx, sy);
  g.lineTo(hx, hy);
  g.stroke();

  const cordAngle = swing > 0 ? t * 28 : Math.PI / 2 + Math.sin(t * 2) * 0.15;
  const cord = swing > 0 ? 13 : 11;
  const px = hx + Math.cos(cordAngle) * cord;
  const py = hy + Math.sin(cordAngle) * cord;
  g.strokeStyle = '#a07c50';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(hx, hy);
  g.lineTo(px, py);
  g.stroke();
  g.fillStyle = '#6b4a2a';
  g.beginPath();
  g.arc(px, py, 2.6, 0, TAU);
  g.fill();
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

function drawLocust(g: CanvasRenderingContext2D, e: Enemy) {
  g.rotate(e.angle);
  const flap = Math.sin(e.age * 42);
  g.strokeStyle = '#5c4a1e';
  g.lineWidth = 1.8;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(-2, s * 4);
    g.lineTo(-9, s * 12);
    g.lineTo(-18, s * 7);
    g.moveTo(5, s * 4);
    g.lineTo(9, s * 9);
    g.stroke();
  }
  g.fillStyle = 'rgba(225, 205, 150, 0.5)';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(-5, s * (6 + flap * 3), 14, 3.5 + Math.abs(flap) * 2, s * 0.25, 0, TAU);
    g.fill();
  }
  g.fillStyle = '#8f7f2e';
  g.beginPath();
  g.ellipse(-2, 0, 15, 5.5, 0, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(40, 30, 10, 0.5)';
  g.lineWidth = 1;
  for (let i = -12; i < 4; i += 4) {
    g.beginPath();
    g.moveTo(i, -5);
    g.lineTo(i, 5);
    g.stroke();
  }
  g.fillStyle = '#6d5f1f';
  g.beginPath();
  g.arc(13, 0, 5.5, 0, TAU);
  g.fill();
  g.fillStyle = '#ffdd66';
  g.beginPath();
  g.arc(15, -2.6, 1.4, 0, TAU);
  g.arc(15, 2.6, 1.4, 0, TAU);
  g.fill();
  g.strokeStyle = '#6d5f1f';
  g.beginPath();
  g.moveTo(17, -2);
  g.quadraticCurveTo(24, -6, 27, -10);
  g.moveTo(17, 2);
  g.quadraticCurveTo(24, 6, 27, 10);
  g.stroke();
}

function drawRaven(g: CanvasRenderingContext2D, e: Enemy) {
  g.rotate(e.angle);
  // A cold rim light so the black bird reads against the night sky.
  g.shadowColor = 'rgba(170, 150, 255, 0.9)';
  g.shadowBlur = 10;
  const flap = Math.sin(e.age * 11);
  g.fillStyle = '#15101d';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(5, 0);
    g.lineTo(-4, s * (22 + flap * 7));
    g.lineTo(-12, s * (24 + flap * 9));
    g.lineTo(-10, s * (14 + flap * 4));
    g.lineTo(-8, 0);
    g.fill();
  }
  g.beginPath();
  g.moveTo(-12, 0);
  g.lineTo(-26, -7);
  g.lineTo(-24, 0);
  g.lineTo(-26, 7);
  g.fill();
  g.beginPath();
  g.ellipse(0, 0, 15, 7.5, 0, 0, TAU);
  g.fill();
  g.beginPath();
  g.arc(13, 0, 6.5, 0, TAU);
  g.fill();
  g.fillStyle = '#4a4050';
  g.beginPath();
  g.moveTo(18, -2.5);
  g.lineTo(28, 0);
  g.lineTo(18, 2.5);
  g.fill();
  g.fillStyle = '#ff5a3c';
  g.beginPath();
  g.arc(15, -3, 1.5, 0, TAU);
  g.arc(15, 3, 1.5, 0, TAU);
  g.fill();
}

function drawSerpent(g: CanvasRenderingContext2D, e: Enemy) {
  const ux = Math.cos(e.angle);
  const uy = Math.sin(e.angle);
  const segs = 16;
  const pts: [number, number][] = [];
  for (let i = 0; i <= segs; i++) {
    const back = i * 5.5;
    const wave = Math.sin(e.age * 6 - i * 0.6) * 9 * Math.min(1, i / 3);
    pts.push([-ux * back - uy * wave, -uy * back + ux * wave]);
  }

  const glow = g.createRadialGradient(0, 0, 4, 0, 0, 48);
  glow.addColorStop(0, 'rgba(255, 120, 40, 0.35)');
  glow.addColorStop(1, 'rgba(255, 120, 40, 0)');
  g.fillStyle = glow;
  g.beginPath();
  g.arc(-ux * 30, -uy * 30, 60, 0, TAU);
  g.fill();

  g.lineCap = 'round';
  for (const [color, extra] of [['#3a1208', 3], ['#d2602a', 0]] as const) {
    g.strokeStyle = color;
    for (let i = segs - 1; i >= 0; i--) {
      g.lineWidth = 3 + (1 - i / segs) * 9 + extra;
      g.beginPath();
      g.moveTo(pts[i + 1][0], pts[i + 1][1]);
      g.lineTo(pts[i][0], pts[i][1]);
      g.stroke();
    }
  }
  g.strokeStyle = 'rgba(255, 210, 110, 0.7)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(pts[segs][0], pts[segs][1]);
  for (let i = segs - 1; i >= 0; i--) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();

  g.rotate(e.angle);
  g.fillStyle = '#e0782f';
  g.strokeStyle = '#3a1208';
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(5, 0, 11, 8, 0, 0, TAU);
  g.fill();
  g.stroke();
  g.fillStyle = '#ffe08a';
  g.beginPath();
  g.arc(9, -4, 2, 0, TAU);
  g.arc(9, 4, 2, 0, TAU);
  g.fill();
  if (Math.sin(e.age * 9) > 0.2) {
    g.strokeStyle = '#ff3b3b';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(15, 0);
    g.lineTo(23, 0);
    g.lineTo(27, -3);
    g.moveTo(23, 0);
    g.lineTo(27, 3);
    g.stroke();
  }
}

function drawGoliath(g: CanvasRenderingContext2D, e: Enemy) {
  const step = Math.sin(e.age * 3);
  g.translate(0, Math.abs(step) * -3);
  g.lineCap = 'round';

  // Spear "like a weaver's beam".
  g.strokeStyle = '#6b4a2a';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(40, -86);
  g.lineTo(44, 58);
  g.stroke();
  g.fillStyle = '#cfd6dc';
  g.beginPath();
  g.moveTo(34, -84);
  g.lineTo(40, -112);
  g.lineTo(46, -84);
  g.fill();

  // Legs with bronze greaves.
  g.fillStyle = '#8c6a3a';
  g.fillRect(-18, 22 + step * 3, 13, 38);
  g.fillRect(5, 22 - step * 3, 13, 38);
  g.fillStyle = '#3a2618';
  g.fillRect(-20, 58 + step * 3, 17, 6);
  g.fillRect(3, 58 - step * 3, 17, 6);

  // Skirt.
  g.fillStyle = '#5a2e22';
  g.beginPath();
  g.moveTo(-24, 10);
  g.lineTo(24, 10);
  g.lineTo(28, 30);
  g.lineTo(-28, 30);
  g.fill();

  // Scale mail.
  g.fillStyle = '#a07a3c';
  g.beginPath();
  g.roundRect(-26, -30, 52, 44, 8);
  g.fill();
  g.strokeStyle = 'rgba(60, 40, 15, 0.55)';
  g.lineWidth = 1.2;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 6; col++) {
      g.beginPath();
      g.arc(-21 + col * 8.5 + (row % 2) * 4, -24 + row * 8, 4, 0, Math.PI);
      g.stroke();
    }
  }

  // Arms.
  g.strokeStyle = '#b8825a';
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(22, -24);
  g.lineTo(40, -6);
  g.moveTo(-22, -24);
  g.lineTo(-34, -4);
  g.stroke();

  // Shield.
  g.fillStyle = '#7a5530';
  g.strokeStyle = '#c9a45c';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(-36, 2, 20, 0, TAU);
  g.fill();
  g.stroke();
  g.fillStyle = '#c9a45c';
  g.beginPath();
  g.arc(-36, 2, 5, 0, TAU);
  g.fill();

  // Head, helmet and crest.
  g.fillStyle = '#b8825a';
  g.beginPath();
  g.arc(0, -44, 14, 0, TAU);
  g.fill();
  g.fillStyle = '#2a160c';
  g.beginPath();
  g.arc(0, -38, 11, 0.1 * Math.PI, 0.9 * Math.PI);
  g.fill();
  g.fillStyle = '#b08a46';
  g.beginPath();
  g.arc(0, -48, 15, Math.PI, 0);
  g.lineTo(15, -44);
  g.lineTo(-15, -44);
  g.fill();
  g.fillRect(-2, -50, 4, 14);
  g.fillStyle = '#9a1f1f';
  g.beginPath();
  g.ellipse(0, -66, 18, 5, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = '#ff6a3c';
  g.beginPath();
  g.arc(-6, -43, 1.8, 0, TAU);
  g.arc(6, -43, 1.8, 0, TAU);
  g.fill();
}

export function drawEnemy(g: CanvasRenderingContext2D, e: Enemy) {
  g.save();
  g.translate(e.x, e.y);
  if (e.kind === 'locust') drawLocust(g, e);
  else if (e.kind === 'raven') drawRaven(g, e);
  else if (e.kind === 'serpent') drawSerpent(g, e);
  else drawGoliath(g, e);
  g.restore();
  if (e.kind === 'goliath') drawHealth(g, e);

  if (e.flash > 0) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = `rgba(255, 240, 200, ${e.flash * 2.5})`;
    g.beginPath();
    g.arc(e.x, e.y, e.radius * 0.9, 0, TAU);
    g.fill();
    g.restore();
  }
}

/** A giant's health: how much of its phrase is left to type. */
function drawHealth(g: CanvasRenderingContext2D, e: Enemy) {
  const left = 1 - (e.spent + e.typed) / e.total;
  const w = 96;
  const h = 8;
  const x = e.x - w / 2;
  // Under the word, which stays on screen while the giant comes in from the top.
  const y = Math.max(labelY(e), 20) + 22;
  g.save();
  g.fillStyle = 'rgba(10, 6, 22, 0.8)';
  g.strokeStyle = 'rgba(242, 193, 78, 0.6)';
  g.lineWidth = 1;
  g.beginPath();
  g.roundRect(x - 2, y - 2, w + 4, h + 4, 4);
  g.fill();
  g.stroke();
  // Gold when fresh, red when nearly down.
  g.fillStyle = left > 0.5 ? GOLD : left > 0.25 ? '#ff9a3c' : '#e5484d';
  g.beginPath();
  g.roundRect(x, y, w * left, h, 3);
  g.fill();
  // A notch where each word of the phrase ends.
  g.fillStyle = 'rgba(10, 6, 22, 0.9)';
  let at = e.spent + e.target.length;
  for (const word of e.queue) {
    g.fillRect(x + (w * (e.total - at)) / e.total - 0.5, y, 1, h);
    at += word.target.length;
  }
  g.restore();
}

export function drawReticle(g: CanvasRenderingContext2D, e: Enemy, t: number) {
  const r = e.radius + 12 + Math.sin(t * 6) * 2;
  g.save();
  g.translate(e.x, e.y);
  g.rotate(t * 1.5);
  g.strokeStyle = GOLD;
  g.lineWidth = 2;
  g.shadowColor = GOLD;
  g.shadowBlur = 10;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(0, 0, r, i * (TAU / 4) + 0.2, (i + 1) * (TAU / 4) - 0.2);
    g.stroke();
  }
  g.restore();
}

export function labelY(e: Enemy) {
  return e.kind === 'goliath' ? e.y + e.radius + 34 : e.y - e.radius - 18;
}

export function drawLabel(g: CanvasRenderingContext2D, e: Enemy, locked: boolean, w: number) {
  const size = e.kind === 'goliath' ? 20 : 17;
  g.font = `700 ${size}px ${MONO}`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const text = e.chars.join('');
  const tw = g.measureText(text).width;
  const padX = 8;
  const boxH = size + 12;
  const jitter = e.shake > 0 ? Math.sin(e.shake * 80) * 4 : 0;
  const lx = Math.min(Math.max(e.x - tw / 2, padX + 4), w - tw - padX - 4) + jitter;
  const ly = Math.max(labelY(e), boxH / 2 + 4);

  g.fillStyle = locked ? 'rgba(30, 18, 8, 0.88)' : 'rgba(10, 6, 22, 0.72)';
  g.strokeStyle = e.shake > 0 ? '#ff5a4a' : locked ? GOLD : 'rgba(255, 255, 255, 0.14)';
  g.lineWidth = locked ? 2 : 1;
  g.beginPath();
  g.roundRect(lx - padX, ly - boxH / 2, tw + padX * 2, boxH, 6);
  g.fill();
  g.stroke();

  const done = e.chars.slice(0, e.typed).join('');
  const rest = e.chars.slice(e.typed).join('');
  const doneW = g.measureText(done).width;
  g.fillStyle = 'rgba(242, 193, 78, 0.6)';
  g.fillText(done, lx, ly + 1);
  g.fillStyle = locked ? '#fff8e6' : '#f4efe6';
  g.fillText(rest, lx + doneW, ly + 1);

  if (locked && rest.length) {
    const cw = g.measureText(e.chars[e.typed]).width;
    g.fillStyle = GOLD;
    g.fillRect(lx + doneW, ly + size / 2 + 1, cw, 2);
  }
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export function drawProjectile(g: CanvasRenderingContext2D, p: Projectile) {
  const alpha = Math.min(1, p.life);
  if (p.trail.length > 1) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (let i = 1; i < p.trail.length; i++) {
      const a = (i / p.trail.length) * alpha;
      g.strokeStyle = `rgba(255, 210, 120, ${a * 0.8})`;
      g.lineWidth = 1 + (i / p.trail.length) * 4;
      g.beginPath();
      g.moveTo(p.trail[i - 1].x, p.trail[i - 1].y);
      g.lineTo(p.trail[i].x, p.trail[i].y);
      g.stroke();
    }
    g.restore();
  }
  g.globalAlpha = alpha;
  g.fillStyle = '#e4dccb';
  g.beginPath();
  g.arc(p.x, p.y, 3.5, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
}

export function drawParticles(g: CanvasRenderingContext2D, particles: Particle[]) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    g.globalAlpha = Math.max(0, p.life / p.max);
    g.fillStyle = p.color;
    g.beginPath();
    g.arc(p.x, p.y, p.size * (0.5 + (0.5 * p.life) / p.max), 0, TAU);
    g.fill();
  }
  g.restore();
}

export function drawRings(g: CanvasRenderingContext2D, rings: Ring[]) {
  g.save();
  for (const r of rings) {
    const a = r.life / r.max;
    g.strokeStyle = `rgba(242, 193, 78, ${a})`;
    g.lineWidth = 10 * a + 2;
    g.shadowColor = GOLD;
    g.shadowBlur = 30;
    g.beginPath();
    g.arc(r.x, r.y, r.r, 0, TAU);
    g.stroke();
  }
  g.restore();
}

export function drawFloatTexts(g: CanvasRenderingContext2D, texts: FloatText[]) {
  g.font = `700 18px ${SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const t of texts) {
    g.globalAlpha = Math.min(1, t.life * 1.5);
    g.fillStyle = t.color;
    g.fillText(t.text, t.x, t.y);
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

export interface Hud {
  score: number;
  multiplier: number;
  wave: number;
  wpm: number;
  accuracy: number;
  lives: number;
  /** The first `startLives` lives are hearts; the rest are shields. */
  startLives: number;
  maxLives: number;
  shofars: number;
  /** The passage being typed, if any. */
  passage: string | null;
}

function heart(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x, y + s * 0.3);
  g.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  g.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  g.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  g.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
  g.fill();
}

function shield(g: CanvasRenderingContext2D, x: number, y: number, s: number, owned: boolean) {
  g.beginPath();
  g.moveTo(x - s * 0.42, y + s * 0.05);
  g.lineTo(x + s * 0.42, y + s * 0.05);
  g.lineTo(x + s * 0.42, y + s * 0.45);
  g.quadraticCurveTo(x + s * 0.4, y + s * 0.85, x, y + s);
  g.quadraticCurveTo(x - s * 0.4, y + s * 0.85, x - s * 0.42, y + s * 0.45);
  g.closePath();
  if (!owned) {
    g.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    g.lineWidth = 1.5;
    g.stroke();
    return;
  }
  g.fillStyle = '#8fb3e8';
  g.fill();
  g.strokeStyle = GOLD;
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = GOLD;
  g.fillRect(x - 1, y + s * 0.2, 2, s * 0.6);
  g.fillRect(x - s * 0.22, y + s * 0.38, s * 0.44, 2);
}

function shofar(g: CanvasRenderingContext2D, x: number, y: number) {
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + 14, y + 4, x + 20, y - 12);
  g.lineTo(x + 28, y - 16);
  g.quadraticCurveTo(x + 22, y + 12, x - 2, y + 4);
  g.closePath();
  g.fill();
}

export function drawHud(g: CanvasRenderingContext2D, w: number, h: number, s: Hud) {
  const pad = 18;
  g.textBaseline = 'top';
  g.shadowColor = 'rgba(0, 0, 0, 0.6)';
  g.shadowBlur = 6;

  g.textAlign = 'left';
  g.fillStyle = 'rgba(244, 239, 230, 0.6)';
  g.font = `500 12px ${SERIF}`;
  g.fillText('SCORE', pad, pad);
  g.fillStyle = GOLD;
  g.font = `700 28px ${SERIF}`;
  g.fillText(s.score.toLocaleString(), pad, pad + 14);
  g.fillStyle = 'rgba(244, 239, 230, 0.75)';
  g.font = `700 14px ${MONO}`;
  g.fillText(`×${s.multiplier.toFixed(1)}`, pad, pad + 48);

  g.textAlign = 'right';
  g.fillStyle = 'rgba(244, 239, 230, 0.6)';
  g.font = `500 12px ${SERIF}`;
  g.fillText('WAVE', w - pad, pad);
  g.fillStyle = GOLD;
  g.font = `700 28px ${SERIF}`;
  g.fillText(String(s.wave), w - pad, pad + 14);
  g.fillStyle = 'rgba(244, 239, 230, 0.75)';
  g.font = `700 14px ${MONO}`;
  g.fillText(`${Math.round(s.wpm)} wpm · ${Math.round(s.accuracy * 100)}%`, w - pad, pad + 48);

  if (s.passage) {
    g.fillStyle = 'rgba(242, 193, 78, 0.75)';
    g.font = `500 13px ${SERIF}`;
    g.fillText(s.passage.toUpperCase(), w - pad, pad + 70);
  }

  for (let i = 0; i < s.maxLives; i++) {
    const x = pad + 12 + i * 28;
    if (i < s.startLives) {
      g.fillStyle = i < s.lives ? '#e5484d' : 'rgba(255, 255, 255, 0.15)';
      heart(g, x, h - pad - 22, 22);
    } else {
      shield(g, x, h - pad - 22, 22, i < s.lives);
    }
  }

  g.fillStyle = GOLD;
  for (let i = 0; i < s.shofars; i++) shofar(g, w - pad - 34 - i * 36, h - pad - 8);
  g.textAlign = 'right';
  g.textBaseline = 'bottom';
  g.font = `500 11px ${MONO}`;
  g.fillStyle = 'rgba(244, 239, 230, 0.5)';
  g.fillText(s.shofars ? 'ENTER · SHOFAR' : 'NO SHOFAR', w - pad, h - pad - 30);
  g.shadowBlur = 0;
}

export interface Banner {
  title: string;
  /** Short lines shown above the title, e.g. rewards for the wave just cleared. */
  notes: string[];
  text: string;
  ref: string;
}

const BANNER_LINES = 6;

export function drawBanner(g: CanvasRenderingContext2D, w: number, h: number, banner: Banner, alpha: number) {
  const { title, notes, text, ref } = banner;
  g.save();
  g.globalAlpha = alpha;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(244, 239, 230, 0.85)';
  g.font = `700 16px ${SERIF}`;
  g.fillText(notes.join('   ✦   ').toUpperCase(), w / 2, h * 0.36 - 46);
  g.shadowColor = 'rgba(242, 193, 78, 0.6)';
  g.shadowBlur = 24;
  g.fillStyle = GOLD;
  g.font = `700 ${Math.min(52, w / 10)}px ${SERIF}`;
  g.fillText(title, w / 2, h * 0.36);
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(244, 239, 230, 0.9)';
  g.font = `italic 22px ${BOOK}`;
  const shown = lines(g, `“${text}”`, Math.min(w - 40, 640));
  // A long passage shows its opening; its words all come as enemies anyway.
  if (shown.length > BANNER_LINES) {
    shown.length = BANNER_LINES;
    shown[BANNER_LINES - 1] += '…';
  }
  shown.forEach((l, i) => g.fillText(l, w / 2, h * 0.36 + 50 + i * 28));
  g.fillStyle = 'rgba(242, 193, 78, 0.75)';
  g.font = `500 13px ${SERIF}`;
  g.fillText(ref.toUpperCase(), w / 2, h * 0.36 + 50 + 28 * shown.length + 6);
  g.restore();
}

function lines(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxW && line) {
      out.push(line);
      line = word;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}
