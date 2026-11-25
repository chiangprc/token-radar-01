// Pre-Token Radar — model C data program (lib/model.ts).
//
// One sealed snapshot in, one ranked board out. The model is model C only:
//
//   implied_usd = exp(6.964566512435208 + 0.5222655485140051 * ln(tvl_usd))
//
// TVL is the only model input. Category, chains, 7-day change, age and the
// watchlist flag are display-only: none of them enters the model, the sort,
// or any tie-break (the only tie-break is slug, ascending).
//
// A protocol is pre-token when its DefiLlama record carries no token:
// gecko_id IS NULL AND symbol IS NULL. That is the whole selection rule:
// no CEX, wrapped, staked or versioned exclusion is layered on top, and no
// row is dropped to make the board look better. "Records no token" is not
// "has no token": the wording matters, and this code never claims otherwise.
//
// Nothing here is copied from the starter's model: the starter scores with
// a base multiple, a growth multiplier and a maturity multiplier; this file
// scores with the frozen log-log curve only, and its farm plan carries no
// dollar cost and no holding time (both are UNKNOWN by contract).

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One row of board.json: the ranked board's row (20 fields, in this order). */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: null;
  listed_at: string | null;
  gecko_id: null;
  symbol: null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_band: '>=100M' | '10M-100M' | '1M-10M' | '<1M';
  extrapolation: 'IN_RANGE' | 'EXTRAPOLATION_LOW' | 'EXTRAPOLATION_HIGH';
  uncertainty: 'order-of-magnitude';
  data_quality: string[];
  watchlist: boolean;
  farm_steps: string[];
}

/** One comparable (a traded-token protocol): the market's own value, not a model's. */
export interface ComparableRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
}

/** Everything the dashboard needs: the board, the comparables, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  snapshot_sha256: string;
  floor_usd: number;
  model_version: string;
  model: { alpha: number; beta: number; formula: string };
  uncertainty: {
    basis: string;
    med_abs_log_err: number;
    mean_abs_log_err: number;
    med_ape: number;
    within_2x_pct: number;
    within_3x_pct: number;
    med_log_bias: number;
    beta_ci_low: number;
    beta_ci_high: number;
    joint_95_at_tvl_500M_usd: number[];
    joint_95_ratio_at_tvl_500M: number;
    note: string;
  };
  counts: {
    protocols_scanned: number;
    pre_token: number;
    watchlist: number;
    comparable: number;
    token_recorded_no_mcap: number;
  };
  watchlist_size: number;
  board_size: number;
  early_size: number;
  comparables_size: number;
  rows: BoardRow[];
  comparables: ComparableRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** The model's version label. */
export const MODEL_VERSION = 'model-c-1.0';
/** Model C, frozen full-precision coefficients: the only values main.ts may run. */
export const ALPHA = 6.964566512435208;
export const BETA = 0.5222655485140051;
/** The formula as the dashboard states it (display rounding only, never run). */
export const MODEL_FORMULA = 'implied_usd = exp(6.9646 + 0.5223 × ln(tvl_usd))';
/** Comparable TVL range (MODEL-CONTRACT §9): the extrapolation bounds. */
export const COMP_TVL_MIN = 5_045_118;
export const COMP_TVL_MAX = 26_324_198_228;
/** Frozen counts: a snapshot that yields different numbers is refused, never silently accepted. */
export const EXPECTED_BOARD_ROWS = 342;
export const EXPECTED_COMPARABLES = 128;
export const EXPECTED_WATCHLIST = 40;
/** Gate cap for board.json. */
export const BOARD_MAX_BYTES = 8 * 1024 * 1024;

const DAY_MS = 86_400_000;

/** The model-uncertainty block, stored once in data.js meta (DATA-CONTRACT §5). */
export const UNCERTAINTY: RadarData['uncertainty'] = {
  basis: 'loo-n128',
  med_abs_log_err: 1.22,
  mean_abs_log_err: 1.6,
  med_ape: 0.852,
  within_2x_pct: 32.0,
  within_3x_pct: 42.2,
  med_log_bias: -0.07,
  beta_ci_low: 0.341,
  beta_ci_high: 0.683,
  joint_95_at_tvl_500M_usd: [21_600_000, 61_000_000],
  joint_95_ratio_at_tvl_500M: 2.8,
  note: 'Order-of-magnitude estimate, not a precise valuation.',
};

