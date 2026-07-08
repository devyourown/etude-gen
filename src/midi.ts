// Minimal zero-dependency Standard MIDI File (format 0) encoder.
// Just enough to turn a compiled note list into a .mid any DAW can open.

export interface MidiNote {
  midi: number;
  startTick: number;
  durTick: number;
  velocity: number;
}

export interface MidiMeta {
  tpqn: number; // ticks per quarter note
  bpm: number;
  timeSignature: { beats: number; unit: number };
}

function vlq(n: number): number[] {
  if (n < 0) throw new Error(`negative delta time: ${n}`);
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
}

function u16(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff];
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function encodeMidi(notes: MidiNote[], meta: MidiMeta): Uint8Array {
  const usPerQuarter = Math.round(60_000_000 / meta.bpm);

  // order: note-offs (1) before note-ons (2) at the same tick, so repeated
  // pitches re-trigger instead of being killed by the previous note's release.
  const events: { tick: number; order: number; bytes: number[] }[] = [
    {
      tick: 0,
      order: 0,
      bytes: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff],
    },
    {
      tick: 0,
      order: 0,
      bytes: [0xff, 0x58, 0x04, meta.timeSignature.beats, Math.round(Math.log2(meta.timeSignature.unit)), 24, 8],
    },
  ];

  for (const n of notes) {
    events.push({ tick: n.startTick, order: 2, bytes: [0x90, n.midi, n.velocity] });
    events.push({ tick: n.startTick + n.durTick, order: 1, bytes: [0x80, n.midi, 0] });
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const track: number[] = [];
  let last = 0;
  for (const e of events) {
    track.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00); // end of track

  const bytes = [
    0x4d, 0x54, 0x68, 0x64, // MThd
    ...u32(6),
    ...u16(0), // format 0
    ...u16(1), // one track
    ...u16(meta.tpqn),
    0x4d, 0x54, 0x72, 0x6b, // MTrk
    ...u32(track.length),
    ...track,
  ];
  return Uint8Array.from(bytes);
}
