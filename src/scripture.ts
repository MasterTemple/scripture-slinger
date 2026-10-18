/**
 * Bible passages as waves.
 *
 * References are read by topos and a translation's text by logoxide, both from
 * logoxide's WebAssembly package, which is only loaded once the player asks for
 * passages. A translation is a folder of USX files (one per book, named by its
 * lowercase USFM code) under `public/bibles/`, listed in `translations.json`.
 */
import type { LogoxideBook, Passage, Topos } from 'logoxide';
import type { Verse, WavePlan, WordSource } from './words';

export type WaveUnit = 'verse' | 'paragraph' | 'words';

export interface ScriptureSettings {
  /** References as the player wrote them; empty means random Bible words. */
  passages: string;
  translation: string;
  unit: WaveUnit;
  /** Words per wave when `unit` is 'words'. */
  words: number;
  shuffle: boolean;
  /** When shuffled, each passage (e.g. John 1:1-3) still comes as one run, in order. */
  keepTogether: boolean;
}

export const DEFAULT_SCRIPTURE: ScriptureSettings = {
  passages: '',
  translation: 'esv',
  unit: 'verse',
  words: 20,
  shuffle: false,
  keepTogether: true,
};

export interface Translation {
  id: string;
  name: string;
  abbreviation: string;
}

/** References found in what the player wrote, and the parts that aren't references. */
export interface FoundPassages {
  references: string[];
  unrecognized: string[];
}

const BIBLES = `${import.meta.env.BASE_URL}bibles/`;

/** Verse labels in styled text: \u0001chapter:verse\u0002, which no Bible's text contains. */
const LABEL = /\u0001(\d+):(\d+)\u0002/g;
const STYLE = {
  verseLabel: '\u0001{chapter}:{verse}\u0002',
  chapterLabel: null,
  notes: false,
  headings: false,
  templates: [],
  width: null,
  limit: null,
};

type Lx = typeof import('logoxide');

let lib: Promise<{ lx: Lx; topos: Topos }> | null = null;
let installed: Promise<Translation[]> | null = null;
const books = new Map<string, Promise<LogoxideBook>>();

function logoxide() {
  lib ??= import('logoxide').then(async (lx) => {
    await lx.initialized;
    return { lx, topos: lx.Topos.new() };
  });
  return lib;
}

/** The translations in `public/bibles/translations.json` (none if it's missing). */
export function translations(): Promise<Translation[]> {
  installed ??= fetch(`${BIBLES}translations.json`)
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  return installed;
}

/** The references in `input`, for showing the player what will be typed. */
export async function findPassages(input: string): Promise<FoundPassages> {
  const { lx, topos } = await logoxide();
  const matches = topos.search(input, lx.OffsetUnit.Utf16);
  // "John 3:16 ESV" is fine: the passages are read in the chosen translation.
  const names = new Set((await translations()).map((t) => t.abbreviation.toLowerCase()));
  const unrecognized: string[] = [];
  let pos = 0;
  for (const m of [...matches, { start: input.length, end: input.length }]) {
    for (const part of input.slice(pos, m.start).split(/[,;\n]|\band\b|&/)) {
      if (/[\p{L}\p{N}]/u.test(part) && !names.has(part.trim().toLowerCase())) unrecognized.push(part.trim());
    }
    pos = m.end;
  }
  return { references: matches.map((m) => m.passage.reference), unrecognized };
}

/** Read the passages in `s` and plan their waves. Throws with a message for the player. */
export async function loadPassages(s: ScriptureSettings): Promise<PassageSource> {
  const { lx, topos } = await logoxide();
  const translation = (await translations()).find((t) => t.id === s.translation);
  if (!translation) throw new Error('That translation isn’t installed.');

  // Each contiguous range (John 1:1-3 in "John 1:1-3; 3:16") is a passage of its own.
  const passages = topos
    .search(s.passages, lx.OffsetUnit.Utf16)
    .flatMap((m) => m.passage.segments.map((seg) => ({ ...m.passage, segments: [seg] })));
  if (!passages.length) throw new Error('No Bible references found.');

  const usfm = new Map(topos.books().map((b) => [b.id, b.usfm]));
  const groups: Chunk[][] = [];
  for (const passage of passages) {
    const book = await loadBook(lx, topos, translation, passage, usfm.get(passage.bookId)!);
    const tokens = readTokens(lx, book, passage);
    groups.push(split(tokens, s).map((t) => toChunk(lx, topos, passage.book, t)));
  }
  if (!groups.some((g) => g.length)) throw new Error(`The ${translation.abbreviation} has no text for those passages.`);
  return new PassageSource(
    groups.filter((g) => g.length),
    s,
  );
}

function loadBook(lx: Lx, topos: Topos, t: Translation, passage: Passage, usfm: string): Promise<LogoxideBook> {
  const key = `${t.id}/${usfm}`;
  let book = books.get(key);
  if (!book) {
    book = fetch(`${BIBLES}${t.id}/${usfm.toLowerCase()}.usx`)
      .then((r) => {
        if (!r.ok) throw new Error(`The ${t.abbreviation} has no ${passage.book}.`);
        return r.text();
      })
      .then((text) => {
        const parsed = lx.LogoxideBook.parse(topos, 'usx', text);
        if (!parsed) throw new Error(`The ${t.abbreviation}’s ${passage.book} couldn’t be read.`);
        return parsed;
      });
    // A failed fetch can be tried again.
    book.catch(() => books.delete(key));
    books.set(key, book);
  }
  return book;
}

