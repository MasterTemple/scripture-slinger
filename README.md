# Bible Type

A typing game in the style of [ZType](https://zty.pe/), themed on the Bible. You are David with a sling. Locusts, ravens, fiery serpents and the occasional Goliath come at you, and you type their words to bring them down.

```sh
npm install
npm run dev      # play at http://localhost:5173
npm run build    # type-check + production build into dist/
```

## How it plays

- Type the first letter of any enemy's word to lock on. Each correct letter throws a stone.
- Once you're locked on, you have to finish that word. A wrong key breaks your combo.
- **Enter** blows the shofar, which clears the screen (Goliath only gets knocked back). You start with one and get another every 3 waves, up to 3.
- **Esc** pauses.
- You start with 3 hearts. Clearing a wave without a single typo earns another life, up to 3 shields (6 lives in all). Shields are lost before hearts.
- You pick the starting speed (1–20) on the menu. Enemies get about 7% faster each wave and also speed up a little within a wave. Every 5th wave brings a Goliath with a long phrase.

### Rules (on the menu, remembered between sessions)

- **Forgiving shofar** (on by default): blowing the shofar with nothing on screen to defeat gives it back. A giant counts as a target, since the blast still drives it back.
- **Capitalization** and **Punctuation**: when off, words appear in lowercase with punctuation stripped.
- **On a wrong key**: keep going (counts as a miss), restart the word and stay locked on, or restart the word and release it.
- **Release target with**: Space, Tab or Backspace drops your current target so you can attack another. With Space, a space inside a Goliath phrase still types the space.
- **A released word**: either keeps its progress (type its next letter to pick it back up) or starts over.
- **A space in a giant's phrase**: either keeps you locked on, or releases the giant after each word of its phrase (progress kept) so you can deal with other enemies, then pick it back up by typing its next letter.
- If several enemies start with the letter you type, you lock onto the one nearest to David.
- **As the waves go on**: *Enemies get faster* (+7% speed per wave) or *More enemies, gentler speed-up* (+2.5% speed per wave, with bigger waves that spawn more often to make up the difference).
- **Pause between words counted in WPM**: WPM always counts time spent inside a word. This sets how much of the pause before each word also counts (none up to 5s), so you choose whether picking the next target is part of your speed.

## Typing passages

Name passages in the menu's **Scripture** box (`John 1:1-14; Psalm 23; Romans 8:28-39`, or any text with references in it) and the waves walk through their words in reading order, each Goliath carrying a clause from its wave. Leave it empty for random Bible words.

- **Each wave is** a verse, a paragraph (a stanza in poetry), or a set number of words.
- **Passages come** in the order given, or shuffled. When shuffled, **Keep each passage together** decides whether `John 1:1-3` stays one run in order or its verses are shuffled in with the rest.
- When the passages run out, they start over.

References are read by [topos](https://github.com/MasterTemple/topos-bible) and the text by [logoxide](https://github.com/Logoxide/logoxide), both from logoxide's WebAssembly package, which is only downloaded once a passage is named. It isn't on npm yet, so `package.json` links a local build (`npm run pack:wasm` in `logoxide/crates/logoxide-ffi`).

Bible texts aren't in this repository. Each translation is a folder of USX files, one per book named by its lowercase USFM code (`public/bibles/esv/jhn.usx`), listed in `public/bibles/translations.json`:

```json
[{ "id": "esv", "name": "English Standard Version", "abbreviation": "ESV" }]
```

## Plugging in other word sources

The game only asks for words through the `WordSource` interface in `src/words.ts`:

```ts
interface WordSource {
  startWave?(boss: boolean): { verse; size; bossAt } | null;
  next(req: { minLen; maxLen; phrase; punctuation; accept(word): boolean }): string | null;
}
```

Pass your own implementation to `game.start(settings, source)` in `src/main.ts`. Return text exactly as written, with its capitals and punctuation. `toTypeable` strips or lowercases it to match the player's settings, and `normalizeChar` maps curly quotes and dashes to plain keys. Call `req.accept(word)` to skip words whose first key is already taken on screen, so every enemy can be locked onto without ambiguity. `startWave` is optional: a source that plans its own waves (like `PassageSource` in `src/scripture.ts`) returns the banner verse, how many regular enemies the wave has, and how many come before its giant.
