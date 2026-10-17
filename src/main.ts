import './style.css';
import { AudioFX } from './audio';
import {
  DEFAULT_SETTINGS,
  Game,
  type GameSettings,
  type GameStats,
  type MistakeRule,
  type Progression,
  type ReleaseKey,
} from './game';

const SETTINGS_KEY = 'bible-type:settings';
const MUTE_KEY = 'bible-type:muted';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const menu = $('menu');
const pauseEl = $('pause');
const over = $('over');
const speed = $<HTMLInputElement>('speed');
const speedVal = $<HTMLOutputElement>('speedVal');
const caps = $<HTMLInputElement>('caps');
const punct = $<HTMLInputElement>('punct');
const mistake = $<HTMLSelectElement>('mistake');
const releaseKey = $<HTMLSelectElement>('releaseKey');
const releaseMode = $<HTMLSelectElement>('releaseMode');
const releaseModeRow = $('releaseModeRow');
const releaseHint = $('releaseHint');
const giantSpace = $<HTMLSelectElement>('giantSpace');
const progression = $<HTMLSelectElement>('progression');
const wpmGap = $<HTMLSelectElement>('wpmGap');
const shofarRefund = $<HTMLInputElement>('shofarRefund');
const muteBtn = $<HTMLButtonElement>('mute');
const best = $('best');
const stats = $('stats');

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preferences just won't persist.
  }
}

const audio = new AudioFX();
audio.muted = load(MUTE_KEY) === '1';

const game = new Game($<HTMLCanvasElement>('game'), audio, {
  onGameOver: showGameOver,
  onPause: () => show(pauseEl),
  onResume: () => show(null),
});

if (import.meta.env.DEV) Object.assign(window, { game });

function show(el: HTMLElement | null) {
  for (const o of [menu, pauseEl, over]) o.classList.toggle('hidden', o !== el);
  el?.querySelector<HTMLButtonElement>('button.primary')?.focus();
}

function refreshMenu() {
  const b = Game.bestScore();
  best.textContent = b ? `Best: ${b.toLocaleString()}` : '';
  muteBtn.textContent = audio.muted ? 'Sound: off' : 'Sound: on';
}

function readSettings(): GameSettings {
  return {
    speed: Number(speed.value),
    caseSensitive: caps.checked,
    punctuation: punct.checked,
    onMistake: mistake.value as MistakeRule,
    releaseKey: releaseKey.value as ReleaseKey,
    releaseResets: releaseMode.value === 'reset',
    giantSpaceReleases: giantSpace.value === 'release',
    progression: progression.value as Progression,
    wpmGap: Number(wpmGap.value),
    shofarRefund: shofarRefund.checked,
  };
}

function applySettings(s: GameSettings) {
  speed.value = String(s.speed);
  caps.checked = s.caseSensitive;
  punct.checked = s.punctuation;
  mistake.value = s.onMistake;
  releaseKey.value = s.releaseKey;
  releaseMode.value = s.releaseResets ? 'reset' : 'keep';
  giantSpace.value = s.giantSpaceReleases ? 'release' : 'stay';
  progression.value = s.progression;
  wpmGap.value = String(s.wpmGap);
  shofarRefund.checked = s.shofarRefund;
  // An unknown saved value leaves a select blank; fall back to the default.
  if (!wpmGap.value) wpmGap.value = String(DEFAULT_SETTINGS.wpmGap);
}

function loadSettings(): GameSettings {
  try {
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(load(SETTINGS_KEY) ?? '{}') };
    s.speed = Math.min(20, Math.max(1, Math.round(Number(s.speed)) || DEFAULT_SETTINGS.speed));
    return s;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function syncSettingsUi() {
  speedVal.textContent = speed.value;
  const key = releaseKey.value;
  releaseMode.disabled = key === 'off';
  releaseModeRow.classList.toggle('disabled', key === 'off');
  releaseHint.classList.toggle('hidden', key === 'off');
  releaseHint.innerHTML = `<kbd>${key}</kbd> releases your target so you can attack another.`;
}

function start() {
  show(null);
  (document.activeElement as HTMLElement | null)?.blur();
  game.start(readSettings());
}

function toMenu() {
  game.toMenu();
  refreshMenu();
  show(menu);
}

function showGameOver(s: GameStats) {
  const cells: [string, string, boolean?][] = [
    ['Score', s.score.toLocaleString(), true],
    ['Wave', String(s.wave)],
    ['Words', String(s.words)],
    ['WPM', String(Math.round(s.wpm))],
    ['Accuracy', `${Math.round(s.accuracy * 100)}%`],
    ['Best streak', String(s.maxCombo)],
  ];
  stats.innerHTML = '';
  for (const [label, value, hl] of cells) {
    const div = document.createElement('div');
    if (hl) div.className = 'highlight';
    const dt = document.createElement('dt');
    dt.textContent = s.newBest && hl ? 'New best!' : label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    div.append(dt, dd);
    stats.append(div);
  }
  // Let the final explosion play before the panel covers it.
  setTimeout(() => show(over), 900);
}

applySettings(loadSettings());
syncSettingsUi();
for (const el of [speed, progression, caps, punct, shofarRefund, mistake, releaseKey, releaseMode, giantSpace, wpmGap]) {
  el.addEventListener('input', () => {
    syncSettingsUi();
    save(SETTINGS_KEY, JSON.stringify(readSettings()));
  });
}

muteBtn.addEventListener('click', () => {
  audio.muted = !audio.muted;
  save(MUTE_KEY, audio.muted ? '1' : '0');
  refreshMenu();
});

$('start').addEventListener('click', start);
$('again').addEventListener('click', start);
$('toMenu').addEventListener('click', toMenu);
$('quit').addEventListener('click', toMenu);
$('resume').addEventListener('click', () => game.resume());

refreshMenu();
show(menu);
