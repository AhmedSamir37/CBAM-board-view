٦"use strict";

/* =======================
   CBAM Board View — script.js (REBUILD v1)
   Works with your provided index.html IDs
   ======================= */

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

  // buttons
  btnToggleInputs: $("btnToggleInputs"),
  btnCopyLink: $("btnCopyLink"),
  btnCsv: $("btnCsv"),
  btnPrint: $("btnPrint"),
  btnInstall: $("btnInstall"),
  btnApply: $("btnApply"),
  btnReset: $("btnReset"),

  // panels/status
  inputsPanel: $("inputsPanel"),
  statusText: $("statusText"),

  // outputs
  kpiAnnual: $("kpiAnnual"),
  kpiPerTon: $("kpiPerTon"),
  kpiTco2: $("kpiTco2"),
  kpiNet: $("kpiNet"),
  kpiAnnualNote: $("kpiAnnualNote"),

  scnCp: $("scnCp"),
  scnInt: $("scnInt"),
  scnAnnual: $("scnAnnual"),
  scnPerTon: $("scnPerTon"),
};

const STORAGE_KEY = "cbam_board_view_rebuild_v1";

const SCENARIOS = {
  base: { cpMult: 1.0, intMult: 1.0 },
  conservative: { cpMult: 0.85, intMult: 0.92 },
  stress: { cpMult: 1.25, intMult: 1.15 },
};

let currentScenario = "base";
let euTonsOverridden = false;

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
function fmt(n, d = 0) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function setText(node, txt) {
  if (node) node.textContent = txt;
}
function setVal(node, v) {
  if (node) node.value = v;
}
function setStatus(msg) {
  setText(el.statusText, msg);
}

function renderDashes(note = "Enter inputs then Apply") {
  setText(el.kpiAnnual, "—");
  setText(el.kpiPerTon, "—");
  setText(el.kpiTco2, "—");
  setText(el.kpiNet, "—");
  setText(el.kpiAnnualNote, note);

  setText(el.scnCp, "—");
  setText(el.scnInt, "—");
  setText(el.scnAnnual, "—");
  setText(el.scnPerTon, "—");
}

function readInputs() {
  const totalProd = Math.max(0, num(el.totalProd?.value, 0));
  const euShare = clamp(num(el.euShare?.value, 0), 0, 100);

  const autoEuTons = totalProd * (euShare / 100);

  let euTons = Math.max(0, num(el.euTons?.value, 0));
  if (!euTonsOverridden) {
    euTons = autoEuTons;

    // only auto-fill when user not actively typing in EU tons
    if (el.euTons && document.activeElement !== el.euTons) {
      setVal(el.euTons, autoEuTons > 0 ? String(Math.round(autoEuTons)) : "");
    }
  }

  const intensity = Math.max(0, num(el.intensity?.value, 0));
  const cp = Math.max(0, num(el.cp?.value, 0));
  const exempt = clamp(num(el.exempt?.value, 0), 0, 100);

  const eurusd = Math.max(0, num(el.eurusd?.value, 0));
  const route = (el.route?.value || "").trim();

  return { totalProd, euShare, autoEuTons, euTons, intensity, cp, exempt, eurusd, route };
}

function hasEnough(i) {
  return i.euTons > 0 && i.intensity > 0 && i.cp > 0;
}

function calc(i) {
  const coveredTco2 = i.euTons * i.intensity;
  const grossEUR = coveredTco2 * i.cp;
  const netEUR = grossEUR * (1 - i.exempt / 100);
  const perTonEUR = i.euTons > 0 ? netEUR / i.euTons : 0;
  return { coveredTco2, grossEUR, netEUR, perTonEUR };
}

function calcScenario(i, key) {
  const sc = SCENARIOS[key] || SCENARIOS.base;
  const cpS = i.cp * sc.cpMult;
  const intS = i.intensity * sc.intMult;

  const coveredTco2 = i.euTons * intS;
  const grossEUR = coveredTco2 * cpS;
  const netEUR = grossEUR * (1 - i.exempt / 100);
  const perTonEUR = i.euTons > 0 ? netEUR / i.euTons : 0;

  return { cpS, intS, netEUR, perTonEUR };
}

function renderAll() {
  const i = readInputs();

  if (!hasEnough(i)) {
    renderDashes("Enter inputs then Apply");
    setStatus("Ready.");
    saveState(i);
    return;
  }

  const out = calc(i);
  setText(el.kpiAnnual, fmt(out.netEUR, 0));
  setText(el.kpiPerTon, fmt(out.perTonEUR, 2));
  setText(el.kpiTco2, fmt(out.coveredTco2, 0));
  setText(el.kpiNet, fmt(out.netEUR, 0));
  setText(el.kpiAnnualNote, "Computed");

  const s = calcScenario(i, currentScenario);
  setText(el.scnCp, fmt(s.cpS, 2));
  setText(el.scnInt, fmt(s.intS, 2));
  setText(el.scnAnnual, fmt(s.netEUR, 0));
  setText(el.scnPerTon, fmt(s.perTonEUR, 2));

  saveState(i);
  setStatus("Updated.");
}

function setScenario(key) {
  if (!SCENARIOS[key]) key = "base";
  currentScenario = key;

  document.querySelectorAll("[data-scn]").forEach((b) => b.classList.remove("is-active"));
  const active = document.querySelector(`[data-scn="${key}"]`);
  if (active) active.classList.add("is-active");
}

