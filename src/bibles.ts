/**
 * Where a translation's books come from, and where they're kept on this device.
 *
 * Every translation is a folder of USX files, one per book, named by its lowercase USFM code
 * (`jhn.usx`). The BSB's, KJV's and WEB's folders are on fetch.bible. Others can be installed on the server, under
 * `public/bibles/` and listed in its `translations.json`. A player's own translations exist only
 * in their browser.
 *
 * Books from another site are kept in the browser's Cache Storage once downloaded, so each is
 * downloaded once. A player's own books are kept there too, under made-up URLs on this site
 * that are never requested from the server. Cache Storage only exists on https and localhost;
 * without it, downloaded books aren't kept and the player can't add their own.
 */

export interface Translation {
  id: string;
  name: string;
  abbreviation: string;
  /** The folder its books are in, ending in a slash. */
  url: string;
  /** A player's own, kept only in this browser. */
  local?: boolean;
  /** A player's own translation's books. */
  books?: StoredBook[];
}

/** A book of a player's own translation. */
export interface StoredBook {
  /** Lowercase USFM code. */
  usfm: string;
  /** The chapters the book has that its file doesn't. */
  missing: number[];
}

/** A player's own translation, as listed in the index. */
interface LocalTranslation {
  id: string;
  name: string;
  abbreviation: string;
  books: StoredBook[];
}

/** A book read from a player's file, as USX. */
export interface BookFile extends StoredBook {
  usx: string;
}

const BIBLES = `${import.meta.env.BASE_URL}bibles/`;
const CACHE = 'scripture-slinger:bibles';
const LOCAL = new URL(`${import.meta.env.BASE_URL}my-bibles/`, location.href).href;
const INDEX = `${LOCAL}index.json`;

/** A translation on fetch.bible, by its id there. */
const fetchBible = (id: string, abbreviation: string, name: string, fetchId: string): Translation => ({
  id,
  name,
  abbreviation,
  url: `https://collection.fetch.bible/bibles/${fetchId}/usx/`,
});

/** Public domain, so always available. A server's `translations.json` can replace them by id. */
const BUILT_IN: Translation[] = [
  fetchBible('bsb', 'BSB', 'Berean Standard Bible', 'eng_bsb'),
  fetchBible('kjv', 'KJV', 'King James Version', 'eng_kjv'),
  // fetch.bible's `eng_web` has the deuterocanon; `eng_webp` is the 66 books.
  fetchBible('web', 'WEB', 'World English Bible', 'eng_webp'),
];

let installed: Promise<Translation[]> | null = null;

/** The translations on the server, in `public/bibles/translations.json` (none if it's missing). */
function serverTranslations(): Promise<Translation[]> {
  installed ??= fetch(`${BIBLES}translations.json`)
    .then((r) => (r.ok ? r.json() : []))
    .then((list: Omit<Translation, 'url'>[]) => list.map((t) => ({ ...t, url: `${BIBLES}${t.id}/` })))
    .catch(() => []);
  return installed;
}

/** Every translation the player can choose: the BSB, the server's, then their own. */
export async function translations(): Promise<Translation[]> {
  const server = await serverTranslations();
  const ids = new Set(server.map((t) => t.id));
  return [
    ...BUILT_IN.filter((t) => !ids.has(t.id)),
    ...server,
    ...(await localIndex()).map((t) => toTranslation(t)),
  ];
}

function toTranslation(t: LocalTranslation): Translation {
  return {
    id: t.id,
    name: t.name,
    abbreviation: t.abbreviation,
    url: `${LOCAL}${t.id}/`,
    local: true,
    books: t.books,
  };
}

async function openCache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE);
  } catch {
    return null;
  }
}

/** Whether this browser can keep books (and so whether players can add their own). */
export async function canKeepBooks(): Promise<boolean> {
  return (await openCache()) !== null;
}

/** A book's USX, from this device if it's kept here, else downloaded (and kept, if it's from another site). */
export async function bookText(t: Translation, usfm: string): Promise<string | null> {
  const url = new URL(`${t.url}${usfm.toLowerCase()}.usx`, location.href).href;
  const cache = await openCache();
  const kept = await cache?.match(url);
  if (kept) return kept.text();
  if (t.local) return null;
  const r = await fetch(url);
  if (!r.ok) return null;
  if (cache && new URL(url).origin !== location.origin) {
    // Not keeping it only means downloading it again next time.
    await cache.put(url, r.clone()).catch(() => {});
  }
  return r.text();
}

/** Lowercase USFM codes of the books of `t` kept on this device. */
export async function keptBooks(t: Translation): Promise<string[]> {
  const cache = await openCache();
  if (!cache) return [];
  const folder = new URL(t.url, location.href).href;
  return (await cache.keys())
    .map((r) => r.url)
    .filter((url) => url.startsWith(folder) && url.endsWith('.usx'))
    .map((url) => url.slice(folder.length, -'.usx'.length));
}

/** Delete the books of `t` kept on this device, and the translation itself if it's the player's own. */
export async function forget(t: Translation) {
  const cache = await openCache();
  if (!cache) return;
  const folder = new URL(t.url, location.href).href;
  for (const r of await cache.keys()) if (r.url.startsWith(folder)) await cache.delete(r);
  if (t.local) await saveIndex((await localIndex()).filter((l) => l.id !== t.id));
}

async function localIndex(): Promise<LocalTranslation[]> {
  try {
    const r = await (await openCache())?.match(INDEX);
    return r ? await r.json() : [];
  } catch {
    return [];
  }
}

async function saveIndex(list: LocalTranslation[]) {
  const cache = await openCache();
  if (!cache) throw new Error('This browser can’t keep files for the game.');
  await cache.put(INDEX, Response.json(list));
}

/** The id of the player's own translation with this abbreviation. */
export function localId(abbreviation: string): string {
  return `my-${abbreviation.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}`;
}

/**
 * Keep `books` as the player's own translation, adding to (or replacing books of) the one with
 * the same abbreviation if there is one.
 */
export async function saveLocalBooks(abbreviation: string, name: string, books: BookFile[]): Promise<Translation> {
  const cache = await openCache();
  if (!cache) throw new Error('This browser can’t keep files for the game.');
  const id = localId(abbreviation);
  const index = await localIndex();
  const existing = index.find((t) => t.id === id);
  const added = new Set(books.map((b) => b.usfm));
  const entry: LocalTranslation = {
    id,
    abbreviation: abbreviation.trim(),
    name: name.trim() || existing?.name || abbreviation.trim(),
    books: [
      ...(existing?.books ?? []).filter((b) => !added.has(b.usfm)),
      ...books.map(({ usfm, missing }) => ({ usfm, missing })),
    ],
  };
  const t = toTranslation(entry);
  for (const b of books) {
    const headers = { 'Content-Type': 'application/xml' };
    await cache.put(`${t.url}${b.usfm}.usx`, new Response(b.usx, { headers }));
  }
  await saveIndex([...index.filter((l) => l.id !== id), entry]);
  // Ask the browser not to clear them when space runs low; it may say no.
  void navigator.storage?.persist?.().catch(() => {});
  return t;
}
