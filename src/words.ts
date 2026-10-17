/**
 * Word supply for the game.
 *
 * The game only talks to the `WordSource` interface, so swapping in real Bible
 * texts later means writing another implementation (e.g. one that walks through
 * a passage word by word) and passing it to `new Game(...)`.
 *
 * Sources should return text as written (capitals, punctuation and all); the
 * game strips or lowercases it according to the player's settings.
 */

export interface WordRequest {
  minLen: number;
  maxLen: number;
  /** True when a boss wants a longer multi-word phrase. */
  phrase: boolean;
  /** Whether the player is typing punctuation; a source may prefer punctuated text when true. */
  punctuation: boolean;
  /** Whether the word can be used right now (e.g. its first key isn't already taken on screen). */
  accept(word: string): boolean;
}

/** What a source decides about a wave; anything it leaves out follows the game's difficulty curve. */
export interface WavePlan {
  /** Shown on the wave's banner, and its reference during the wave. */
  verse: Verse;
  /** How many regular (non-boss) enemies the wave has. */
  size: number;
  /** How many regular enemies come before the boss (when the wave has one). */
  bossAt: number;
}

export interface WordSource {
  /**
   * Called as each wave begins. A source that walks through a passage plans the
   * wave from its text; return null (or leave it out) for the game's own plan.
   */
  startWave?(boss: boolean): WavePlan | null;
  /** Return a word (or phrase), or null if nothing fits right now. */
  next(req: WordRequest): string | null;
}

export interface TypingOptions {
  caseSensitive: boolean;
  punctuation: boolean;
}

export interface Verse {
  text: string;
  ref: string;
}

const CHAR_MAP: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  ' ': ' ',
};

/** Map a displayed character to the key that types it (curly quotes → straight, etc.). */
export function normalizeChar(c: string): string {
  return CHAR_MAP[c] ?? c;
}

/**
 * Turn source text into the characters shown on an enemy, applying the
 * player's capitalization/punctuation settings. Returns [] if nothing typeable is left.
 */
