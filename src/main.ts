import './style.css';
import { AudioFX } from './audio';
import {
  canKeepBooks,
  forget,
  keptBooks,
  localId,
  renameLocal,
  saveLocalBooks,
  translations,
  type BookFile,
  type StoredBook,
  type Translation,
} from './bibles';
import {
  DEFAULT_SETTINGS,
  Game,
  type GameSettings,
  type GameStats,
  type MistakeRule,
  type Progression,
  type BannerVerse,
  type ReleaseKey,
} from './game';
import {
  DEFAULT_SCRIPTURE,
  errorText,
  findPassages,
  bookNames,
  forgetBooks,
  loadPassages,
  loadRandomVerses,
  readBookFiles,
  type ScriptureSettings,
  type WaveUnit,
} from './scripture';
import type { WordSource } from './words';

const SETTINGS_KEY = 'scripture-slinger:settings';
const MUTE_KEY = 'scripture-slinger:muted';
const SCRIPTURE_KEY = 'scripture-slinger:scripture';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const menu = $('menu');
const pauseEl = $('pause');
const bibles = $('bibles');
const bibleList = $('bibleList');
const addBible = $<HTMLFormElement>('addBible');
const bibleAbbrev = $<HTMLInputElement>('bibleAbbrev');
const bibleName = $<HTMLInputElement>('bibleName');
const bibleFiles = $<HTMLInputElement>('bibleFiles');
const myBibles = $<HTMLDataListElement>('myBibles');
const addBooks = $<HTMLButtonElement>('addBooks');
const addStatus = $('addStatus');
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
const nextWordOnly = $<HTMLInputElement>('nextWordOnly');
const bannerVerse = $<HTMLSelectElement>('bannerVerse');
const muteBtn = $<HTMLButtonElement>('mute');
const startBtn = $<HTMLButtonElement>('start');
const passages = $<HTMLTextAreaElement>('passages');
const passageStatus = $('passageStatus');
const translation = $<HTMLSelectElement>('translation');
const unit = $<HTMLSelectElement>('unit');
const unitWords = $<HTMLInputElement>('unitWords');
const unitWordsRow = $('unitWordsRow');
const order = $<HTMLSelectElement>('order');
const orderRow = $('orderRow');
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

