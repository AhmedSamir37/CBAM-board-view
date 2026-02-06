/* ==========================================================
   CBAM Board View (Steel – EAF/DRI) — script.js (CLEAN v4.0)
   - Robust button wiring (Apply/Reset works even if IDs differ)
   - Strong KPI rendering (— when not enough inputs)
   - Scenarios: Base / Conservative / Stress
   - Auto EU tons unless overridden
   - Shareable URL hash state + LocalStorage
   - Copy link / CSV / Print
   - PWA install support
   - Soft click sound (mobile-safe unlock)
   ========================================================== */
"use strict";

/* ===================== Small helpers ===================== */
const $ = (id) => document.getElementById(id);

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const safeStr = (v, fallback = "") => {
  if (v === null || v === undefined) return fallback;
  const s = String(v);
  return (s === "null" || s === "undefined") ? fallback : s;
};

const fmtNumber = (n, decimals = 0) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const setText = (el, txt) => { if (el) el.textContent = txt; };
const setVal  = (el, v)   => { if (el) el.value = v; };

/* ===================== Robust element finding ===================== */
function findButtonByText(exactLowerText) {
  const t = exactLowerText.toLowerCase();
  const btns = [...document.querySelectorAll("button")];
  return btns.find(b => (b.textContent || "").trim().toLowerCase() === t) || null;
}

function findFirstExistingId(ids) {
  for (const id of ids) {
    const el = $(id);
    if (el) return el;
  }
  return null;
}

function anyButtonSelector(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/* ===================== UI click sound ===================== */
let uiClickSound = null;

function initClickSound() {
  if (uiClickSound) return;

  // IMPORTANT: file must exist at /sounds/click.wav (lowercase)
  uiClickSound = new Audio("sounds/click.wav");
  uiClickSound.preload = "auto";
  uiClickSound.volume = 0.25;

  // Unlock on mobile: must happen after a user gesture
  const unlock = () => {
    try {
      uiClickSound.play()
        .then(() => {
          uiClickSound.pause();
          uiClickSound.currentTime = 0;
        })
        .catch(() => {});
    } catch (_) {}

    document.removeEventListener("pointerdown", unlock);
    document.removeEventListener("keydown", unlock);
  };

  document.addEventListener("pointerdown", unlock, { once: true, passive: true });
  document.addEventListener("keydown", unlock, { once: true });
}

function playClick() {
  if (!uiClickSound) return;
  try {
    uiClickSound.currentTime = 0;
    uiClickSound.play().catch(() => {});
  } catch (_) {}
}

function wireClickSound() {
  // Play for ANY enabled button click
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || btn.disabled) return;
    playClick();
  });
}

/* ===================== Scenario model ===================== */
const STORAGE_KEY = "cbam_board_view_v40";

const SCENARIOS = {
  base:         { cpMult: 1.00, intMult: 1.00 },
  conservative: { cpMult: 0.85, intMult: 0.92 },
  stress:       { cpMult: 1.25, intMult: 1.15 },
};

let currentScenario = "base";
let euTonsOverridden = false;

// PWA
let deferredInstallPrompt = null;

/* ===================== DOM mapping (by IDs) ===================== */
/*
  These IDs are your "expected" ones:
  totalProd, euShare, euTons, intensity, cp, exempt, eurusd, route
  outputs: kpiAnnual, kpiPerTon, kpiTco2, kpiNet, kpiAnnualNote
  scenario outputs: scnCp, scnInt, scnAnnual, scnPerTon
  misc: inputsPanel, statusText
  top buttons: btnToggleInputs, btnCopyLink, btnCsv, btnPrint, btnInstall
  apply/reset (IDs may differ — we robust-find them)
*/
const elTotalProd = $("totalProd");
const elEuShare   = $("euShare");
const elEuTons    = $("euTons");
const elIntensity = $("intensity");
const elCp        = $("cp");
const elExempt    = $("exempt");
const elFx        = $("eurusd");
const elRoute     = $("route");

const inputsPanel = $("inputsPanel");
const statusText  = $("statusText");

