#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SongIR, SongIRSchema, Difficulty } from "./ir.js";
import { validate } from "./validate.js";
import { compile } from "./compile.js";
import { generateSong } from "./generate.js";

const HELP = `etude-gen — generate validated piano practice songs with an LLM

Usage:
  etude-gen [options]                 generate a song via the OpenAI API
  etude-gen --from-ir <file> [opts]   compile an existing IR file (offline, no API key)

Options:
  --difficulty easy|normal|hard   (default: normal)
  --key <key>                     e.g. C, G, F#, Am   (default: C)
  --measures <n>                  (default: 8)
  --technique "<text>"            e.g. "left-hand arpeggios"
  --title "<text>"
  --tempo <bpm>
  --time-sig <beats>/<unit>       (default: 4/4)
  --model <model>                 (default: $OPENAI_MODEL or gpt-5.5)
  --attempts <n>                  max generate+repair attempts (default: 3)
  --out <dir>                     output directory (default: out)
  --from-ir <file>                skip generation, compile this IR JSON
  -h, --help
`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "song";
}

function writeOutputs(song: SongIR, outDir: string) {
  const { chart, midi } = compile(song);
  mkdirSync(outDir, { recursive: true });
  const base = join(outDir, slugify(song.title));

  writeFileSync(`${base}.ir.json`, JSON.stringify(song, null, 2));
  writeFileSync(`${base}.notechart.json`, JSON.stringify(chart, null, 2));
  writeFileSync(`${base}.mid`, midi);

  console.log(`\n"${song.title}" — ${song.key} ${song.difficulty}, ${song.measures.length} measures, ${chart.notes.length} notes, ${(chart.durationMs / 1000).toFixed(1)}s`);
  console.log(`  ${base}.ir.json         (what the LLM wrote)`);
  console.log(`  ${base}.notechart.json  (compiled, ms-accurate chart)`);
  console.log(`  ${base}.mid             (open in any DAW / GarageBand)`);
}

async function main() {
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    console.log(HELP);
    return;
  }

  const outDir = arg("out") ?? "out";
  const fromIr = arg("from-ir");

  if (fromIr) {
    const song = SongIRSchema.parse(JSON.parse(readFileSync(fromIr, "utf-8")));
    const errors = validate(song);
    if (errors.length) {
      console.error(`IR failed validation:\n${errors.map((e) => `- ${e}`).join("\n")}`);
      process.exit(1);
    }
    console.log("IR valid ✓ (offline mode, no API call)");
    writeOutputs(song, outDir);
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set. Export it, or try offline mode:\n  npm run generate -- --from-ir examples/meadow-morning.json");
    process.exit(1);
  }

  const tsArg = arg("time-sig");
  const ts = tsArg
    ? { beats: parseInt(tsArg.split("/")[0], 10), unit: parseInt(tsArg.split("/")[1], 10) }
    : undefined;

  const spec = {
    difficulty: (arg("difficulty") ?? "normal") as Difficulty,
    key: arg("key") ?? "C",
    measures: parseInt(arg("measures") ?? "8", 10),
    technique: arg("technique"),
    title: arg("title"),
    tempoBpm: arg("tempo") ? parseInt(arg("tempo")!, 10) : undefined,
    timeSignature: ts,
  };

  console.log(`Generating: ${spec.difficulty} · ${spec.key} · ${spec.measures} measures${spec.technique ? ` · ${spec.technique}` : ""}`);

  const { song, attempts } = await generateSong(spec, {
    model: arg("model"),
    maxAttempts: arg("attempts") ? parseInt(arg("attempts")!, 10) : undefined,
    onAttempt: (n, errors) => {
      if (errors.length) console.log(`  attempt ${n}: ${errors.length} validation error(s), asking the model to repair…`);
      else console.log(`  attempt ${n}: valid ✓`);
    },
  });

  console.log(`Passed validation in ${attempts} attempt(s).`);
  writeOutputs(song, outDir);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
