// All derivable statistics
const Stats = (() => {
  function compute(trades) {
    const closed = trades.filter(t => t.status === "closed");
    const open = trades.filter(t => t.status === "open");

    const wins = closed.filter(t => t.outcome === "win");
    const losses = closed.filter(t => t.outcome === "loss");
    const bes = closed.filter(t => t.outcome === "be");

    const pnl = (t) => parseFloat(t.pnl) || 0;
    const totalPnl = closed.reduce((s, t) => s + pnl(t), 0);
    const grossWin = wins.reduce((s, t) => s + pnl(t), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + pnl(t), 0));

    const rOf = (t) => Trades.rMultiple(t) || 0;
    const totalR = closed.reduce((s, t) => s + rOf(t), 0);

    const decided = wins.length + losses.length; // exclude BE from WR
    const winRate = decided ? (wins.length / decided) * 100 : 0;

    const avgWin = wins.length ? grossWin / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;
    const profitFactor = grossLoss ? grossWin / grossLoss : (grossWin ? Infinity : 0);
    const expectancyR = closed.length ? totalR / closed.length : 0;

    const pnls = closed.map(pnl);
    const largestWin = pnls.length ? Math.max(0, ...pnls) : 0;
    const largestLoss = pnls.length ? Math.min(0, ...pnls) : 0;

    // streaks (chronological)
    const chron = [...closed].reverse();
    let curStreak = 0, curType = null, maxWin = 0, maxLoss = 0, w = 0, l = 0;
    chron.forEach(t => {
      if (t.outcome === "win") { w++; l = 0; maxWin = Math.max(maxWin, w); }
      else if (t.outcome === "loss") { l++; w = 0; maxLoss = Math.max(maxLoss, l); }
      else { w = 0; l = 0; }
    });
    for (let i = chron.length - 1; i >= 0; i--) {
      const o = chron[i].outcome;
      if (o === "be") break;
      if (curType === null) { curType = o; curStreak = 1; }
      else if (o === curType) curStreak++;
      else break;
    }

    // hold time
    const holds = closed.map(Trades.holdMs).filter(Boolean);
    const avgHoldMs = holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : null;

    // avg RR (planned)
    const rrs = closed.map(t => Trades.rr(t.slPips, t.tpPips)).filter(Boolean);
    const avgRR = rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : 0;

    // equity curve
    let cum = 0;
    const curve = chron.map(t => { cum += pnl(t); return { t: t.exitTime || t.entryTime, y: cum }; });

    return {
      total: trades.length, open: open.length, closed: closed.length,
      wins: wins.length, losses: losses.length, bes: bes.length,
      winRate, totalPnl, totalR, avgWin, avgLoss, profitFactor, expectancyR,
      largestWin, largestLoss, curStreak, curType, maxWin, maxLoss,
      avgHoldMs, avgRR, curve,
      byTag: groupStats(closed, t => t.tags, true),
      byPair: groupStats(closed, t => [t.pair]),
      byTier: groupStats(closed, t => [t.tier])
    };
  }

  function groupStats(closed, keyFn, multi) {
    const map = {};
    closed.forEach(t => {
      const keys = keyFn(t).filter(k => k);
      keys.forEach(k => {
        if (!map[k]) map[k] = { key: k, n: 0, w: 0, l: 0, pnl: 0, r: 0 };
        const g = map[k];
        g.n++;
        if (t.outcome === "win") g.w++;
        if (t.outcome === "loss") g.l++;
        g.pnl += parseFloat(t.pnl) || 0;
        g.r += Trades.rMultiple(t) || 0;
      });
    });
    return Object.values(map).map(g => ({
      ...g,
      wr: (g.w + g.l) ? (g.w / (g.w + g.l)) * 100 : 0
    })).sort((a, b) => b.pnl - a.pnl);
  }

  function fmtHold(ms) {
    if (!ms) return "—";
    const h = Math.floor(ms / 3.6e6);
    const m = Math.floor((ms % 3.6e6) / 6e4);
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    return h ? `${h}h ${m}m` : `${m}m`;
  }

  return { compute, fmtHold };
})();