/** A word of a passage, with where it is and whether a verse or paragraph begins with it. */
interface Token {
  word: string;
  chapter: number;
  verse: number;
  verseStart: boolean;
  paraStart: boolean;
}

/** One wave's text. */
interface Chunk {
  verse: Verse;
  words: string[];
}

function readTokens(lx: Lx, book: LogoxideBook, passage: Passage): Token[] {
  const styled = book.styledText(passage, STYLE, passage.book);
  if (!styled) return [];
  const { text, marks } = styled;

  // Prose paragraphs are marked; poetry's stanzas are a blank line apart (its lines one newline).
  const breaks = new Set(marks.filter((m) => m.kind === lx.NodeKind.Paragraph).map((m) => m.start));
  for (const m of text.matchAll(/\n\s*\n/g)) breaks.add(m.index + m[0].length);
  const cuts: { at: number; end: number; chapter?: number; verse?: number }[] = [...breaks].map((at) => ({
    at,
    end: at,
  }));
  for (const m of text.matchAll(LABEL)) {
    cuts.push({ at: m.index, end: m.index + m[0].length, chapter: Number(m[1]), verse: Number(m[2]) });
  }
  // At the same place, a paragraph break comes before the verse label.
  cuts.sort((a, b) => a.at - b.at || (a.verse === undefined ? -1 : 1));

  const tokens: Token[] = [];
  let chapter = 0;
  let verse = 0;
  let verseStart = false;
  let paraStart = true;
  let pos = 0;
  const take = (to: number) => {
    // Anything before the first verse (a psalm's title) isn't typed.
    if (!verse) return;
    for (const word of words(text.slice(pos, to))) {
      tokens.push({ word, chapter, verse, verseStart, paraStart });
      verseStart = paraStart = false;
    }
  };
  for (const cut of cuts) {
    take(cut.at);
    pos = cut.end;
    if (cut.verse === undefined) {
      paraStart = true;
    } else {
      chapter = cut.chapter!;
      verse = cut.verse;
      verseStart = true;
    }
  }
  take(text.length);
  return tokens;
}

/** Split text into words to type. A dash ends a word ("Christ—I" is two), and lone punctuation joins a word. */
function words(text: string): string[] {
  const out: string[] = [];
  let lead = '';
  for (const piece of text.split(/\s+/)) {
    for (const w of piece.split(/(?<=[—–])(?=.)/u)) {
      if (!w) continue;
      if (!/[\p{L}\p{N}]/u.test(w)) {
        if (out.length) out[out.length - 1] += w;
        else lead += w;
        continue;
      }
      out.push(lead + w);
      lead = '';
    }
  }
  return out;
}

/** One passage's words, cut into waves of a verse, a paragraph, or a number of words. */
function split(tokens: Token[], s: ScriptureSettings): Token[][] {
  const out: Token[][] = [];
  for (const t of tokens) {
    const cur = out[out.length - 1];
    const starts =
      !cur || (s.unit === 'verse' ? t.verseStart : s.unit === 'paragraph' ? t.paraStart : cur.length >= s.words);
    if (starts) out.push([t]);
    else cur.push(t);
  }
  // A short tail joins the wave before it rather than making a wave of a few words.
  if (s.unit === 'words' && out.length > 1 && out[out.length - 1].length < s.words / 2) {
    out[out.length - 2].push(...out.pop()!);
  }
  return out;
}

function toChunk(lx: Lx, topos: Topos, book: string, tokens: Token[]): Chunk {
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const end =
    first.chapter !== last.chapter
      ? `-${last.chapter}:${last.verse}`
      : first.verse !== last.verse
        ? `-${last.verse}`
        : '';
  const ref = `${book} ${first.chapter}:${first.verse}${end}`;
  const words = tokens.map((t) => t.word);
  // Words split at a dash are shown joined again.
  const text = words.join(' ').replace(/([—–]) /gu, '$1');
  return { verse: { ref: topos.parse(ref, lx.BookStyle.Name)?.reference ?? ref, text }, words };
}

function shuffle<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Waves through the chosen passages, each wave's words in reading order. Starts over when they run out. */
export class PassageSource implements WordSource {
  private order: Chunk[] = [];
  private index = 0;

  constructor(
    private readonly groups: Chunk[][],
    private readonly settings: Pick<ScriptureSettings, 'shuffle' | 'keepTogether'>,
  ) {}

  private arrange(): Chunk[] {
    const { shuffle: shuffled, keepTogether } = this.settings;
    if (!shuffled) return this.groups.flat();
    if (keepTogether) return shuffle([...this.groups]).flat();
    return shuffle(this.groups.flat());
  }

  startWave(boss: boolean): WavePlan {
    if (this.index >= this.order.length) {
      this.order = this.arrange();
      this.index = 0;
    }
    const chunk = this.order[this.index++];
    // A giant wave is the giant alone, carrying all of its words.
    return { verse: chunk.verse, words: chunk.words.map((text) => ({ text, giant: boss })) };
  }
}
