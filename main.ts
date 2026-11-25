// Pre-Token Radar — data program (main.ts, Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input
// <file|dir>), scores every pre-token protocol with model C in lib/model.ts,
// writes the ranked board to /output/board.json and the dashboard's data to
// /output/data.js, and — once dashboard/ and screenshots/ exist (Stage 3B
// onward) — copies them to /output and writes /output/dossier.json with the
// vendored make.fun library.
//
// Stage 3A runs only the board and the data file: there is no dashboard yet,
// so the copy and dossier steps are skipped with a note on stdout, and the
// program exits 0. The pipeline below is the full one: when dashboard/ and
// screenshots/ appear, the same program runs them without modification.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALPHA, BETA, BOARD_MAX_BYTES, boardIssue, buildRadar, dataScript, EXPECTED_COMPARABLES, parseSnapshot, SnapshotError } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DOSSIER_MAX_BYTES = 1_572_864;
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const raw = readFileSync(inputFile);
const inputSha256 = createHash('sha256').update(raw).digest('hex');

let snapshot;
try {
  snapshot = parseSnapshot(raw.toString('utf8'));
} catch (e) {
  if (e instanceof SnapshotError) {
    process.stderr.write(`token radar: ${e.message}\n`);
    process.exit(2);
  }
  throw e;
}

let built;
try {
  built = buildRadar(snapshot, inputSha256);
} catch (e) {
  if (e instanceof SnapshotError) {
    process.stderr.write(`token radar: ${e.message}\n`);
    process.exit(1);
  }
  throw e;
}
const { board, radar, monotonicClamps, farmSafetyNetTriggers } = built;

const issue = boardIssue(board, snapshot, farmSafetyNetTriggers);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const boardText = `${JSON.stringify({ rows: board })}\n`;
if (Buffer.byteLength(boardText, 'utf8') > BOARD_MAX_BYTES) {
  process.stderr.write(`token radar: board.json is ${Buffer.byteLength(boardText, 'utf8')} bytes, past the 8 MiB cap\n`);
  process.exit(1);
}
writeFileSync(join(out, 'board.json'), boardText);
const dataText = dataScript(radar);
writeFileSync(join(out, 'data.js'), dataText);

/** Self-check on the bytes just written: data.js rows serialize exactly like board.json rows. */
const dataParsed = JSON.parse(dataText.slice('window.RADAR='.length, -2));
if (JSON.stringify(dataParsed.rows) !== JSON.stringify(board)) {
  process.stderr.write('token radar: data.js rows do not serialize like board.json rows\n');
  process.exit(1);
}
if (dataParsed.comparables.length !== EXPECTED_COMPARABLES) {
  process.stderr.write(`token radar: data.js holds ${dataParsed.comparables.length} comparables, expected ${EXPECTED_COMPARABLES}\n`);
  process.exit(1);
}
if (dataParsed.snapshot_sha256 !== inputSha256) {
  process.stderr.write('token radar: data.js snapshot_sha256 does not match the input file\n');
  process.exit(1);
}

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

/** Dashboard and dossier (Stage 3B onward): only when dashboard/ exists in this repository. */
let dossierWritten = false;
if (!existsSync(join(here, 'dashboard'))) {
  process.stdout.write('token radar: dashboard/ is not present yet (Stage 3B); skipping dashboard copy, screenshots and dossier\n');
} else {
  copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
  const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
  if (shots.length < 3) {
    process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
    process.exit(1);
  }
  for (const name of shots) {
    if (!IMAGE_NAME.test(name)) {
      process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
      process.exit(1);
    }
  }
  // The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));
  if (statSync(join(out, 'dossier.json')).size > DOSSIER_MAX_BYTES) {
    process.stderr.write('token radar: dossier.json is past 1.5 MiB\n');
    process.exit(1);
  }
  dossierWritten = true;
}

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.comparables_size} comparables)\n` +
    `token radar: model C (alpha ${ALPHA}, beta ${BETA}); monotonic clamps ${monotonicClamps}; farm safety-net triggers ${farmSafetyNetTriggers}\n` +
    `token radar: wrote ${join(out, 'board.json')} (${Buffer.byteLength(boardText, 'utf8')} bytes) and ${join(out, 'data.js')} (${Buffer.byteLength(dataText, 'utf8')} bytes)` +
    `${dossierWritten ? ` and ${join(out, 'dossier.json')}` : '; dossier not written (Stage 3B+)'}\n`,
);
