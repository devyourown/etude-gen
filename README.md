# etude-gen 🎼

Generate **validated, playable piano practice songs** from a one-line spec, using an
LLM as the composer and a deterministic compiler as the engineer.

```bash
npx tsx src/cli.ts --difficulty easy --key C --measures 8 --technique "left-hand arpeggios"
```

…and out comes a `.mid` file you can open in GarageBand, plus a millisecond-accurate
note chart ready for a rhythm-game engine.

This is an open-source, clean-room extraction of the AI composition pipeline behind
[LevelUp Piano](https://nariinfo.dev/portfolio/levelup-piano), a MIDI piano practice
app. Full design write-up (Korean + English):
[*Generating Practice Songs with an LLM*](https://nariinfo.dev/portfolio/levelup-piano/blog/generating-practice-songs).

## The core idea: don't make the LLM do arithmetic

Ask a model to emit milliseconds and MIDI note numbers and you get arithmetic
mistakes everywhere — "which ms is beat 3 at 76 BPM?" is exactly what LLMs are worst
at. So the model never sees a millisecond:

```
spec ──▶ LLM writes symbolic IR ──▶ validator ──▶ compiler ──▶ .mid + note chart
         (measures · beats ·        │    ✓            (deterministic:
          note names, via           │ ✗ errors fed     beats → ticks → ms)
          Structured Outputs)       ◀── back to LLM
```

1. **The LLM composes like a human composer** — in measures, beats, and note names
   (`"E4"`, `"F#3"`), enforced as JSON via **OpenAI Structured Outputs** (zod schema).
2. **A validator checks the teaching constraints**: measure overflow, per-hand pitch
   ranges, per-difficulty polyphony and note-length envelopes, key conformance.
   Failures are fed back to the model *verbatim*, and it regenerates — a
   generate → validate → repair loop.
3. **A compiler does the arithmetic**, deterministically: beats → ticks → ms, then a
   zero-dependency Standard MIDI File encoder. Same IR in, same bytes out, every time.

The split matters beyond music: *let the model do the creative, fuzzy part in its
native vocabulary; push everything that must be exactly right into ordinary code.*

## Quickstart

```bash
npm install
export OPENAI_API_KEY=sk-...

# generate a song (default model: gpt-5.5, override with --model or $OPENAI_MODEL)
npm run generate -- --difficulty normal --key G --measures 8 --technique "broken chords"

# no API key? compile the bundled example IR offline:
npm run generate -- --from-ir examples/meadow-morning.json
```

Want to see real model output first? [`examples/generated/`](examples/generated/) holds
**Morning Brook**, an actual generated song (IR + compiled chart + `.mid`) from one run.

Outputs land in `out/`:

| File | What it is |
| --- | --- |
| `<title>.ir.json` | The symbolic song exactly as the LLM wrote it |
| `<title>.notechart.json` | Compiled chart: every note with `startMs` / `durationMs` — feed it to a game engine |
| `<title>.mid` | Standard MIDI file — open in GarageBand, Logic, MuseScore… |

## Difficulty envelopes

What makes output *educational* rather than merely musical — enforced by the
validator, described to the model in its prompt:

| | easy | normal | hard |
| --- | --- | --- | --- |
| max notes / measure | 6 | 12 | 24 |
| max simultaneous notes / hand | 1 | 2 | 4 |
| shortest note (beats) | 1 | 0.5 | 0.25 |

Plus, for every difficulty: hand ranges (L: A0–C5, R: C3–C8), ≤ 20% out-of-key notes,
measures that add up, tempo 30–220.

## Project layout

```
src/ir.ts        the IR: zod schema (doubles as the Structured Outputs schema) + pitch/key parsing
src/generate.ts  OpenAI call + the validate/repair loop
src/validate.ts  difficulty envelopes and all teaching constraints
src/compile.ts   beats → ticks → milliseconds, deterministically
src/midi.ts      minimal zero-dependency SMF (format 0) encoder
src/cli.ts       command-line interface
```

## License

MIT © Hyojun Lee
