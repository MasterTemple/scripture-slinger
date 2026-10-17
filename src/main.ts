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
import {
  DEFAULT_SCRIPTURE,
  findPassages,
  loadPassages,
  translations,
  type ScriptureSettings,
  type WaveUnit,
} from './scripture';
import type { WordSource } from './words';

const SETTINGS_KEY = 'bible-type:settings';
const MUTE_KEY = 'bible-type:muted';
const SCRIPTURE_KEY = 'bible-type:scripture';

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
const progression = $<HTMLSelectElement>('progression');
const wpmGap = $<HTMLSelectElement>('wpmGap');
const shofarRefund = $<HTMLInputElement>('shofarRefund');
const muteBtn = $<HTMLButtonElement>('mute');
const startBtn = $<HTMLButtonElement>('start');
const passages = $<HTMLTextAreaElement>('passages');
const passageStatus = $('passageStatus');
const passageOptions = $('passageOptions');
const translation = $<HTMLSelectElement>('translation');
const unit = $<HTMLSelectElement>('unit');
const unitWords = $<HTMLInputElement>('unitWords');
const unitWordsRow = $('unitWordsRow');
const order = $<HTMLSelectElement>('order');
const keepTogether = $<HTMLInputElement>('keepTogether');
const keepTogetherRow = $('keepTogetherRow');
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
  if (el) el.querySelector<HTMLButtonElement>('button.primary')?.focus();
  // A hidden button keeping focus would still take Enter and Space.
  else (document.activeElement as HTMLElement | null)?.blur();
}

// On the pause and game-over panels, Tab cycles their buttons rather than leaving the page.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const open = [pauseEl, over].find((o) => !o.classList.contains('hidden'));
  if (!open) return;
  const items = [...open.querySelectorAll<HTMLElement>('button:not(:disabled)')];
  if (!items.length) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement as HTMLElement);
  const step = e.shiftKey ? -1 : 1;
  items[i < 0 ? (e.shiftKey ? items.length - 1 : 0) : (i + step + items.length) % items.length].focus();
});

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

function readScripture(): ScriptureSettings {
  return {
    passages: passages.value,
    translation: translation.value || DEFAULT_SCRIPTURE.translation,
    unit: unit.value as WaveUnit,
    words: Math.min(200, Math.max(3, Math.round(Number(unitWords.value)) || DEFAULT_SCRIPTURE.words)),
    shuffle: order.value === 'shuffled',
    keepTogether: keepTogether.checked,
  };
}

function applyScripture(s: ScriptureSettings) {
  passages.value = s.passages;
  translation.value = s.translation;
  unit.value = s.unit;
  unitWords.value = String(s.words);
  order.value = s.shuffle ? 'shuffled' : 'ordered';
  keepTogether.checked = s.keepTogether;
  if (!unit.value) unit.value = DEFAULT_SCRIPTURE.unit;
}

function loadScripture(): ScriptureSettings {
  try {
    return { ...DEFAULT_SCRIPTURE, ...JSON.parse(load(SCRIPTURE_KEY) ?? '{}') };
  } catch {
    return DEFAULT_SCRIPTURE;
  }
}

function syncScriptureUi() {
  const none = !passages.value.trim();
  passageOptions.classList.toggle('disabled', none);
  for (const el of [translation, unit, unitWords, order]) el.disabled = none;
  unitWordsRow.classList.toggle('hidden', unit.value !== 'words');
  const together = none || order.value !== 'shuffled';
  keepTogether.disabled = together;
  keepTogetherRow.classList.toggle('disabled', together);
}

function setStatus(text: string, error = false) {
  passageStatus.textContent = text;
  passageStatus.classList.toggle('error', error);
}

/** Show which references were understood as the player types them. */
let previewTimer = 0;
let previewRun = 0;
function previewPassages() {
  clearTimeout(previewTimer);
  const input = passages.value;
  if (!input.trim()) return setStatus('');
  const run = ++previewRun;
  previewTimer = window.setTimeout(async () => {
    try {
      const found = await findPassages(input);
      if (run !== previewRun) return;
      const unknown = found.unrecognized.length ? `Not a reference: ${found.unrecognized.join(', ')}` : '';
      if (!found.references.length) return setStatus(unknown || 'No Bible references found.', true);
      setStatus([found.references.join(' · '), unknown].filter(Boolean).join(' — '), !!unknown);
    } catch (e) {
      if (run === previewRun) setStatus(`Couldn’t read references: ${e}`, true);
    }
  }, 250);
}

function syncSettingsUi() {
  speedVal.textContent = speed.value;
  const key = releaseKey.value;
  releaseMode.disabled = key === 'off';
  releaseModeRow.classList.toggle('disabled', key === 'off');
  releaseHint.classList.toggle('hidden', key === 'off');
  releaseHint.innerHTML = `<kbd>${key}</kbd> releases your target so you can attack another.`;
}

let starting = false;
async function start() {
  if (starting) return;
  const scripture = readScripture();
  let source: WordSource | undefined;
  if (scripture.passages.trim()) {
    starting = true;
    startBtn.disabled = true;
    startBtn.textContent = 'Unrolling the scroll…';
    try {
      source = await loadPassages(scripture);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), true);
      refreshMenu();
      show(menu);
      passages.focus();
      return;
    } finally {
      starting = false;
      startBtn.disabled = false;
      startBtn.textContent = 'Begin';
    }
  }
  show(null);
  game.start(readSettings(), source);
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
applyScripture(loadScripture());
syncScriptureUi();
previewPassages();
void translations().then((list) => {
  const saved = loadScripture().translation;
  translation.replaceChildren(
    ...list.map((t) => new Option(`${t.abbreviation} — ${t.name}`, t.id, false, t.id === saved)),
  );
  if (!list.length) translation.append(new Option('None installed', ''));
});
for (const el of [passages, translation, unit, unitWords, order, keepTogether]) {
  el.addEventListener('input', () => {
    syncScriptureUi();
    if (el === passages) previewPassages();
    save(SCRIPTURE_KEY, JSON.stringify(readScripture()));
  });
}
for (const el of [speed, progression, caps, punct, shofarRefund, mistake, releaseKey, releaseMode, wpmGap]) {
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
