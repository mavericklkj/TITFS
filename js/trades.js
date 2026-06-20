// Trade model, calculations, defaults
const Trades = (() => {
  const DEFAULT_PAIRS = ["EUR/USD", "BTC/USD", "GBP/USD", "USD/JPY", "XAU/USD"];
  const DEFAULT_TAGS = ["Engulfing", "Engulfing Sweep", "OTE", "FVG", "Order Block", "RSI Divergence"];
  const DEFAULT_TIERS = ["Tier 1", "Tier 2", "Tier 3", "Tier 4", "Tier 5"];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // R:R from SL/TP pips
  function rr(slPips, tpPips) {
    const sl = parseFloat(slPips), tp = parseFloat(tpPips);
    if (!sl || !tp) return null;
    return tp / sl;
  }

  // R-multiple realized at close
  function rMultiple(t) {
    if (t.status !== "closed") return null;
    if (t.outcome === "win") return rr(t.slPips, t.tpPips);
    if (t.outcome === "loss") return -1;
    if (t.outcome === "be") return 0;
    return null;
  }

  function holdMs(t) {
    if (!t.entryTime || !t.exitTime) return null;
    const a = new Date(t.entryTime).getTime();
    const b = new Date(t.exitTime).getTime();
    return (b > a) ? b - a : null;
  }

  function blank() {
    return {
      id: uid(), status: "open", pair: "", direction: "long",
      tier: "", gamble: false, slPips: "", tpPips: "", entryTime: "",
      exitTime: "", tags: [], outcome: "", pnl: "", notes: "",
      images: [] // {id, label, dataUrl}
    };
  }

  function nowLocal() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  return { DEFAULT_PAIRS, DEFAULT_TAGS, DEFAULT_TIERS, uid, rr, rMultiple, holdMs, blank, nowLocal };
})();