// Bring over what was saved before the game was renamed from Bible Type / Bible Slinger.
for (const name of ['settings', 'muted', 'scripture', 'best']) {
  for (const prefix of ['bible-slinger', 'bible-type']) {
    const old = load(`${prefix}:${name}`);
    if (old !== null && load(`scripture-slinger:${name}`) === null) save(`scripture-slinger:${name}`, old);
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
  for (const o of [menu, bibles, pauseEl, over]) o.classList.toggle('hidden', o !== el);
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
    nextWordOnly: nextWordOnly.checked,
    bannerVerse: bannerVerse.value as BannerVerse,
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
  nextWordOnly.checked = s.nextWordOnly;
  bannerVerse.value = s.bannerVerse;
  // An unknown saved value leaves a select blank; fall back to the default.
  if (!wpmGap.value) wpmGap.value = String(DEFAULT_SETTINGS.wpmGap);
  if (!bannerVerse.value) bannerVerse.value = DEFAULT_SETTINGS.bannerVerse;
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
  // With no passages named, waves are random verses, which come in no order.
  const random = !passages.value.trim();
  order.disabled = random;
  orderRow.classList.toggle('disabled', random);
  unitWordsRow.classList.toggle('hidden', unit.value !== 'words');
  const together = random || order.value !== 'shuffled';
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
      if (run === previewRun) setStatus(`Couldn’t read references: ${errorText(e)}`, true);
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
  let source: WordSource;
  starting = true;
  startBtn.disabled = true;
  startBtn.textContent = 'Unrolling the scroll…';
  try {
    source = scripture.passages.trim() ? await loadPassages(scripture) : await loadRandomVerses(scripture);
  } catch (e) {
    setStatus(errorText(e), true);
    refreshMenu();
    show(menu);
    passages.focus();
    return;
  } finally {
    starting = false;
    startBtn.disabled = false;
    startBtn.textContent = 'Begin';
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

/** List the translations in the menu, choosing `selected` if it's there. */
async function fillTranslations(selected: string) {
  const list = await translations();
  translation.replaceChildren(
    ...list.map((t) => new Option(`${t.abbreviation} — ${t.name}`, t.id, false, t.id === selected)),
  );
  if (!list.length) translation.append(new Option('None installed', ''));
}

function setAddStatus(text: string, tone: 'error' | 'ok' | null = null) {
  addStatus.textContent = text;
  addStatus.classList.toggle('error', tone === 'error');
  addStatus.classList.toggle('ok', tone === 'ok');
}

const BOOKS = 66;

function isComplete(books: StoredBook[]): boolean {
  return books.length === BOOKS && books.every((b) => !b.missing.length);
}

/** Numbers as runs: [1, 2, 3, 5] is "1–3, 5". */
function runs(nums: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (nums[j + 1] === nums[j] + 1) j++;
    out.push(j > i ? `${nums[i]}–${nums[j]}` : String(nums[i]));
    i = j;
  }
  return out.join(', ');
}

/** Whether all 66 books are there with every chapter, and if not, what's missing. */
function describeBooks(books: StoredBook[], names: Map<string, string>): string {
  if (isComplete(books)) return 'All 66 books, every chapter';
  const have = new Set(books.map((b) => b.usfm));
  const absent = [...names.keys()].filter((u) => !have.has(u)).map((u) => names.get(u)!);
  const present = [...names.keys()].filter((u) => have.has(u)).map((u) => names.get(u)!);
  const parts = [
    !absent.length
      ? 'All 66 books'
      : absent.length <= 8
        ? `${books.length} of 66 books, without ${absent.join(', ')}`
        : present.length <= 8
          ? `${books.length} of 66 books: ${present.join(', ')}`
          : `${books.length} of 66 books`,
  ];
  const partial = books.filter((b) => b.missing.length);
  for (const b of partial.slice(0, 3)) {
    parts.push(`${names.get(b.usfm)} lacks chapter${b.missing.length === 1 ? '' : 's'} ${runs(b.missing)}`);
  }
  if (partial.length > 3) parts.push(`${partial.length - 3} more books lack chapters`);
  return parts.join('; ');
}

/** The player's own translation that books added under `abbreviation` would go into. */
async function localTranslation(abbreviation: string): Promise<Translation | undefined> {
  const id = localId(abbreviation);
  return (await translations()).find((t) => t.local && localId(t.abbreviation) === id);
}

/** Books as they'd be with `added` put into `t`. */
function merged(t: Translation | undefined, added: StoredBook[]): StoredBook[] {
  const codes = new Set(added.map((b) => b.usfm));
  return [...(t?.books ?? []).filter((b) => !codes.has(b.usfm)), ...added];
}

/** The chosen files, once read. */
let picked: { files: File[]; books: BookFile[]; problems: string[] } | null = null;

/** Read the chosen files and say what the translation would have with them. */
async function previewFiles() {
  const files = [...(bibleFiles.files ?? [])];
  picked = null;
  if (!files.length) return setAddStatus('');
  setAddStatus('Reading the books…');
  try {
    const result = await readBookFiles(files);
    // Other files may have been chosen meanwhile.
    if (bibleFiles.files?.[0] !== files[0]) return;
    picked = { files, ...result };
    await showPicked();
  } catch (e) {
    setAddStatus(`Couldn’t read the books: ${errorText(e)}`, 'error');
  }
}

async function showPicked() {
  if (!picked) return;
  const { books, problems } = picked;
  if (!books.length) return setAddStatus(problems.join(' ') || 'No books found.', 'error');
  const t = await localTranslation(bibleAbbrev.value);
  const all = merged(t, books);
  const into = t ? `Your ${t.abbreviation} with these: ` : '';
  const summary = `${into}${describeBooks(all, await bookNames())}.`;
  const tone = isComplete(all) ? 'ok' : problems.length ? 'error' : null;
  setAddStatus([summary, ...problems].join(' '), tone);
}

/** Each translation, with which of its books are kept here, and a way to delete them. */
async function fillLibrary() {
  const list = await translations();
  // Naming what's missing needs logoxide; a complete translation doesn't.
  const names = list.some((t) => t.books && !isComplete(t.books)) ? await bookNames() : new Map<string, string>();
  const items = await Promise.all(
    list.map(async (t) => {
      const kept = await keptBooks(t);
      const remote = !t.local && new URL(t.url, location.href).origin !== location.origin;
      const li = document.createElement('li');
      const label = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = t.abbreviation;
      const detail = document.createElement('small');
      const books = kept.map((b) => b.toUpperCase()).join(', ');
      detail.textContent = t.books
        ? `Your own: ${describeBooks(t.books, names)}`
        : remote
          ? kept.length
            ? `Downloaded: ${books}`
            : 'Downloaded as passages need it'
          : 'Installed on this site';
      label.append(title, ` ${t.name}`, detail);
      li.append(label);
      if (t.local) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'link';
        btn.textContent = 'Rename';
        btn.addEventListener('click', () => li.replaceChildren(renameForm(t)));
        li.append(btn);
      }
      if (t.local || kept.length) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'link';
        btn.textContent = t.local ? 'Delete' : 'Clear';
        btn.addEventListener('click', async () => {
          if (t.local && !confirm(`Delete your ${t.abbreviation} from this browser?`)) return;
          await forget(t);
          forgetBooks(t.id);
          await refreshTranslations();
        });
        li.append(btn);
      }
      return li;
    }),
  );
  bibleList.replaceChildren(...items);
  myBibles.replaceChildren(...list.filter((t) => t.local).map((t) => new Option(t.name, t.abbreviation)));
}

