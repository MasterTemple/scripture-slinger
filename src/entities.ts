export type EnemyKind = 'locust' | 'raven' | 'serpent' | 'goliath';

export interface EnemyWord {
  /** Characters as displayed (original casing/punctuation). */
  chars: string[];
  /** Normalized characters the player must type; same length as `chars`. */
  target: string[];
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  /** Characters as displayed (original casing/punctuation). */
  chars: string[];
  /** Normalized characters the player must type; same length as `chars`. */
  target: string[];
  typed: number;
  /** Words still to come after the one shown (a giant's phrase). */
  queue: EnemyWord[];
  /** In a passage, a giant shows its next word only when that word's turn comes. */
  waitsTurn: boolean;
  /** Letters in all of the enemy's words, and how many of them are already typed; a giant's health. */
  total: number;
  spent: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  radius: number;
  age: number;
  /** Fully typed; dies when the last stone in flight lands. */
  doomed: boolean;
  reward: number;
  flash: number;
  shake: number;
  knock: number;
}

export interface Projectile {
  targetId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  trail: { x: number; y: number }[];
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

export interface Ring {
  x: number;
  y: number;
  r: number;
  speed: number;
  life: number;
  max: number;
}

export interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
}