function encodeHash(i) {
  const sp = new URLSearchParams();
  if (i.totalProd) sp.set("p", String(Math.round(i.totalProd)));
  if (i.euShare) sp.set("es", String(i.euShare));
  if (i.euTons) sp.set("et", String(Math.round(i.euTons)));
  if (i.intensity) sp.set("i", String(i.intensity));
  if (i.cp) sp.set("cp", String(i.cp));
  if (i.exempt) sp.set("ex", String(i.exempt));
  if (i.eurusd) sp.set("fx", String(i.eurusd));
  if (i.route) sp.set("r", i.route);
  sp.set("scn", currentScenario);
  return sp.toString();
}

function applyFromHash() {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  if (!hash) return false;

  const sp = new URLSearchParams(hash);
  const p = sp.get("p");
  const es = sp.get("es");
  const et = sp.get("et");
  const inten = sp.get("i");
  const cp = sp.get("cp");
  const ex = sp.get("ex");
  const fx = sp.get("fx");
  const r = sp.get("r");
  const scn = sp.get("scn");

  if (p != null) setVal(el.totalProd, p);
  if (es != null) setVal(el.euShare, es);

  if (et != null) {
    setVal(el.euTons, et);
    euTonsOverridden = true;
  }

  if (inten != null) setVal(el.intensity, inten);
  if (cp != null) setVal(el.cp, cp);
  if (ex != null) setVal(el.exempt, ex);
  if (fx != null) setVal(el.eurusd, fx);
  if (r != null) setVal(el.route, r);

  if (scn) setScenario(scn);

  return true;
}

function saveState(i) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...i, currentScenario, euTonsOverridden })
    );
  } catch (_) {}

  // update shareable hash (only when Apply is used, to avoid noisy hash while typing)
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw);

    if (o.totalProd != null) setVal(el.totalProd, o.totalProd);
    if (o.euShare != null) setVal(el.euShare, o.euShare);
    if (o.euTons != null) setVal(el.euTons, o.euTons);
    if (o.intensity != null) setVal(el.intensity, o.intensity);
    if (o.cp != null) setVal(el.cp, o.cp);
    if (o.exempt != null) setVal(el.exempt, o.exempt);
    if (o.eurusd != null) setVal(el.eurusd, o.eurusd);
    if (o.route != null) setVal(el.route, o.route);

    euTonsOverridden = !!o.euTonsOverridden;
    setScenario(o.currentScenario || "base");
    return true;
  } catch (_) {
    return false;
  }
}

function doApply() {
  const i = readInputs();
  location.hash = encodeHash(i);
  renderAll();
}

function doReset() {
  setVal(el.totalProd, "");
  setVal(el.euShare, "");
  setVal(el.euTons, "");
  setVal(el.intensity, "");
  setVal(el.cp, "");
  setVal(el.exempt, "");
  setVal(el.eurusd, "");
  setVal(el.route, "");

  euTonsOverridden = false;
  setScenario("base");

  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  location.hash = "";

  renderDashes("Enter inputs then Apply");
  setStatus("Ready.");
}

function toggleInputs() {
  if (!el.inputsPanel) return;
  const hidden = el.inputsPanel.getAttribute("aria-hidden") === "true";
  el.inputsPanel.setAttribute("aria-hidden", hidden ? "false" : "true");
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
  const i = readInputs();
  const enough = hasEnough(i);
  const out = enough ? calc(i) : null;

  const rows = [
    ["CBAM Board View", ""],
    ["Route", i.route || ""],
    ["Scenario", currentScenario],
    ["", ""],
    ["Total production (t/y)", i.totalProd || ""],
    ["EU share (%)", i.euShare || ""],
    ["EU tons (t/y)", i.euTons ? Math.round(i.euTons) : ""],
    ["Emissions intensity (tCO2/t)", i.intensity || ""],
    ["Carbon price (€/tCO2)", i.cp || ""],
    ["Exemptions (%)", i.exempt || ""],
    ["FX EUR/USD (optional)", i.eurusd || ""],
    ["", ""],
    ["Covered emissions (tCO2)", out ? Math.round(out.coveredTco2) : ""],
    ["Net exposure (€/year)", out ? Math.round(out.netEUR) : ""],
    ["CBAM cost per ton (€/t)", out ? out.perTonEUR.toFixed(2) : ""],
  ];

  const csv = rows
    .map((r) =>
      r
        .map((x) => {
          const s = String(x ?? "");
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

  setStatus("CSV downloaded.");
}

function wire() {
  // EU tons override detection
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
if (el.btnGuide) {
  el.btnGuide.addEventListener("click", () => {
    window.location.href = "./docs/user-guide.html";
  });
}
  // scenarios
  document.querySelectorAll("[data-scn]").forEach((b) => {
    b.addEventListener("click", () => {
      const key = b.getAttribute("data-scn");
      setScenario(key);
      doApply();
    });
  });
}

(function init() {
  const initReport = {
    applyFound: !!el.btnApply,
    resetFound: !!el.btnReset,
    inputsPanelFound: !!el.inputsPanel,
    outputsFound: !!(el.kpiAnnual && el.kpiPerTon && el.kpiTco2 && el.kpiNet),
  };
  console.log("[CBAM] Initialized REBUILD v1", initReport);

  setScenario("base");

  const loadedHash = applyFromHash();
  if (!loadedHash) loadState();

  wire();

  renderDashes("Enter inputs then Apply");
  setStatus("Ready.");

  // Soft auto-fill of EU tons when prod/share typed (without applying results)
  ["input", "change"].forEach((evt) => {
    el.totalProd?.addEventListener(evt, () => readInputs());
    el.euShare?.addEventListener(evt, () => readInputs());
  });
})();
