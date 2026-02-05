/* ==========================================================
   CBAM Board View (Steel – EAF/DRI) — script.js (FULL)
   - Fix: route label "null"
   - Apply calculations + scenarios
   - Reset works (clear + recompute)
   - Shareable URL state + Copy link
   - CSV export + Print
   ========================================================== */

"use strict";

/* ---------------- Helpers ---------------- */

function qs(id) {
  return document.getElementById(id);
}

function on(el, ev, fn) {
  if (!el) return;
  el.addEventListener(ev, fn, { passive: true });
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function safeStr(v, fallback = "") {
  if (v === null || v === undefined) return fallback;
  const s = String(v);
  return (s === "null" || s === "undefined") ? fallback : s;
}

function fmtNumber(n, decimals = 0) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function setText(el, txt) {
  if (!el) return;
  el.textContent = txt;
}

function setVal(el, v) {
  if (!el) return;
  el.value = v;
}

/* ---------------- DOM ---------------- */

// Inputs
const elTotalProd = qs("totalProd");
const elEuShare = qs("euShare");
const elEuTons = qs("euTons");
const elIntensity = qs("intensity");
const elCp = qs("cp");
const elExempt = qs("exempt");
const elFx = qs("eurusd");
const elRoute = qs("route");

// Buttons (top bar)
const btnToggleInputs = qs("btnToggleInputs");
const btnCopyLink = qs("btnCopyLink");
const btnCsv = qs("btnCsv");
const btnPrint = qs("btnPrint");
const btnInstall = qs("btnInstall");

// Panel (optional)
const inputsPanel = qs("inputsPanel");

// KPI outputs (IDs expected)
const outAnnual = qs("kpiAnnual");   // €/year
const outPerTon = qs("kpiPerTon");   // €/t exported
const outTco2 = qs("kpiTco2");       // tCO2
const outNet = qs("kpiNet");         // €/year after exemptions

// Scenario cards outputs
const scnCp = qs("scnCp");
const scnInt = qs("scnInt");
const scnAnnual = qs("scnAnnual");
const scnPerTon = qs("scnPerTon");

// Footer (optional)
const footerMuted = document.querySelector("footer .muted");

/* ---------------- State ---------------- */

const STORAGE_KEY = "cbam_board_view_v3";

const SCENARIOS = {
  base: { cpMult: 1.00, intMult: 1.00 },
  conservative: { cpMult: 0.85, intMult: 0.92 },
  stress: { cpMult: 1.25, intMult: 1.15 },
};

let currentScenario = "base";
let euTonsOverridden = false;

// PWA install prompt
let deferredInstallPrompt = null;

/* ---------------- Core Math ----------------
   Model (simplified decision stress-testing):
   EU_tons: either user input or auto from totalProd * euShare%
   Covered tCO2 = EU_tons * intensity
   Gross €/year = Covered tCO2 * carbon_price
   Net €/year = Gross * (1 - exemptions%)
   €/t exported = Net / EU_tons
-------------------------------------------- */

function readInputs() {
  const totalProd = Math.max(0, num(elTotalProd?.value, 0));
  const euShare = clamp(num(elEuShare?.value, 0), 0, 100);

  // EU tons: auto unless overridden
  let euTons = Math.max(0, num(elEuTons?.value, 0));
  const autoEuTons = totalProd * (euShare / 100);

  if (!euTonsOverridden) {
    euTons = autoEuTons;
    // keep field in sync but don't fight the user if they are typing
    if (elEuTons && document.activeElement !== elEuTons) {
      setVal(elEuTons, autoEuTons ? String(Math.round(autoEuTons)) : "");
    }
  }

  const intensity = Math.max(0, num(elIntensity?.value, 0));
  const cp = Math.max(0, num(elCp?.value, 0));
  const exempt = clamp(num(elExempt?.value, 0), 0, 100);
  const fx = Math.max(0, num(elFx?.value, 0)); // optional

  // Route label: FIX "null"
  const route = safeStr(elRoute?.value, "").trim();

  return { totalProd, euShare, euTons, autoEuTons, intensity, cp, exempt, fx, route };
}

function calc(inputs) {
  const { euTons, intensity, cp, exempt } = inputs;

  const coveredTco2 = euTons * intensity;
  const grossEUR = coveredTco2 * cp;
  const netEUR = grossEUR * (1 - exempt / 100);
  const perTonEUR = euTons > 0 ? (netEUR / euTons) : 0;

  return { coveredTco2, grossEUR, netEUR, perTonEUR };
}

function calcScenario(inputs, key) {
  const sc = SCENARIOS[key] || SCENARIOS.base;
  const cpS = inputs.cp * sc.cpMult;
  const intS = inputs.intensity * sc.intMult;

  const euTons = inputs.euTons;
  const exempt = inputs.exempt;

  const coveredTco2 = euTons * intS;
  const grossEUR = coveredTco2 * cpS;
  const netEUR = grossEUR * (1 - exempt / 100);
  const perTonEUR = euTons > 0 ? (netEUR / euTons) : 0;

  return { cpS, intS, coveredTco2, netEUR, perTonEUR };
}

/* ---------------- Rendering ---------------- */

function renderMain(inputs, out) {
  // KPI cards (big numbers)
  setText(outAnnual, fmtNumber(out.netEUR, 0));
  setText(outPerTon, fmtNumber(out.perTonEUR, 2));
  setText(outTco2, fmtNumber(out.coveredTco2, 0));
  setText(outNet, fmtNumber(out.netEUR, 0));

  // Footer route label safety (avoid showing "null")
  // If you display route somewhere else via JS، خليه هنا:
  // مثال: qs("routeBadge") ...
}

function renderScenario(inputs) {
  const s = calcScenario(inputs, currentScenario);
  setText(scnCp, fmtNumber(s.cpS, 2));
  setText(scnInt, fmtNumber(s.intS, 2));
  setText(scnAnnual, fmtNumber(s.netEUR, 0));
  setText(scnPerTon, fmtNumber(s.perTonEUR, 2));
}

function setScenarioUI(key) {
  currentScenario = key;

  // support both class names: .seg__btn OR .seg_btn
  const btns = document.querySelectorAll("[data-scn]");
  btns.forEach((b) => b.classList.remove("is-active"));

  const active = document.querySelector(`[data-scn="${key}"]`);
  if (active) active.classList.add("is-active");

  // Optional little indicator on panel
  // Example: setText(qs("scenarioHint"), `Scenario: ${key}`);
}

/* ---------------- URL State ----------------
   Store in URL hash: #p=...&s=... etc
-------------------------------------------- */

function encodeState(inputs) {
  const sp = new URLSearchParams();
  sp.set("p", String(Math.round(inputs.totalProd)));
  sp.set("es", String(inputs.euShare));
  sp.set("et", String(Math.round(inputs.euTons)));
  sp.set("i", String(inputs.intensity));
  sp.set("cp", String(inputs.cp));
  sp.set("ex", String(inputs.exempt));
  if (inputs.fx) sp.set("fx", String(inputs.fx));
  if (inputs.route) sp.set("r", inputs.route);
  sp.set("scn", currentScenario);
  return sp.toString();
}

function applyStateFromUrl() {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  if (!hash) return false;

  const sp = new URLSearchParams(hash);
  const p = sp.get("p");
  const es = sp.get("es");
  const et = sp.get("et");
  const i = sp.get("i");
  const cp = sp.get("cp");
  const ex = sp.get("ex");
  const fx = sp.get("fx");
  const r = sp.get("r");
  const scn = sp.get("scn");

  if (p !== null) setVal(elTotalProd, p);
  if (es !== null) setVal(elEuShare, es);
  if (et !== null) {
    setVal(elEuTons, et);
    euTonsOverridden = true;
  }
  if (i !== null) setVal(elIntensity, i);
  if (cp !== null) setVal(elCp, cp);
  if (ex !== null) setVal(elExempt, ex);
  if (fx !== null) setVal(elFx, fx);
  if (r !== null) setVal(elRoute, safeStr(r, ""));

  if (scn && SCENARIOS[scn]) setScenarioUI(scn);

  return true;
}

function saveToStorage(inputs) {
  try {
    const obj = {
      ...inputs,
      currentScenario,
      euTonsOverridden,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch (_) {}
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);

    if (obj.totalProd != null) setVal(elTotalProd, obj.totalProd);
    if (obj.euShare != null) setVal(elEuShare, obj.euShare);
    if (obj.euTons != null) setVal(elEuTons, obj.euTons);
    if (obj.intensity != null) setVal(elIntensity, obj.intensity);
    if (obj.cp != null) setVal(elCp, obj.cp);
    if (obj.exempt != null) setVal(elExempt, obj.exempt);
    if (obj.fx != null) setVal(elFx, obj.fx);
    if (obj.route != null) setVal(elRoute, safeStr(obj.route, ""));

    if (obj.currentScenario && SCENARIOS[obj.currentScenario]) {
      setScenarioUI(obj.currentScenario);
    }

    euTonsOverridden = !!obj.euTonsOverridden;
    return true;
  } catch (_) {
    return false;
  }
}

/* ---------------- Actions ---------------- */

function doApply() {
  const inputs = readInputs();
  const out = calc(inputs);

  renderMain(inputs, out);
  renderScenario(inputs);

  // update URL state
  const state = encodeState(inputs);
  // Keep shareable URL state
  location.hash = state;

  // storage
  saveToStorage(inputs);

  // optional footer version indicator if exists
  if (footerMuted) {
    // keep existing text if you want; do nothing by default
  }
}

function doReset() {
  // clear all inputs
  setVal(elTotalProd, "");
  setVal(elEuShare, "");
  setVal(elEuTons, "");
  setVal(elIntensity, "");
  setVal(elCp, "");
  setVal(elExempt, "");
  setVal(elFx, "");
  setVal(elRoute, "");

  euTonsOverridden = false;
  setScenarioUI("base");

  // clear url + storage
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  location.hash = "";

  // clear outputs to zeros/dashes
  setText(outAnnual, "—");
  setText(outPerTon, "—");
  setText(outTco2, "—");
  setText(outNet, "—");

  setText(scnCp, "—");
  setText(scnInt, "—");
  setText(scnAnnual, "—");
  setText(scnPerTon, "—");
}

function toggleInputsPanel() {
  if (!inputsPanel) return;
  const hidden = inputsPanel.getAttribute("aria-hidden") === "true";
  inputsPanel.setAttribute("aria-hidden", hidden ? "false" : "true");
}

function copyShareLink() {
  const url = location.origin + location.pathname + location.hash;
  const text = url;
  if (!navigator.clipboard) {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return;
  }
  navigator.clipboard.writeText(text).catch(() => {});
}

function downloadCSV() {
  const inputs = readInputs();
  const out = calc(inputs);

  const rows = [
    ["CBAM Board View", ""],
    ["Route", inputs.route || ""],
    ["Scenario", currentScenario],
    ["", ""],
    ["Total production (t/y)", inputs.totalProd],
    ["EU share (%)", inputs.euShare],
    ["EU tons (t/y)", Math.round(inputs.euTons)],
    ["Emissions intensity (tCO2/t)", inputs.intensity],
    ["Carbon price (€/tCO2)", inputs.cp],
    ["Exemptions / free allocation (%)", inputs.exempt],
    ["FX EUR/USD (optional)", inputs.fx || ""],
    ["", ""],
    ["Covered emissions (tCO2)", Math.round(out.coveredTco2)],
    ["Net exposure (€/year)", Math.round(out.netEUR)],
    ["CBAM cost per ton (€/t)", out.perTonEUR.toFixed(2)],
  ];

  const csv = rows
    .map(r => r.map(x => {
      const s = safeStr(x, "");
      // escape
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "cbam-board-view.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

function doPrint() {
  window.print();
}

/* ---------------- Wiring ---------------- */

function wireScenarioButtons() {
  const btns = document.querySelectorAll("[data-scn]");
  btns.forEach((b) => {
    b.addEventListener("click", () => {
      const key = b.getAttribute("data-scn");
      if (!key || !SCENARIOS[key]) return;
      setScenarioUI(key);
      doApply();
    }, { passive: true });
  });
}

function wireApplyResetButtons() {
  // Robust: use IDs if exist, otherwise find by text
  let btnApply = qs("btnApply");
  let btnReset = qs("btnReset");

  if (!btnApply) {
    btnApply = Array.from(document.querySelectorAll("button"))
      .find(b => (b.textContent || "").trim().toLowerCase() === "apply");
  }
  if (!btnReset) {
    btnReset = Array.from(document.querySelectorAll("button"))
      .find(b => (b.textContent || "").trim().toLowerCase() === "reset");
  }

  on(btnApply, "click", doApply);
  on(btnReset, "click", doReset);
}

function wireInputsAuto() {
  // If user edits euTons manually => override ON
  on(elEuTons, "input", () => {
    const v = safeStr(elEuTons.value, "").trim();
    euTonsOverridden = v.length > 0;
  });

  // If user changes totalProd/euShare and NOT overridden => auto updates on Apply
  // We keep it simple: user presses Apply; no live calc unless you want.
}

function wireTopBarButtons() {
  on(btnToggleInputs, "click", toggleInputsPanel);
  on(btnCopyLink, "click", copyShareLink);
  on(btnCsv, "click", downloadCSV);
  on(btnPrint, "click", doPrint);
}

function wirePWAInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (btnInstall) btnInstall.hidden = false;
  });

  on(btnInstall, "click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    try { await deferredInstallPrompt.userChoice; } catch (_) {}
    deferredInstallPrompt = null;
    if (btnInstall) btnInstall.hidden = true;
  });
}

/* ---------------- Init ---------------- */

(function init() {
  // 1) scenario default
  setScenarioUI("base");

  // 2) restore: URL has priority
  const loadedFromUrl = applyStateFromUrl();
  if (!loadedFromUrl) loadFromStorage();

  // 3) wire
  wireTopBarButtons();
  wireScenarioButtons();
  wireApplyResetButtons();
  wireInputsAuto();
  wirePWAInstall();

  // 4) first render (do not force hash rewrite if empty)
  // If there is any input present, we can auto-apply to show numbers.
  // Otherwise keep dashes.
  const inputs = readInputs();
  const hasAny =
    inputs.totalProd || inputs.euShare || inputs.euTons ||
    inputs.intensity || inputs.cp || inputs.exempt || inputs.fx || inputs.route;

  if (hasAny) {
    doApply();
  } else {
    // default empties
    setText(outAnnual, "—");
    setText(outPerTon, "—");
    setText(outTco2, "—");
    setText(outNet, "—");

    setText(scnCp, "—");
    setText(scnInt, "—");
    setText(scnAnnual, "—");
    setText(scnPerTon, "—");
  }
})();
