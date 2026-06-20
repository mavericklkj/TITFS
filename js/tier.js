// Tier state machine + ladder math
const Tier = (() => {
  const BASE = 100;     // Tier 1 stake
  const RR = 2.4;       // default reward:risk
  const MAX = 5;

  // Ladder: each tier risks the PREVIOUS tier's TP profit.
  // T1 stake = BASE; profit = stake * RR.
  // T(n) stake = T(n-1) profit.
  function ladder(base = BASE, rr = RR) {
    const rows = [];
    let stake = base;
    for (let i = 1; i <= MAX; i++) {
      const profit = stake * rr;
      rows.push({ tier: i, stake, rr, profit });
      stake = profit; // next tier risks this tier's profit
    }
    return rows;
  }

  function stakeFor(tierNum, base = BASE, rr = RR) {
    const row = ladder(base, rr).find(r => r.tier === tierNum);
    return row ? row.stake : null;
  }

  // Given a tier and an outcome, return the next tier (tiered trades only).
  function next(tierNum, outcome) {
    if (outcome === "win") return Math.min(MAX, tierNum + 1);
    if (outcome === "loss") return Math.max(1, tierNum - 1);
    return tierNum; // be / unknown → hold
  }

  // Walk all CLOSED, TIERED trades in chronological order to derive current tier.
  // Gamble trades are skipped entirely.
  function currentTier(trades) {
    const chron = trades
      .filter(t => t.status === "closed" && !t.gamble)
      .sort((a, b) => (a.exitTime || a.entryTime || "").localeCompare(b.exitTime || b.entryTime || ""));
    let tier = 1;
    chron.forEach(t => { tier = next(tier, t.outcome); });
    return tier;
  }

  return { BASE, RR, MAX, ladder, stakeFor, next, currentTier };
})();