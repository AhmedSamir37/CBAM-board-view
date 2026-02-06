/* ==========================================================
CBAM Board View (Steel – EAF/DRI) — script.js (CLEAN v3.2)

Strong KPI rendering (— when not enough inputs)

Scenarios: Base / Conservative / Stress

Auto EU tons unless overridden

Shareable URL hash state

Copy link / CSV / Print

PWA install support

Soft click sound (mobile-safe unlock)
========================================================== */
"use strict";


/* ===================== UI click sound ===================== */
let uiClickSound = null;

function initClickSound() {
if (uiClickSound) return;

uiClickSound = new Audio("sounds/click.wav");
uiClickSound.preload = "auto";
uiClickSound.volume = 0.25; // خفيف وواضح

// Unlock audio on mobile browsers (must be triggered by a user gesture)
const unlock = () => {
try {
uiClickSound
.play()
.then(() => {
uiClickSound.pause();
uiClickSound.currentTime = 0;
})
.catch(() => {});
} catch (e) {}
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
uiClickSound.play();
} catch (e) {}
}

function wireClickSound() {
// Play for ANY button click (clean + consistent)
document.addEventListener("click", (e) => {
const btn = e.target.closest("button");
if (!btn || btn.disabled) return;
playClick();
});
}
/* ========================================================== */

/* ---------------- Helpers ---------------- */
const $ = (id) => document.getElementById(id);

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
return s === "null" || s === "undefined" ? fallback : s;
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
if (el) el.value = v;
}

/* ---------------- DOM (IDs must match index.html) ---------------- */
// Inputs
const elTotalProd = $("totalProd");
const elEuShare = $("euShare");
const elEuTons = $("euTons");
const elIntensity = $("intensity");
const elCp = $("cp");
const elExempt = $("exempt");
const elFx = $("eurusd");
const elRoute = $("route");

// Buttons
const btnToggleInputs = $("btnToggleInputs");
const btnCopyLink = $("btnCopyLink");
const btnCsv = $("btnCsv");
const btnPrint = $("btnPrint");
const btnInstall = $("btnInstall");
const btnApply = $("btnApply");
const btnReset = $("btnReset");

// Panels / status
const inputsPanel = $("inputsPanel");
const statusText = $("statusText");

// KPI outputs
const outAnnual = $("kpiAnnual");
const outPerTon = $("kpiPerTon");
const outTco2 = $("kpiTco2");
const outNet = $("kpiNet");
const outAnnualNote = $("kpiAnnualNote");

// Scenario outputs
const scnCp = $("scnCp");
const scnInt = $("scnInt");
const scnAnnual = $("scnAnnual");
const scnPerTon = $("scnPerTon");

/* ---------------- State ---------------- */
const STORAGE_KEY = "cbam_board_view_v32";

const SCENARIOS = {
base: { cpMult: 1.0, intMult: 1.0 },
conservative: { cpMult: 0.85, intMult: 0.92 },
stress: { cpMult: 1.25, intMult: 1.15 },
};

let currentScenario = "base";
let euTonsOverridden = false;

// PWA
let deferredInstallPrompt = null;

/* ---------------- Core Math ----------------
Covered tCO2 = EU_tons * intensity
Gross €/year = Covered tCO2 * carbon_price
Net €/year   = Gross * (1 - exemptions%)
€/t exported = Net / EU_tons
-------------------------------------------- */
function readInputs() {
const totalProd = Math.max(0, num(elTotalProd?.value, 0));
const euShare = clamp(num(elEuShare?.value, 0), 0, 100);

const autoEuTons = totalProd * (euShare / 100);
let euTons = Math.max(0, num(elEuTons?.value, 0));

// Auto-fill unless overridden
if (!euTonsOverridden) {
euTons = autoEuTons;

// avoid fighting user while typing  
if (elEuTons && document.activeElement !== elEuTons) {  
  setVal(elEuTons, autoEuTons ? String(Math.round(autoEuTons)) : "");  
}

}

const intensity = Math.max(0, num(elIntensity?.value, 0));
const cp = Math.max(0, num(elCp?.value, 0));
const exempt = clamp(num(elExempt?.value, 0), 0, 100);
const fx = Math.max(0, num(elFx?.value, 0)); // optional
const route = safeStr(elRoute?.value, "").trim();

return { totalProd, euShare, autoEuTons, euTons, intensity, cp, exempt, fx, route };
}

