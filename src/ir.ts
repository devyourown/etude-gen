import { z } from "zod";

// The intermediate representation (IR) the LLM writes.
//
// Design rule: the model composes the way a human composer does — in measures,
// beats, and note names. It never touches milliseconds or MIDI note numbers;
// arithmetic belongs to the deterministic compiler, not the LLM.

export const NoteSchema = z.object({
  hand: z.enum(["L", "R"]).describe("Which hand plays the note"),
  pitch: z
    .string()
    .describe('Scientific pitch name, e.g. "E4", "F#3", "Bb5"'),
  beat: z
    .number()
    .describe(
      "1-based beat position inside the measure; fractions allowed (1.5 = the 'and' of beat 1)"
    ),
  len: z.number().describe("Duration in beats"),
});

export const MeasureSchema = z.object({
  n: z.number().int().describe("1-based measure number"),
  notes: z.array(NoteSchema),
});

export const TimeSignatureSchema = z.object({
  beats: z.number().int().describe("Beats per measure (numerator)"),
  unit: z
    .number()
    .int()
    .describe("Note value of one beat (denominator: 4 = quarter note)"),
});

export const SongIRSchema = z.object({
  title: z.string(),
  key: z.string().describe('Major or minor key, e.g. "C", "G", "F#", "Am", "Dm"'),
  tempo_bpm: z.number(),
  time_signature: TimeSignatureSchema,
  difficulty: z.enum(["easy", "normal", "hard"]),
  measures: z.array(MeasureSchema),
});

export type Note = z.infer<typeof NoteSchema>;
export type Measure = z.infer<typeof MeasureSchema>;
export type SongIR = z.infer<typeof SongIRSchema>;
export type Difficulty = SongIR["difficulty"];

const PITCH_CLASS: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/** "F#3" -> 54, "C4" -> 60. Returns null when unparseable or out of MIDI range. */
export function parsePitch(pitch: string): number | null {
  const m = /^([A-G])([#b])?(-?\d)$/.exec(pitch.trim());
  if (!m) return null;
  let pc = PITCH_CLASS[m[1]];
  if (m[2] === "#") pc += 1;
  if (m[2] === "b") pc -= 1;
  const midi = (parseInt(m[3], 10) + 1) * 12 + pc;
  return midi >= 0 && midi <= 127 ? midi : null;
}

/** Pitch classes of the key's diatonic scale, or null if the key is unparseable. */
export function keyScale(key: string): Set<number> | null {
  const m = /^([A-G])([#b])?(m)?$/.exec(key.trim());
  if (!m) return null;
  let tonic = PITCH_CLASS[m[1]];
  if (m[2] === "#") tonic += 1;
  if (m[2] === "b") tonic -= 1;
  tonic = ((tonic % 12) + 12) % 12;
  const intervals = m[3] === "m"
    ? [0, 2, 3, 5, 7, 8, 10] // natural minor
    : [0, 2, 4, 5, 7, 9, 11]; // major
  return new Set(intervals.map((i) => (tonic + i) % 12));
}
