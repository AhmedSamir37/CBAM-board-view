/* =========================================================
   CBAM Board View (Steel – EAF/DRI) — script.js (FULL)
   - Fix: route label "null"
   - Apply calculations + scenarios
   - Shareable URL state + Copy link
   - CSV export + Print
   ========================================================= */

"use strict";

/* ---------- Small helpers ---------- */
function num(v, fallback = 0) {
  const n = Number(v);
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

function fmtMoneyEUR(n, decimals = 0) {
  if (!Number.isFinite(Number(n))) return "—";
  return fmtNumber(n, decimals);
}

function qs(id) {
  return document.getElementById(id);
}

function setText(el, txt) {
  if (!el) return;
  el.textContent = txt;
}

/* ---------- Scenario model ---------- */
const SCENARIOS = {
  base: {
    label: "Base",
    cpFactor: 1.0,
    intFactor: 1.0,
  },
  conservative: {
    label: "Conservative",
    // Matches what you saw: 80 -> 68 (0.85), 2.10 -> ~1.93 (0.92)
    cpFactor: 0.85,
    intFactor: 0.92,
  },
  stress: {
    label: "Stress",
    cpFactor: 1.15,
    intFactor: 1.08,
  },
};

let state = {
  scn: "base",
  euTonsManual: false,
};

/* ---------- Bind DOM ---------- */
const el = {
  // Inputs
  totalProd: qs("totalProd"),
  euShare: qs("euShare"),
  euTons: qs("euTons"),
  intensity: qs("intensity"),
  cp: qs("cp"),
  exempt: qs("exempt"),
  eurusd: qs("eurusd"),
  route: qs("route"),

  // Buttons
  btnToggleInputs: qs("btnToggleInputs"),
  btnCopyLink: qs("btnCopyLink"),
  btnCsv: qs("btnCsv"),
  btnPrint: qs("btnPrint"),
  btnInstall: qs("btnInstall"), // optional (handled in app.js usually)
  btnApply: document.querySelector('button[type="button"][data-action="apply"]') || null,

  // Panels
  inputsPanel: qs("inputsPanel"),

  // KPI outputs (must match index.html ids)
  kpiAnnual: qs("kpiAnnual"),
  kpiAnnualSub: qs("kpiAnnualSub"),
  kpiPerTon: qs("kpiPerTon"),
  kpiPerTonSub: qs("kpiPerTonSub"),
  kpiEmissions: qs("kpiEmissions"),
  kpiEmissionsSub: qs("kpiEmissionsSub"),
  kpiNet: qs("kpiNet"),
  kpiNetSub: qs("kpiNetSub"),

  // Scenario cards outputs
  scnCp: qs("scnCp"),
  scnInt: qs("scnInt"),
  scnAnnual: qs("scnAnnual"),
  scnPerTon: qs("scnPerTon"),

  // Scenario buttons (chips)
  scnBtns: Array.from(document.querySelectorAll("button[data-scn]")),
};

/* ---------- URL state (share link) ---------- */
function readURLState() {
  const sp = new URLSearchParams(window.location.search);

  const totalProd = num(sp.get("p"), num(el.totalProd?.value, 0));
  const euShare = num(sp.get("s"), num(el.euShare?.value, 0));
  const euTons = sp.has("t") ? num(sp.get("t"), 0) : NaN;
  const intensity = num(sp.get("i"), num(el.intensity?.value, 0));
  const cp = num(sp.get("c"), num(el.cp?.value, 0));
  const exempt = num(sp.get("e"), num(el.exempt?.value, 0));
  const eurusd = sp.has("fx") ? sp.get("fx") : "";
  const scn = sp.get("scn") || "base";

  // Fix: route "null"
  const routeParam = sp.has("r") ? sp.get("r") : "";
  const route =
    routeParam === null || routeParam === undefined || routeParam === "null"
      ? ""
      : String(routeParam).trim();

  if (el.totalProd) el.totalProd.value = totalProd ? String(totalProd) : "";
  if (el.euShare) el.euShare.value = euShare ? String(euShare) : "";
  if (el.intensity) el.intensity.value = intensity ? String(intensity) : "";
  if (el.cp) el.cp.value = cp ? String(cp) : "";
  if (el.exempt) el.exempt.value = String(exempt || 0);
  if (el.eurusd) el.eurusd.value = eurusd ? String(eurusd) : "";
  if (el.route) el.route.value = route || "";

  // EU tons: if URL has it, treat as manual override
  if (el.euTons) {
    if (Number.isFinite(euTons) && euTons > 0) {
      el.euTons.value = String(euTons);
      state.euTonsManual = true;
    } else {
      // leave empty; will auto-calc if possible
      state.euTonsManual = false;
    }
  }

  state.scn = SCENARIOS[scn] ? scn : "base";
}

function buildShareURL() {
  const sp = new URLSearchParams();

  const p = num(el.totalProd?.value, 0);
  const s = num(el.euShare?.value, 0);
  const t = num(el.euTons?.value, 0);
  const i = num(el.intensity?.value, 0);
  const c = num(el.cp?.value, 0);
  const e = num(el.exempt?.value, 0);

  const fxRaw = el.eurusd?.value;
  const fx = fxRaw === null || fxRaw === undefined ? "" : String(fxRaw).trim();

  // Fix: route "null"
  const routeRaw = el.route?.value;
  const route =
    routeRaw === null || routeRaw === undefined || routeRaw === "null"
      ? ""
      : String(routeRaw).trim();

  if (p > 0) sp.set("p", String(p));
  if (s > 0) sp.set("s", String(s));
  // only include t if user actually set it (override)
  if (state.euTonsManual && t > 0) sp.set("t", String(t));
  if (i > 0) sp.set("i", String(i));
  if (c > 0) sp.set("c", String(c));
  if (e > 0) sp.set("e", String(e));
  if (fx) sp.set("fx", fx);
  if (route) sp.set("r", route);
  sp.set("scn", state.scn);

  const base = `${window.location.origin}${window.location.pathname}`;
  const q = sp.toString();
  return q ? `${base}?${q}` : base;
}

/* ---------- Core calculations ---------- */
function calcEUtonsAuto(totalProd, euSharePct) {
  if (!(totalProd > 0) || !(euSharePct > 0)) return 0;
  return (totalProd * euSharePct) / 100;
}

function computeBase() {
  const totalProd = num(el.totalProd?.value, 0);
  const euShare = clamp(num(el.euShare?.value, 0), 0, 100);

  const intensity = num(el.intensity?.value, 0); // tCO2 per t exported
  const cp = num(el.cp?.value, 0); // €/tCO2
  const exempt = clamp(num(el.exempt?.value, 0), 0, 100);

  // EU tons (auto unless user overrides)
  let euTons = num(el.euTons?.value, 0);
  if (!state.euTonsManual) {
    euTons = calcEUtonsAuto(totalProd, euShare);
    if (el.euTons) el.euTons.value = euTons > 0 ? fmtNumber(euTons, 0).replace(/,/g, "") : "";
  }

  const coveredEmissions = euTons * intensity; // tCO2
  const gross = coveredEmissions * cp; // €
  const net = gross * (1 - exempt / 100);
  const perTon = intensity * cp; // €/t exported

  // route label safe (fix "null")
  const routeRaw = el.route?.value;
  const route =
    routeRaw === null || routeRaw === undefined || routeRaw === "null"
      ? ""
      : String(routeRaw).trim();

  return {
    totalProd,
    euShare,
    euTons,
    intensity,
    cp,
    exempt,
    coveredEmissions,
    gross,
    net,
    perTon,
    route,
  };
}

function computeScenario(base, scnKey) {
  const scn = SCENARIOS[scnKey] || SCENARIOS.base;
  const cp = base.cp * scn.cpFactor;
  const intensity = base.intensity * scn.intFactor;

  const coveredEmissions = base.euTons * intensity;
  const gross = coveredEmissions * cp;
  const net = gross * (1 - base.exempt / 100);
  const perTon = intensity * cp;

  return {
    cp,
    intensity,
    coveredEmissions,
    gross,
    net,
    perTon,
  };
}

/* ---------- Render outputs ---------- */
function renderKPIs(base) {
  // Annual CBAM exposure (EU exports) = gross
  setText(el.kpiAnnual, base.gross > 0 ? `${fmtMoneyEUR(base.gross, 0)}` : "—");
  setText(
    el.kpiAnnualSub,
    base.euTons > 0
      ? `EU tons: ${fmtNumber(base.euTons, 0)} t/y · Exemptions: ${fmtNumber(base.exempt, 2)}%`
      : "Enter inputs then Apply"
  );

  // €/t exported
  setText(el.kpiPerTon, base.perTon > 0 ? `${fmtMoneyEUR(base.perTon, 2)}` : "—");
  setText(el.kpiPerTonSub, base.euTons > 0 ? "Net ÷ EU tons" : "CBAM cost per ton exported");

  // Covered emissions
  setText(el.kpiEmissions, base.coveredEmissions > 0 ? `${fmtNumber(base.coveredEmissions, 0)}` : "—");
  setText(el.kpiEmissionsSub, base.euTons > 0 ? "EU tons × intensity" : "");

  // Net exposure after exemptions
  setText(el.kpiNet, base.net > 0 ? `${fmtMoneyEUR(base.net, 0)}` : "—");
  setText(el.kpiNetSub, base.euTons > 0 ? "Gross × (1 − exemptions)" : "");
}

function renderScenarioCards(base) {
  const s = computeScenario(base, state.scn);

  setText(el.scnCp, s.cp > 0 ? fmtNumber(s.cp, 2) : "—");
  setText(el.scnInt, s.intensity > 0 ? fmtNumber(s.intensity, 2) : "—");
  setText(el.scnAnnual, s.net > 0 ? fmtMoneyEUR(s.net, 0) : "—");
  setText(el.scnPerTon, s.perTon > 0 ? fmtMoneyEUR(s.perTon, 2) : "—");
}

function setActiveScenarioButton() {
  el.scnBtns.forEach((b) => {
    const key = b.getAttribute("data-scn");
    if (!key) return;
    if (key === state.scn) b.classList.add("is-active");
    else b.classList.remove("is-active");
  });
}

/* ---------- Actions ---------- */
function applyAll() {
  const base = computeBase();
  renderKPIs(base);
  renderScenarioCards(base);
  setActiveScenarioButton();
  // keep URL clean but do not force navigation unless user clicks copy
}

async function copyShareLink() {
  const url = buildShareURL();
  try {
    await navigator.clipboard.writeText(url);
    // optional: small UX feedback
    const btn = el.btnCopyLink;
    if (btn) {
      const old = btn.textContent;
      btn.textContent = "Copied ✓";
      setTimeout(() => (btn.textContent = old), 900);
    }
  } catch {
    // fallback: prompt
    window.prompt("Copy this link:", url);
  }
}

function downloadCSV() {
  const base = computeBase();
  const sBase = computeScenario(base, "base");
  const sCon = computeScenario(base, "conservative");
  const sStr = computeScenario(base, "stress");

  const fxRaw = el.eurusd?.value;
  const fx =
    fxRaw === null || fxRaw === undefined || fxRaw === "null"
      ? ""
      : String(fxRaw).trim();

  const routeRaw = el.route?.value;
  const route =
    routeRaw === null || routeRaw === undefined || routeRaw === "null"
      ? ""
      : String(routeRaw).trim();

  const rows = [
    ["CBAM Board View (Steel – EAF/DRI)", ""],
    ["Route label", route || ""],
    ["", ""],
    ["INPUTS", ""],
    ["Total production (t/y)", base.totalProd],
    ["EU share (%)", base.euShare],
    ["EU tons (t/y)", base.euTons],
    ["Emissions intensity (tCO2/t exported)", base.intensity],
    ["Carbon price (€/tCO2)", base.cp],
    ["Exemptions / free allocation (%)", base.exempt],
    ["FX EUR/USD (optional)", fx],
    ["", ""],
    ["RESULTS (Base)", ""],
    ["Annual CBAM exposure (€/year)", Math.round(sBase.net)],
    ["€/t exported", Number(sBase.perTon.toFixed(2))],
    ["Covered emissions (tCO2)", Math.round(sBase.coveredEmissions)],
    ["", ""],
    ["SCENARIOS", ""],
    ["Scenario", "Annual (€/year)"],
    ["Base", Math.round(sBase.net)],
    ["Conservative", Math.round(sCon.net)],
    ["Stress", Math.round(sStr.net)],
  ];

  const csv = rows
    .map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = "cbam-board-view.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toggleInputsPanel() {
  if (!el.inputsPanel) return;

  const isHidden = el.inputsPanel.getAttribute("aria-hidden") === "true";
  el.inputsPanel.setAttribute("aria-hidden", isHidden ? "false" : "true");

  // Optional: also toggle a class if your CSS uses it
  el.inputsPanel.classList.toggle("is-open", isHidden);
}

/* ---------- Auto EU tons behavior ---------- */
function wireAutoEUtons() {
  if (!el.euTons) return;

  // If user types EU tons → becomes manual override
  el.euTons.addEventListener("input", () => {
    const v = String(el.euTons.value || "").trim();
    state.euTonsManual = v.length > 0;
  });

  // If totalProd/euShare changes and not manual → recalc EU tons
  const recalc = () => {
    if (state.euTonsManual) return;
    const totalProd = num(el.totalProd?.value, 0);
    const euShare = clamp(num(el.euShare?.value, 0), 0, 100);
    const euTons = calcEUtonsAuto(totalProd, euShare);
    el.euTons.value = euTons > 0 ? String(Math.round(euTons)) : "";
  };

  if (el.totalProd) el.totalProd.addEventListener("input", recalc);
  if (el.euShare) el.euShare.addEventListener("input", recalc);
}

/* ---------- Scenario buttons ---------- */
function wireScenarioButtons() {
  el.scnBtns.forEach((b) => {
    b.addEventListener("click", () => {
      const key = b.getAttribute("data-scn");
      if (!key || !SCENARIOS[key]) return;
      state.scn = key;
      applyAll();
    });
  });
}

/* ---------- Apply button wiring ---------- */
function wireApplyButton() {
  // In your UI, Apply is a <button> without id; easiest is query by text if needed.
  // We'll wire by searching the first button with text "Apply" inside the document.
  let applyBtn = document.querySelector("button");
  const candidates = Array.from(document.querySelectorAll("button"));
  applyBtn = candidates.find((x) => (x.textContent || "").trim().toLowerCase() === "apply") || null;

  if (applyBtn) applyBtn.addEventListener("click", applyAll);
}

/* ---------- Top action buttons ---------- */
function wireTopButtons() {
  if (el.btnToggleInputs) el.btnToggleInputs.addEventListener("click", toggleInputsPanel);
  if (el.btnCopyLink) el.btnCopyLink.addEventListener("click", copyShareLink);
  if (el.btnCsv) el.btnCsv.addEventListener("click", downloadCSV);
  if (el.btnPrint) el.btnPrint.addEventListener("click", () => window.print());
}

/* ---------- Init ---------- */
function init() {
  readURLState();

  wireTopButtons();
  wireApplyButton();
  wireAutoEUtons();
  wireScenarioButtons();

  // First render (so it doesn't look dead)
  applyAll();
}

document.addEventListener("DOMContentLoaded", init);