const outAnnual     = $("kpiAnnual");
const outPerTon     = $("kpiPerTon");
const outTco2       = $("kpiTco2");
const outNet        = $("kpiNet");
const outAnnualNote = $("kpiAnnualNote");

const scnCp     = $("scnCp");
const scnInt    = $("scnInt");
const scnAnnual = $("scnAnnual");
const scnPerTon = $("scnPerTon");

// Top bar buttons (try common IDs, then selectors)
const btnToggleInputs =
  $("btnToggleInputs") || $("toggleInputs") || anyButtonSelector(['button[data-action="toggle-inputs"]']);

const btnCopyLink =
  $("btnCopyLink") || $("copyLink") || anyButtonSelector(['button[data-action="copy-link"]']);

const btnCsv =
  $("btnCsv") || $("downloadCsv") || anyButtonSelector(['button[data-action="csv"]']);

const btnPrint =
  $("btnPrint") || $("printBtn") || anyButtonSelector(['button[data-action="print"]']);

const btnInstall =
  $("btnInstall") || $("installBtn") || anyButtonSelector(['button[data-action="install"]']);

// Apply/Reset: robust lookup
const btnApply = findFirstExistingId(["btnApply", "apply", "applyBtn"]) || findButtonByText("apply");
const btnReset = findFirstExistingId(["btnReset", "reset", "resetBtn"]) || findButtonByText("reset");

/* ===================== Core math ===================== */
function readInputs() {
  const totalProd = Math.max(0, num(elTotalProd?.value, 0));
  const euShare   = clamp(num(elEuShare?.value, 0), 0, 100);

  const autoEuTons = totalProd * (euShare / 100);
  let euTons = Math.max(0, num(elEuTons?.value, 0));

  if (!euTonsOverridden) {
    euTons = autoEuTons;

    // do not fight user typing
    if (elEuTons && document.activeElement !== elEuTons) {
      setVal(elEuTons, autoEuTons ? String(Math.round(autoEuTons)) : "");
    }
  }

  const intensity = Math.max(0, num(elIntensity?.value, 0));
  const cp        = Math.max(0, num(elCp?.value, 0));
  const exempt    = clamp(num(elExempt?.value, 0), 0, 100);
  const fx        = Math.max(0, num(elFx?.value, 0)); // optional
  const route     = safeStr(elRoute?.value, "").trim();

  return { totalProd, euShare, autoEuTons, euTons, intensity, cp, exempt, fx, route };
}

function hasEnough(x) {
  return x.euTons > 0 && x.cp > 0 && x.intensity > 0;
}

function calc(x) {
  const coveredTco2 = x.euTons * x.intensity;
  const grossEUR    = coveredTco2 * x.cp;
  const netEUR      = grossEUR * (1 - x.exempt / 100);
  const perTonEUR   = x.euTons > 0 ? netEUR / x.euTons : 0;
  return { coveredTco2, grossEUR, netEUR, perTonEUR };
}

function calcScenario(x, key) {
  const sc = SCENARIOS[key] || SCENARIOS.base;
  const cpS  = x.cp * sc.cpMult;
  const intS = x.intensity * sc.intMult;

  const coveredTco2 = x.euTons * intS;
  const grossEUR    = coveredTco2 * cpS;
  const netEUR      = grossEUR * (1 - x.exempt / 100);
  const perTonEUR   = x.euTons > 0 ? netEUR / x.euTons : 0;

  return { cpS, intS, coveredTco2, netEUR, perTonEUR };
}

/* ===================== Rendering ===================== */
function renderDashes(note = "Enter inputs then Apply") {
  setText(outAnnual, "—");
  setText(outPerTon, "—");
  setText(outTco2,   "—");
  setText(outNet,    "—");
  setText(outAnnualNote, note);

  setText(scnCp,     "—");
  setText(scnInt,    "—");
  setText(scnAnnual, "—");
  setText(scnPerTon, "—");
}

function renderMain(o) {
  setText(outAnnual, fmtNumber(o.netEUR, 0));
  setText(outPerTon, fmtNumber(o.perTonEUR, 2));
  setText(outTco2,   fmtNumber(o.coveredTco2, 0));
  setText(outNet,    fmtNumber(o.netEUR, 0));
  setText(outAnnualNote, "Computed");
}

