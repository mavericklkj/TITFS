// Rendering + interactions
const UI = (() => {
  const app = () => document.getElementById("app");
  const modalRoot = () => document.getElementById("modalRoot");
  let state = { pairs: [], tags: [], tiers: [], trades: [], filter: { status: "all", pair: "", tag: "" } };

  const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
  const num = (n, d = 2) => (n === Infinity ? "∞" : (n == null ? "—" : Number(n).toFixed(d)));
  const sign = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");

  async function refresh() {
    state.trades = await DB.trades.all();
    state.pairs = await DB.meta.get("pairs", Trades.DEFAULT_PAIRS);
    state.tags = await DB.meta.get("tags", Trades.DEFAULT_TAGS);
    state.tiers = await DB.meta.get("tiers", Trades.DEFAULT_TIERS);
  }

  // ---------- TRADES VIEW ----------
  function renderTrades() {
    let list = state.trades;
    const f = state.filter;
    if (f.status !== "all") list = list.filter(t => t.status === f.status);
    if (f.pair) list = list.filter(t => t.pair === f.pair);
    if (f.tag) list = list.filter(t => (t.tags || []).includes(f.tag));

    const openT = list.filter(t => t.status === "open");
    const closedT = list.filter(t => t.status === "closed");

    const filterBar = `
      <div class="filter-bar">
        <select onchange="UI.setFilter('status', this.value)">
          ${["all", "open", "closed"].map(s =>
            `<option value="${s}" ${f.status === s ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}
        </select>
        <select onchange="UI.setFilter('pair', this.value)">
          <option value="">All pairs</option>
          ${state.pairs.map(p => `<option ${f.pair === p ? "selected" : ""}>${esc(p)}</option>`).join("")}
        </select>
        <select onchange="UI.setFilter('tag', this.value)">
          <option value="">All setups</option>
          ${state.tags.map(t => `<option ${f.tag === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
        </select>
      </div>`;

    if (!list.length) {
      app().innerHTML = filterBar + `<div class="empty"><b>No trades yet</b>Tap ＋ to log your first entry.</div>`;
      return;
    }

    app().innerHTML = filterBar +
      (openT.length ? `<div class="section-title">Open · ${openT.length}</div>` + openT.map(card).join("") : "") +
      (closedT.length ? `<div class="section-title">Closed · ${closedT.length}</div>` + closedT.map(card).join("") : "");
  }

  function card(t) {
    const r = Trades.rMultiple(t);
    const rrv = Trades.rr(t.slPips, t.tpPips);
    const pnlNum = parseFloat(t.pnl);
    const outBadge = t.status === "open" ? `<span class="badge open">OPEN</span>`
      : `<span class="badge ${t.outcome}">${t.outcome.toUpperCase()}</span>`;
    return `
      <div class="card" onclick="UI.openTrade('${t.id}')">
        <div class="card-head">
          <div>
            <span class="pair">${esc(t.pair || "—")}</span>
            <span class="badge ${t.direction}">${t.direction.toUpperCase()}</span>
          </div>
          ${outBadge}
        </div>
        <div class="meta-grid">
          <div class="meta"><span class="k">Tier</span><span class="v">${esc(t.tier || "—")}</span></div>
          <div class="meta"><span class="k">SL / TP pips</span><span class="v">${esc(t.slPips || "—")} / ${esc(t.tpPips || "—")}</span></div>
          <div class="meta"><span class="k">R:R</span><span class="v">${rrv ? num(rrv) : "—"}</span></div>
          ${t.status === "closed" ? `
            <div class="meta"><span class="k">P&L</span><span class="v ${sign(pnlNum)}">${isNaN(pnlNum) ? "—" : (pnlNum > 0 ? "+" : "") + pnlNum}</span></div>
            <div class="meta"><span class="k">R</span><span class="v ${sign(r)}">${r == null ? "—" : (r > 0 ? "+" : "") + num(r)}</span></div>
            <div class="meta"><span class="k">Hold</span><span class="v">${Stats.fmtHold(Trades.holdMs(t))}</span></div>
          ` : `<div class="meta"><span class="k">Entry</span><span class="v">${fmtDate(t.entryTime)}</span></div>`}
        </div>
        ${(t.tags || []).length ? `<div class="tags">${t.tags.map(tg => `<span class="tag-chip">${esc(tg)}</span>`).join("")}</div>` : ""}
        ${(t.images || []).length ? `<div class="thumbs">${t.images.map(im =>
          `<img class="thumb" src="${im.dataUrl}" onclick="event.stopPropagation();UI.lightbox('${im.dataUrl}')" />`).join("")}</div>` : ""}
      </div>`;
  }

  function fmtDate(s) {
    if (!s) return "—";
    const d = new Date(s);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
      d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  // ---------- TRADE FORM (open + edit + close) ----------
  function newTrade() { openForm(Trades.blank(), "new"); }

  async function openTrade(id) {
    const t = await DB.trades.get(id);
    openForm(t, "edit");
  }

  function openForm(t, mode) {
    // Auto-fill tier for NEW tiered trades from current tier state
    if (mode === "new" && !t.gamble && !t.tier) {
      t.tier = Tier.currentTier(state.trades);
    }
    const isClosed = t.status === "closed";
    modalRoot().innerHTML = `
      <div class="modal-bg" onclick="if(event.target===this)UI.closeModal()">
        <div class="modal">
          <div class="modal-head">
            <h2>${mode === "new" ? "New Trade" : "Edit Trade"}</h2>
            <button class="modal-close" onclick="UI.closeModal()">×</button>
          </div>
          <form id="tradeForm" onsubmit="return false">
            <div class="field">
              <label>Pair</label>
              <div class="chip-pick" id="pairPick">
                ${state.pairs.map(p => `<button type="button" class="${t.pair === p ? "sel" : ""}" onclick="UI.pickPair('${esc(p)}')">${esc(p)}</button>`).join("")}
              </div>
            </div>
            <div class="field">
              <label>Direction</label>
              <div class="seg" id="dirSeg">
                <button type="button" class="${t.direction === "long" ? "sel long" : ""}" onclick="UI.pickDir('long')">LONG</button>
                <button type="button" class="${t.direction === "short" ? "sel short" : ""}" onclick="UI.pickDir('short')">SHORT</button>
              </div>
            </div>
            <div class="field">
              <label>Trade type</label>
              <div class="seg" id="gambleSeg">
                <button type="button" class="${!t.gamble ? "sel long" : ""}" onclick="UI.pickGamble(false)">TIERED</button>
                <button type="button" class="${t.gamble ? "sel short" : ""}" onclick="UI.pickGamble(true)">GAMBLE</button>
              </div>
            </div>
            <div class="field" id="tierField">
              <label>Tier</label>
              <select id="f_tier" onchange="UI.onTierChange(this.value)">
                ${[1,2,3,4,5].map(n => `<option value="${n}" ${String(t.tier) === String(n) ? "selected" : ""}>Tier ${n}</option>`).join("")}
              </select>
              <div class="calc-line" id="tierStakeLine"></div>
            </div>
            <div class="field-row">
              <div class="field"><label>SL (pips)</label><input id="f_sl" type="number" step="any" value="${esc(t.slPips)}" oninput="UI.recalcRR()" /></div>
              <div class="field"><label>TP (pips)</label><input id="f_tp" type="number" step="any" value="${esc(t.tpPips)}" oninput="UI.recalcRR()" /></div>
            </div>
            <div class="calc-line" id="rrLine"></div>
            <div class="field">
              <label>Entry time <span style="color:var(--muted);text-transform:none;letter-spacing:0">· auto-stamped on save, editable</span></label>
              <div style="display:flex;gap:8px">
                <input id="f_entry" type="datetime-local" value="${esc(t.entryTime)}" style="flex:1" />
                <button type="button" class="btn-ghost" onclick="UI.stampNow('f_entry')">Now</button>
              </div>
            </div>
            <div class="field">
              <label>Setup tags</label>
              <div class="chip-pick" id="tagPick">
                ${state.tags.map(tg => `<button type="button" class="${(t.tags || []).includes(tg) ? "sel" : ""}" onclick="UI.toggleTag('${esc(tg)}')">${esc(tg)}</button>`).join("")}
              </div>
            </div>
            <div class="field">
              <label>Entry screenshot(s)</label>
              <input type="file" accept="image/*" multiple onchange="UI.addImages(this,'entry')" />
            </div>
            <div class="thumbs" id="imgEntry"></div>

            <div class="section-title" style="margin-top:20px">Close (when TP / SL / BE hit)</div>
            <div class="field">
              <label>Outcome</label>
              <div class="seg" id="outSeg">
                ${["win", "loss", "be"].map(o =>
                  `<button type="button" class="${t.outcome === o ? "sel " + (o === "win" ? "long" : o === "loss" ? "short" : "") : ""}" onclick="UI.pickOutcome('${o}')">${o === "be" ? "BREAK EVEN" : o.toUpperCase()}</button>`).join("")}
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label>Exit time <span style="color:var(--muted);text-transform:none;letter-spacing:0">· auto on close</span></label>
                <div style="display:flex;gap:8px">
                  <input id="f_exit" type="datetime-local" value="${esc(t.exitTime)}" style="flex:1;min-width:0" />
                  <button type="button" class="btn-ghost" onclick="UI.stampNow('f_exit')">Now</button>
                </div>
              </div>
              <div class="field"><label>P&L</label><input id="f_pnl" type="number" step="any" value="${esc(t.pnl)}" /></div>
            </div>
            <div class="field">
              <label>Result screenshot(s)</label>
              <input type="file" accept="image/*" multiple onchange="UI.addImages(this,'result')" />
            </div>
            <div class="thumbs" id="imgResult"></div>

            <div class="field">
              <label>Notes</label>
              <textarea id="f_notes">${esc(t.notes)}</textarea>
            </div>

            <div class="btn-row">
              <button class="btn" style="flex:1" onclick="UI.save()">Save</button>
              ${mode === "edit" ? `<button class="btn btn-danger" onclick="UI.del('${t.id}')">Delete</button>` : ""}
            </div>
          </form>
        </div>
      </div>`;
    UI._draft = JSON.parse(JSON.stringify(t));
    renderDraftImages();
    recalcRR();
    updateTierUI();
  }

  function pickGamble(g) {
    UI._draft.gamble = g;
    const seg = document.getElementById("gambleSeg");
    seg.children[0].className = !g ? "sel long" : "";
    seg.children[1].className = g ? "sel short" : "";
    if (g) { UI._draft.tier = ""; }
    else if (!UI._draft.tier) { UI._draft.tier = Tier.currentTier(state.trades); }
    updateTierUI();
  }
  function onTierChange(v) { UI._draft.tier = v; updateTierUI(); }

  function stampNow(fieldId) {
    const el = document.getElementById(fieldId);
    if (el) el.value = Trades.nowLocal();
  }
  function updateTierUI() {
    const field = document.getElementById("tierField");
    const line = document.getElementById("tierStakeLine");
    const sel = document.getElementById("f_tier");
    if (!field) return;
    field.style.display = UI._draft.gamble ? "none" : "block";
    if (sel && UI._draft.tier) sel.value = UI._draft.tier;
    if (line && UI._draft.tier) {
      const stake = Tier.stakeFor(Number(UI._draft.tier));
      const profit = stake * Tier.RR;
      line.innerHTML = `Stake <b>${stake.toFixed(2)}</b> · TP profit <b>${profit.toFixed(2)}</b> @ ${Tier.RR} RR`;
    } else if (line) { line.innerHTML = ""; }
  }

  // draft mutators
  function pickPair(p) { UI._draft.pair = p; document.querySelectorAll("#pairPick button").forEach(b => b.classList.toggle("sel", b.textContent === p)); }
  function pickDir(d) {
    UI._draft.direction = d;
    const seg = document.getElementById("dirSeg");
    seg.children[0].className = d === "long" ? "sel long" : "";
    seg.children[1].className = d === "short" ? "sel short" : "";
  }
  function pickOutcome(o) {
    UI._draft.outcome = o;
    const seg = document.getElementById("outSeg");
    [...seg.children].forEach((b, i) => {
      const oo = ["win", "loss", "be"][i];
      b.className = UI._draft.outcome === oo ? "sel " + (oo === "win" ? "long" : oo === "loss" ? "short" : "") : "";
    });
  }
  function toggleTag(tg) {
    const arr = UI._draft.tags || (UI._draft.tags = []);
    const i = arr.indexOf(tg);
    if (i >= 0) arr.splice(i, 1); else arr.push(tg);
    document.querySelectorAll("#tagPick button").forEach(b => b.classList.toggle("sel", arr.includes(b.textContent)));
  }
  function recalcRR() {
    const sl = parseFloat(document.getElementById("f_sl")?.value);
    const tp = parseFloat(document.getElementById("f_tp")?.value);
    const line = document.getElementById("rrLine");
    if (line) line.innerHTML = (sl && tp) ? `R:R <b>${(tp / sl).toFixed(2)}</b>` : "";
  }

  async function addImages(input, label) {
    const files = [...input.files];
    for (const file of files) {
      const dataUrl = await fileToDataUrl(file);
      UI._draft.images.push({ id: Trades.uid(), label, dataUrl });
    }
    renderDraftImages();
  }
  function renderDraftImages() {
    ["entry", "result"].forEach(lbl => {
      const box = document.getElementById(lbl === "entry" ? "imgEntry" : "imgResult");
      if (!box) return;
      box.innerHTML = UI._draft.images.filter(im => im.label === lbl).map(im =>
        `<span style="position:relative;display:inline-block">
           <img class="thumb" src="${im.dataUrl}" onclick="UI.lightbox('${im.dataUrl}')" />
           <button onclick="UI.removeImg('${im.id}')" style="position:absolute;top:-6px;right:-6px;background:var(--red);color:#000;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-weight:700">×</button>
         </span>`).join("");
    });
  }
  function removeImg(id) { UI._draft.images = UI._draft.images.filter(im => im.id !== id); renderDraftImages(); }

  function fileToDataUrl(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });
  }

  async function save() {
    const d = UI._draft;
    d.tier = d.gamble ? "" : document.getElementById("f_tier").value;
    d.slPips = document.getElementById("f_sl").value;
    d.tpPips = document.getElementById("f_tp").value;
    d.entryTime = document.getElementById("f_entry").value;
    d.exitTime = document.getElementById("f_exit").value;
    d.pnl = document.getElementById("f_pnl").value;
    d.notes = document.getElementById("f_notes").value;
    // status: closed if an outcome is set
    d.status = d.outcome ? "closed" : "open";

    // Auto-stamp times based on the action, but never overwrite a value already present.
    const now = Trades.nowLocal();
    if (!d.entryTime) d.entryTime = now;           // stamp entry on first save
    if (d.status === "closed" && !d.exitTime) d.exitTime = now; // stamp exit when closing

    await DB.trades.put(d);
    closeModal();
    await refresh();
    renderTrades();
  }
  async function del(id) {
    if (!confirm("Delete this trade permanently?")) return;
    await DB.trades.remove(id);
    closeModal();
    await refresh();
    renderTrades();
  }

  function closeModal() { modalRoot().innerHTML = ""; }
  function lightbox(src) {
    const lb = document.createElement("div");
    lb.className = "lightbox";
    lb.onclick = () => lb.remove();
    lb.innerHTML = `<img src="${src}" />`;
    document.body.appendChild(lb);
  }

  function setFilter(k, v) { state.filter[k] = v; renderTrades(); }

  // ---------- STATS VIEW ----------
  function renderStats() {
    const s = Stats.compute(state.trades);
    if (!s.closed) {
      app().innerHTML = `<div class="empty"><b>No closed trades</b>Close some trades to see stats.</div>`;
      return;
    }
    const pf = s.profitFactor === Infinity ? "∞" : num(s.profitFactor);
    app().innerHTML = `
      <div class="stat-grid">
        ${stat("Win Rate", num(s.winRate, 1) + "%", `${s.wins}W · ${s.losses}L · ${s.bes}BE`)}
        ${stat("Total P&L", (s.totalPnl > 0 ? "+" : "") + num(s.totalPnl), null, sign(s.totalPnl))}
        ${stat("Total R", (s.totalR > 0 ? "+" : "") + num(s.totalR), null, sign(s.totalR))}
        ${stat("Expectancy", num(s.expectancyR) + "R", "per trade", sign(s.expectancyR))}
        ${stat("Profit Factor", pf, "gross win / loss")}
        ${stat("Avg R:R", num(s.avgRR), "planned")}
        ${stat("Avg Win", "+" + num(s.avgWin), null, "pos")}
        ${stat("Avg Loss", "-" + num(s.avgLoss), null, "neg")}
        ${stat("Largest Win", "+" + num(s.largestWin), null, "pos")}
        ${stat("Largest Loss", num(s.largestLoss), null, "neg")}
        ${stat("Cur. Streak", (s.curStreak || 0) + (s.curType ? " " + s.curType[0].toUpperCase() : ""), `max ${s.maxWin}W / ${s.maxLoss}L`)}
        ${stat("Avg Hold", Stats.fmtHold(s.avgHoldMs), "entry→exit")}
      </div>
      <div class="section-title">Equity Curve</div>
      <div class="curve-wrap">${curveSvg(s.curve)}</div>
      ${groupTable("By Setup", s.byTag)}
      ${groupTable("By Pair", s.byPair)}
      ${groupTable("By Tier", s.byTier)}`;
  }

  function stat(label, num_, sub, cls = "") {
    return `<div class="stat"><div class="label">${label}</div><div class="num ${cls}">${num_}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
  }

  function groupTable(title, rows) {
    if (!rows.length) return "";
    return `<div class="section-title">${title}</div>
      <table class="table"><thead><tr><th>${title.replace("By ", "")}</th><th>N</th><th>WR</th><th>P&L</th><th>R</th></tr></thead><tbody>
      ${rows.map(g => `<tr>
        <td>${esc(g.key)}</td><td>${g.n}</td><td>${num(g.wr, 0)}%</td>
        <td class="${sign(g.pnl)}">${(g.pnl > 0 ? "+" : "") + num(g.pnl)}</td>
        <td class="${sign(g.r)}">${(g.r > 0 ? "+" : "") + num(g.r)}</td>
      </tr>`).join("")}</tbody></table>`;
  }

  function curveSvg(curve) {
    if (curve.length < 2) return `<div class="sub" style="color:var(--muted)">Need ≥2 closed trades.</div>`;
    const W = 320, H = 120, pad = 4;
    const ys = curve.map(p => p.y);
    const min = Math.min(0, ...ys), max = Math.max(0, ...ys);
    const range = (max - min) || 1;
    const pts = curve.map((p, i) => {
      const x = pad + (i / (curve.length - 1)) * (W - pad * 2);
      const y = H - pad - ((p.y - min) / range) * (H - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const zeroY = H - pad - ((0 - min) / range) * (H - pad * 2);
    const last = ys[ys.length - 1];
    const col = last >= 0 ? "var(--accent)" : "var(--red)";
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none" style="display:block">
      <line x1="0" y1="${zeroY}" x2="${W}" y2="${zeroY}" stroke="var(--line)" stroke-dasharray="3 3"/>
      <polyline points="${pts.join(" ")}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>
    </svg>`;
  }

  // ---------- MANAGE VIEW ----------
  function renderManage() {
    app().innerHTML = `
      ${manageList("Pairs", "pairs", state.pairs)}
      ${manageList("Setup Tags", "tags", state.tags)}
      <div class="section-title">Tiers</div>
      <div class="calc-line" style="color:var(--muted)">Tiers are fixed (1–5) and driven by the tier engine — manage them in the <b>Tier</b> tab.</div>`;
  }
  function manageList(title, key, items) {
    return `<div class="section-title">${title}</div>
      <div class="add-row">
        <input id="add_${key}" placeholder="Add ${title.toLowerCase().replace(/s$/, "")}…" />
        <button class="btn" onclick="UI.addMeta('${key}')">Add</button>
      </div>
      ${items.map((it, i) => `<div class="list-item"><span>${esc(it)}</span>
        <button class="x" onclick="UI.removeMeta('${key}',${i})">×</button></div>`).join("")}`;
  }
  async function addMeta(key) {
    const input = document.getElementById("add_" + key);
    const v = input.value.trim();
    if (!v) return;
    const arr = state[key];
    if (!arr.includes(v)) arr.push(v);
    await DB.meta.set(key, arr);
    await refresh();
    renderManage();
  }
  async function removeMeta(key, i) {
    state[key].splice(i, 1);
    await DB.meta.set(key, state[key]);
    await refresh();
    renderManage();
  }

  // ---------- BACKUP VIEW ----------
  function renderBackup() {
    app().innerHTML = `
      <div class="card">
        <div class="section-title" style="margin-top:0">Export</div>
        <p style="color:var(--muted);font-size:13px;margin-bottom:12px">
          JSON = full backup (trades + images) you can re-import anywhere.
          ZIP = trades.json plus browseable PNG files in an /images folder.</p>
        <div class="btn-row">
          <button class="btn" onclick="UI.exportJSON()">Export JSON</button>
          <button class="btn" onclick="UI.exportZIP()">Export ZIP</button>
        </div>
      </div>
      <div class="card">
        <div class="section-title" style="margin-top:0">Import / Restore</div>
        <p style="color:var(--muted);font-size:13px;margin-bottom:12px">
          Load a previously exported JSON. <b>Merge</b> adds to current data; <b>Replace</b> wipes first.</p>
        <input type="file" id="importFile" accept="application/json,.json" />
        <div class="btn-row" style="margin-top:12px">
          <button class="btn-ghost" onclick="UI.importJSON(false)">Merge</button>
          <button class="btn-ghost" onclick="UI.importJSON(true)">Replace all</button>
        </div>
      </div>
      <div class="card">
        <div class="section-title" style="margin-top:0">Danger zone</div>
        <button class="btn btn-danger" onclick="UI.wipe()">Erase all data</button>
      </div>`;
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportJSON() {
    const payload = {
      version: 1, exported: new Date().toISOString(),
      meta: { pairs: state.pairs, tags: state.tags, tiers: state.tiers },
      trades: state.trades
    };
    download(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `trade-journal-${dateStamp()}.json`);
  }

  async function exportZIP() {
    if (typeof JSZip === "undefined") { alert("ZIP library still loading, try again in a sec."); return; }
    const zip = new JSZip();
    const clean = state.trades.map(t => ({
      ...t, images: (t.images || []).map(im => ({ id: im.id, label: im.label, file: `images/${t.id}_${im.id}.png` }))
    }));
    zip.file("trades.json", JSON.stringify({
      version: 1, exported: new Date().toISOString(),
      meta: { pairs: state.pairs, tags: state.tags, tiers: state.tiers }, trades: clean
    }, null, 2));
    const imgFolder = zip.folder("images");
    state.trades.forEach(t => (t.images || []).forEach(im => {
      const b64 = im.dataUrl.split(",")[1];
      imgFolder.file(`${t.id}_${im.id}.png`, b64, { base64: true });
    }));
    const blob = await zip.generateAsync({ type: "blob" });
    download(blob, `trade-journal-${dateStamp()}.zip`);
  }

  async function importJSON(replace) {
    const input = document.getElementById("importFile");
    if (!input.files.length) { alert("Pick a JSON file first."); return; }
    try {
      const text = await input.files[0].text();
      const data = JSON.parse(text);
      if (!data.trades) throw new Error("No trades field");
      if (replace) {
        if (!confirm("Replace ALL current data?")) return;
        await DB.trades.clear();
      }
      for (const t of data.trades) {
        if (t.images && t.images[0] && !t.images[0].dataUrl) {
          alert("This looks like a ZIP-style export — import the JSON export instead (it embeds images).");
          return;
        }
        await DB.trades.put(t);
      }
      if (data.meta) {
        await DB.meta.set("pairs", data.meta.pairs || state.pairs);
        await DB.meta.set("tags", data.meta.tags || state.tags);
        await DB.meta.set("tiers", data.meta.tiers || state.tiers);
      }
      await refresh();
      alert("Import complete.");
      go("trades");
    } catch (e) {
      alert("Import failed: " + e.message);
    }
  }

  async function wipe() {
    if (!confirm("Erase ALL trades permanently? Export first if unsure.")) return;
    if (!confirm("Really erase everything? This cannot be undone.")) return;
    await DB.trades.clear();
    await refresh();
    go("trades");
  }

  function dateStamp() { return new Date().toISOString().slice(0, 10); }

  // ---------- TIER VIEW (ladder + history + calculators) ----------
  function renderTier() {
    const cur = Tier.currentTier(state.trades);
    const rows = Tier.ladder();
    const curStake = Tier.stakeFor(cur);

    app().innerHTML = `
      <div class="stat-grid">
        ${stat("Current Tier", "Tier " + cur, `auto from history`, "")}
        ${stat("Tier Stake", "$" + num(curStake), `risk at TP profit @ ${Tier.RR} RR`, "pos")}
      </div>

      ${tierHistoryStrip()}
      ${gambleHistoryStrip()}

      <div class="section-title">Ladder</div>
      <table class="table">
        <thead><tr><th>Tier</th><th>Stake (risk)</th><th>TP profit</th><th>RR</th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr style="${r.tier === cur ? "background:var(--bg-3)" : ""}">
            <td>${r.tier === cur ? "▶ " : ""}Tier ${r.tier}</td>
            <td>${num(r.stake)}</td>
            <td class="pos">+${num(r.profit)}</td>
            <td>${r.rr}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      <div class="calc-line" style="margin-top:10px">
        TP → up one tier · SL → down one tier · BE → hold · floor T1 · cap T5. Gamble trades excluded.
      </div>

      <div class="section-title">TP Pips Calculator</div>
      <div class="card">
        <div class="field-row-3">
          <div class="field"><label>SL pips</label><input id="c_sl" type="number" step="any" placeholder="e.g. 20" oninput="UI.calc('tp')" /></div>
          <div class="field"><label>RR</label><input id="c_rr" type="number" step="any" value="${Tier.RR}" oninput="UI.calc('tp')" /></div>
          <div class="field"><label>TP pips</label><input id="c_tp" type="number" step="any" placeholder="auto" oninput="UI.calc('tpRev')" /></div>
        </div>
        <div class="calc-line" id="tpOut" style="margin-top:2px"></div>
      </div>

      <div class="section-title">Position Size Calculator</div>
      <div class="card">
        <div class="field-row">
          <div class="field"><label>Risk amount ($)</label><input id="ps_risk" type="number" step="any" value="${curStake.toFixed(2)}" oninput="UI.calc('ps')" /></div>
          <div class="field"><label>SL (pips)</label><input id="ps_sl" type="number" step="any" placeholder="e.g. 20" oninput="UI.calc('ps')" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Pip value /unit</label><input id="ps_pv" type="number" step="any" value="0.0001" oninput="UI.calc('ps')" /></div>
          <div class="field"><label>Contract size</label><input id="ps_cs" type="number" step="any" value="100000" oninput="UI.calc('ps')" /></div>
        </div>
        <div class="calc-line" id="psOut"></div>
        <div class="calc-line" style="color:var(--muted)">Risk auto-filled from current Tier ${cur} stake. Pip value 0.0001 + contract 100k = standard FX lot ($10/pip). Adjust for BTC/other instruments.</div>
      </div>`;
  }

  // Tiered path: replay closed tiered trades, show tier before→after each step
  function tierHistoryStrip() {
    const chron = state.trades
      .filter(t => t.status === "closed" && !t.gamble)
      .sort((a, b) => (a.exitTime || a.entryTime || "").localeCompare(b.exitTime || b.entryTime || ""));
    if (!chron.length) return `<div class="section-title">Tier Path</div>
      <div class="calc-line" style="color:var(--muted)">No closed tiered trades yet.</div>`;

    let tier = 1;
    const steps = chron.map(t => {
      const from = tier;
      const to = Tier.next(from, t.outcome);
      tier = to;
      return { from, to, outcome: t.outcome, pair: t.pair, time: t.exitTime || t.entryTime };
    });

    const node = (n, active, dir) => {
      const cls = dir === "win" ? "win" : dir === "loss" ? "loss" : dir === "be" ? "be" : "";
      return `<span class="tier-node ${active ? "active " + cls : ""}">${n}</span>`;
    };

    const dots = steps.map((s, i) => {
      const arrow = s.outcome === "win" ? "↑" : s.outcome === "loss" ? "↓" : "→";
      const ac = s.outcome === "win" ? "pos" : s.outcome === "loss" ? "neg" : "";
      return `<div class="tier-step" title="${esc(s.pair)} · ${fmtDate(s.time)} · T${s.from}${arrow}T${s.to}">
        ${node(s.to, true, s.outcome)}
        <span class="tier-arrow ${ac}">${arrow}</span>
      </div>`;
    }).join("");

    return `<div class="section-title">Tier Path · ${steps.length} trade${steps.length > 1 ? "s" : ""}</div>
      <div class="strip-wrap">
        <div class="tier-strip">
          <span class="tier-node start">1</span>
          <span class="tier-arrow">›</span>
          ${dots}
        </div>
      </div>`;
  }

  // Gamble strip: W/L/BE outcomes, no tier movement
  function gambleHistoryStrip() {
    const chron = state.trades
      .filter(t => t.status === "closed" && t.gamble)
      .sort((a, b) => (a.exitTime || a.entryTime || "").localeCompare(b.exitTime || b.entryTime || ""));
    if (!chron.length) return `<div class="section-title">Gamble History</div>
      <div class="calc-line" style="color:var(--muted)">No closed gamble trades.</div>`;

    let w = 0, l = 0, b = 0;
    const dots = chron.map(t => {
      if (t.outcome === "win") w++; else if (t.outcome === "loss") l++; else b++;
      const sym = t.outcome === "win" ? "W" : t.outcome === "loss" ? "L" : "B";
      return `<span class="gamble-node ${t.outcome}" title="${esc(t.pair)} · ${fmtDate(t.exitTime || t.entryTime)} · ${(parseFloat(t.pnl) || 0) > 0 ? "+" : ""}${t.pnl || 0}">${sym}</span>`;
    }).join("");

    return `<div class="section-title">Gamble History · ${w}W ${l}L ${b}BE</div>
      <div class="strip-wrap"><div class="gamble-strip">${dots}</div></div>`;
  }

  function calc(which) {
    if (which === "tp" || which === "tpRev") {
      const sl = parseFloat(document.getElementById("c_sl")?.value);
      const rr = parseFloat(document.getElementById("c_rr")?.value) || Tier.RR;
      const tpEl = document.getElementById("c_tp");
      const out = document.getElementById("tpOut");
      if (which === "tp" && sl) { const tp = sl * rr; tpEl.value = tp.toFixed(1); out.innerHTML = `TP = <b>${tp.toFixed(1)} pips</b> (${rr} × ${sl})`; }
      else if (which === "tpRev") {
        const tp = parseFloat(tpEl.value);
        if (tp && sl) out.innerHTML = `Implied RR = <b>${(tp / sl).toFixed(2)}</b>`;
      } else if (which === "tp" && !sl) out.innerHTML = "";
    }
    if (which === "ps") {
      const risk = parseFloat(document.getElementById("ps_risk")?.value);
      const sl = parseFloat(document.getElementById("ps_sl")?.value);
      const pv = parseFloat(document.getElementById("ps_pv")?.value);
      const cs = parseFloat(document.getElementById("ps_cs")?.value);
      const out = document.getElementById("psOut");
      if (risk && sl && pv && cs) {
        const perPipPerUnit = pv * cs;          // $ per pip per 1.0 lot
        const lots = risk / (sl * perPipPerUnit);
        const units = lots * cs;
        out.innerHTML = `Size = <b>${lots.toFixed(3)} lots</b> (${Math.round(units).toLocaleString()} units) · ${(perPipPerUnit * lots).toFixed(2)}/pip`;
      } else out.innerHTML = "";
    }
  }

  // ---------- ROUTER ----------
  function go(view) {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
    document.getElementById("fab").style.display = view === "trades" ? "block" : "none";
    if (view === "trades") renderTrades();
    else if (view === "stats") renderStats();
    else if (view === "tier") renderTier();
    else if (view === "manage") renderManage();
    else if (view === "backup") renderBackup();
  }

  return {
    refresh, go, renderTrades, newTrade, openTrade, setFilter,
    pickPair, pickDir, pickOutcome, toggleTag, recalcRR, addImages, removeImg,
    pickGamble, onTierChange, stampNow, calc, renderTier,
    save, del, closeModal, lightbox,
    addMeta, removeMeta, exportJSON, exportZIP, importJSON, wipe,
    _draft: null
  };
})();