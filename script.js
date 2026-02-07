"use strict";

/**
 * CBAM Board View — script.js (Rebuild clean)
 * Matches provided index.html IDs:
 * Inputs: totalProd, euShare, euTons, intensity, cp, exempt, eurusd, route
 * Buttons: btnToggleInputs, btnCopyLink, btnCsv, btnPrint, btnInstall, btnApply, btnReset, btnGuide (optional)
 * Panels: inputsPanel, statusText
 * KPIs: kpiAnnual, kpiPerTon, kpiTco2, kpiNet, kpiAnnualNote
 * Scenarios: buttons [data-scn], outputs scnCp, scnInt, scnAnnual, scnPerTon
 */

const $ = (id) => document.getElementById(id);

const el = {
  // inputs
  totalProd: $("totalProd"),
  euShare: $("euShare"),
  euTons: $("euTons"),
  intensity: $("intensity"),
  cp: $("cp"),
  exempt: $("exempt"),
  eurusd: $("eurusd"),
  route: $("route"),

  // top buttons
  btnToggleInputs: $("btnToggleInputs"),
  btnCopyLink: $("btnCopyLink"),
  btnCsv: $("btnCsv"),
  btnPrint: $("btnPrint"),
  btnInstall: $("btnInstall"),
  btnGuide: $("btnGuide"), // optional

  // panel buttons
  btnApply: $("btnApply"),
  btnReset: $("btnReset"),

  // panels/status
  inputsPanel: $("inputsPanel"),
  statusText: $("statusText"),

  // KPIs
  kpiAnnual: $("kpiAnnual"),
  kpiPerTon: $("kpiPerTon"),
  kpiTco2: $("kpiTco2"),
  kpiNet: $("kpiNet"),
  kpiAnnualNote: $("kpiAnnualNote"),

  // scenario outputs
  scnCp: $("scnCp"),
  scnInt: $("scnInt"),
  scnAnnual: $("scnAnnual"),
  scnPerTon: $("scnPerTon"),
};

const STORAGE_KEY = "cbam_board_view_v31";
let currentScenario = "base";
let euTonsOverridden = false;

// Scenarios are multipliers applied to Base inputs
const SCENARIOS = {
  base: { cpMult: 1.0, intMult: 1.0 },
  conservative: { cpMult: 0.85, intMult: 0.92 },
  stress: { cpMult: 1.25, intMult: 1.15 },
};

function isNum(n) {
  return Number.isFinite(n);
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  n = num(n, min);
  return Math.min(Math.max(n, min), max);
}

