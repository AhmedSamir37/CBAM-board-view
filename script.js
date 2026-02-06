/* ==========================================================
   CBAM Board View (Steel – EAF/DRI) — script.js (SAFE v4)
   هدف النسخة: منع "Apply/Reset مش شغال" مهما حصل اختلاف بسيط في HTML
   - يشتغل حتى لو IDs مختلفة (Fallback بالـselectors)
   - يمنع submit/reload لو الأزرار داخل form
   - Debug لطيف في Console + يظهر Status
   - حسابات KPI + Scenarios + Share link + CSV + Print
   ========================================================== */

"use strict";

/* ---------------- Small utils ---------------- */
const log = (...a) => console.log("[CBAM]", ...a);
const warn = (...a) => console.warn("[CBAM]", ...a);

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function byIdOr(selList) {
  for (const sel of selList) {
    const el =
      sel.startsWith("#") ? qs(sel) : document.getElementById(sel.replace(/^#/, ""));
    if (el) return el;
  }
  return null;
}

function num(v, fallback = 0) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
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
  if (el) el.textContent = txt;
}

function setVal(el, v) {
  if (!el) return;
  el.value = v;
}

function safeStr(v, fallback = "") {
  if (v === null || v === undefined) return fallback;
  const s = String(v);
  if (s === "null" || s === "undefined") return fallback;
  return s;
}

/* ---------------- Config ---------------- */
const STORAGE_KEY = "cbam_board_view_v4";

const SCENARIOS = {
  base: { cpMult: 1.0, intMult: 1.0 },
  conservative: { cpMult: 0.85, intMult: 0.92 },
  stress: { cpMult: 1.25, intMult: 1.15 },
};

let currentScenario = "base";
let euTonsOverridden = false;

/* ---------------- DOM mapping (robust) ----------------
   هنحاول نمسك العناصر بالـID أولاً، ولو مش موجودة نستخدم fallback selectors.
------------------------------------------------------- */
function mapDOM() {
  // Inputs
  const elTotalProd = byIdOr(["totalProd", "#totalProd", 'input[name="totalProd"]']);
  const elEuShare = byIdOr(["euShare", "#euShare", 'input[name="euShare"]']);
  const elEuTons = byIdOr(["euTons", "#euTons", 'input[name="euTons"]']);
  const elIntensity = byIdOr(["intensity", "#intensity", 'input[name="intensity"]']);
  const elCp = byIdOr(["cp", "#cp", 'input[name="cp"]']);
  const elExempt = byIdOr(["exempt", "#exempt", 'input[name="exempt"]']);
  const elFx = byIdOr(["eurusd", "#eurusd", 'input[name="eurusd"]', 'input[name="fx"]']);
  const elRoute = byIdOr(["route", "#route", 'input[name="route"]']);

  // Buttons (IDs as preferred + fallback by text)
  const btnApply =
    byIdOr(["btnApply", "#btnApply"]) ||
    qsa("button").find((b) => /apply/i.test(b.textContent || ""));
  const btnReset =
    byIdOr(["btnReset", "#btnReset"]) ||
    qsa("button").find((b) => /reset/i.test(b.textContent || ""));
  const btnToggleInputs =
    byIdOr(["btnToggleInputs", "#btnToggleInputs"]) ||
    qsa("button").find((b) => /edit inputs/i.test(b.textContent || ""));
  const btnCopyLink =
    byIdOr(["btnCopyLink", "#btnCopyLink"]) ||
    qsa("button").find((b) => /copy share/i.test(b.textContent || ""));
  const btnCsv =
    byIdOr(["btnCsv", "#btnCsv"]) ||
    qsa("button").find((b) => /download csv/i.test(b.textContent || ""));
  const btnPrint =
    byIdOr(["btnPrint", "#btnPrint"]) ||
    qsa("button").find((b) => /print/i.test(b.textContent || ""));
  const btnInstall = byIdOr(["btnInstall", "#btnInstall"]);

  // Panels / status
  const inputsPanel = byIdOr(["inputsPanel", "#inputsPanel"]) || qs('[data-panel="inputs"]');
  const statusText = byIdOr(["statusText", "#statusText"]) || qs('[data-status="text"]');

  // KPI outputs
  const outAnnual = byIdOr(["kpiAnnual", "#kpiAnnual"]);
  const outPerTon = byIdOr(["kpiPerTon", "#kpiPerTon"]);
  const outTco2 = byIdOr(["kpiTco2", "#kpiTco2"]);
  const outNet = byIdOr(["kpiNet", "#kpiNet"]);
  const outAnnualNote = byIdOr(["kpiAnnualNote", "#kpiAnnualNote"]);

  // Scenario outputs
  const scnCp = byIdOr(["scnCp", "#scnCp"]);
  const scnInt = byIdOr(["scnInt", "#scnInt"]);
  const scnAnnual = byIdOr(["scnAnnual", "#scnAnnual"]);
  const scnPerTon = byIdOr(["scnPerTon", "#scnPerTon"]);

  // Scenario buttons
  const scnButtons = qsa("[data-scn]");

  const dom = {
    elTotalProd,
    elEuShare,
    elEuTons,
    elIntensity,
    elCp,
    elExempt,
    elFx,
    elRoute,

    btnApply,
    btnReset,
    btnToggleInputs,
    btnCopyLink,
    btnCsv,
    btnPrint,
    btnInstall,

    inputsPanel,
    statusText,

    outAnnual,
    outPerTon,
    outTco2,
    outNet,
    outAnnualNote,

    scnCp,
    scnInt,
    scnAnnual,
    scnPerTon,

    scnButtons,
  };

  return dom;
}

/* ---------------- Core math ----------------
   Covered tCO2 = EU_tons * intensity
   Gross €/year = Covered tCO2 * carbon_price
   Net €/year   = Gross * (1 - exemptions%)
   €/t exported = Net / EU_tons
-------------------------------------------- */
function readInputs(dom) {
  const totalProd = Math.max(0, num(dom.elTotalProd?.value, 0));
  const euShare = clamp(num(dom.elEuShare?.value, 0), 0, 100);

  const autoEuTons = totalProd * (euShare / 100);
  let euTons = Math.max(0, num(dom.elEuTons?.value, 0));

  if (!euTonsOverridden) {
    euTons = autoEuTons;
    // avoid fighting user while typing
    if (dom.elEuTons && document.activeElement !== dom.elEuTons) {
      setVal(dom.elEuTons, autoEuTons ? String(Math.round(autoEuTons)) : "");
    }
  }

  const intensity = Math.max(0, num(dom.elIntensity?.value, 0));
  const cp = Math.max(0, num(dom.elCp?.value, 0));
  const exempt = clamp(num(dom.elExempt?.value, 0), 0, 100);
  const fx = Math.max(0, num(dom.elFx?.value, 0));
  const route = safeStr(dom.elRoute?.value, "").trim();

  return { totalProd, euShare, autoEuTons, euTons, intensity, cp, exempt, fx, route };
}

function hasEnough(inputs) {
  return inputs.euTons > 0 && inputs.cp > 0 && inputs.intensity > 0;
}

function calc(inputs) {
  const coveredTco2 = inputs.euTons * inputs.intensity;
  const grossEUR = coveredTco2 * inputs.cp;
  const netEUR = grossEUR * (1 - inputs.exempt / 100);
  const perTonEUR = inputs.euTons > 0 ? netEUR / inputs.euTons : 0;
  return { coveredTco2, grossEUR, netEUR, perTonEUR };
}

function calcScenario(inputs, key) {
  const sc = SCENARIOS[key] || SCENARIOS.base;
  const cpS = inputs.cp * sc.cpMult;
  const intS = inputs.intensity * sc.intMult;

  const coveredTco2 = inputs.euTons * intS;
  const grossEUR = coveredTco2 * cpS;
  const netEUR = grossEUR * (1 - inputs.exempt / 100);
  const perTonEUR = inputs.euTons > 0 ? netEUR / inputs.euTons : 0;

  return { cpS, intS, coveredTco2, netEUR, perTonEUR };
}

/* ---------------- Rendering ---------------- */
function renderDashes(dom, note = "Enter inputs then Apply") {
  setText(dom.outAnnual, "—");
  setText(dom.outPerTon, "—");
  setText(dom.outTco2, "—");
  setText(dom.outNet, "—");
  setText(dom.outAnnualNote, note);

  setText(dom.scnCp, "—");
  setText(dom.scnInt, "—");
  setText(dom.scnAnnual, "—");
  setText(dom.scnPerTon, "—");
}

function renderMain(dom, out) {
  setText(dom.outAnnual, fmtNumber(out.netEUR, 0));
  setText(dom.outPerTon, fmtNumber(out.perTonEUR, 2));
  setText(dom.outTco2, fmtNumber(out.coveredTco2, 0));
  setText(dom.outNet, fmtNumber(out.netEUR, 0));
  setText(dom.outAnnualNote, "Computed");
}

function renderScenario(dom, inputs) {
  const s = calcScenario(inputs, currentScenario);
  setText(dom.scnCp, fmtNumber(s.cpS, 2));
  setText(dom.scnInt, fmtNumber(s.intS, 2));
  setText(dom.scnAnnual, fmtNumber(s.netEUR, 0));
  setText(dom.scnPerTon, fmtNumber(s.perTonEUR, 2));
}

function setStatus(dom, msg) {
  if (dom.statusText) dom.statusText.textContent = msg;
}

/* ---------------- URL state ---------------- */
function encodeState(inputs) {
  const sp = new URLSearchParams();
  if (inputs.totalProd) sp.set("p", String(Math.round(inputs.totalProd)));
  if (inputs.euShare) sp.set("es", String(inputs.euShare));
  if (inputs.euTons) sp.set("et", String(Math.round(inputs.euTons)));
  if (inputs.intensity) sp.set("i", String(inputs.intensity));
  if (inputs.cp) sp.set("cp", String(inputs.cp));
  if (inputs.exempt) sp.set("ex", String(inputs.exempt));
  if (inputs.fx) sp.set("fx", String(inputs.fx));
  if (inputs.route) sp.set("r", inputs.route);
  sp.set("scn", currentScenario);
  return sp.toString();
}

function applyStateFromUrl(dom) {
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

  if (p !== null) setVal(dom.elTotalProd, p);
  if (es !== null) setVal(dom.elEuShare, es);

  if (et !== null) {
    setVal(dom.elEuTons, et);
    euTonsOverridden = true;
  }

  if (i !== null) setVal(dom.elIntensity, i);
  if (cp !== null) setVal(dom.elCp, cp);
  if (ex !== null) setVal(dom.elExempt, ex);
  if (fx !== null) setVal(dom.elFx, fx);
  if (r !== null) setVal(dom.elRoute, safeStr(r, ""));

  if (scn && SCENARIOS[scn]) currentScenario = scn;
  return true;
}

/* ---------------- Storage ---------------- */
function saveToStorage(inputs) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...inputs,
        currentScenario,
        euTonsOverridden,
      })
    );
  } catch (_) {}
}

