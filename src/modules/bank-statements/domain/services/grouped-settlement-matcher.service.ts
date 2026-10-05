/**
 * Pure domain service — no I/O.
 *
 * "Liquidação agrupada": given a bank movement's absolute amount and a
 * pre-filtered, capped pool of same-supplier/same-currency open documents
 * (invoices with positive open balances, credit notes with negative open
 * balances — already signed per `Invoice.normalizeAmountSign()`), finds every
 * subset of documents whose open balances sum EXACTLY to the movement's
 * amount.
 *
 * Only true 0-cent-difference combinations are ever returned. The task's
 * optional ±0.01€ rounding tolerance is deliberately NOT implemented here —
 * a tolerance-matched combination would still have a non-zero difference
 * that must be shown plainly and decided manually (task section 11), which
 * adds a second, ambiguous "kind" of result for zero practical benefit this
 * round. Skipping it keeps "exact match" unambiguous: found or not found.
 *
 * Algorithm: meet-in-the-middle subset-sum. The caller is responsible for
 * capping the candidate pool (see `capCandidates`/`DEFAULT_MAX_CANDIDATES`)
 * BEFORE calling `findExactCombinations` — this service never itself fans
 * out beyond the pool it's given, so cap discipline lives at the call site
 * (the use case) as well as defensively here (`findExactCombinations` caps
 * again internally, so a caller that forgets to pre-cap still can't trigger
 * a 2^N blowup).
 */

export interface SettlementCandidate {
  entityId: string;
  documentType: "invoice" | "credit_note";
  /** Signed cents: positive for invoices, negative for credit notes. */
  openBalanceCents: number;
  /** YYYY-MM-DD */
  invoiceDate: string;
  /** YYYY-MM-DD, or null when the document has no due date. */
  dueDate: string | null;
  isOverdue: boolean;
}

export interface SettlementCombination {
  candidates: SettlementCandidate[];
  /** Always equal to the requested targetAbsCents — kept for caller convenience. */
  totalCents: number;
}

export interface GroupedSettlementMatchInput {
  candidates: SettlementCandidate[];
  /** The movement's absolute amount (cents), always > 0. */
  targetAbsCents: number;
  /** YYYY-MM-DD — the movement's booking date, used for capping and tie-break ranking. */
  movementDate: string;
  /** Defaults to 40 (task's suggested cap). */
  maxCandidates?: number;
  /** Defaults to 20 — bounds how many exact combinations are generated/ranked. */
  maxCombinations?: number;
}

export interface GroupedSettlementMatchResult {
  /** All exact-sum combinations found, ranked best-first (see tie-break rules below). Empty when none found. */
  combinations: SettlementCombination[];
  /** How many candidates were actually fed to the combinatorics after capping. */
  consideredCandidateCount: number;
  /** How many candidates were eligible before capping (for UI transparency — "40 de 63 documentos considerados"). */
  totalEligibleCount: number;
}

export const DEFAULT_MAX_CANDIDATES = 40;
export const DEFAULT_MAX_COMBINATIONS = 20;

function parseISODate(d: string): number {
  return new Date(d + "T00:00:00.000Z").getTime();
}

function bestDateForRecency(c: SettlementCandidate): string {
  return c.dueDate ?? c.invoiceDate;
}

/**
 * Caps the candidate pool to `maxCandidates`, keeping the ones nearest to the
 * movement date first (task section 8's date-recency notion). Exported so the
 * use case can apply the same rule when deciding what to show as "the pool"
 * even outside the matcher (e.g. for manual multi-select search results).
 */
export function capCandidatesByDateProximity(
  candidates: SettlementCandidate[],
  movementDate: string,
  maxCandidates: number = DEFAULT_MAX_CANDIDATES
): SettlementCandidate[] {
  if (candidates.length <= maxCandidates) return candidates;
  const movementTime = parseISODate(movementDate);
  return [...candidates]
    .sort((a, b) => {
      const da = Math.abs(parseISODate(bestDateForRecency(a)) - movementTime);
      const db = Math.abs(parseISODate(bestDateForRecency(b)) - movementTime);
      return da - db;
    })
    .slice(0, maxCandidates);
}

