/* CBAM Board View — script.js (v20260205v3)
   Logic:
   - Inputs -> KPIs:
     EU tons = totalProd * euShare/100 (unless overridden by euTons field)
     coveredEmissions = euTons * intensity
     grossExposureEUR = coveredEmissions * carbonPrice
     netExposureEUR = grossExposureEUR * (1 - exemptions/100)
     perTonEUR = netExposureEUR / euTons
   - Scenarios (base / conservative / stress) are simple multipliers.
   - URL state: writes/reads query params for shareability.
*/

(() => {
  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  const num = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : NaN;
  };

  const parseField = (el, fallback = NaN) => {
    if (!el) return fallback;
    const v = num((el.value ?? "").toString().trim());
    return Number.isFinite(v) ? v : fallback;
  };

  const fmtInt = (v) => {
    if (!Number.isFinite(v)) return "—";
    return Math.round(v).toLocaleString("en-US");
  };

  const fmt2 = (v) => {
    if (!Number.isFinite(v)) return "—";
    return (Math.round(v * 100) / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const setText = (el, text) => {
    if (el) el.textContent = text;
  };

  const setReady = (msg = "Ready.") => setText($("statusText"), msg);

  // ---------- DOM ----------
  const els = {
    totalProd: $("totalProd"),
    euShare: $("euShare"),
    euTons: $("euTons"),
    intensity: $("intensity"),
    cp: $("cp"),
    exempt: $("exempt"),
    eurusd: $("eurusd"),
    route: $("route"),

    applyBtn: $("applyBtn"),
    resetBtn: $("resetBtn"),

    // top buttons
    btnToggleInputs: $("btnToggleInputs"),
    btnCopyLink: $("btnCopyLink"),
    btnCsv: $("btnCsv"),
    btnPrint: $("btnPrint"),

    // panels
    inputsPanel: $("inputsPanel"),

    // KPIs
    kpiAnnual: $("kpiAnnual"),
    kpiAnnualSub: $("kpiAnnualSub"),
    kpiPerTon: $("kpiPerTon"),
    kpiPerTonSub: $("kpiPerTonSub"),
    kpiEmissions: $("kpiEmissions"),
    kpiEmissionsSub: $("kpiEmissionsSub"),
    kpiNet: $("kpiNet"),
    kpiNetSub: $("kpiNetSub"),

    // Scenario chips + values
    scnButtons: Array.from(document.querySelectorAll(".seg__btn")),
    scnCp: $("scnCp"),
    scnInt: $("scnInt"),
    scnAnnual: $("scnAnnual"),
    scnPerTon: $("scnPerTon"),
  };

  // ---------- scenario model ----------
  // Simple stress-testing multipliers (you can tune later).
  const SCENARIOS = {
    base: { cp: 1.0, intensity: 1.0 },
    conservative: { cp: 0.85, intensity: 0.92 },
    stress: { cp: 1.25, intensity: 1.10 },
  };

  let currentScenario = "base";
  let lastComputed = null;

  // ---------- core compute ----------
  function computeFromInputs() {
    const totalProd = Math.max(0, parseField(els.totalProd, 0));
    const euShare = clamp(parseField(els.euShare, 0), 0, 100);
    const intensity = Math.max(0, parseField(els.intensity, NaN));
    const cp = Math.max(0, parseField(els.cp, NaN));
    const exempt = clamp(parseField(els.exempt, 0), 0, 100);
    const eurusd = parseField(els.eurusd, NaN); // optional, not used in math
    const route = (els.route?.value ?? "").toString().trim();

    // EU tons: auto unless user overrides with a valid number
    const autoEuTons = totalProd * (euShare / 100);
    const userEuTons = parseField(els.euTons, NaN);
    const euTons = Number.isFinite(userEuTons) && userEuTons >= 0 ? userEuTons : autoEuTons;

    // Validate required fields for calc
    const ok = euTons > 0 && Number.isFinite(intensity) && Number.isFinite(cp);

    if (!ok) {
      return {
        ok: false,
        totalProd,
        euShare,
        euTons,
        intensity,
        cp,
        exempt,
        eurusd,
        route,
      };
    }

    const coveredEmissions = euTons * intensity; // tCO2
    const grossExposure = coveredEmissions * cp; // EUR
    const netExposure = grossExposure * (1 - exempt / 100); // EUR
    const perTon = netExposure / euTons; // EUR/t

    return {
      ok: true,
      totalProd,
      euShare,
      euTons,
      intensity,
      cp,
      exempt,
      eurusd,
      route,

      coveredEmissions,
      grossExposure,
      netExposure,
      perTon,
    };
  }

  function renderKPIs(res) {
    if (!res.ok) {
      setText(els.kpiAnnual, "—");
      setText(els.kpiPerTon, "—");
      setText(els.kpiEmissions, "—");
      setText(els.kpiNet, "—");

      setText(els.kpiAnnualSub, "Enter inputs then Apply");
      setText(els.kpiPerTonSub, "—");
      setText(els.kpiEmissionsSub, "—");
      setText(els.kpiNetSub, "—");
      return;
    }

    setText(els.kpiAnnual, fmtInt(res.grossExposure));
    setText(els.kpiNet, fmtInt(res.netExposure));
    setText(els.kpiPerTon, fmt2(res.perTon));
    setText(els.kpiEmissions, fmtInt(res.coveredEmissions));

    // Subs
    setText(
      els.kpiAnnualSub,
      `EU tons: ${fmtInt(res.euTons)} t/y · Exemptions: ${fmt2(res.exempt)}%`
    );
    setText(els.kpiEmissionsSub, "EU tons × intensity");
    setText(els.kpiNetSub, "Gross × (1 − exemptions)");
    setText(els.kpiPerTonSub, "Net ÷ EU tons");
  }

  function applyScenario(res, scnKey) {
    const scn = SCENARIOS[scnKey] ?? SCENARIOS.base;

    if (!res.ok) {
      return { ok: false };
    }

    const scnCp = res.cp * scn.cp;
    const scnInt = res.intensity * scn.intensity;

    const coveredEmissions = res.euTons * scnInt;
    const grossExposure = coveredEmissions * scnCp;
    const netExposure = grossExposure * (1 - res.exempt / 100);
    const perTon = netExposure / res.euTons;

    return {
      ok: true,
      scnCp,
      scnInt,
      grossExposure,
      netExposure,
      perTon,
    };
  }

  function renderScenario(res, scnKey) {
    const out = applyScenario(res, scnKey);
    if (!out.ok) {
      setText(els.scnCp, "—");
      setText(els.scnInt, "—");
      setText(els.scnAnnual, "—");
      setText(els.scnPerTon, "—");
      return;
    }

    setText(els.scnCp, fmt2(out.scnCp));
    setText(els.scnInt, fmt2(out.scnInt));
    setText(els.scnAnnual, fmtInt(out.netExposure)); // show net for scenario
    setText(els.scnPerTon, fmt2(out.perTon));
  }

  // ---------- URL state ----------
  function writeUrlState(res) {
    // Keep minimal but useful state
    const p = new URLSearchParams();

    if (Number.isFinite(res.totalProd)) p.set("p", String(Math.round(res.totalProd)));
    if (Number.isFinite(res.euShare)) p.set("s", String(res.euShare));
    if (Number.isFinite(res.euTons)) p.set("e", String(Math.round(res.euTons)));
    if (Number.isFinite(res.intensity)) p.set("i", String(res.intensity));
    if (Number.isFinite(res.cp)) p.set("c", String(Math.round(res.cp)));
    if (Number.isFinite(res.exempt)) p.set("x", String(res.exempt));
    if (Number.isFinite(res.eurusd)) p.set("fx", String(res.eurusd));
    if (res.route) p.set("r", res.route);
    p.set("scn", currentScenario);

    const newUrl = `${location.pathname}?${p.toString()}`;
    history.replaceState(null, "", newUrl);
  }

  function readUrlState() {
    const p = new URLSearchParams(location.search);

    const setIf = (el, v) => {
      if (!el) return;
      if (v !== null && v !== undefined && v !== "") el.value = v;
    };

    setIf(els.totalProd, p.get("p"));
    setIf(els.euShare, p.get("s"));
    setIf(els.euTons, p.get("e"));
    setIf(els.intensity, p.get("i"));
    setIf(els.cp, p.get("c"));
    setIf(els.exempt, p.get("x"));
    setIf(els.eurusd, p.get("fx"));
    setIf(els.route, p.get("r"));

    const scn = p.get("scn");
    if (scn && SCENARIOS[scn]) currentScenario = scn;
  }

  // ---------- actions ----------
  function syncAutoEuTonsIfNeeded() {
    // Only auto-fill euTons if field is empty OR equals old auto roughly.
    const totalProd = Math.max(0, parseField(els.totalProd, 0));
    const euShare = clamp(parseField(els.euShare, 0), 0, 100);
    const autoEuTons = totalProd * (euShare / 100);

    const raw = (els.euTons?.value ?? "").toString().trim();
    const v = num(raw);

    // If empty -> fill
    if (!raw) {
      if (els.euTons) els.euTons.value = autoEuTons ? String(Math.round(autoEuTons)) : "";
      return;
    }

    // If user wrote something, do not override.
    if (Number.isFinite(v)) return;
  }

  function onApply() {
    // ensure euTons auto-fills if empty
    syncAutoEuTonsIfNeeded();

    const res = computeFromInputs();
    lastComputed = res;

    renderKPIs(res);
    renderScenario(res, currentScenario);

    if (res.ok) {
      writeUrlState(res);
      setReady("Updated.");
    } else {
      setReady("Missing required inputs (EU tons, intensity, carbon price).");
    }
  }

  function onReset() {
    if (els.totalProd) els.totalProd.value = "";
    if (els.euShare) els.euShare.value = "";
    if (els.euTons) els.euTons.value = "";
    if (els.intensity) els.intensity.value = "";
    if (els.cp) els.cp.value = "";
    if (els.exempt) els.exempt.value = "";
    if (els.eurusd) els.eurusd.value = "";
    if (els.route) els.route.value = "";

    currentScenario = "base";
    setScenarioActiveUI();

    lastComputed = null;
    renderKPIs({ ok: false });
    renderScenario({ ok: false }, currentScenario);

    history.replaceState(null, "", location.pathname);
    setReady("Ready.");
  }

  function setScenarioActiveUI() {
    els.scnButtons.forEach((b) => {
      const k = b.getAttribute("data-scn");
      if (k === currentScenario) b.classList.add("is-active");
      else b.classList.remove("is-active");
    });
  }

  function onScenarioClick(ev) {
    const btn = ev.currentTarget;
    const k = btn.getAttribute("data-scn");
    if (!k || !SCENARIOS[k]) return;

    currentScenario = k;
    setScenarioActiveUI();

    const res = lastComputed ?? computeFromInputs();
    lastComputed = res;

    // scenario does not change base KPIs, only scenario cards
    renderScenario(res, currentScenario);

    if (res.ok) writeUrlState(res);
    setReady(`Scenario: ${currentScenario}`);
  }

  function onToggleInputs() {
    const panel = els.inputsPanel;
    if (!panel) return;

    const hidden = panel.getAttribute("aria-hidden") === "true";
    panel.setAttribute("aria-hidden", hidden ? "false" : "true");
    panel.style.display = hidden ? "" : "none";
  }

  async function onCopyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      setReady("Share link copied.");
    } catch {
      // fallback
      const tmp = document.createElement("textarea");
      tmp.value = location.href;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand("copy");
      tmp.remove();
      setReady("Share link copied.");
    }
  }

  function onPrint() {
    window.print();
  }

  function buildCsvRow(res) {
    // Core KPIs in EUR. FX only for optional USD display.
    const fx = Number.isFinite(res.eurusd) && res.eurusd > 0 ? res.eurusd : NaN;
    const usdNet = Number.isFinite(fx) ? res.netExposure * fx : NaN;

    return {
      route: res.route || "",
      scenario: currentScenario,
      totalProd_t_y: res.totalProd,
      euShare_pct: res.euShare,
      euTons_t_y: res.euTons,
      intensity_tco2_per_t: res.intensity,
      carbonPrice_eur_per_tco2: res.cp,
      exemptions_pct: res.exempt,
      coveredEmissions_tco2: res.coveredEmissions,
      grossExposure_eur: res.grossExposure,
      netExposure_eur: res.netExposure,
      perTon_eur_per_t: res.perTon,
      fx_eurusd_optional: Number.isFinite(res.eurusd) ? res.eurusd : "",
      netExposure_usd_optional: Number.isFinite(usdNet) ? usdNet : "",
    };
  }

  function downloadCsv() {
    const res = lastComputed ?? computeFromInputs();
    if (!res.ok) {
      setReady("Apply valid inputs first, then export CSV.");
      return;
    }

    const row = buildCsvRow(res);
    const headers = Object.keys(row);
    const values = headers.map((h) => {
      const v = row[h];
      if (v === null || v === undefined) return "";
      const s = String(v);
      // CSV escape
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });

    const csv = `${headers.join(",")}\n${values.join(",")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cbam_board_view_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setReady("CSV downloaded.");
  }

  // ---------- wire events ----------
  function bindEvents() {
    // Apply / Reset
    els.applyBtn?.addEventListener("click", onApply);
    els.resetBtn?.addEventListener("click", onReset);

    // Auto EU tons when production/share changes (only if EU tons empty)
    els.totalProd?.addEventListener("input", () => syncAutoEuTonsIfNeeded());
    els.euShare?.addEventListener("input", () => syncAutoEuTonsIfNeeded());

    // Scenario buttons
    els.scnButtons.forEach((b) => b.addEventListener("click", onScenarioClick));

    // Top buttons
    els.btnToggleInputs?.addEventListener("click", onToggleInputs);
    els.btnCopyLink?.addEventListener("click", onCopyLink);
    els.btnCsv?.addEventListener("click", downloadCsv);
    els.btnPrint?.addEventListener("click", onPrint);

    // Enter key triggers Apply (nice on tablets)
    [
      els.totalProd,
      els.euShare,
      els.euTons,
      els.intensity,
      els.cp,
      els.exempt,
      els.eurusd,
      els.route,
    ].forEach((el) => {
      el?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") onApply();
      });
    });
  }

  // ---------- init ----------
  function init() {
    readUrlState();
    setScenarioActiveUI();
    bindEvents();

    // Try initial compute if URL has enough
    const res = computeFromInputs();
    lastComputed = res;

    renderKPIs(res);
    renderScenario(res, currentScenario);

    // keep euTons auto if blank
    syncAutoEuTonsIfNeeded();

    setReady("Ready.");
  }

  // Ensure DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