/** Whether a protocol records no token at all (the frozen pre-token definition). */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is a comparable: a traded token with a usable market cap. */
export function isComparable(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when the date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Model C's full-precision implied value, from the raw dollar TVL. */
export function impliedFull(tvlUsd: number): number {
  return Math.exp(ALPHA + BETA * Math.log(tvlUsd));
}

/** The value band of a stored whole-dollar implied value. */
export function impliedBand(impliedInt: number): BoardRow['implied_band'] {
  if (impliedInt >= 100_000_000) return '>=100M';
  if (impliedInt >= 10_000_000) return '10M-100M';
  if (impliedInt >= 1_000_000) return '1M-10M';
  return '<1M';
}

/** Whether a TVL sits inside the comparables' range, or extrapolates below or above it. */
export function extrapolationFor(tvlUsd: number): BoardRow['extrapolation'] {
  if (tvlUsd < COMP_TVL_MIN) return 'EXTRAPOLATION_LOW';
  if (tvlUsd > COMP_TVL_MAX) return 'EXTRAPOLATION_HIGH';
  return 'IN_RANGE';
}

/** The row's quality flags, alphabetically sorted for determinism. */
export function dataQualityFor(p: SnapshotProtocol, extrapolation: BoardRow['extrapolation']): string[] {
  const flags: string[] = [];
  if (p.listed_at === null) flags.push('listed_at_unknown');
  if (p.change_7d === null) flags.push('change_7d_unknown');
  if (extrapolation === 'EXTRAPOLATION_LOW') flags.push('extrapolation_low');
  if (extrapolation === 'EXTRAPOLATION_HIGH') flags.push('extrapolation_high');
  return flags.sort();
}

/** Three significant figures with a B/M/K suffix; whole dollars below $1K. */
export function format3(valueUsd: number): string {
  const units: Array<[number, string]> = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (let i = 0; i < units.length; i++) {
    const [unit, suffix] = units[i]!;
    if (valueUsd >= unit) {
      const text = (valueUsd / unit).toPrecision(3);
      if (!text.includes('e')) return `$${text}${suffix}`;
      if (i > 0) {
        const [bigger, biggerSuffix] = units[i - 1]!;
        return `$${(valueUsd / bigger).toPrecision(3)}${biggerSuffix}`;
      }
      return `$${text}${suffix}`;
    }
  }
  return `$${Math.round(valueUsd)}`;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/**
 * The category's one action, in words a farmer can follow. The mapping reads
 * only the category string; no protocol is ever special-cased by name. No
 * step carries a dollar cost or a holding time: both are UNKNOWN by contract.
 */
function actionFor(category: string | null, name: string, chain: string): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Place one market position on ${name} and keep it open until it resolves.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit into ${name} on ${chain} and keep the position open.`;
}

/** A protocol's farm plan: five fixed steps, plus how often the safety net fired. */
export interface FarmPlan {
  steps: string[];
  safetyNetTriggers: number;
}

/**
 * The five-step plan. Step 4 is the EV check: it names the protocol's implied
 * value as V and points at the Farm Calculator, where the reader enters their
 * own cost, share and probability. The snapshot states no cost and no time,
 * so no step states either. The safety net (append a sentence when a step is
 * too short, truncate when too long) must never fire; main.ts refuses the
 * board when it does.
 */
export function farmSteps(p: SnapshotProtocol, impliedInt: number): FarmPlan {
  const chain = chainOf(p);
  const action = actionFor(p.category, p.name, chain);
  const value = format3(impliedInt);
  const raw: string[] = [
    'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
    action,
    'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.',
    `Before you spend anything, open the Farm Calculator with this protocol's implied value (${value} as V) and enter your own cost, share and probability — the snapshot does not state what farming it costs or how long it takes.`,
    'Write the wallet, the dates and every transaction in a farm log; claim only from the link the protocol itself publishes, and never pay to claim.',
  ];
  let triggers = 0;
  const steps = raw.map((s) => {
    let out = s;
    if (out.trim().length < 20) {
      out = `${out} Hold the position and check the protocol's own page.`;
      triggers += 1;
    }
    if (out.length > 600) {
      out = `${out.slice(0, 596)}...`;
      triggers += 1;
    }
    return out;
  });
  return { steps, safetyNetTriggers: triggers };
}

/** What buildBoard returns besides the rows: the safety-net counters. */
export interface BoardBuild {
  rows: BoardRow[];
  monotonicClamps: number;
  farmSafetyNetTriggers: number;
}

/** The ranked board: every pre-token protocol, strongest implied value first, ranks 1..342. */
export function buildBoard(snapshot: Snapshot): BoardBuild {
  const chosen = snapshot.protocols.filter(isPreToken);
  if (chosen.length !== EXPECTED_BOARD_ROWS) {
    throw new SnapshotError(`snapshot holds ${chosen.length} pre-token protocols, expected ${EXPECTED_BOARD_ROWS}`);
  }
  const scored = chosen.map((p) => ({ p, full: impliedFull(p.tvl_usd), age: ageDays(snapshot.as_of, p.listed_at) }));
  scored.sort((a, b) => b.full - a.full || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  let clamps = 0;
  let triggers = 0;
  let prev = Number.POSITIVE_INFINITY;
  const rows: BoardRow[] = scored.map((s, i) => {
    let impliedInt = Math.round(s.full);
    if (impliedInt > prev) {
      impliedInt = prev;
      clamps += 1;
    }
    prev = impliedInt;
    const band = impliedBand(impliedInt);
    const extrapolation = extrapolationFor(s.p.tvl_usd);
    const plan = farmSteps(s.p, impliedInt);
    triggers += plan.safetyNetTriggers;
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: null,
      listed_at: s.p.listed_at,
      gecko_id: null,
      symbol: null,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: impliedInt,
      implied_band: band,
      extrapolation,
      uncertainty: 'order-of-magnitude',
      data_quality: dataQualityFor(s.p, extrapolation),
      watchlist: snapshot.watchlist.includes(s.p.slug),
      farm_steps: plan.steps,
    };
  });
  return { rows, monotonicClamps: clamps, farmSafetyNetTriggers: triggers };
}

