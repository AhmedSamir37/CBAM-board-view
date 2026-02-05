/* CBAM Board View — script.js (v3, clean)
   - Robust bindings (works even if some button ids differ)
   - Apply/Reset + auto-calc EU tons
   - KPI updates + scenarios (Base/Conservative/Stress)
   - Shareable URL state + Copy link
   - CSV export + Print
   - PWA install prompt (optional)
*/

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);

  function num(v, fallback = 0) {
    if (v === null || v === undefined) return fallback;
    const s = String(v).trim();
    if (!s) return fallback;
    const x = Number(s);
    return Number.isFinite(x) ? x : fallback;
    // NOTE: we avoid locale parsing. Inputs should be dot-decimal.
  }

  function clamp(x, min, max) {
    return Math.max(min, Math.min(max, x));
  }

  function fmtInt(x) {
    const n = Math.round(num(x, 0));
    return n.toLocaleString("en-US");
  }

  function fmt2(x) {
    const n = num(x, 0);
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmt0(x) {
    const n = num(x, 0);
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  function setText(el, value) {
    if (!el) return;
    el.textContent = value;
  }

  function safeQS(sel, root = document) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function safeQSA(sel, root = document) {
    try { return Array.from(root.querySelectorAll(sel)); } catch { return []; }
  }

  // Find a button in a panel by its visible text (fallback if no id)
  function findButtonByText(text) {
    const btns = safeQSA("button");
    const t = text.toLowerCase();
    return btns.find(b => (b.textContent || "").trim().toLowerCase() === t) || null;
  }

  // ---------- Elements (inputs) ----------
  const elTotalProd = $("totalProd");
  const elEuShare   = $("euShare");
  const elEuTons    = $("euTons");
  const elIntensity = $("intensity");
  const elCp        = $("cp");
  const elExempt    = $("exempt");
  const elEurusd    = $("eurusd");
  const elRoute     = $("route");

  // Panels / controls
  const inputsPanel = $("inputsPanel");
  const btnToggleInputs = $("btnToggleInputs") || findButtonByText("Edit inputs");
  const btnCopyLink = $("btnCopyLink") || findButtonByText("Copy share link");
  const btnCsv      = $("btnCsv") || findButtonByText("Download CSV");
  const btnPrint    = $("btnPrint") || findButtonByText("Print / Save PDF");
  const btnInstall  = $("btnInstall") || findButtonByText("Install");

  // Apply/Reset (try ids first, otherwise match by text)
  const btnApply = $("btnApply") || findButtonByText("Apply");
  const btnReset = $("btnReset") || findButtonByText("Reset");

  // ---------- KPI output elements ----------
  const outAnnual     = $("kpiAnnual");
  const outAnnualSub  = $("kpiAnnualSub");
  const outPerTon     = $("kpiPerTon");
  const outPerTonSub  = $("kpiPerTonSub");
  const outEmissions  = $("kpiEmissions");
  const outEmissSub   = $("kpiEmissionsSub");
  const outNet        = $("kpiNet");
  const outNetSub     = $("kpiNetSub");

  // Scenario output tiles/cards
  const outScnCp     = $("scnCp");
  const outScnInt    = $("scnInt");
  const outScnAnnual = $("scnAnnual");
  const outScnPerTon = $("scnPerTon");

  // Scenario buttons (segmented)
  const scnBtns = safeQSA('[data-scn]'); // expects data-scn="base|conservative|stress"

  // ---------- State ----------
  let euTonsManual = false;
  let activeScenario = "base";

  // Base calculations bundle
  function computeBase() {
    const totalProd = clamp(num(elTotalProd?.value, 0), 0, 1e12);
    const euShare   = clamp(num(elEuShare?.value, 0),   0, 100);
    const intensity = clamp(num(elIntensity?.value, 0), 0, 1e6);
    const cp        = clamp(num(elCp?.value, 0),        0, 1e6);
    const exempt    = clamp(num(elExempt?.value, 0),    0, 100);

    // EU tons: either manual or auto
    let euTonsVal = num(elEuTons?.value, 0);
    const euTonsAuto = totalProd * (euShare / 100);

    if (!euTonsManual) {
      euTonsVal = euTonsAuto;
      if (elEuTons) elEuTons.value = euTonsVal ? fmt0(euTonsVal).replace(/,/g, "") : "";
    }

    const emissions = euTonsVal * intensity;            // tCO2
    const gross     = emissions * cp;                   // €
    const net       = gross * (1 - exempt / 100);       // €
    const perTon    = euTonsVal > 0 ? (net / euTonsVal) : 0;

    const route     = (elRoute?.value || "").trim();
    const eurusd    = num(elEurusd?.value, 0);

    return {
      totalProd, euShare, euTons: euTonsVal, euTonsAuto,
      intensity, cp, exempt,
      emissions, gross, net, perTon,
      route, eurusd
    };
  }

  function scenarioFromBase(base, which) {
    // Working model (not “regulation-accurate”): scenario stress-testing multipliers.
    // Conservative: lower ETS + improved intensity
    // Stress: higher ETS + worse intensity
    const m = {
      base:         { cp: 1.00, intensity: 1.00, annual: 1.00 },
      conservative: { cp: 0.85, intensity: 0.92, annual: 0.78 },
      stress:       { cp: 1.25, intensity: 1.10, annual: 1.45 },
    }[which] || { cp: 1, intensity: 1, annual: 1 };

    const scnCp = base.cp * m.cp;
    const scnInt = base.intensity * m.intensity;

    // recompute emissions + € using same EU tons and exemptions
    const emissions = base.euTons * scnInt;
    const gross = emissions * scnCp;
    const net = gross * (1 - base.exempt / 100);

    // for “annual exposure” scenario tile, apply annual multiplier as extra stress-testing knob
    const annual = net * m.annual;
    const perTon = base.euTons > 0 ? (annual / base.euTons) : 0;

    return { scnCp, scnInt, annual, perTon };
  }

  // ---------- Rendering ----------
  function renderKPIs(base) {
    const hasInputs = base.euTons > 0 && base.intensity > 0 && base.cp > 0;

    if (!hasInputs) {
      setText(outAnnual, "—");
      setText(outPerTon, "—");
      setText(outEmissions, "—");
      setText(outNet, "—");
      setText(outAnnualSub, "Enter inputs then Apply");
      setText(outPerTonSub, "—");
      setText(outEmissSub, "—");
      setText(outNetSub, "—");
      return;
    }

    setText(outAnnual, fmt0(base.gross));
    setText(outPerTon, fmt2(base.perTon));
    setText(outEmissions, fmt0(base.emissions));
    setText(outNet, fmt0(base.net));

    setText(outAnnualSub, `EU tons: ${fmt0(base.euTons)} t/y · Exemptions: ${fmt2(base.exempt)}%`);
    setText(outPerTonSub, "Net ÷ EU tons");
    setText(outEmissSub, "EU tons × intensity");
    setText(outNetSub, "Gross × (1 − exemptions)");
  }

  function renderScenarioTiles(base) {
    const s = scenarioFromBase(base, activeScenario);
    setText(outScnCp, fmt2(s.scnCp));
    setText(outScnInt, fmt2(s.scnInt));
    setText(outScnAnnual, fmt0(s.annual));
    setText(outScnPerTon, fmt2(s.perTon));
  }

  function setActiveScenario(which) {
    activeScenario = which || "base";
    scnBtns.forEach(btn => {
      const b = btn;
      const isActive = (b.getAttribute("data-scn") === activeScenario);
      b.classList.toggle("is-active", isActive);
      b.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  // ---------- URL state (share link) ----------
  function buildState(base) {
    return {
      tp: base.totalProd,
      eu: base.euShare,
      eut: base.euTons,
      man: euTonsManual ? 1 : 0,
      i: base.intensity,
      cp: base.cp,
      ex: base.exempt,
      fx: base.eurusd || "",
      r: base.route || "",
      scn: activeScenario || "base"
    };
  }

  function applyStateToInputs(st) {
    if (!st) return;

    if (elTotalProd && st.tp !== undefined) elTotalProd.value = String(st.tp);
    if (elEuShare   && st.eu !== undefined) elEuShare.value   = String(st.eu);

    euTonsManual = String(st.man || "0") === "1";
    if (elEuTons && st.eut !== undefined) elEuTons.value = String(st.eut);

    if (elIntensity && st.i  !== undefined)  elIntensity.value = String(st.i);
    if (elCp        && st.cp !== undefined)  elCp.value        = String(st.cp);
    if (elExempt    && st.ex !== undefined)  elExempt.value    = String(st.ex);

    if (elEurusd && st.fx !== undefined) elEurusd.value = String(st.fx);
    if (elRoute  && st.r  !== undefined) elRoute.value  = String(st.r);

    setActiveScenario(st.scn || "base");
  }

  function stateToQuery(st) {
    const p = new URLSearchParams();
    Object.entries(st).forEach(([k, v]) => {
      if (v === "" || v === null || v === undefined) return;
      p.set(k, String(v));
    });
    return p.toString();
  }

  function queryToState() {
    const p = new URLSearchParams(window.location.search);
    if (![...p.keys()].length) return null;

    const st = {
      tp: p.get("tp"),
      eu: p.get("eu"),
      eut: p.get("eut"),
      man: p.get("man"),
      i: p.get("i"),
      cp: p.get("cp"),
      ex: p.get("ex"),
      fx: p.get("fx"),
      r: p.get("r"),
      scn: p.get("scn"),
    };

    // convert numeric strings where relevant
    ["tp","eu","eut","i","cp","ex","fx"].forEach(k => {
      if (st[k] === null || st[k] === "") return;
      const v = Number(st[k]);
      if (Number.isFinite(v)) st[k] = v;
    });

    return st;
  }

  function replaceUrlWithState(base) {
    const st = buildState(base);
    const q = stateToQuery(st);
    const url = q ? `${window.location.pathname}?${q}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }

  // ---------- Actions ----------
  function doApply() {
    const base = computeBase();
    renderKPIs(base);
    renderScenarioTiles(base);
    replaceUrlWithState(base);

    // Small UX: show "Updated." if any element exists with that text target
    const ready = safeQS(".status") || safeQS(".ready") || safeQS("[data-status]");
    if (ready) setText(ready, "Updated.");
  }

  function doReset() {
    euTonsManual = false;
    activeScenario = "base";
    setActiveScenario("base");

    if (elTotalProd) elTotalProd.value = "";
    if (elEuShare)   elEuShare.value = "";
    if (elEuTons)    elEuTons.value = "";
    if (elIntensity) elIntensity.value = "";
    if (elCp)        elCp.value = "";
    if (elExempt)    elExempt.value = "";
    if (elEurusd)    elEurusd.value = "";
    if (elRoute)     elRoute.value = "";

    // clear URL
    window.history.replaceState(null, "", window.location.pathname);

    // clear outputs
    renderKPIs({ euTons: 0, intensity: 0, cp: 0, gross: 0, perTon: 0, emissions: 0, net: 0, exempt: 0 });
    renderScenarioTiles({ cp: 0, intensity: 0, euTons: 0, exempt: 0 });

    // close inputs if panel exists and is open
    if (inputsPanel) {
      inputsPanel.setAttribute("aria-hidden", "true");
    }
  }

  async function copyShareLink() {
    const base = computeBase();
    const st = buildState(base);
    const q = stateToQuery(st);
    const full = `${window.location.origin}${window.location.pathname}${q ? "?" + q : ""}`;
    try {
      await navigator.clipboard.writeText(full);
      // Optional: quick feedback
      if (btnCopyLink) {
        const old = btnCopyLink.textContent;
        btnCopyLink.textContent = "Copied ✓";
        setTimeout(() => { btnCopyLink.textContent = old; }, 900);
      }
    } catch {
      // fallback prompt
      window.prompt("Copy this link:", full);
    }
  }

  function downloadCSV() {
    const base = computeBase();
    const sBase = scenarioFromBase(base, "base");
    const sCon  = scenarioFromBase(base, "conservative");
    const sStr  = scenarioFromBase(base, "stress");

    const rows = [
      ["Field", "Value", "Unit/Note"],
      ["Total production", base.totalProd, "t/y"],
      ["EU share", base.euShare, "%"],
      ["EU tons", base.euTons, "t/y"],
      ["Emissions intensity", base.intensity, "tCO2/t exported"],
      ["Carbon price", base.cp, "€/tCO2"],
      ["Exemptions / free allocation", base.exempt, "%"],
      ["FX EUR/USD (optional)", base.eurusd || "", "display-only"],
      ["Route label", base.route || "", ""],
      ["---", "", ""],
      ["Annual CBAM exposure (gross)", base.gross, "€/year"],
      ["Covered emissions (gross)", base.emissions, "tCO2"],
      ["Net exposure after exemptions", base.net, "€/year"],
      ["CBAM cost per ton exported", base.perTon, "€/t"],
      ["--- Scenarios (stress-test model) ---", "", ""],
      ["Base: carbon price", sBase.scnCp, "€/tCO2"],
      ["Base: intensity", sBase.scnInt, "tCO2/t"],
      ["Base: annual exposure", sBase.annual, "€/year"],
      ["Base: €/t exported", sBase.perTon, "€/t"],
      ["Conservative: carbon price", sCon.scnCp, "€/tCO2"],
      ["Conservative: intensity", sCon.scnInt, "tCO2/t"],
      ["Conservative: annual exposure", sCon.annual, "€/year"],
      ["Conservative: €/t exported", sCon.perTon, "€/t"],
      ["Stress: carbon price", sStr.scnCp, "€/tCO2"],
      ["Stress: intensity", sStr.scnInt, "tCO2/t"],
      ["Stress: annual exposure", sStr.annual, "€/year"],
      ["Stress: €/t exported", sStr.perTon, "€/t"],
    ];

    const csv = rows
      .map(r => r.map(x => {
        const s = String(x ?? "");
        // quote if contains comma/quote/newline
        if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      }).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "cbam-board-view.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function toggleInputsPanel() {
    if (!inputsPanel) return;
    const hidden = inputsPanel.getAttribute("aria-hidden") !== "false";
    inputsPanel.setAttribute("aria-hidden", hidden ? "false" : "true");
  }

  // ---------- PWA install ----------
  let deferredPrompt = null;

  function setupPwaInstall() {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (btnInstall) btnInstall.hidden = false;
    });

    if (btnInstall) {
      btnInstall.addEventListener("click", async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        try { await deferredPrompt.userChoice; } catch {}
        deferredPrompt = null;
        btnInstall.hidden = true;
      });
    }
  }

  // ---------- Bind events ----------
  function bind() {
    // Track manual override on EU tons
    if (elEuTons) {
      elEuTons.addEventListener("input", () => {
        const v = String(elEuTons.value || "").trim();
        euTonsManual = v.length > 0; // if user typed something, treat as manual
      });
    }

    // If totalProd / euShare changed and not manual -> auto-update euTons live (optional)
    const recalcEuTonsLive = () => {
      if (!elEuTons || euTonsManual) return;
      const tp = num(elTotalProd?.value, 0);
      const eu = num(elEuShare?.value, 0);
      const auto = tp * (eu / 100);
      elEuTons.value = auto ? fmt0(auto).replace(/,/g, "") : "";
    };

    elTotalProd?.addEventListener("input", recalcEuTonsLive);
    elEuShare?.addEventListener("input", recalcEuTonsLive);

    // Buttons
    btnApply?.addEventListener("click", (e) => { e.preventDefault(); doApply(); });
    btnReset?.addEventListener("click", (e) => { e.preventDefault(); doReset(); });

    btnToggleInputs?.addEventListener("click", (e) => { e.preventDefault(); toggleInputsPanel(); });
    btnCopyLink?.addEventListener("click", (e) => { e.preventDefault(); copyShareLink(); });
    btnCsv?.addEventListener("click", (e) => { e.preventDefault(); downloadCSV(); });
    btnPrint?.addEventListener("click", (e) => { e.preventDefault(); window.print(); });

    // Scenario switching
    scnBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const which = btn.getAttribute("data-scn") || "base";
        setActiveScenario(which);
        doApply(); // re-render with active scenario + update share URL
      });
    });
  }

  // ---------- Init ----------
  function init() {
    // Restore state from URL (if present)
    const st = queryToState();
    if (st) applyStateToInputs(st);

    // Ensure scenario buttons reflect current state
    setActiveScenario(activeScenario);

    // First render (without forcing “Apply” requirement)
    // But we keep “—” if incomplete.
    doApply();

    // Bind events last
    bind();

    // PWA install
    setupPwaInstall();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
