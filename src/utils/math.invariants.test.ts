/**
 * Suite C — FE math invariants (cutover fence).
 *
 * Goal: capture the current contract of `calculatePredictRatio` and
 * `calculateWin` so the M4a→M4b switch (BE-supplied odds) can replace them
 * with confidence.
 *
 * These tests are NOT a regression: they describe behavior that will be
 * intentionally retired at M4b. They fence two flows:
 *
 *   1. While the BE serves Q10 compat-bridge fields (homeTeamPoolToken /
 *      awayTeamPoolToken / totalPoolAmountToken), the FE math here must
 *      continue to produce odds equal to the chain-side LMSR odds. Suite B's
 *      q10_compat_bridge.test.ts proves the BE's bridge is correct; this
 *      suite proves the FE math is consistent with that bridge.
 *
 *   2. At M4b the BE switches to homeOdds/awayOdds directly. These tests are
 *      DELETED in the same PR that deletes the math.ts functions — the deletion
 *      is the M4b cutover.
 *
 * Test framework: written for Vitest (Vite-native). Compatible with Jest by
 * substituting imports. To run:
 *
 *   npm install -D vitest
 *   npx vitest run src/utils/math.invariants.test.ts
 *
 * The file uses standard describe/it/expect — works under any Jest-like runner.
 */

import { describe, it, expect } from "vitest";
import { calculatePredictRatio, calculateWin } from "./math";
import { SelectedTeam, CurrencyType } from "../types/PredictionRecord";

describe("calculatePredictRatio", () => {
  it("returns 0 on empty pool", () => {
    expect(calculatePredictRatio(0, 0)).toBe(0);
  });

  it("returns teamAmount / totalAmount", () => {
    expect(calculatePredictRatio(100, 50)).toBe(0.5);
    expect(calculatePredictRatio(400, 100)).toBe(0.25);
  });

  it("Q10 compat-bridge: with bridged pools = odds × collateral, ratio reproduces LMSR odds", () => {
    // Suppose chain reports homeOdds = 0.6, awayOdds = 0.4, collateral = 1000
    // Bridge yields: homePool = 600, awayPool = 400, total = 1000.
    // calculatePredictRatio(total, homePool) must reproduce 0.6.
    const homeOdds = 0.6;
    const collateral = 1000;
    const homePool = homeOdds * collateral;
    const awayPool = (1 - homeOdds) * collateral;
    const total = homePool + awayPool;
    expect(calculatePredictRatio(total, homePool)).toBeCloseTo(homeOdds, 6);
  });
});

describe("calculateWin", () => {
  const cur = {} as CurrencyType; // not consulted by the function

  it("empty pool returns [amount, '1.00']", () => {
    const [win, odds] = calculateWin(100, 0, cur, SelectedTeam.HOME, 0, 0);
    expect(win).toBe("100");
    expect(odds).toBe("1.00");
  });

  it("symmetric pools yield odds = 0.5 → win = 2 × amount", () => {
    const [win, odds] = calculateWin(100, 0, cur, SelectedTeam.HOME, 500, 500);
    expect(parseFloat(odds)).toBeCloseTo(0.5, 3);
    expect(parseFloat(win)).toBeCloseTo(200, 3);
  });

  it("asymmetric pools: HOME heavier → HOME pays less per unit", () => {
    // HOME pool = 750, AWAY pool = 250 → home odds = 0.75, win on HOME = 100/0.75 ≈ 133.3
    const [winHome] = calculateWin(100, 0, cur, SelectedTeam.HOME, 750, 250);
    const [winAway] = calculateWin(100, 0, cur, SelectedTeam.AWAY, 750, 250);
    expect(parseFloat(winHome)).toBeLessThan(parseFloat(winAway));
  });

  it("zero-pool side: returns large multiplier and odds '0.01'", () => {
    const [win, odds] = calculateWin(100, 0, cur, SelectedTeam.HOME, 0, 1000);
    expect(odds).toBe("0.01");
    expect(parseFloat(win)).toBe(10000);
  });

  it("Q10 compat-bridge round-trip: bridged pool inputs reproduce chain LMSR odds", () => {
    // Chain reports homeOdds = 0.7. Compat bridge: homePool = 0.7 × C, awayPool = 0.3 × C.
    const C = 2000;
    const homeOdds = 0.7;
    const homePool = homeOdds * C;
    const awayPool = (1 - homeOdds) * C;
    const [, odds] = calculateWin(100, 0, cur, SelectedTeam.HOME, homePool, awayPool);
    expect(parseFloat(odds)).toBeCloseTo(homeOdds, 3);
  });
});