/** The comparables, by market cap, for the dashboard's model-basis view. */
export function buildComparables(snapshot: Snapshot): ComparableRow[] {
  return snapshot.protocols
    .filter(isComparable)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: ageDays(snapshot.as_of, p.listed_at),
    }));
}

/** What buildRadar returns besides the board and the radar data. */
export interface RadarBuild {
  board: BoardRow[];
  radar: RadarData;
  monotonicClamps: number;
  farmSafetyNetTriggers: number;
}

/** Everything the dashboard renders, from the snapshot. The rows array is shared with board.json. */
export function buildRadar(snapshot: Snapshot, inputSha256: string): RadarBuild {
  const { rows, monotonicClamps, farmSafetyNetTriggers } = buildBoard(snapshot);
  const comparables = buildComparables(snapshot);
  if (comparables.length !== EXPECTED_COMPARABLES) {
    throw new SnapshotError(`snapshot holds ${comparables.length} comparables, expected ${EXPECTED_COMPARABLES}`);
  }
  const tokenRecordedNoMcap = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd === null).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    snapshot_sha256: inputSha256,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: { alpha: ALPHA, beta: BETA, formula: MODEL_FORMULA },
    uncertainty: UNCERTAINTY,
    counts: {
      protocols_scanned: snapshot.protocols.length,
      pre_token: rows.length,
      watchlist: snapshot.watchlist.length,
      comparable: comparables.length,
      token_recorded_no_mcap: tokenRecordedNoMcap,
    },
    watchlist_size: snapshot.watchlist.length,
    board_size: rows.length,
    early_size: rows.filter((r) => !r.watchlist).length,
    comparables_size: comparables.length,
    rows,
    comparables,
  };
  return { board: rows, radar, monotonicClamps, farmSafetyNetTriggers };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot, farmSafetyNetTriggers: number): string | null {
  if (board.length !== EXPECTED_BOARD_ROWS) return `the board holds ${board.length} rows, expected ${EXPECTED_BOARD_ROWS}`;
  const slugs = new Set<string>();
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  for (const r of board) {
    if (slugs.has(r.slug)) return `duplicate slug ${r.slug}`;
    slugs.add(r.slug);
    if (!index.has(r.slug)) return `slug ${r.slug} is not one of the snapshot's protocols`;
    if (typeof r.name !== 'string' || r.name.length === 0) return `${r.slug} has an empty name`;
  }
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug(s): ${missing.slice(0, 5).join(', ')}`;
  const watchTrue = new Set(board.filter((r) => r.watchlist).map((r) => r.slug));
  if (watchTrue.size !== snapshot.watchlist.length || snapshot.watchlist.some((s) => !watchTrue.has(s))) {
    return 'the watchlist:true rows do not equal the snapshot watchlist';
  }
  const early = board.filter((r) => !r.watchlist).length;
  if (early < 60) return `only ${early} rows sit outside the watchlist, at least 60 are required`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.farm_steps.length !== 5) return `${r.slug} has ${r.farm_steps.length} farm steps, expected 5`;
    for (const s of r.farm_steps) {
      if (s.trim().length < 20 || s.trim().length > 600 || s.length < 20 || s.length > 600) {
        return `${r.slug} has a farm step of ${s.length} characters`;
      }
    }
    if (Object.keys(r).length !== 20) return `${r.slug} has ${Object.keys(r).length} fields, expected 20`;
    if (r.mcap_usd !== null || r.gecko_id !== null || r.symbol !== null) return `${r.slug} is not null on mcap_usd, gecko_id or symbol`;
    if (r.token_status !== 'pre-token') return `${r.slug} has token_status ${r.token_status}`;
    if (!(r.age_days === null || Number.isSafeInteger(r.age_days))) return `${r.slug} has age_days ${r.age_days}`;
    if (!(r.change_7d === null || (typeof r.change_7d === 'number' && Number.isFinite(r.change_7d)))) return `${r.slug} has change_7d ${r.change_7d}`;
    if (r.implied_band !== impliedBand(r.implied_value_usd)) return `${r.slug} has band ${r.implied_band} for $${r.implied_value_usd}`;
    const p = index.get(r.slug)!;
    if (r.extrapolation !== extrapolationFor(p.tvl_usd)) return `${r.slug} has extrapolation ${r.extrapolation}`;
    if (JSON.stringify(dataQualityFor(p, r.extrapolation)) !== JSON.stringify(r.data_quality)) {
      return `${r.slug} has data_quality ${JSON.stringify(r.data_quality)}`;
    }
  }
  if (farmSafetyNetTriggers !== 0) return `the farm-step safety net fired ${farmSafetyNetTriggers} time(s)`;
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