/**
 * Subset-sum over one half of the pool via bitmask DP: `sums[mask]` is built
 * from `sums[mask without its lowest set bit]` in O(1), giving O(2^n) total
 * instead of the naive O(2^n · n). Indices are decoded from a mask lazily,
 * only for the handful of masks that end up in a returned combination.
 */
function computeSubsetSums(list: SettlementCandidate[]): number[] {
  const n = list.length;
  const count = 1 << n;
  const sums = new Array<number>(count);
  sums[0] = 0;
  for (let mask = 1; mask < count; mask++) {
    const lowBit = mask & -mask;
    const idx = Math.log2(lowBit) | 0;
    sums[mask] = sums[mask ^ lowBit]! + list[idx]!.openBalanceCents;
  }
  return sums;
}

function maskToIndices(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (mask & (1 << i)) out.push(i);
  }
  return out;
}

function compareCombinations(movementDate: string) {
  const movementTime = parseISODate(movementDate);
  return (a: SettlementCombination, b: SettlementCombination): number => {
    // 1. Prefer combinations with more documents dated on/before the movement date.
    const preA = a.candidates.filter((c) => parseISODate(bestDateForRecency(c)) <= movementTime).length;
    const preB = b.candidates.filter((c) => parseISODate(bestDateForRecency(c)) <= movementTime).length;
    if (preA !== preB) return preB - preA;

    // 2. Prefer combinations with more overdue documents.
    const odA = a.candidates.filter((c) => c.isOverdue).length;
    const odB = b.candidates.filter((c) => c.isOverdue).length;
    if (odA !== odB) return odB - odA;

    // 3. Prefer combinations whose oldest document is older.
    const minA = Math.min(...a.candidates.map((c) => parseISODate(c.invoiceDate)));
    const minB = Math.min(...b.candidates.map((c) => parseISODate(c.invoiceDate)));
    if (minA !== minB) return minA - minB;

    // 4. Tie-breaker only: fewer documents.
    return a.candidates.length - b.candidates.length;
  };
}

export class GroupedSettlementMatcherService {
  findExactCombinations(input: GroupedSettlementMatchInput): GroupedSettlementMatchResult {
    const maxCandidates = input.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
    const maxCombinations = input.maxCombinations ?? DEFAULT_MAX_COMBINATIONS;
    const totalEligibleCount = input.candidates.length;

    const capped = capCandidatesByDateProximity(input.candidates, input.movementDate, maxCandidates);
    const consideredCandidateCount = capped.length;

    if (capped.length === 0) {
      return { combinations: [], consideredCandidateCount, totalEligibleCount };
    }

    const half = Math.ceil(capped.length / 2);
    const left = capped.slice(0, half);
    const right = capped.slice(half);

    const leftSums = computeSubsetSums(left);
    const rightSums = computeSubsetSums(right);

    const rightMasksBySum = new Map<number, number[]>();
    for (let mask = 0; mask < rightSums.length; mask++) {
      const sum = rightSums[mask]!;
      const arr = rightMasksBySum.get(sum);
      if (arr) arr.push(mask);
      else rightMasksBySum.set(sum, [mask]);
    }

    const target = input.targetAbsCents;
    const combinations: SettlementCombination[] = [];

    outer: for (let leftMask = 0; leftMask < leftSums.length; leftMask++) {
      const need = target - leftSums[leftMask]!;
      const rightMasks = rightMasksBySum.get(need);
      if (!rightMasks) continue;

      const leftIndices = maskToIndices(leftMask, left.length);

      for (const rightMask of rightMasks) {
        if (leftMask === 0 && rightMask === 0) continue; // skip the empty combination
        const rightIndices = maskToIndices(rightMask, right.length);
        const docs = [...leftIndices.map((i) => left[i]!), ...rightIndices.map((i) => right[i]!)];
        if (docs.length === 0) continue;
        combinations.push({ candidates: docs, totalCents: target });
        if (combinations.length >= maxCombinations) break outer;
      }
    }

    combinations.sort(compareCombinations(input.movementDate));

    return { combinations, consideredCandidateCount, totalEligibleCount };
  }
}