export function toTypeable(raw: string, opts: TypingOptions): string[] {
  let text = raw.trim();
  if (!opts.punctuation) {
    text = text
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (!opts.caseSensitive) text = text.toLowerCase();
  return Array.from(text);
}

const WORDS = `
ark sin God Lamb love hope joy dove king word holy amen Abel Adam Eve Noah Cain Seth Ruth Job Amos
Mark Luke John Paul Lot Ham Dan Gad Levi Zion Nile fig vine wine oil salt sea tomb rock lion fish net
boat ship gold alms fast pray sing harp horn rod yoke seed sow reap fire rain star soul life way door
gate law body cup ox ram ewe east well hand eyes ear foot sun moon bow tent veil cord dust clay pot
bread faith grace peace mercy glory manna staff psalm Jesus Moses David Aaron Isaac Jacob Sarah Mary
Peter James Jonah Elijah Elisha Samuel Gideon Samson Joseph Esther Daniel Isaiah Israel Egypt Jordan
Canaan Bethel temple prayer praise heaven angel Spirit gospel prophet apostle wisdom justice kingdom
cherub seraph chariot trumpet sabbath Pharaoh Eden Goshen Sinai Hebron Judah Bethany Galilee Jericho
Babylon Nineveh Rachel Rebekah Miriam Deborah Hannah Naomi Boaz Jesse Saul Solomon Hezekiah Josiah
Nehemiah Ezra Micah Hosea Joel Obadiah Nahum Habakkuk Haggai Malachi Matthew Thomas Andrew Philip
Stephen Timothy Titus Barnabas Silas Lydia Martha Lazarus Nicodemus Zacchaeus Pilate Herod Caesar
shepherd vineyard harvest servant witness disciple blessing promise offering sacrifice altar incense
shofar jubilee unleavened wilderness mountain olive cedar sackcloth ashes scroll parable miracle
lantern lampstand fortress refuge shield buckler sword helmet armour breastplate sandals
tabernacle covenant salvation righteous Redeemer resurrection revelation Deuteronomy Leviticus
Genesis Exodus Numbers Joshua Judges Kings Chronicles Proverbs Psalms Romans Galatians Ephesians
Colossians Hebrews Ecclesiastes Philippians Thessalonians Lamentations Melchizedek Methuselah
Zerubbabel Bartholomew forgiveness everlasting hallelujah hosanna Emmanuel transfiguration
righteousness longsuffering frankincense propitiation intercession commandments tribulation
`
  .split(/\s+/)
  .filter(Boolean);

/** Words as they appear mid-verse, used when the player has punctuation turned on. */
const PUNCTUATED = `
LORD, LORD's God's Amen. Hallelujah! Hosanna! Selah. Behold, Verily, Abba, Lord? heaven; earth.
light: darkness; Israel! Zion, Jerusalem, shepherd; want. Rabbi, Master, faith, hope, charity.
David's Peter's Pharaoh's Lamb's Spirit: glory! Alpha, Omega. repent: Yea, Nay, Lo, O, thee; thou,
thine. mine: Saviour, Messiah. Jacob's Abraham's servant; sheep, waters. paths; soul: feet, rod;
`
  .split(/\s+/)
  .filter(Boolean);

const PHRASES = [
  'The LORD is my shepherd;',
  'The battle is the LORD’s.',
  'Be strong and of a good courage;',
  'Greater is he that is in you,',
  'The joy of the LORD is your strength.',
  'With God all things are possible.',
  'I can do all things through Christ',
  'The LORD is my light and my salvation;',
  'Be still, and know that I am God:',
  'The word of God is quick, and powerful,',
  'Resist the devil, and he will flee from you.',
  'Thy word is a lamp unto my feet,',
  'If God be for us, who can be against us?',
  'They that wait upon the LORD',
  'Not by might, nor by power, but by my spirit,',
  'A soft answer turneth away wrath:',
];

export const VERSES: Verse[] = [
  { text: 'The LORD is my shepherd; I shall not want.', ref: 'Psalm 23:1' },
  { text: 'Thy word is a lamp unto my feet, and a light unto my path.', ref: 'Psalm 119:105' },
  { text: 'Be strong and of a good courage; be not afraid.', ref: 'Joshua 1:9' },
  { text: 'For the battle is the LORD’s, and he will give you into our hands.', ref: '1 Samuel 17:47' },
  { text: 'God is our refuge and strength, a very present help in trouble.', ref: 'Psalm 46:1' },
  { text: 'The name of the LORD is a strong tower.', ref: 'Proverbs 18:10' },
  { text: 'Not by might, nor by power, but by my spirit, saith the LORD.', ref: 'Zechariah 4:6' },
  { text: 'If God be for us, who can be against us?', ref: 'Romans 8:31' },
  { text: 'Resist the devil, and he will flee from you.', ref: 'James 4:7' },
  { text: 'They that wait upon the LORD shall renew their strength.', ref: 'Isaiah 40:31' },
  { text: 'The LORD is my light and my salvation; whom shall I fear?', ref: 'Psalm 27:1' },
  { text: 'Fear thou not; for I am with thee.', ref: 'Isaiah 41:10' },
  { text: 'Be still, and know that I am God.', ref: 'Psalm 46:10' },
  { text: 'The joy of the LORD is your strength.', ref: 'Nehemiah 8:10' },
];

export function randomVerse(): Verse {
  return VERSES[Math.floor(Math.random() * VERSES.length)];
}

function pick<T>(list: T[]): T | null {
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

/** Random words drawn from a built-in list of Bible names, places, and themes. */
export class DefaultWordSource implements WordSource {
  private recent: string[] = [];

  next(req: WordRequest): string | null {
    const usable = (w: string) => !this.recent.includes(w) && req.accept(w);
    const sized = (list: string[]) => list.filter((w) => w.length >= req.minLen && w.length <= req.maxLen);
    let choice: string | null;
    if (req.phrase) {
      choice = pick(PHRASES.filter(usable));
    } else {
      const pool = req.punctuation && Math.random() < 0.35 ? PUNCTUATED : WORDS;
      choice = pick(sized(pool).filter(usable)) ?? pick(sized(WORDS).filter(usable)) ?? pick(WORDS.filter(usable));
    }
    if (choice) {
      this.recent.push(choice);
      if (this.recent.length > 30) this.recent.shift();
    }
    return choice;
  }
}