function renderScenario(x) {
  const s = calcScenario(x, currentScenario);
  setText(scnCp,     fmtNumber(s.cpS, 2));
  setText(scnInt,    fmtNumber(s.intS, 2));
  setText(scnAnnual, fmtNumber(s.netEUR, 0));
  setText(scnPerTon, fmtNumber(s.perTonEUR, 2));
}

function setScenarioUI(key) {
  currentScenario = key;

  // toggle buttons that have data-scn
  document.querySelectorAll("[data-scn]").forEach((b) => b.classList.remove("is-active"));
  const active = document.querySelector(`[data-scn="${key}"]`);
  if (active) active.classList.add("is-active");
}

/* ===================== URL hash state ===================== */
function encodeState(x) {
  const sp = new URLSearchParams();
  if (x.totalProd)  sp.set("p",  String(Math.round(x.totalProd)));
  if (x.euShare)    sp.set("es", String(x.euShare));
  if (x.euTons)     sp.set("et", String(Math.round(x.euTons)));
  if (x.intensity)  sp.set("i",  String(x.intensity));
  if (x.cp)         sp.set("cp", String(x.cp));
  if (x.exempt)     sp.set("ex", String(x.exempt));
  if (x.fx)         sp.set("fx", String(x.fx));
  if (x.route)      sp.set("r",  x.route);
  sp.set("scn", currentScenario);
  return sp.toString();
}

function applyStateFromUrl() {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  if (!hash) return false;

  const sp = new URLSearchParams(hash);

  const p   = sp.get("p");
  const es  = sp.get("es");
  const et  = sp.get("et");
  const i   = sp.get("i");
  const cp  = sp.get("cp");
  const ex  = sp.get("ex");
  const fx  = sp.get("fx");
  const r   = sp.get("r");
  const scn = sp.get("scn");

  if (p  !== null) setVal(elTotalProd, p);
  if (es !== null) setVal(elEuShare, es);

  if (et !== null) {
    setVal(elEuTons, et);
    euTonsOverridden = true;
  }

  if (i  !== null) setVal(elIntensity, i);
  if (cp !== null) setVal(elCp, cp);
  if (ex !== null) setVal(elExempt, ex);
  if (fx !== null) setVal(elFx, fx);
  if (r  !== null) setVal(elRoute, safeStr(r, ""));

  if (scn && SCENARIOS[scn]) setScenarioUI(scn);

  return true;
}

/* ===================== Local storage ===================== */
function saveToStorage(x) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...x,
        currentScenario,
        euTonsOverridden,
      })
    );
  } catch (_) {}
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);

    if (obj.totalProd != null)  setVal(elTotalProd, obj.totalProd);
    if (obj.euShare   != null)  setVal(elEuShare, obj.euShare);
    if (obj.euTons    != null)  setVal(elEuTons, obj.euTons);
    if (obj.intensity != null)  setVal(elIntensity, obj.intensity);
    if (obj.cp        != null)  setVal(elCp, obj.cp);
    if (obj.exempt    != null)  setVal(elExempt, obj.exempt);
    if (obj.fx        != null)  setVal(elFx, obj.fx);
    if (obj.route     != null)  setVal(elRoute, safeStr(obj.route, ""));

    euTonsOverridden = !!obj.euTonsOverridden;
    if (obj.currentScenario && SCENARIOS[obj.currentScenario]) setScenarioUI(obj.currentScenario);

    return true;
  } catch (_) {
    return false;
  }
}

/* ===================== Actions ===================== */
function setStatus(msg) {
  setText(statusText, msg);
}

function doApply() {
  const x = readInputs();

  if (!hasEnough(x)) {
    renderDashes("Enter inputs then Apply");
    setStatus("Ready.");
    saveToStorage(x);
    return;
  }

  const o = calc(x);
  renderMain(o);
  renderScenario(x);

  location.hash = encodeState(x);
  saveToStorage(x);

  setStatus("Updated.");
}

function doReset() {
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

  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  location.hash = "";

  renderDashes("Enter inputs then Apply");
  setStatus("Ready.");
}