function fmtNumber(n, decimals = 0) {
  if (!isNum(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function setStatus(msg) {
  if (el.statusText) el.statusText.textContent = msg;
}

function setText(node, text) {
  if (node) node.textContent = text;
}

function getInputsRaw() {
  const totalProd = clamp(num(el.totalProd?.value), 0, 1e12);
  const euShare = clamp(num(el.euShare?.value), 0, 100);
  let euTons = clamp(num(el.euTons?.value), 0, 1e12);

  const intensity = clamp(num(el.intensity?.value), 0, 1000);
  const cp = clamp(num(el.cp?.value), 0, 1e6);
  const exempt = clamp(num(el.exempt?.value), 0, 100);
  const eurusd = clamp(num(el.eurusd?.value), 0, 1000);

  const route = String(el.route?.value || "").trim();

  // If EU tons not overridden, auto-calc
  const autoEuTons = totalProd * (euShare / 100);
  if (!euTonsOverridden) euTons = autoEuTons;

  return {
    totalProd,
    euShare,
    euTons,
    intensity,
    cp,
    exempt,
    eurusd,
    route,
    // helpful
    autoEuTons,
  };
}

function readInputsAndSoftFill() {
  const i = getInputsRaw();

  // Soft-fill EU tons field only when not overridden
  if (el.euTons && !euTonsOverridden) {
    // show a rounded value but keep numeric
    el.euTons.value = i.autoEuTons ? String(Math.round(i.autoEuTons)) : "";
  }

  return i;
}

function hasEnough(i) {
  // Minimum requirements to compute:
  // need EU tons, intensity, carbon price
  return i.euTons > 0 && i.intensity > 0 && i.cp >= 0;
}

function calcKPIs(i) {
  const coveredTco2 = i.euTons * i.intensity; // tCO2
  const grossAnnual = coveredTco2 * i.cp; // €/year
  const netAnnual = grossAnnual * (1 - i.exempt / 100);
  const perTon = i.euTons > 0 ? netAnnual / i.euTons : 0;

  return {
    coveredTco2,
    grossAnnual,
    netAnnual,
    perTon,
  };
}

function renderKPIs(k) {
  setText(el.kpiAnnual, fmtNumber(k.grossAnnual, 0));
  setText(el.kpiPerTon, fmtNumber(k.perTon, 2));
  setText(el.kpiTco2, fmtNumber(k.coveredTco2, 0));
  setText(el.kpiNet, fmtNumber(k.netAnnual, 0));

  if (el.kpiAnnualNote) el.kpiAnnualNote.textContent = "Gross before exemptions";
}

function renderDashes(note = "Enter inputs then Apply") {
  setText(el.kpiAnnual, "—");
  setText(el.kpiPerTon, "—");
  setText(el.kpiTco2, "—");
  setText(el.kpiNet, "—");
  if (el.kpiAnnualNote) el.kpiAnnualNote.textContent = note;

  setText(el.scnCp, "—");
  setText(el.scnInt, "—");
  setText(el.scnAnnual, "—");
  setText(el.scnPerTon, "—");
}

function setScenarioUI(key) {
  currentScenario = key in SCENARIOS ? key : "base";
  document.querySelectorAll("[data-scn]").forEach((b) => {
    const active = b.getAttribute("data-scn") === currentScenario;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function renderScenario(iBase) {
  const s = SCENARIOS[currentScenario] || SCENARIOS.base;

  const i = {
    ...iBase,
    cp: iBase.cp * s.cpMult,
    intensity: iBase.intensity * s.intMult,
  };

  const k = calcKPIs(i);

  setText(el.scnCp, fmtNumber(i.cp, 0));
  setText(el.scnInt, fmtNumber(i.intensity, 2));
  setText(el.scnAnnual, fmtNumber(k.netAnnual, 0));
  setText(el.scnPerTon, fmtNumber(k.perTon, 2));
}

function toggleInputs() {
  if (!el.inputsPanel) return;
  const hidden = el.inputsPanel.getAttribute("aria-hidden") === "true";
  el.inputsPanel.setAttribute("aria-hidden", hidden ? "false" : "true");
  setStatus(hidden ? "Inputs opened." : "Inputs hidden.");
}

function encodeState(i) {
  // compact but readable; avoid route in URL if you want shorter
  const state = {
    p: i.totalProd,
    s: i.euShare,
    e: euTonsOverridden ? i.euTons : null, // only if overridden
    i: i.intensity,
    c: i.cp,
    x: i.exempt,
    f: i.eurusd || null,
    r: i.route || null,
    scn: currentScenario,
  };
  // remove nulls
  Object.keys(state).forEach((k) => state[k] == null && delete state[k]);
  const json = JSON.stringify(state);
  // base64url
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `#s=${b64}`;
}

function decodeStateFromHash() {
  const h = String(location.hash || "");
  if (!h.startsWith("#s=")) return null;

  const b64 = h.slice(3).replace(/-/g, "+").replace(/_/g, "/");
  // pad
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  try {
    const json = decodeURIComponent(escape(atob(b64 + pad)));
    const obj = JSON.parse(json);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function applyStateToUI(state) {
  if (!state) return false;

  // scenario first
  if (state.scn) setScenarioUI(String(state.scn));

  if (el.totalProd) el.totalProd.value = state.p != null ? String(state.p) : "";
  if (el.euShare) el.euShare.value = state.s != null ? String(state.s) : "";

  // EU tons override behavior
  if (state.e != null) {
    euTonsOverridden = true;
    if (el.euTons) el.euTons.value = String(state.e);
  } else {
    euTonsOverridden = false;
    // will soft-fill on read
    if (el.euTons) el.euTons.value = "";
  }

  if (el.intensity) el.intensity.value = state.i != null ? String(state.i) : "";
  if (el.cp) el.cp.value = state.c != null ? String(state.c) : "";
  if (el.exempt) el.exempt.value = state.x != null ? String(state.x) : "";
  if (el.eurusd) el.eurusd.value = state.f != null ? String(state.f) : "";
  if (el.route) el.route.value = state.r != null ? String(state.r) : "";

  // soft-fill EU tons if not overridden
  readInputsAndSoftFill();
  return true;
}

function saveToStorage(i) {
  try {
    const payload = {
      inputs: {
        totalProd: i.totalProd,
        euShare: i.euShare,
        euTons: i.euTons,
        intensity: i.intensity,
        cp: i.cp,
        exempt: i.exempt,
        eurusd: i.eurusd,
        route: i.route,
      },
      meta: {
        euTonsOverridden,
        scenario: currentScenario,
        ts: Date.now(),
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    if (!obj || !obj.inputs) return false;

    const { inputs, meta } = obj;

    if (meta?.scenario) setScenarioUI(String(meta.scenario));
    euTonsOverridden = !!meta?.euTonsOverridden;

    if (el.totalProd) el.totalProd.value = inputs.totalProd != null ? String(inputs.totalProd) : "";
    if (el.euShare) el.euShare.value = inputs.euShare != null ? String(inputs.euShare) : "";
    if (el.euTons) el.euTons.value = euTonsOverridden && inputs.euTons != null ? String(inputs.euTons) : "";
    if (el.intensity) el.intensity.value = inputs.intensity != null ? String(inputs.intensity) : "";
    if (el.cp) el.cp.value = inputs.cp != null ? String(inputs.cp) : "";
    if (el.exempt) el.exempt.value = inputs.exempt != null ? String(inputs.exempt) : "";
    if (el.eurusd) el.eurusd.value = inputs.eurusd != null ? String(inputs.eurusd) : "";
    if (el.route) el.route.value = inputs.route != null ? String(inputs.route) : "";

    readInputsAndSoftFill();
    return true;
  } catch {
    return false;
  }
}

function doApply() {
  const i = readInputsAndSoftFill();

  if (!hasEnough(i)) {
    renderDashes("Enter inputs then Apply");
    setStatus("Missing required inputs (EU tons, intensity, carbon price).");
    saveToStorage(i);
    return;
  }

  const k = calcKPIs(i);
  renderKPIs(k);
  renderScenario(i);

  // persist
  location.hash = encodeState(i);
  saveToStorage(i);

  setStatus("Updated.");
}

function doReset() {
  // clear UI
  if (el.totalProd) el.totalProd.value = "";
  if (el.euShare) el.euShare.value = "";
  if (el.euTons) el.euTons.value = "";
  if (el.intensity) el.intensity.value = "";
  if (el.cp) el.cp.value = "";
  if (el.exempt) el.exempt.value = "";
  if (el.eurusd) el.eurusd.value = "";
  if (el.route) el.route.value = "";

  euTonsOverridden = false;
  setScenarioUI("base");

  // clear storage + hash
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  history.replaceState(null, "", location.pathname + location.search);

  renderDashes("Enter inputs then Apply");
  setStatus("Ready.");
}

async function copyShareLink() {
  const i = readInputsAndSoftFill();
  const url = location.origin + location.pathname + encodeState(i);

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setStatus("Link copied.");
  } catch {
    setStatus("Copy failed (browser blocked).");
  }
}

function downloadCSV() {
  const i = readInputsAndSoftFill();
  const k = hasEnough(i) ? calcKPIs(i) : null;

  const rows = [];
  rows.push(["field", "value"]);
  rows.push(["route", i.route]);
  rows.push(["totalProd_tpy", i.totalProd]);
  rows.push(["euShare_pct", i.euShare]);
  rows.push(["euTons_tpy", i.euTons]);
  rows.push(["intensity_tco2_per_t", i.intensity]);
  rows.push(["carbonPrice_eur_per_tco2", i.cp]);
  rows.push(["exemptions_pct", i.exempt]);
  rows.push(["fx_eur_usd_optional", i.eurusd]);

  if (k) {
    rows.push(["coveredEmissions_tco2", k.coveredTco2]);
    rows.push(["grossExposure_eur_per_year", k.grossAnnual]);
    rows.push(["netExposure_eur_per_year", k.netAnnual]);
    rows.push(["netCost_eur_per_t_exported", k.perTon]);
    if (i.eurusd > 0) {
      rows.push(["netExposure_usd_per_year_optional", k.netAnnual * i.eurusd]);
      rows.push(["netCost_usd_per_t_optional", k.perTon * i.eurusd]);
    }
  } else {
    rows.push(["note", "Not enough inputs to compute KPIs"]);
  }

  const csv = rows
    .map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `cbam_board_view_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);

  setStatus("CSV downloaded.");
}

function wire() {
  // detect EU tons override by user typing
  if (el.euTons) {
    el.euTons.addEventListener("input", () => {
      const v = String(el.euTons.value || "").trim();
      euTonsOverridden = v.length > 0;
    });
  }

  if (el.btnToggleInputs) el.btnToggleInputs.addEventListener("click", toggleInputs);
  if (el.btnCopyLink) el.btnCopyLink.addEventListener("click", copyShareLink);
  if (el.btnCsv) el.btnCsv.addEventListener("click", downloadCSV);
  if (el.btnPrint) el.btnPrint.addEventListener("click", () => window.print());

  if (el.btnApply) el.btnApply.addEventListener("click", doApply);
  if (el.btnReset) el.btnReset.addEventListener("click", doReset);

  // User Guide (same tab)
  if (el.btnGuide) {
    el.btnGuide.addEventListener("click", () => {
      window.location.href = "./docs/user-guide.html";
    });
  }

  // scenario selector
  document.querySelectorAll("[data-scn]").forEach((b) => {
    b.addEventListener("click", () => {
      const key = String(b.getAttribute("data-scn") || "base");
      setScenarioUI(key);
      // If already has enough inputs, refresh scenario results
      const i = readInputsAndSoftFill();
      if (hasEnough(i)) renderScenario(i);
      saveToStorage(i);
      setStatus(`Scenario: ${currentScenario}`);
    });
  });

  // soft autofill EU tons when production/share typed
  ["input", "change"].forEach((evt) => {
    el.totalProd?.addEventListener(evt, () => readInputsAndSoftFill());
    el.euShare?.addEventListener(evt, () => readInputsAndSoftFill());
  });
}

function initPWAInstall() {
  // Optional PWA install UX
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (el.btnInstall) el.btnInstall.hidden = false;
  });

  if (el.btnInstall) {
    el.btnInstall.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      el.btnInstall.hidden = true;
      setStatus("Install prompt shown.");
    });
  }
}

function init() {
  // baseline UI
  setScenarioUI("base");
  renderDashes("Enter inputs then Apply");
  setStatus("Ready.");

  // Load state priority: URL hash > localStorage
  const state = decodeStateFromHash();
  const loadedFromHash = applyStateToUI(state);

  if (!loadedFromHash) {
    loadFromStorage();
  }

  wire();
  initPWAInstall();

  // If loaded state is already sufficient, auto-render without waiting Apply (optional)
  // Keep it conservative: only render if hash existed.
  if (loadedFromHash) {
    const i = readInputsAndSoftFill();
    if (hasEnough(i)) {
      const k = calcKPIs(i);
      renderKPIs(k);
      renderScenario(i);
      setStatus("Loaded from share link.");
    }
  }

  // Debug
  console.log("[CBAM] init ok", {
    ids: Object.fromEntries(Object.entries(el).map(([k, v]) => [k, !!v])),
  });
}

document.addEventListener("DOMContentLoaded", init);
