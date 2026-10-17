import type { AudioFX } from './audio';
import type { Enemy, EnemyKind, FloatText, Particle, Projectile, Ring, Star } from './entities';
import * as draw from './render';
import { DefaultWordSource, normalizeChar, randomVerse, toTypeable, type WordSource } from './words';

export interface GameStats {
  score: number;
  wave: number;
  words: number;
  accuracy: number;
  wpm: number;
  maxCombo: number;
  newBest: boolean;
}

export interface GameCallbacks {
  onGameOver(stats: GameStats): void;
  onPause(): void;
  onResume(): void;
}

export type MistakeRule = 'continue' | 'restart' | 'release';
export type ReleaseKey = 'off' | 'Space' | 'Tab' | 'Backspace';
/** 'faster': enemies speed up quickly. 'swarm': gentler speed-up, more enemies to make up for it. */
export type Progression = 'faster' | 'swarm';

export interface GameSettings {
  /** 1–20; enemies still speed up each wave from here. */
  speed: number;
  caseSensitive: boolean;
  punctuation: boolean;
  /** What a wrong key does to the locked word. */
  onMistake: MistakeRule;
  /** Key that drops the current target so another can be attacked. */
  releaseKey: ReleaseKey;
  /** Whether a released word goes back to its first letter. */
  releaseResets: boolean;
  /** Typing a space in a giant's phrase releases it (keeping progress) so you can attack others. */
  giantSpaceReleases: boolean;
  progression: Progression;
  /** Longest pause between words (seconds) that still counts toward WPM. */
  wpmGap: number;
  /** A shofar blown with nothing to defeat is given back. */
  shofarRefund: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  speed: 4,
  caseSensitive: false,
  punctuation: false,
  onMistake: 'continue',
  releaseKey: 'off',
  releaseResets: false,
  giantSpaceReleases: false,
  progression: 'faster',
  wpmGap: 0,
  shofarRefund: true,
};

type State = 'menu' | 'playing' | 'paused' | 'over';

const KINDS: Record<EnemyKind, { speed: number; radius: number; colors: string[] }> = {
  locust: { speed: 1.25, radius: 15, colors: ['#c8b45a', '#8f7f2e', '#f2e2a0'] },
  raven: { speed: 1.0, radius: 18, colors: ['#6a5a80', '#2a2235', '#ff5a3c'] },
  serpent: { speed: 0.82, radius: 20, colors: ['#ff8a3c', '#ffcc66', '#d2602a'] },
  goliath: { speed: 0.32, radius: 46, colors: ['#c9a45c', '#a07a3c', '#ff6a3c'] },
};

const START_LIVES = 3;
/** Lives past the starting three are shields, earned by flawless waves. */
const MAX_LIVES = 6;
const MAX_SHOFARS = 3;
const STONE_SPEED = 1500;
const BANNER_TIME = 3.2;
const BEST_KEY = 'bible-type:best';

/** Speed setting 1–20 → base enemy speed in px/s at a 900px-tall screen. */
const baseSpeedFor = (setting: number) => 12 + setting * 8;