function loadFromStorage(dom) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);

    if (obj.totalProd != null) setVal(dom.elTotalProd, obj.totalProd);
    if (obj.euShare != null) setVal(dom.elEuShare, obj.euShare);
    if (obj.euTons != null) setVal(dom.elEuTons, obj.euTons);
    if (obj.intensity != null) setVal(dom.elIntensity, obj.intensity);
    if (obj.cp != null) setVal(dom.elCp, obj.cp);
    if (obj.exempt != null) setVal(dom.elExempt, obj.exempt);
    if (obj.fx != null) setVal(dom.elFx, obj.fx);
    if (obj.route != null) setVal(dom.elRoute, safeStr(obj.route, ""));

    euTonsOverridden = !!obj.euTonsOverridden;
    if (obj.currentScenario && SCENARIOS[obj.currentScenario]) currentScenario = obj.currentScenario;

    return true;
  } catch (_) {
    return false;
  }
}

/* ---------------- Actions ---------------- */
function doApply(dom) {
  const inputs = readInputs(dom);

  if (!hasEnough(inputs)) {
    renderDashes(dom, "Enter inputs then Apply");
    setStatus(dom, "Ready.");
    saveToStorage(inputs);
    return;
  }

  const out = calc(inputs);
  renderMain(dom, out);
  renderScenario(dom, inputs);

  location.hash = encodeState(inputs);
  saveToStorage(inputs);

  setStatus(dom, "Updated.");
}

