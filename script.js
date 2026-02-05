(() => {
  "use strict";

  const VERSION = "20260205v3";

  // ✅ Kill any old PWA caches / service workers that might be hijacking updates
  async function nukePwaCaches() {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (_) {
      // ignore
    }
  }

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };

  const fmt0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const fmt2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatSmart = (n) => {
    if (!Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1000) return fmt0.format(n);
    return fmt2.format(n);
  };

  const setText = (id, text) => {
    const el = $(id);
    if (el) el.textContent = text;
  };

  const setStatus = (msg) => setText("statusText", msg);

  // ---------- Guard ----------
  const requiredIds = [
    "btnApply","btnReset","btnToggleInputs","btnCopyLink","btnCsv","btnPrint",
    "totalProd","euShare","euTons","intensity","cp","exempt","eurusd","route",
    "kpiAnnual","kpiPerTon","kpiEmissions","kpiNet",
    "kpiAnnualSub","kpiPerTonSub","kpiEmissionsSub","kpiNetSub",
    "scnCp","scnInt","scnAnnual","scnPerTon",
    "statusText","inputsPanel"
  ];

  function hardCheckIds() {
    const missing = requiredIds.filter((id) => !$(id));
    if (missing.length) {
      alert("Missing IDs in index.html:\n" + missing.join(", "));
      throw new Error("Missing IDs: " + missing.join(", "));
    }
  }

  // ---------- DOM ----------
  const dom = {
    totalProd: $("totalProd"),
    euShare: $("euShare"),
    euTons: $("euTons"),
    intensity: $("intensity"),
    cp: $("cp"),
    exempt: $("exempt"),
    eurusd: $("eurusd"),
    route: $("route"),

    btnApply: $("btnApply"),
    btnReset: $("btnReset"),
    btnToggleInputs: $("btnToggleInputs"),
    btnCopyLink: $("btnCopyLink"),
    btnCsv: $("btnCsv"),
    btnPrint: $("btnPrint"),

    inputsPanel: $("inputsPanel"),
  };

  // ---------- State ----------
  const DEFAULTS = {
    totalProd: 1000000,
    euShare: 20,
    euTons: NaN,        // auto unless overridden
    intensity: 2.10,
    cp: 80,
    exempt: 0,
    eurusd: NaN,
    route: "EAF · DRI+EAF · Mixed"
  };

  let euTonsOverridden = false;

  const state = {
    inputs: { ...DEFAULTS },
    scenario: "base"
  };

  // ---------- URL State ----------
  function writeUrlState() {
    const u = new URL(window.location.href);
    const q = u.searchParams;

    q.set("v", VERSION);
    q.set("p", String(state.inputs.totalProd || 0));
    q.set("s", String(state.inputs.euShare || 0));
    q.set("i", String(state.inputs.intensity || 0));
    q.set("cp", String(state.inputs.cp || 0));
    q.set("x", String(state.inputs.exempt || 0));

    if (Number.isFinite(state.inputs.euTons)) q.set("e", String(state.inputs.euTons));
    else q.delete("e");

    if (Number.isFinite(state.inputs.eurusd)) q.set("fx", String(state.inputs.eurusd));
    else q.delete("fx");

    if (state.inputs.route && state.inputs.route.trim()) q.set("r", state.inputs.route.trim());
    else q.delete("r");

    history.replaceState(null, "", u.toString());
  }

  function readUrlState() {
    const u = new URL(window.location.href);
    const q = u.searchParams;

    const p = toNum(q.get("p"));
    const s = toNum(q.get("s"));
    const e = toNum(q.get("e"));
    const i = toNum(q.get("i"));
    const cp = toNum(q.get("cp"));
    const x = toNum(q.get("x"));
    const fx = toNum(q.get("fx"));
    const r = q.get("r");

    if (Number.isFinite(p)) state.inputs.totalProd = p;
    if (Number.isFinite(s)) state.inputs.euShare = s;
    if (Number.isFinite(i)) state.inputs.intensity = i;
    if (Number.isFinite(cp)) state.inputs.cp = cp;
    if (Number.isFinite(x)) state.inputs.exempt = x;

    if (Number.isFinite(e)) {
      state.inputs.euTons = e;
      euTonsOverridden = true;
    }

    if (Number.isFinite(fx)) state.inputs.eurusd = fx;
    if (typeof r === "string" && r.trim()) state.inputs.route = r.trim();
  }

  // ---------- UI Sync ----------
  function syncInputsToUI() {
    dom.totalProd.value = Number.isFinite(state.inputs.totalProd) ? String(state.inputs.totalProd) : "";
    dom.euShare.value = Number.isFinite(state.inputs.euShare) ? String(state.inputs.euShare) : "";
    dom.euTons.value = Number.isFinite(state.inputs.euTons) ? String(state.inputs.euTons) : "";
    dom.intensity.value = Number.isFinite(state.inputs.intensity) ? String(state.inputs.intensity) : "";
    dom.cp.value = Number.isFinite(state.inputs.cp) ? String(state.inputs.cp) : "";
    dom.exempt.value = Number.isFinite(state.inputs.exempt) ? String(state.inputs.exempt) : "";
    dom.eurusd.value = Number.isFinite(state.inputs.eurusd) ? String(state.inputs.eurusd) : "";
    dom.route.value = state.inputs.route || "";
  }

  function syncUIToInputs() {
    state.inputs.totalProd = toNum(dom.totalProd.value);
    state.inputs.euShare = toNum(dom.euShare.value);
    state.inputs.intensity = toNum(dom.intensity.value);
    state.inputs.cp = toNum(dom.cp.value);
    state.inputs.exempt = toNum(dom.exempt.value);
    state.inputs.eurusd = toNum(dom.eurusd.value);
    state.inputs.route = (dom.route.value || "").trim();

    const euT = toNum(dom.euTons.value);
    if (Number.isFinite(euT) && euT > 0) {
      state.inputs.euTons = euT;
      euTonsOverridden = true;
    } else {
      if (!euTonsOverridden) state.inputs.euTons = NaN;
    }
  }

  function autoCalcEuTons() {
    const p = state.inputs.totalProd;
    const s = state.inputs.euShare;
    if (!Number.isFinite(p) || !Number.isFinite(s)) return;

    const auto = (p * s) / 100;
    if (!euTonsOverridden) {
      state.inputs.euTons = auto;
      dom.euTons.value = String(Math.round(auto));
    }
  }

  dom.euTons.addEventListener("input", () => {
    const v = toNum(dom.euTons.value);
    euTonsOverridden = Number.isFinite(v) && v > 0;
  });

  dom.totalProd.addEventListener("input", () => {
    syncUIToInputs();
    autoCalcEuTons();
  });

  dom.euShare.addEventListener("input", () => {
    syncUIToInputs();
    autoCalcEuTons();
  });

  // ---------- Core math ----------
  function computeKPIs(inputs) {
    const totalProd = inputs.totalProd;
    const euShare = inputs.euShare;
    const intensity = inputs.intensity;
    const cp = inputs.cp;
    const exempt = clamp(inputs.exempt, 0, 100);

    let euTons = inputs.euTons;
    if (!Number.isFinite(euTons)) {
      if (Number.isFinite(totalProd) && Number.isFinite(euShare)) {
        euTons = (totalProd * euShare) / 100;
      }
    }

    const ok =
      Number.isFinite(euTons) && euTons > 0 &&
      Number.isFinite(intensity) && intensity >= 0 &&
      Number.isFinite(cp) && cp >= 0;

    if (!ok) return { ok:false, euTons, reason:"Enter valid EU tons, intensity, and carbon price." };

    const emissions = euTons * intensity;
    const gross = emissions * cp;
    const net = gross * (1 - exempt / 100);
    const perTon = net / euTons;

    return { ok:true, euTons, emissions, gross, net, perTon, exempt };
  }

  function scenarioAdjust(baseInputs, which) {
    const out = { ...baseInputs };
    if (which === "conservative") { out.cp = baseInputs.cp * 0.85; out.intensity = baseInputs.intensity * 0.92; }
    if (which === "stress") { out.cp = baseInputs.cp * 1.25; out.intensity = baseInputs.intensity * 1.10; }
    return out;
  }

  function renderKPIs(k) {
    if (!k.ok) {
      setText("kpiAnnual", "—");
      setText("kpiPerTon", "—");
      setText("kpiEmissions", "—");
      setText("kpiNet", "—");
      setText("kpiAnnualSub", "Enter inputs then Apply");
      setText("kpiPerTonSub", "—");
      setText("kpiEmissionsSub", "—");
      setText("kpiNetSub", "—");
      return;
    }

    setText("kpiAnnual", formatSmart(k.gross));
    setText("kpiPerTon", formatSmart(k.perTon));
    setText("kpiEmissions", formatSmart(k.emissions));
    setText("kpiNet", formatSmart(k.net));

    setText("kpiAnnualSub", `EU tons: ${formatSmart(k.euTons)} t/y · Exemptions: ${formatSmart(k.exempt)}%`);
    setText("kpiPerTonSub", `Net / EU tons`);
    setText("kpiEmissionsSub", `EU tons × intensity`);
    setText("kpiNetSub", `Gross × (1 − exemptions)`);
  }

  function renderScenario(which) {
    const adj = scenarioAdjust(state.inputs, which);
    if (!euTonsOverridden) adj.euTons = NaN;

    const k = computeKPIs(adj);

    setText("scnCp", Number.isFinite(adj.cp) ? formatSmart(adj.cp) : "—");
    setText("scnInt", Number.isFinite(adj.intensity) ? formatSmart(adj.intensity) : "—");
    setText("scnAnnual", k.ok ? formatSmart(k.net) : "—");
    setText("scnPerTon", k.ok ? formatSmart(k.perTon) : "—");
  }

  function applyAll() {
    syncUIToInputs();
    autoCalcEuTons();
    const k = computeKPIs(state.inputs);
    renderKPIs(k);
    renderScenario(state.scenario);
    writeUrlState();
    setStatus(k.ok ? "Calculated." : "Missing/invalid inputs — check EU tons, intensity, carbon price.");
  }

  // ---------- Buttons ----------
  async function copyShareLink() {
    writeUrlState();
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus("Share link copied.");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = window.location.href;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      setStatus("Share link copied (fallback).");
    }
  }

  function downloadCSV() {
    syncUIToInputs();
    autoCalcEuTons();

    const base = computeKPIs(state.inputs);
    const cons = computeKPIs(scenarioAdjust(state.inputs, "conservative"));
    const stress = computeKPIs(scenarioAdjust(state.inputs, "stress"));

    const fx = Number.isFinite(state.inputs.eurusd) ? state.inputs.eurusd : "";

    const rows = [
      ["CBAM Board View", VERSION],
      ["Route", state.inputs.route || ""],
      [],
      ["Inputs"],
      ["Total production (t/y)", state.inputs.totalProd || ""],
      ["EU share (%)", state.inputs.euShare || ""],
      ["EU tons (t/y)", Number.isFinite(base.euTons) ? base.euTons : ""],
      ["Intensity (tCO2/t)", state.inputs.intensity || ""],
      ["Carbon price (EUR/tCO2)", state.inputs.cp || ""],
      ["Exemptions (%)", state.inputs.exempt || ""],
      ["FX EUR/USD (optional)", fx],
      [],
      ["Scenario","Carbon price","Intensity","EU tons","Covered emissions (tCO2)","Gross EUR/yr","Net EUR/yr","EUR per ton"],
      row("Base", base, state.inputs.cp, state.inputs.intensity),
      row("Conservative", cons, scenarioAdjust(state.inputs,"conservative").cp, scenarioAdjust(state.inputs,"conservative").intensity),
      row("Stress", stress, scenarioAdjust(state.inputs,"stress").cp, scenarioAdjust(state.inputs,"stress").intensity),
    ];

    const csv = rows.map(r => r.map(cell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `cbam-board-view-${VERSION}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus("CSV downloaded.");

    function row(name, k, cp, intensity){
      if (!k.ok) return [name, cp||"", intensity||"", "", "", "", "", ""].map(cell);
      return [name, cp, intensity, k.euTons, k.emissions, k.gross, k.net, k.perTon].map(cell);
    }

    function cell(v){
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
    }
  }

  function toggleInputs() {
    const hidden = dom.inputsPanel.getAttribute("aria-hidden") === "true";
    dom.inputsPanel.setAttribute("aria-hidden", hidden ? "false" : "true");
    dom.inputsPanel.style.display = hidden ? "" : "none";
    setStatus(hidden ? "Inputs opened." : "Inputs hidden.");
  }

  function resetAll() {
    state.inputs = { ...DEFAULTS };
    euTonsOverridden = false;
    syncInputsToUI();
    autoCalcEuTons();
    renderKPIs({ ok:false });
    renderScenario(state.scenario);
    writeUrlState();
    setStatus("Reset to defaults.");
  }

  function bindScenarioButtons() {
    const btns = Array.from(document.querySelectorAll(".seg__btn"));
    btns.forEach((b) => {
      b.addEventListener("click", () => {
        btns.forEach(x => x.classList.remove("is-active"));
        b.classList.add("is-active");
        state.scenario = b.dataset.scn || "base";
        renderScenario(state.scenario);
        setStatus(`Scenario: ${state.scenario}`);
      });
    });
  }

  function init() {
    hardCheckIds();

    readUrlState();
    syncInputsToUI();
    autoCalcEuTons();

    bindScenarioButtons();

    dom.btnApply.addEventListener("click", applyAll);
    dom.btnReset.addEventListener("click", resetAll);
    dom.btnToggleInputs.addEventListener("click", toggleInputs);
    dom.btnCopyLink.addEventListener("click", copyShareLink);
    dom.btnCsv.addEventListener("click", downloadCSV);
    dom.btnPrint.addEventListener("click", () => window.print());

    renderKPIs({ ok:false });
    renderScenario(state.scenario);

    // ✅ This line confirms JS is running
    setStatus("JS loaded. Enter inputs then Apply.");
  }

  window.addEventListener("DOMContentLoaded", async () => {
    await nukePwaCaches();
    init();
  });
})();
