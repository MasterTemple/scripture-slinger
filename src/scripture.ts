/**
 * Bible passages as waves.
 *
 * References are read by topos and a translation's text by logoxide, both from
 * logoxide's WebAssembly package, which is only loaded once the player asks for
 * passages. Where the books come from is up to `./bibles`.
 */
import type { Logoxide, LogoxideBook, Passage, Topos, ToposFormat } from 'logoxide';
import { bookText, translations, type BookFile, type Translation } from './bibles';
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
  passages: 'Hebrews 1',
  translation: 'bsb',
  unit: 'verse',
  words: 20,
  shuffle: false,
  keepTogether: true,
};

/** References found in what the player wrote, and the parts that aren't references. */
export interface FoundPassages {
  references: string[];
  unrecognized: string[];
}

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
const books = new Map<string, Promise<LogoxideBook>>();

function logoxide() {
  lib ??= import('logoxide').then(async (lx) => {
    await lx.initialized;
    return { lx, topos: lx.Topos.new() };
  });
  return lib;
}

/** The translations the player can choose, as topos's, by their abbreviations: "John 3:16 KJV" names one. */
function toposTranslations(lx: Lx, list: Translation[]) {
  let names = lx.ToposTranslations.create();
  // By lowercase abbreviation. A player's own can share a server's; the first in the menu is the one named.
  const byName = new Map<string, Translation>();
  for (const t of list) {
    const key = t.abbreviation.toLowerCase();
    if (byName.has(key)) continue;
    byName.set(key, t);
    names = names.add(t.abbreviation, []);
  }
  return { names, byName };
}

/** The references in `input`, each with the translation it names, if any. */
async function search(input: string) {
  const { lx, topos } = await logoxide();
  const list = await translations();
  const { names, byName } = toposTranslations(lx, list);
  const matches = topos.searchWithTranslations(input, lx.OffsetUnit.Utf16, lx.ToposQuery.create(), names);
  return { lx, topos, list, matches, byName };
}

/** The references in `input`, for showing the player what will be typed. */
export async function findPassages(input: string): Promise<FoundPassages> {
  const { matches } = await search(input);
  const unrecognized: string[] = [];
  let pos = 0;
  // A translation the game doesn't have ("John 3:16 ESV") isn't a reference, so the player is told.
  const spans = matches.map((m) => ({ start: m.reference.start, end: m.translation?.end ?? m.reference.end }));
  for (const m of [...spans, { start: input.length, end: input.length }]) {
    for (const part of input.slice(pos, m.start).split(/[,;\n]|\band\b|&/)) {
      if (/[\p{L}\p{N}]/u.test(part)) unrecognized.push(part.trim());
    }
    pos = m.end;
  }
  const references = matches.map((m) => [m.reference.passage.reference, m.translation?.name].filter(Boolean).join(' '));
  return { references, unrecognized };
}

/** Read the passages in `s` and plan their waves. Throws with a message for the player. */
export async function loadPassages(s: ScriptureSettings): Promise<PassageSource> {
  const { lx, topos, list, matches, byName } = await search(s.passages);
  const chosen = list.find((t) => t.id === s.translation);
  if (!chosen) throw new Error('That translation isn’t installed.');

  // Each contiguous range (John 1:1-3 in "John 1:1-3; 3:16") is a passage of its own, read in the
  // translation its reference names ("John 3:16 KJV"), else the chosen one.
  const passages = topos.parts(s.passages, lx.OffsetUnit.Utf16).map((p) => {
    const match = matches.find((m) => m.reference.start <= p.start && p.end <= m.reference.end);
    const named = match?.translation && byName.get(match.translation.name.toLowerCase());
    return { passage: p.passage, translation: named || chosen };
  });
  if (!passages.length) throw new Error('No Bible references found.');

  const usfm = new Map(topos.books().map((b) => [b.id, b.usfm]));
  const format = lx.ToposFormat.create().book(lx.BookStyle.Name);
  const groups: Chunk[][] = [];
  for (const { passage, translation } of passages) {
    const book = await loadBook(lx, topos, translation, passage, usfm.get(passage.bookId)!);
    const tokens = readTokens(lx, book, passage);
    // A wave in another translation than the chosen one says which.
    const named = translation === chosen ? null : translation.abbreviation;
    groups.push(split(tokens, s).map((t) => toChunk(topos, format, passage, named, t)));
  }
  if (!groups.some((g) => g.length)) {
    const used = [...new Set(passages.map((p) => p.translation))];
    const which = used.length === 1 ? `The ${used[0].abbreviation} has` : 'Those translations have';
    throw new Error(`${which} no text for those passages.`);
  }
  return new PassageSource(
    groups.filter((g) => g.length),
    s,
  );
}