function toggleInputsPanel() {
  if (!inputsPanel) return;
  const hidden = inputsPanel.getAttribute("aria-hidden") === "true";
  inputsPanel.setAttribute("aria-hidden", hidden ? "false" : "true");
}

async function copyShareLink() {
  const url = location.origin + location.pathname + (location.hash || "");
  try {
    await navigator.clipboard.writeText(url);
    setStatus("Link copied.");
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setStatus("Link copied.");
  }
}

function downloadCSV() {
  const x = readInputs();
  const enough = hasEnough(x);
  const o = enough ? calc(x) : null;

  const rows = [
    ["CBAM Board View", ""],
    ["Route", x.route || ""],
    ["Scenario", currentScenario],
    ["", ""],
    ["Total production (t/y)", x.totalProd || ""],
    ["EU share (%)", x.euShare || ""],
    ["EU tons (t/y)", x.euTons ? Math.round(x.euTons) : ""],
    ["Emissions intensity (tCO2/t)", x.intensity || ""],
    ["Carbon price (€/tCO2)", x.cp || ""],
    ["Exemptions / free allocation (%)", x.exempt || ""],
    ["FX EUR/USD (optional)", x.fx || ""],
    ["", ""],
    ["Covered emissions (tCO2)", o ? Math.round(o.coveredTco2) : ""],
    ["Net exposure (€/year)", o ? Math.round(o.netEUR) : ""],
    ["CBAM cost per ton (€/t)", o ? o.perTonEUR.toFixed(2) : ""],
  ];

  const csv = rows
    .map(r => r.map(v => {
      const s = safeStr(v, "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = "cbam-board-view.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(u);

  setStatus("CSV downloaded.");
}

function doPrint() { window.print(); }

/* ===================== Wiring ===================== */
function wireScenarioButtons() {
  document.querySelectorAll("[data-scn]").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const key = b.getAttribute("data-scn");
      if (!key || !SCENARIOS[key]) return;

      setScenarioUI(key);
      doApply();
    });
  });
}

function wireInputsOverride() {
  if (!elEuTons) return;
  elEuTons.addEventListener("input", () => {
    const v = safeStr(elEuTons.value, "").trim();
    euTonsOverridden = v.length > 0;
  });
}

function wireTopBar() {
  if (btnToggleInputs) btnToggleInputs.addEventListener("click", (e) => { e.preventDefault(); toggleInputsPanel(); });
  if (btnCopyLink)     btnCopyLink.addEventListener("click", (e) => { e.preventDefault(); copyShareLink(); });
  if (btnCsv)          btnCsv.addEventListener("click", (e) => { e.preventDefault(); downloadCSV(); });
  if (btnPrint)        btnPrint.addEventListener("click", (e) => { e.preventDefault(); doPrint(); });
}

function wireApplyReset() {
  // Make sure Apply/Reset are buttons (not form submit)
  if (btnApply) {
    btnApply.setAttribute("type", "button");
    btnApply.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      doApply();
    });
  }

  if (btnReset) {
    btnReset.setAttribute("type", "button");
    btnReset.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      doReset();
    });
  }
}

function wirePWAInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (btnInstall) btnInstall.hidden = false;
  });

  if (!btnInstall) return;
  btnInstall.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    try { await deferredInstallPrompt.userChoice; } catch (_) {}
    deferredInstallPrompt = null;
    btnInstall.hidden = true;
  });
}

/* ===================== Init ===================== */
(function init() {
  // Defensive: prevent <form> submit from breaking buttons
  document.addEventListener("submit", (e) => e.preventDefault(), true);

  setScenarioUI("base");

  const loadedFromUrl = applyStateFromUrl();
  if (!loadedFromUrl) loadFromStorage();

  wireTopBar();
  wireScenarioButtons();
  wireApplyReset();
  wireInputsOverride();
  wirePWAInstall();

  // audio
  initClickSound();
  wireClickSound();

  renderDashes("Enter inputs then Apply");
  setStatus("Ready.");

  // auto-apply if enough inputs
  const x = readInputs();
  if (hasEnough(x)) doApply();
})();