/** Enemy speed multiplier gained per wave. */
const SPEED_GROWTH: Record<Progression, number> = { faster: 1.07, swarm: 1.025 };

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private sky!: HTMLCanvasElement;
  private land!: HTMLCanvasElement;
  private stars: Star[] = draw.makeStars(160);

  private state: State = 'menu';
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private rings: Ring[] = [];
  private lockId: number | null = null;
  private nextId = 1;

  private settings: GameSettings = DEFAULT_SETTINGS;
  private wave = 0;
  private waveTime = 0;
  private toSpawn = 0;
  private waveSize = 0;
  private spawnTimer = 0;
  private bossQueued = false;
  /** Regular enemies spawned before the boss comes. */
  private bossAt = 0;
  /** The passage being typed this wave, shown in the HUD; null for random words. */
  private waveRef: string | null = null;
  private source: WordSource = new DefaultWordSource();
  private banner: draw.Banner & { t: number } = { title: '', notes: [], text: '', ref: '', t: 0 };
  /** Typos made during the current wave; a wave with none earns a life. */
  private waveTypos = 0;

  private lives = START_LIVES;
  private shofars = 1;
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private correct = 0;
  private wrong = 0;
  private wordsDone = 0;
  /** WPM only counts time inside words: from each word's first keystroke to its last. */
  private typingTime = 0;
  /** Correct keystrokes after the first of each word (the ones `typingTime` covers). */
  private typingChars = 0;
  private lastKeyAt: number | null = null;

  private shake = 0;
  private hurtFlash = 0;
  private holyFlash = 0;
  private aim = -Math.PI / 2;
  private swing = 0;
  private time = 0;
  private last = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly audio: AudioFX,
    private readonly cb: GameCallbacks,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('blur', () => {
      if (this.state === 'playing') this.pause();
    });
    requestAnimationFrame((t) => this.frame(t));
  }

  static bestScore(): number {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  start(settings: GameSettings, source: WordSource = new DefaultWordSource()) {
    this.settings = { ...settings };
    this.source = source;
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.lockId = null;
    this.wave = 0;
    this.lives = START_LIVES;
    this.shofars = 1;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.correct = 0;
    this.wrong = 0;
    this.wordsDone = 0;
    this.typingTime = 0;
    this.typingChars = 0;
    this.lastKeyAt = null;
    this.state = 'playing';
    this.nextWave();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.cb.onPause();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.cb.onResume();
  }

  toMenu() {
    this.state = 'menu';
    this.enemies = [];
    this.projectiles = [];
    this.lockId = null;
  }

  private gameOver() {
    this.state = 'over';
    for (const e of this.enemies) this.burst(e.x, e.y, KINDS[e.kind].colors, 26);
    this.enemies = [];
    this.projectiles = [];
    this.lockId = null;
    this.audio.gameOver();
    const best = Game.bestScore();
    const newBest = this.score > best;
    if (newBest) {
      try {
        localStorage.setItem(BEST_KEY, String(this.score));
      } catch {
        // Storage unavailable; the best score just won't persist.
      }
    }
    this.cb.onGameOver({
      score: this.score,
      wave: this.wave,
      words: this.wordsDone,
      accuracy: this.accuracy(),
      wpm: this.wpm(),
      maxCombo: this.maxCombo,
      newBest,
    });
  }

  private nextWave() {
    const notes: string[] = [];
    if (this.wave > 0 && this.waveTypos === 0 && this.lives < MAX_LIVES) {
      this.lives++;
      notes.push(`Flawless · +1 ${this.lives > START_LIVES ? 'Shield' : 'Heart'}`);
    }
    this.waveTypos = 0;
    this.wave++;
    this.waveTime = 0;
    this.bossQueued = this.wave % 5 === 0;
    const plan = this.source.startWave?.(this.bossQueued) ?? null;
    this.waveSize = plan?.size ?? Math.min(Math.round(Math.min(6 + this.wave * 2, 40) * this.crowd()), 100);
    this.toSpawn = this.waveSize;
    this.bossAt = plan?.bossAt ?? Math.ceil(this.waveSize / 2);
    this.spawnTimer = 0;
    const verse = plan?.verse ?? randomVerse();
    this.waveRef = plan ? verse.ref : null;
    if (this.wave > 1 && (this.wave - 1) % 3 === 0 && this.shofars < MAX_SHOFARS) {
      this.shofars++;
      notes.push('+1 Shofar');
    }
    if (this.bossQueued) notes.push('A Giant Approaches');
    this.banner = { title: `Wave ${this.wave}`, notes, text: verse.text, ref: verse.ref, t: BANNER_TIME };
    this.audio.wave();
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && !e.repeat) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      else return;
      e.preventDefault();
      return;
    }
    if (this.state !== 'playing') return;
    // Tab would move focus out of the page (to the browser's toolbar), leaving the game unable to hear keys.
    if (e.key === 'Tab') e.preventDefault();
    if (e.key === 'Enter') {
      e.preventDefault();
      this.blowShofar();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.isReleaseKey(e)) {
      e.preventDefault();
      this.release();
      return;
    }
    if (e.key.length !== 1) return;
    e.preventDefault();
    const ch = normalizeChar(e.key);
    this.type(this.settings.caseSensitive ? ch : ch.toLowerCase());
  }

  private isReleaseKey(e: KeyboardEvent): boolean {
    const key = this.settings.releaseKey;
    if (key === 'off') return false;
    if (key !== 'Space') return e.key === key;
    if (e.key !== ' ') return false;
    // Space still types the space inside a phrase when that's the next letter.
    const t = this.locked();
    return !t || t.target[t.typed] !== ' ';
  }

  private release() {
    const t = this.locked();
    if (!t) return;
    if (this.settings.releaseResets) t.typed = 0;
    this.lockId = null;
    this.audio.release();
  }

  private locked(): Enemy | null {
    if (this.lockId === null) return null;
    const e = this.enemies.find((en) => en.id === this.lockId) ?? null;
    if (!e) this.lockId = null;
    return e;
  }

  private type(ch: string) {
    let target = this.locked();
    const continuing = target !== null;
    if (!target) {
      // A released word that kept its progress is picked up again by its next letter.
      const candidates = this.enemies.filter((e) => !e.doomed && e.target[e.typed] === ch);
      if (!candidates.length) return this.miss(null);
      const dist = (e: Enemy) => Math.hypot(e.x - this.px(), e.y - this.py());
      target = candidates.reduce((a, b) => (dist(b) < dist(a) ? b : a));
      this.lockId = target.id;
    }

    // Time inside a word always counts; the pause before a word counts up to the chosen limit.
    const sinceLast = this.lastKeyAt === null ? 0 : this.time - this.lastKeyAt;
    const counted = continuing ? sinceLast : Math.min(sinceLast, this.settings.wpmGap);
    this.typingTime += counted;
    this.lastKeyAt = this.time;
    if (target.target[target.typed] !== ch) return this.miss(target);
    if (continuing || counted > 0) this.typingChars++;

    target.typed++;
    this.correct++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.fire(target);

    if (target.typed === target.target.length) {
      target.doomed = true;
      target.reward = Math.round(target.target.length * 10 * this.multiplier() * (target.kind === 'goliath' ? 3 : 1));
      this.wordsDone++;
      this.lockId = null;
    } else if (ch === ' ' && target.kind === 'goliath' && this.settings.giantSpaceReleases) {
      this.lockId = null;
    }
  }

  private miss(target: Enemy | null) {
    this.wrong++;
    this.waveTypos++;
    this.combo = 0;
    this.audio.miss();
    if (!target) return;
    target.shake = 0.25;
    const rule = this.settings.onMistake;
    if (rule !== 'continue') target.typed = 0;
    if (rule === 'release') this.lockId = null;
  }

  private multiplier() {
    return 1 + Math.min(this.combo, 60) / 20;
  }

  private fire(target: Enemy) {
    const sx = this.px() + 7 + Math.cos(this.aim) * 15;
    const sy = this.py() - 6 + Math.sin(this.aim) * 15;
    const a = Math.atan2(target.y - sy, target.x - sx);
    this.projectiles.push({
      targetId: target.id,
      x: sx,
      y: sy,
      vx: Math.cos(a) * STONE_SPEED,
      vy: Math.sin(a) * STONE_SPEED,
      life: 1,
      trail: [],
    });
    this.swing = 0.35;
    this.audio.shoot(target.typed);
  }

  private blowShofar() {
    if (this.shofars <= 0) return this.audio.miss();
    // Only fully typed (already doomed) enemies left counts as nothing to defeat;
    // a giant does count, since the blast still drives it back.
    if (this.settings.shofarRefund && !this.enemies.some((e) => !e.doomed)) {
      this.texts.push({ x: this.px(), y: this.py() - 60, text: 'Shofar kept', life: 1, color: draw.GOLD });
      return this.audio.release();
    }
    this.shofars--;
    this.audio.shofar();
    this.holyFlash = 1;
    this.shake = 0.4;
    for (let i = 0; i < 3; i++) {
      this.rings.push({ x: this.px(), y: this.py(), r: 10, speed: 900 + i * 250, life: 1.2, max: 1.2 });
    }
    for (const e of [...this.enemies]) {
      if (e.kind === 'goliath') {
        e.knock = 900;
        e.flash = 0.3;
      } else {
        this.kill(e, Math.round(e.target.length * 5));
      }
    }
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  private px() {
    return this.w / 2;
  }

  private py() {
    return this.h - 80;
  }

  private heightScale() {
    return Math.min(1.5, Math.max(0.6, this.h / 900));
  }

  private enemySpeed() {
    const growth = Math.pow(SPEED_GROWTH[this.settings.progression], this.wave - 1);
    const ramp = growth * (1 + Math.min(this.waveTime, 60) * 0.002);
    return baseSpeedFor(this.settings.speed) * ramp * this.heightScale();
  }

  /**
   * In swarm mode, the speed growth that was given up comes back as more
   * enemies spawning more often, so the pressure grows at about the same rate.
   */
  private crowd() {
    if (this.settings.progression !== 'swarm') return 1;
    return Math.pow(SPEED_GROWTH.faster / SPEED_GROWTH.swarm, this.wave - 1);
  }

  private spawnInterval() {
    const base = Math.max(0.6, 2.4 - this.wave * 0.1);
    return Math.max(0.12, (base * Math.max(0.3, 1.3 - this.settings.speed * 0.05)) / this.crowd());
  }

  private spawn(kind?: EnemyKind): boolean {
    const taken = new Set(this.enemies.filter((e) => !e.doomed).map((e) => e.target[e.typed]));
    const opts = { caseSensitive: this.settings.caseSensitive, punctuation: this.settings.punctuation };
    const keysFor = (raw: string) => toTypeable(raw, opts).map(normalizeChar);
    const boss = kind === 'goliath';
    const word = this.source.next({
      minLen: this.wave < 3 ? 3 : Math.min(3 + Math.floor(this.wave / 3), 7),
      maxLen: Math.min(4 + this.wave, 14),
      phrase: boss,
      punctuation: this.settings.punctuation,
      accept: (raw) => {
        const first = keysFor(raw)[0];
        return first !== undefined && first !== ' ' && !taken.has(first);
      },
    });
    if (!word) return false;

    const chars = toTypeable(word, opts);
    const target = chars.map(normalizeChar);
    if (!target.length) return false;
    const len = target.length;
    const k: EnemyKind = kind ?? (len <= 4 ? 'locust' : len <= 7 ? 'raven' : 'serpent');
    const spec = KINDS[k];
    const margin = Math.min(80, this.w * 0.1);
    this.enemies.push({
      id: this.nextId++,
      kind: k,
      chars,
      target,
      typed: 0,
      x: boss ? this.w / 2 : margin + Math.random() * (this.w - margin * 2),
      y: -spec.radius - 10,
      angle: Math.PI / 2,
      speed: spec.speed * (0.9 + Math.random() * 0.2),
      radius: spec.radius,
      age: Math.random() * 10,
      doomed: false,
      reward: 0,
      flash: 0,
      shake: 0,
      knock: 0,
    });
    return true;
  }

  private kill(e: Enemy, reward: number) {
    this.enemies = this.enemies.filter((en) => en !== e);
    if (this.lockId === e.id) this.lockId = null;
    this.burst(e.x, e.y, KINDS[e.kind].colors, e.kind === 'goliath' ? 80 : 26);
    if (reward > 0) {
      this.score += reward;
      this.texts.push({ x: e.x, y: e.y, text: `+${reward}`, life: 1, color: draw.GOLD });
    }
    this.audio.kill();
  }

  private burst(x: number, y: number, colors: string[], count: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 260;
      const life = 0.4 + Math.random() * 0.6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        max: life,
        size: 1.5 + Math.random() * 3,
        color: colors[i % colors.length],
        gravity: 220,
      });
    }
  }

  private update(dt: number) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.5);
    this.holyFlash = Math.max(0, this.holyFlash - dt * 1.2);
    this.swing = Math.max(0, this.swing - dt);
    this.updateEffects(dt);
    if (this.state !== 'playing') return;

    if (this.banner.t > 0) {
      this.banner.t -= dt;
    } else {
      this.waveTime += dt;
      this.spawnTimer -= dt;
      // Once the boss is due, it comes before any more regular enemies, so a passage stays in order.
      const bossDue = this.bossQueued && this.waveSize - this.toSpawn >= this.bossAt;
      if (bossDue) {
        if (this.spawn('goliath')) this.bossQueued = false;
      } else if (this.toSpawn > 0 && this.spawnTimer <= 0) {
        if (this.spawn()) this.toSpawn--;
        this.spawnTimer = this.spawnInterval() * (0.7 + Math.random() * 0.6);
      }
      if (this.toSpawn === 0 && !this.bossQueued && this.enemies.length === 0) this.nextWave();
    }

    this.updateEnemies(dt);
    this.updateProjectiles(dt);

    const target = this.locked();
    const want = target ? Math.atan2(target.y - this.py(), target.x - this.px()) : -Math.PI / 2;
    this.aim += (want - this.aim) * Math.min(1, dt * 14);
  }

  private updateEnemies(dt: number) {
    const base = this.enemySpeed();
    const px = this.px();
    const py = this.py();
    for (const e of [...this.enemies]) {
      e.age += dt;
      e.flash = Math.max(0, e.flash - dt);
      e.shake = Math.max(0, e.shake - dt);
      const dx = px - e.x;
      const dy = py - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      const v = base * e.speed - e.knock;
      e.x += ux * v * dt;
      e.y += uy * v * dt;
      if (e.kind === 'locust') {
        const wob = Math.cos(e.age * 5) * 40 * dt;
        e.x += -uy * wob;
        e.y += ux * wob;
      }
      e.knock = Math.max(0, e.knock - 700 * dt);
      e.angle = Math.atan2(uy, ux);

      if (d < e.radius + 24) {
        if (e.doomed) {
          this.kill(e, e.reward);
          continue;
        }
        this.kill(e, 0);
        this.lives--;
        this.combo = 0;
        this.shake = 0.6;
        this.hurtFlash = 1;
        this.audio.hurt();
        if (this.lives <= 0) {
          this.gameOver();
          return;
        }
      }
    }
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 8) p.trail.shift();
      const t = this.enemies.find((e) => e.id === p.targetId);
      if (!t) {
        p.life -= dt * 4;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        continue;
      }
      const dx = t.x - p.x;
      const dy = t.y - p.y;
      const d = Math.hypot(dx, dy);
      const step = STONE_SPEED * dt;
      if (d <= step + t.radius * 0.6) {
        p.life = 0;
        this.hit(t);
        continue;
      }
      p.vx = (dx / d) * STONE_SPEED;
      p.vy = (dy / d) * STONE_SPEED;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  private hit(e: Enemy) {
    e.flash = 0.12;
    e.knock = Math.max(e.knock, e.kind === 'goliath' ? 60 : 160);
    this.burst(e.x, e.y, ['#f6e7c1', '#c9b48a'], 5);
    this.audio.hit();
    const inFlight = this.projectiles.some((p) => p.targetId === e.id && p.life > 0);
    if (e.doomed && !inFlight) this.kill(e, e.reward);
  }

  private updateEffects(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.vx *= 1 - dt * 1.5;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 40 * dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const r of this.rings) {
      r.life -= dt;
      r.r += r.speed * dt;
    }
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  private accuracy() {
    const total = this.correct + this.wrong;
    return total ? this.correct / total : 1;
  }

  private wpm() {
    return this.typingTime > 0.5 ? this.typingChars / 5 / (this.typingTime / 60) : 0;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  private resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.sky = draw.buildSky(this.w, this.h, this.dpr);
    this.land = draw.buildLand(this.w, this.h, this.dpr);
  }

  private frame(now: number) {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.state !== 'paused') this.update(dt);
    this.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  private render() {
    const g = this.ctx;
    const { w, h } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.shake > 0) {
      const m = this.shake * 14;
      g.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }

    g.drawImage(this.sky, 0, 0, w, h);
    draw.drawStars(g, this.stars, w, h, this.time);
    g.drawImage(this.land, 0, 0, w, h);
    draw.drawRings(g, this.rings);

    for (const e of this.enemies) draw.drawEnemy(g, e);
    for (const p of this.projectiles) draw.drawProjectile(g, p);
    draw.drawParticles(g, this.particles);
    draw.drawPlayer(g, this.px(), this.py(), this.aim, this.swing, this.time);

    const locked = this.locked();
    if (locked) draw.drawReticle(g, locked, this.time);
    for (const e of this.enemies) if (e !== locked) draw.drawLabel(g, e, false, w);
    if (locked) draw.drawLabel(g, locked, true, w);
    draw.drawFloatTexts(g, this.texts);

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.hurtFlash > 0) {
      const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(200, 20, 20, 0)');
      v.addColorStop(1, `rgba(200, 20, 20, ${this.hurtFlash * 0.55})`);
      g.fillStyle = v;
      g.fillRect(0, 0, w, h);
    }
    if (this.holyFlash > 0) {
      g.fillStyle = `rgba(255, 236, 180, ${this.holyFlash * 0.35})`;
      g.fillRect(0, 0, w, h);
    }

    if (this.state === 'playing' || this.state === 'paused') {
      draw.drawHud(g, w, h, {
        score: this.score,
        multiplier: this.multiplier(),
        wave: this.wave,
        wpm: this.wpm(),
        accuracy: this.accuracy(),
        lives: this.lives,
        startLives: START_LIVES,
        maxLives: MAX_LIVES,
        shofars: this.shofars,
        passage: this.waveRef,
      });
      if (this.banner.t > 0) {
        const t = this.banner.t;
        const alpha = Math.min(1, (BANNER_TIME - t) * 3, t * 2);
        draw.drawBanner(g, w, h, this.banner, alpha);
      }
    }
  }
}
