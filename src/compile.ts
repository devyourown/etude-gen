import { SongIR, parsePitch } from "./ir.js";
import { encodeMidi, MidiNote } from "./midi.js";

// The deterministic half of the pipeline: the LLM's measures/beats/note-names
// become exact ticks and milliseconds here, and only here.

export interface ChartNote {
  hand: "L" | "R";
  pitch: string;
  midi: number;
  measure: number;
  beat: number;
  startMs: number;
  durationMs: number;
}

export interface NoteChart {
  title: string;
  key: string;
  tempoBpm: number;
  timeSignature: { beats: number; unit: number };
  difficulty: string;
  durationMs: number;
  notes: ChartNote[];
}

export interface Compiled {
  chart: NoteChart;
  midi: Uint8Array;
}

const TPQN = 480;
const VELOCITY = { R: 84, L: 72 } as const;

export function compile(song: SongIR): Compiled {
  const { beats, unit } = song.time_signature;
  const ticksPerBeat = TPQN * (4 / unit);
  const msPerTick = 60_000 / (song.tempo_bpm * TPQN);

  const chartNotes: ChartNote[] = [];
  const midiNotes: MidiNote[] = [];

  for (const measure of song.measures) {
    for (const note of measure.notes) {
      const midi = parsePitch(note.pitch);
      if (midi === null) throw new Error(`unvalidated pitch reached the compiler: ${note.pitch}`);

      const startTick = Math.round(((measure.n - 1) * beats + (note.beat - 1)) * ticksPerBeat);
      const durTick = Math.round(note.len * ticksPerBeat);

      midiNotes.push({ midi, startTick, durTick, velocity: VELOCITY[note.hand] });
      chartNotes.push({
        hand: note.hand,
        pitch: note.pitch,
        midi,
        measure: measure.n,
        beat: note.beat,
        startMs: Math.round(startTick * msPerTick),
        durationMs: Math.round(durTick * msPerTick),
      });
    }
  }

  chartNotes.sort((a, b) => a.startMs - b.startMs || a.midi - b.midi);
  const durationMs = chartNotes.reduce((max, n) => Math.max(max, n.startMs + n.durationMs), 0);

  return {
    chart: {
      title: song.title,
      key: song.key,
      tempoBpm: song.tempo_bpm,
      timeSignature: song.time_signature,
      difficulty: song.difficulty,
      durationMs,
      notes: chartNotes,
    },
    midi: encodeMidi(midiNotes, {
      tpqn: TPQN,
      bpm: song.tempo_bpm,
      timeSignature: song.time_signature,
    }),
  };
}
