import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { SongIR, SongIRSchema, Difficulty } from "./ir.js";
import { validate, ENVELOPES } from "./validate.js";

export interface Spec {
  difficulty: Difficulty;
  key: string;
  measures: number;
  technique?: string;
  title?: string;
  tempoBpm?: number;
  timeSignature?: { beats: number; unit: number };
}

export interface GenerateOptions {
  model?: string;
  maxAttempts?: number;
  onAttempt?: (attempt: number, errors: string[]) => void;
}

export interface GenerateResult {
  song: SongIR;
  attempts: number;
}

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.5";

function systemPrompt(spec: Spec): string {
  const env = ENVELOPES[spec.difficulty];
  return `You are a piano pedagogy composer. You write short practice pieces as symbolic JSON.

Rules:
- Compose the way a human composer does: in measures, beats, and note names like "F#3". NEVER produce milliseconds or MIDI note numbers — a deterministic compiler handles all timing arithmetic.
- "beat" is 1-based within its measure; fractions are allowed (1.5 = the "and" of beat 1). Every note must fit inside its measure: beat + len <= beats_per_measure + 1.
- Number measures consecutively from 1 and produce exactly the requested number of measures.
- Stay in the requested key. Accidentals only when musically necessary (well under 20% of notes).
- Right hand (R) carries the melody, roughly above C4. Left hand (L) plays accompaniment, roughly below C4.
- Difficulty "${spec.difficulty}" limits: at most ${env.maxNotesPerMeasure} notes per measure, at most ${env.maxPolyphonyPerHand} simultaneous note(s) per hand, no note shorter than ${env.minLen} beat(s).
- Center the piece on the requested technique, but make it musical — a small piece, not a mechanical drill.`;
}

function userPrompt(spec: Spec): string {
  const ts = spec.timeSignature ?? { beats: 4, unit: 4 };
  return [
    `Compose a ${spec.difficulty} practice piece.`,
    `Key: ${spec.key}`,
    `Length: exactly ${spec.measures} measures in ${ts.beats}/${ts.unit}`,
    spec.tempoBpm ? `Tempo: ${spec.tempoBpm} BPM` : `Tempo: choose something appropriate`,
    spec.technique ? `Technique focus: ${spec.technique}` : null,
    spec.title ? `Title: ${spec.title}` : `Title: invent a short evocative title`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Generate a song IR and run it through the validation/repair loop:
 * validation failures are fed back to the model verbatim until the song
 * passes or attempts run out.
 */
export async function generateSong(
  spec: Spec,
  opts: GenerateOptions = {}
): Promise<GenerateResult> {
  const client = new OpenAI();
  const model = opts.model ?? DEFAULT_MODEL;
  const maxAttempts = opts.maxAttempts ?? 3;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt(spec) },
    { role: "user", content: userPrompt(spec) },
  ];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const completion = await client.beta.chat.completions.parse({
      model,
      messages,
      response_format: zodResponseFormat(SongIRSchema, "song"),
    });

    const song = completion.choices[0].message.parsed;
    if (!song) throw new Error("model returned no parsable song (possibly refused)");

    const errors = validate(song);
    opts.onAttempt?.(attempt, errors);
    if (errors.length === 0) return { song, attempts: attempt };

    messages.push(
      { role: "assistant", content: JSON.stringify(song) },
      {
        role: "user",
        content: `That song failed validation:\n${errors.map((e) => `- ${e}`).join("\n")}\n\nRegenerate the complete song with every issue fixed. Keep the same spec.`,
      }
    );
  }

  throw new Error(`song failed validation after ${maxAttempts} attempts`);
}