function hasEnough(inputs) {
// Board-grade minimum: EU tons > 0 AND cp > 0 AND intensity > 0
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
function renderDashes(note = "Enter inputs then Apply") {
setText(outAnnual, "—");
setText(outPerTon, "—");
setText(outTco2, "—");
setText(outNet, "—");
if (outAnnualNote) setText(outAnnualNote, note);

setText(scnCp, "—");
setText(scnInt, "—");
setText(scnAnnual, "—");
setText(scnPerTon, "—");
}

function renderMain(out) {
setText(outAnnual, fmtNumber(out.netEUR, 0));
setText(outPerTon, fmtNumber(out.perTonEUR, 2));
setText(outTco2, fmtNumber(out.coveredTco2, 0));
setText(outNet, fmtNumber(out.netEUR, 0));
if (outAnnualNote) setText(outAnnualNote, "Computed");
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

// visual toggle for buttons that have data-scn
document.querySelectorAll("[data-scn]").forEach((b) => b.classList.remove("is-active"));
const active = document.querySelector([data-scn="${key}"]);
if (active) active.classList.add("is-active");
}

/* ---------------- URL State ---------------- */
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

euTonsOverridden = !!obj.euTonsOverridden;  
if (obj.currentScenario && SCENARIOS[obj.currentScenario]) setScenarioUI(obj.currentScenario);  

return true;

} catch (_) {
return false;
}
}

/* ---------------- Actions ---------------- */
function setStatus(msg) {
if (statusText) setText(statusText, msg);
}

function doApply() {
const inputs = readInputs();

if (!hasEnough(inputs)) {
renderDashes("Enter inputs then Apply");
setStatus("Ready.");
saveToStorage(inputs);
return;
}

const out = calc(inputs);
renderMain(out);
renderScenario(inputs);

location.hash = encodeState(inputs);
saveToStorage(inputs);

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

try {
localStorage.removeItem(STORAGE_KEY);
} catch (_) {}

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
// fallback
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
const inputs = readInputs();
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
if (s.includes(",") || s.includes('"') || s.includes("\n")) return "${s.replace(/"/g, '""')}";
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

function doPrint() {
window.print();
}

/* ---------------- Wiring ---------------- */
function wireScenarioButtons() {
document.querySelectorAll("[data-scn]").forEach((b) => {
b.addEventListener("click", () => {
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
if (btnToggleInputs) btnToggleInputs.addEventListener("click", toggleInputsPanel);
if (btnCopyLink) btnCopyLink.addEventListener("click", copyShareLink);
if (btnCsv) btnCsv.addEventListener("click", downloadCSV);
if (btnPrint) btnPrint.addEventListener("click", doPrint);
}

function wireApplyReset() {
if (btnApply) btnApply.addEventListener("click", doApply);
if (btnReset) btnReset.addEventListener("click", doReset);
}

function wirePWAInstall() {
window.addEventListener("beforeinstallprompt", (e) => {
e.preventDefault();
deferredInstallPrompt = e;
if (btnInstall) btnInstall.hidden = false;
});

if (!btnInstall) return;
btnInstall.addEventListener("click", async () => {
if (!deferredInstallPrompt) return;
deferredInstallPrompt.prompt();
try {
await deferredInstallPrompt.userChoice;
} catch (_) {}
deferredInstallPrompt = null;
btnInstall.hidden = true;
});
}

/* ---------------- Init ---------------- */
(function init() {
setScenarioUI("base");

const loadedFromUrl = applyStateFromUrl();
if (!loadedFromUrl) loadFromStorage();

wireTopBar();
wireScenarioButtons();
wireApplyReset();
wireInputsOverride();
wirePWAInstall();

initClickSound();
wireClickSound();

renderDashes("Enter inputs then Apply");
setStatus("Ready.");

// Auto-apply if enough inputs
const inputs = readInputs();
if (hasEnough(inputs)) doApply();
})();