function doReset(dom) {
  setVal(dom.elTotalProd, "");
  setVal(dom.elEuShare, "");
  setVal(dom.elEuTons, "");
  setVal(dom.elIntensity, "");
  setVal(dom.elCp, "");
  setVal(dom.elExempt, "");
  setVal(dom.elFx, "");
  setVal(dom.elRoute, "");

  euTonsOverridden = false;
  currentScenario = "base";

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}

  location.hash = "";

  renderDashes(dom, "Enter inputs then Apply");
  setStatus(dom, "Ready.");
}

function toggleInputsPanel(dom) {
  if (!dom.inputsPanel) return;
  const hidden = dom.inputsPanel.getAttribute("aria-hidden") === "true";
  dom.inputsPanel.setAttribute("aria-hidden", hidden ? "false" : "true");
}

async function copyShareLink(dom) {
  const url = location.origin + location.pathname + (location.hash || "");
  try {
    await navigator.clipboard.writeText(url);
    setStatus(dom, "Link copied.");
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setStatus(dom, "Link copied.");
  }
}

function downloadCSV(dom) {
  const inputs = readInputs(dom);
  const enough = hasEnough(inputs);
  const out = enough ? calc(inputs) : null;

  const rows = [
    ["CBAM Board View", ""],
    ["Route", inputs.route || ""],
    ["Scenario", currentScenario],
    ["", ""],
    ["Total production (t/y)", inputs.totalProd || ""],
    ["EU share (%)", inputs.euShare || ""],
    ["EU tons (t/y)", inputs.euTons ? Math.round(inputs.euTons) : ""],
    ["Emissions intensity (tCO2/t)", inputs.intensity || ""],
    ["Carbon price (€/tCO2)", inputs.cp || ""],
    ["Exemptions / free allocation (%)", inputs.exempt || ""],
    ["FX EUR/USD (optional)", inputs.fx || ""],
    ["", ""],
    ["Covered emissions (tCO2)", out ? Math.round(out.coveredTco2) : ""],
    ["Net exposure (€/year)", out ? Math.round(out.netEUR) : ""],
    ["CBAM cost per ton (€/t)", out ? out.perTonEUR.toFixed(2) : ""],
  ];

  const csv = rows
    .map((r) =>
      r
        .map((x) => {
          const s = safeStr(x, "");
          if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(",")
    )
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

  setStatus(dom, "CSV downloaded.");
}

function doPrint() {
  window.print();
}

/* ---------------- Wiring (FIX: stop submit/reload) ---------------- */
function preventFormSubmit() {
  // أي form في الصفحة: منع submit (خصوصًا لو الأزرار داخل form)
  qsa("form").forEach((f) => {
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });
}

function forceButtonType(dom) {
  // لو الزرار نوعه submit، هنحوّله button لتفادي reload
  [dom.btnApply, dom.btnReset, dom.btnToggleInputs, dom.btnCopyLink, dom.btnCsv, dom.btnPrint].forEach((b) => {
    if (!b) return;
    if (String(b.getAttribute("type") || "").toLowerCase() === "submit") {
      b.setAttribute("type", "button");
    }
  });
}

function wireScenarioButtons(dom) {
  if (!dom.scnButtons || dom.scnButtons.length === 0) return;
  dom.scnButtons.forEach((b) => {
    b.addEventListener("click", (e) => {
      e.preventDefault();
      const key = b.getAttribute("data-scn");
      if (!key || !SCENARIOS[key]) return;
      currentScenario = key;

      // UI active state (safe even if css missing)
      dom.scnButtons.forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");

      doApply(dom);
    });
  });
}

function wireInputsOverride(dom) {
  if (!dom.elEuTons) return;
  dom.elEuTons.addEventListener("input", () => {
    const v = safeStr(dom.elEuTons.value, "").trim();
    euTonsOverridden = v.length > 0;
  });
}

function wireButtons(dom) {
  // Apply
  if (dom.btnApply) {
    dom.btnApply.addEventListener("click", (e) => {
      e.preventDefault();
      doApply(dom);
    });
  } else {
    warn("Apply button not found (btnApply).");
  }

  // Reset
  if (dom.btnReset) {
    dom.btnReset.addEventListener("click", (e) => {
      e.preventDefault();
      doReset(dom);
    });
  } else {
    warn("Reset button not found (btnReset).");
  }

  // Top bar actions
  if (dom.btnToggleInputs) dom.btnToggleInputs.addEventListener("click", (e) => (e.preventDefault(), toggleInputsPanel(dom)));
  if (dom.btnCopyLink) dom.btnCopyLink.addEventListener("click", (e) => (e.preventDefault(), copyShareLink(dom)));
  if (dom.btnCsv) dom.btnCsv.addEventListener("click", (e) => (e.preventDefault(), downloadCSV(dom)));
  if (dom.btnPrint) dom.btnPrint.addEventListener("click", (e) => (e.preventDefault(), doPrint()));
}

/* ---------------- Init ---------------- */
(function init() {
  preventFormSubmit();

  const dom = mapDOM();
  forceButtonType(dom);

  // Minimal health check
  if (!dom.elIntensity || !dom.elCp) {
    warn("Some inputs not found. Check IDs in HTML (intensity/cp/etc).");
  }

  // Load state
  const loadedFromUrl = applyStateFromUrl(dom);
  if (!loadedFromUrl) loadFromStorage(dom);

  // Wiring
  wireButtons(dom);
  wireScenarioButtons(dom);
  wireInputsOverride(dom);

  // Initial UI
  renderDashes(dom, "Enter inputs then Apply");
  setStatus(dom, "Ready.");

  // Auto apply if enough
  const inputs = readInputs(dom);
  if (hasEnough(inputs)) doApply(dom);

  log("Initialized v4", {
    applyFound: !!dom.btnApply,
    resetFound: !!dom.btnReset,
  });
})();
```0
