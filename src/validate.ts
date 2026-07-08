import { SongIR, Difficulty, parsePitch, keyScale } from "./ir.js";

// Difficulty envelopes: the teaching constraints a generated song must satisfy.
// These are what make the output *educational* rather than merely musical.
export interface Envelope {
  maxNotesPerMeasure: number;
  maxPolyphonyPerHand: number;
  minLen: number; // shortest allowed note, in beats
}

export const ENVELOPES: Record<Difficulty, Envelope> = {
  easy: { maxNotesPerMeasure: 6, maxPolyphonyPerHand: 1, minLen: 1 },
  normal: { maxNotesPerMeasure: 12, maxPolyphonyPerHand: 2, minLen: 0.5 },
  hard: { maxNotesPerMeasure: 24, maxPolyphonyPerHand: 4, minLen: 0.25 },
};

// Generous playable ranges per hand (MIDI numbers).
const HAND_RANGE = {
  L: { lo: 21, hi: 72, label: "A0..C5" },
  R: { lo: 48, hi: 108, label: "C3..C8" },
};

const MAX_OUT_OF_KEY_RATIO = 0.2;

/**
 * Returns a list of human-readable problems, empty when the song is valid.
 * Each message is written to be fed straight back to the LLM for repair.
 */
export function validate(song: SongIR): string[] {
  const errors: string[] = [];
  const env = ENVELOPES[song.difficulty];
  const { beats, unit } = song.time_signature;

  if (song.tempo_bpm < 30 || song.tempo_bpm > 220)
    errors.push(`tempo_bpm ${song.tempo_bpm} is outside the playable range 30..220`);
  if (beats < 2 || beats > 12 || ![2, 4, 8].includes(unit))
    errors.push(`time_signature ${beats}/${unit} is not supported (use 2..12 beats, unit 2, 4 or 8)`);
  if (song.measures.length === 0) errors.push("the song has no measures");

  const scale = keyScale(song.key);
  if (!scale) errors.push(`key "${song.key}" is not a recognizable key (use e.g. "C", "F#", "Am")`);

  let noteCount = 0;
  let outOfKey = 0;

  song.measures.forEach((measure, i) => {
    const where = `measure ${measure.n}`;
    if (measure.n !== i + 1)
      errors.push(`${where}: measures must be numbered consecutively from 1 (found ${measure.n} at position ${i + 1})`);
    if (measure.notes.length > env.maxNotesPerMeasure)
      errors.push(`${where}: ${measure.notes.length} notes exceeds the ${song.difficulty} limit of ${env.maxNotesPerMeasure} per measure`);

    measure.notes.forEach((note, j) => {
      const label = `${where}, note ${j + 1} (${note.pitch})`;
      const midi = parsePitch(note.pitch);
      noteCount++;

      if (midi === null) {
        errors.push(`${label}: "${note.pitch}" is not a valid pitch name`);
        return;
      }
      const range = HAND_RANGE[note.hand];
      if (midi < range.lo || midi > range.hi)
        errors.push(`${label}: outside the ${note.hand} hand range ${range.label}`);
      if (note.beat < 1 || note.beat + note.len > beats + 1)
        errors.push(`${label}: beat ${note.beat} + len ${note.len} overflows a ${beats}/${unit} measure`);
      if (note.len < env.minLen)
        errors.push(`${label}: len ${note.len} is shorter than the ${song.difficulty} minimum of ${env.minLen} beats`);
      if (scale && !scale.has(midi % 12)) outOfKey++;
    });

    // Per-hand polyphony via interval sweep.
    for (const hand of ["L", "R"] as const) {
      const iv = measure.notes
        .filter((n) => n.hand === hand)
        .map((n) => ({ start: n.beat, end: n.beat + n.len }))
        .sort((a, b) => a.start - b.start);
      const active: number[] = [];
      let peak = 0;
      for (const n of iv) {
        while (active.length && active[0] <= n.start) active.shift();
        active.push(n.end);
        active.sort((a, b) => a - b);
        peak = Math.max(peak, active.length);
      }
      if (peak > env.maxPolyphonyPerHand)
        errors.push(`${where}: ${hand} hand plays ${peak} simultaneous notes, exceeding the ${song.difficulty} limit of ${env.maxPolyphonyPerHand}`);
    }
  });

  if (scale && noteCount > 0 && outOfKey / noteCount > MAX_OUT_OF_KEY_RATIO)
    errors.push(
      `${outOfKey} of ${noteCount} notes are outside the key of ${song.key} (max ${MAX_OUT_OF_KEY_RATIO * 100}%) — stay diatonic, use accidentals sparingly`
    );

  return errors;
}