/** A form in place of the player's own translation in the list, to give it another abbreviation and name. */
function renameForm(t: Translation): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'rename';
  const abbreviation = document.createElement('input');
  abbreviation.type = 'text';
  abbreviation.value = t.abbreviation;
  abbreviation.maxLength = 16;
  abbreviation.required = true;
  abbreviation.ariaLabel = 'Abbreviation';
  const name = document.createElement('input');
  name.type = 'text';
  name.value = t.name;
  name.maxLength = 80;
  name.ariaLabel = 'Name';
  const save = document.createElement('button');
  save.className = 'primary';
  save.textContent = 'Save';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'link';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => void fillLibrary());
  const status = document.createElement('p');
  status.className = 'status error';
  status.ariaLive = 'polite';
  form.append(abbreviation, name, save, cancel, status);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    save.disabled = true;
    try {
      await renameLocal(t.id, abbreviation.value, name.value);
      await refreshTranslations();
      previewPassages();
    } catch (err) {
      status.textContent = errorText(err);
      save.disabled = false;
    }
  });
  form.addEventListener('keydown', (e) => {
    // Escape leaves the renaming, not the whole list.
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    void fillLibrary();
  });
  queueMicrotask(() => abbreviation.select());
  return form;
}

async function refreshTranslations(selected = translation.value) {
  await Promise.all([fillTranslations(selected), fillLibrary()]);
  save(SCRIPTURE_KEY, JSON.stringify(readScripture()));
}

async function openLibrary() {
  show(bibles);
  setAddStatus('');
  await fillLibrary();
  if (!(await canKeepBooks())) {
    for (const el of [bibleAbbrev, bibleName, bibleFiles, addBooks]) el.disabled = true;
    setAddStatus('This browser can’t keep files for the game (it needs https), so you can’t add your own.', 'error');
  }
  bibleAbbrev.focus();
}

function closeLibrary() {
  show(menu);
  translation.focus();
}

addBible.addEventListener('submit', async (e) => {
  e.preventDefault();
  const files = [...(bibleFiles.files ?? [])];
  const abbreviation = bibleAbbrev.value.trim();
  if (!files.length || !abbreviation) return;
  addBooks.disabled = true;
  setAddStatus('Reading the books…');
  try {
    const read = picked?.files[0] === files[0] ? picked : { files, ...(await readBookFiles(files)) };
    const { books, problems } = read;
    if (!books.length) throw new Error(problems.join(' ') || 'No books found.');
    const t = await saveLocalBooks(abbreviation, bibleName.value, books);
    forgetBooks(t.id);
    await refreshTranslations(t.id);
    const all = (await translations()).find((l) => l.id === t.id)?.books ?? [];
    const count = `${books.length} book${books.length === 1 ? '' : 's'}`;
    const added = `Added ${count} to your ${t.abbreviation}: ${describeBooks(all, await bookNames())}.`;
    setAddStatus([added, ...problems].join(' '), isComplete(all) ? 'ok' : problems.length ? 'error' : null);
    picked = null;
    addBible.reset();
    syncScriptureUi();
    previewPassages();
  } catch (err) {
    setAddStatus(errorText(err), 'error');
  } finally {
    addBooks.disabled = false;
  }
});

// The name of a translation already added fills itself in, and what it would have is said again.
bibleAbbrev.addEventListener('input', async () => {
  const t = await localTranslation(bibleAbbrev.value);
  if (t) bibleName.value = t.name;
  void showPicked();
});
bibleFiles.addEventListener('change', () => void previewFiles());

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !bibles.classList.contains('hidden')) closeLibrary();
});

applySettings(loadSettings());
syncSettingsUi();
applyScripture(loadScripture());
syncScriptureUi();
previewPassages();
void fillTranslations(loadScripture().translation);
for (const el of [passages, translation, unit, unitWords, order, keepTogether]) {
  el.addEventListener('input', () => {
    syncScriptureUi();
    if (el === passages) previewPassages();
    save(SCRIPTURE_KEY, JSON.stringify(readScripture()));
  });
}
for (const el of [
  speed,
  progression,
  caps,
  punct,
  shofarRefund,
  nextWordOnly,
  bannerVerse,
  mistake,
  releaseKey,
  releaseMode,
  wpmGap,
]) {
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
$('manageBibles').addEventListener('click', openLibrary);
$('closeBibles').addEventListener('click', closeLibrary);

refreshMenu();
show(menu);