function loadBook(lx: Lx, topos: Topos, t: Translation, passage: Passage, usfm: string): Promise<LogoxideBook> {
  const key = `${t.id}/${usfm}`;
  let book = books.get(key);
  if (!book) {
    book = bookText(t, usfm)
      .then((text) => {
        if (text === null) throw new Error(`The ${t.abbreviation} has no ${passage.book}.`);
        // Text with no verses isn't a book.
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

/** Each book's name, by its lowercase USFM code, in Bible order. */
export async function bookNames(): Promise<Map<string, string>> {
  const { topos } = await logoxide();
  return new Map(topos.books().map((b) => [b.usfm.toLowerCase(), b.name]));
}

/** Forget the books of translation `id` read so far, so changed files are read again. */
export function forgetBooks(id: string) {
  for (const key of books.keys()) if (key.startsWith(`${id}/`)) books.delete(key);
}

/** A zip file starts with "PK\3\4". */
const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;

/** What went wrong, for the player. */
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * The books in a player's USX or USFM files (or zips of them), each with the chapters it's
 * missing, and what's wrong with the files that aren't books.
 */
export async function readBookFiles(files: File[]): Promise<{ books: BookFile[]; problems: string[] }> {
  const { lx, topos } = await logoxide();
  const bible = new Map(topos.books().map((b) => [b.id, b]));
  const found = new Map<string, BookFile>();
  const problems: string[] = [];
  let converter: Logoxide | null = null;

  const lib = () => (converter ??= lx.Logoxide.new());

  /** Read one file: one of the 66 books, another book, or not a book. */
  const read = (text: string): 'book' | 'other' | 'none' => {
    text = text.replace(/^\uFEFF/, '');
    if (/^\s*\\id\s/.test(text)) text = lib().usfmToUsx(text);
    // A license or a stylesheet has no verses, so it isn't a book; Tobit is, but not one of the 66.
    const book = lx.LogoxideBook.parse(topos, 'usx', text);
    if (!book) return 'none';
    const id = book.bookId();
    const info = id == null ? undefined : bible.get(id);
    if (!info) return 'other';
    const has = new Set(book.chapters());
    const missing = Array.from({ length: info.chapters }, (_, i) => i + 1).filter((c) => !has.has(c));
    found.set(info.usfm.toUpperCase(), { usfm: info.usfm.toLowerCase(), usx: text, missing });
    return 'book';
  };

  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isZip(bytes)) {
        const kind = read(new TextDecoder().decode(bytes));
        if (kind === 'none') problems.push(`${file.name} isn’t a USX or USFM book.`);
        if (kind === 'other') problems.push(`${file.name} isn’t one of the 66 books.`);
        continue;
      }
      let books = 0;
      let others = 0;
      for (const f of lib().unzip(bytes)) {
        // A zip's license, metadata and stylesheets aren't books, and aren't worth a word.
        if (!/\.(usx|xml|usfm|sfm|txt)$/i.test(f.path) || f.path.includes('__MACOSX/')) continue;
        const kind = read(new TextDecoder().decode(f.bytes));
        if (kind === 'book') books++;
        // The deuterocanon is left out, and front matter and glossaries (with no chapters) aren't counted.
        if (kind === 'other') others++;
      }
      if (!books) problems.push(`${file.name} has no USX or USFM books in it.`);
      else if (others) {
        problems.push(`Left out ${others} book${others === 1 ? '' : 's'} of ${file.name} not among the 66.`);
      }
    } catch (e) {
      problems.push(`${file.name} couldn’t be read: ${errorText(e)}`);
    }
  }
  return { books: [...found.values()], problems };
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
  // Marks counted in UTF-16 units, as a string is indexed.
  const styled = book.styledText(passage, STYLE, passage.book, lx.OffsetUnit.Utf16);
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

/**
 * Split text into words to type. A dash ends a word ("Christ—I" is two), and lone punctuation joins a word.
 * The KJV's paragraph signs (¶) aren't typed.
 */
function words(text: string): string[] {
  const out: string[] = [];
  let lead = '';
  for (const piece of text.replace(/¶/g, ' ').split(/\s+/)) {
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

function toChunk(
  topos: Topos,
  format: ToposFormat,
  passage: Passage,
  translation: string | null,
  tokens: Token[],
): Chunk {
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const start = { chapter: first.chapter, verse: first.verse };
  const end =
    last.chapter !== first.chapter || last.verse !== first.verse ? { chapter: last.chapter, verse: last.verse } : null;
  // The wave's verses, in the passage's book; formatting reads only the book and the segments.
  const verses = { ...passage, reference: '', osis: '', usfm: '', segments: [{ tag: 'Verses' as const, start, end }] };
  const reference = topos.formatPassage(verses, format) ?? passage.reference;
  const ref = translation ? `${reference} ${translation}` : reference;
  const words = tokens.map((t) => t.word);
  // Words split at a dash are shown joined again.
  const text = words.join(' ').replace(/([—–]) /gu, '$1');
  return { verse: { ref, text }, words };
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
