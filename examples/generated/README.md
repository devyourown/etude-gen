# A real generated sample

These three files are the actual output of one real run — no hand-editing:

```bash
npm run generate -- --difficulty easy --key C --technique "left-hand arpeggios"
```

The model produced **"Morning Brook"** (C major, easy, 8 measures, 47 notes: a stepwise
right-hand melody over a left-hand C-major broken-chord accompaniment), it passed
validation, and the compiler emitted the MIDI.

| File | What it is |
| --- | --- |
| `morning-brook.ir.json` | The symbolic IR exactly as the LLM wrote it (measures, beats, note names) |
| `morning-brook.notechart.json` | The compiled chart — every note with `startMs` / `durationMs` |
| `morning-brook.mid` | Standard MIDI file — open in GarageBand, Logic, or MuseScore |

Regenerate your own with the command above, or compile this IR offline (no API key):

```bash
npm run generate -- --from-ir examples/generated/morning-brook.ir.json
```
