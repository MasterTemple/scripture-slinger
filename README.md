# Scripture Slinger

A typing game in the style of [ZType](https://zty.pe/), themed on the Bible. You are David with a sling. Locusts, ravens, fiery serpents and the occasional Goliath come at you, and you type their words to bring them down.

Play it at **https://mastertemple.github.io/scripture-slinger/**.

```sh
npm install
npm run dev      # play at http://localhost:5173
npm run build    # type-check + production build into dist/, for /scripture-slinger/
npm run preview  # the build, at http://localhost:4173/scripture-slinger/
```

Every push to `master` is built and published to GitHub Pages by `.github/workflows/pages.yml` (the repository's **Settings → Pages → Source** is **GitHub Actions**). The build's `base` in `vite.config.ts` is `/scripture-slinger/`, the repository's name; `npm run dev` serves from `/`.

## How it plays

- Type the first letter of any enemy's word to lock on. Each correct letter throws a stone.
- Once you're locked on, you have to finish that word. A wrong key breaks your combo.
- **Enter** blows the shofar, which clears the screen (Goliath only gets knocked back). You start with one and get another every 3 waves, up to 3.
- **Esc** pauses.
- You start with 3 hearts. Clearing a wave without a single typo earns another life, up to 3 shields (6 lives in all). Shields are lost before hearts.
- You pick the starting speed (1–20) on the menu. Enemies get about 7% faster each wave and also speed up a little within a wave. Every 5th wave brings a Goliath carrying a phrase, shown one word at a time. Each word you finish is a blow (his health bar shows how much of the phrase is left), and the next word is a fresh target, so you can turn to other enemies between words.

### Rules (on the menu, remembered between sessions)

- **Forgiving shofar** (on by default): blowing the shofar with nothing on screen to defeat gives it back. A giant counts as a target, since the blast still drives it back.
- **Capitalization** and **Punctuation**: when off, words appear in lowercase with punctuation stripped.
- **On a wrong key**: keep going (counts as a miss), restart the word and stay locked on, or restart the word and release it.
- **Release target with**: Space, Tab or Backspace drops your current target so you can attack another.
- **A released word**: either keeps its progress (type its next letter to pick it back up) or starts over.
- If several enemies start with the letter you type, you lock onto the one nearest to David.
- **As the waves go on**: *Enemies get faster* (+7% speed per wave) or *More enemies, gentler speed-up* (+2.5% speed per wave, with bigger waves that spawn more often to make up the difference).
- **Pause between words counted in WPM**: WPM always counts time spent inside a word. This sets how much of the pause before each word also counts (none up to 5s), so you choose whether picking the next target is part of your speed.

## Typing passages

Name passages in the menu's **Scripture** box (`John 1:1-14; Psalm 23; Romans 8:28-39`, or any text with references in it) and the waves walk through their words in reading order. Leave it empty for random Bible words.

- Every creature takes the same time to reach David, so they arrive in reading order: defeating whatever is closest types the passage in order.
- If you know the verse, type ahead: a letter no enemy on screen is waiting for, but that starts the passage's next word, brings that word in at once (no miss), moving slower so it reaches David no sooner than it would have. Knowing the verse buys you time. A space between words is never a miss.
- A giant wave is the giant alone, carrying every word of the wave: each word appears as soon as you finish the one before. He's paced like the creatures those words would have been (one creature's journey, plus a spawn's wait for each word).

- **Each wave is** a verse, a paragraph (a stanza in poetry), or a set number of words.
- **Passages come** in the order given, or shuffled. When shuffled, **Keep each passage together** decides whether `John 1:1-3` stays one run in order or its verses are shuffled in with the rest.
- When the passages run out, they start over.

References are read by [topos](https://github.com/MasterTemple/topos-bible) and the text by [logoxide](https://github.com/Logoxide/logoxide), both from logoxide's WebAssembly package, which is only downloaded once a passage is named. It comes from npm (`logoxide`).

Each translation is a folder of USX files, one per book, named by its lowercase USFM code (`jhn.usx`). The menu's **Manage** link lists them. There are three kinds (`src/bibles.ts`):

- **The BSB, KJV and WEB** (public domain) are always available. Their books are downloaded from [fetch.bible](https://fetch.bible) as passages need them, and then kept in the browser's Cache Storage, so each book is only downloaded once. **Clear** deletes the copies. More are a line each in `BUILT_IN`.
- **On the server:** folders under `public/bibles/` (`public/bibles/esv/jhn.usx`), listed in `public/bibles/translations.json`. One with the id `bsb`, `kjv` or `web` takes the place of the built-in one. These aren't in this repository.

  ```json
  [{ "id": "esv", "name": "English Standard Version", "abbreviation": "ESV" }]
  ```

- **A player's own:** USX or USFM files (one per book), or zips of them (eBible.org's `<id>_usfm.zip`, a Digital Bible Library bundle's USX), added under **Manage**. logoxide unzips them, converts USFM to USX and reads each book, and the panel says whether all 66 books are there with every chapter (and if not, which are missing) before they're added. They're kept only in that browser's Cache Storage. Adding books under an abbreviation that's already been used adds them to that translation.

Cache Storage only exists on https and `localhost`. Without it, the BSB is downloaded again each session and players can't add their own translations.

## Plugging in other word sources

The game only asks for words through the `WordSource` interface in `src/words.ts`:

```ts
interface WordSource {
  startWave?(boss: boolean): { verse; words: { text; giant }[] } | null;
  next?(req: { minLen; maxLen; phrase; punctuation; accept(word): boolean }): string | null;
}
```

Pass your own implementation to `game.start(settings, source)` in `src/main.ts`. Return text exactly as written, with its capitals and punctuation. `toTypeable` strips or lowercases it to match the player's settings, and `normalizeChar` maps curly quotes and dashes to plain keys. Call `req.accept(word)` to skip words whose first key is already taken on screen, so every enemy can be locked onto without ambiguity. A source that plans its own waves (like `PassageSource` in `src/scripture.ts`) implements `startWave` instead, returning the banner verse and the wave's words in the order they should be typed, with the giant's marked; the game keeps them in that order.

## License

Scripture Slinger is dedicated to the public domain under [CC0 1.0](LICENSE).
