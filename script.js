// CBAM Board View - Core Logic
// Pure JS, no libraries, offline friendly

const $ = (id) => document.getElementById(id);

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatNumber(n, decimals = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

function formatMoneyEUR(n) {
  return "€ " + formatNumber(n, 2);
}

function formatTCO2(n) {
  return formatNumber(n, 3) + " tCO₂";
}

function getInputs() {
  return {
    totalProd: safeNumber($("totalProd")?.value),
    exportEU: safeNumber($("exportEU")?.value),
    co2Intensity: safeNumber($("co2Intensity")?.value),
    carbonPrice: safeNumber($("carbonPrice")?.value),
    freeAllow: safeNumber($("freeAllow")?.value),
    elecShare: safeNumber($("elecShare")?.value),
    elecEF: safeNumber($("elecEF")?.value),
    scrapShare: safeNumber($("scrapShare")?.value),
    hbiShare: safeNumber($("hbiShare")?.value),
  };
}

function calcKPIs(inp) {
  // Basic model assumptions:
  // - EU export share drives CBAM exposure
  // - Carbon price €/tCO2
  // - Free allocation reduces payable tCO2 (as %)
  // - Electricity emissions factor affects intensity if elecShare is used

  const exportTons = Math.min(inp.exportEU, inp.totalProd);

  const freeFactor = Math.max(0, Math.min(inp.freeAllow / 100, 1));
  const payableFactor = 1 - freeFactor;

  const totalEmbeddedCO2 = exportTons * inp.co2Intensity; // tCO2
  const payableCO2 = totalEmbeddedCO2 * payableFactor;

  const cbamCost = payableCO2 * inp.carbonPrice; // €

  const cbamPerTon = exportTons > 0 ? cbamCost / exportTons : 0;

  // Electricity emissions contribution (simple):
  // If elecShare is given as % of total emissions, adjust intensity slightly.
  // (Not perfect science, but good decision-grade approximation.)
  const elecFactor = Math.max(0, Math.min(inp.elecShare / 100, 1));
  const adjustedIntensity =
    inp.co2Intensity * (1 - elecFactor) + inp.elecEF * elecFactor;

  // Scenario KPI signals:
  const riskScore = Math.min(
    100,
    Math.max(0, (cbamPerTon / 100) * 35 + inp.co2Intensity * 18)
  );

  return {
    exportTons,
    totalEmbeddedCO2,
    payableCO2,
    cbamCost,
    cbamPerTon,
    adjustedIntensity,
    riskScore,
  };
}

function updateUI() {
  const inp = getInputs();
  const kpi = calcKPIs(inp);

  if ($("kpiExport")) $("kpiExport").textContent = formatNumber(kpi.exportTons, 0) + " t/y";
  if ($("kpiIntensity")) $("kpiIntensity").textContent = formatTCO2(inp.co2Intensity) + "/t";
  if ($("kpiAdjIntensity")) $("kpiAdjIntensity").textContent = formatTCO2(kpi.adjustedIntensity) + "/t";
  if ($("kpiCBAM")) $("kpiCBAM").textContent = formatMoneyEUR(kpi.cbamCost);
  if ($("kpiCBAMperTon")) $("kpiCBAMperTon").textContent = formatMoneyEUR(kpi.cbamPerTon) + "/t";
  if ($("kpiPayableCO2")) $("kpiPayableCO2").textContent = formatTCO2(kpi.payableCO2);

  if ($("riskBar")) {
    $("riskBar").style.width = Math.min(100, kpi.riskScore) + "%";
  }
  if ($("riskScore")) {
    $("riskScore").textContent = Math.round(kpi.riskScore) + " / 100";
  }
}

function exportCSV() {
  const inp = getInputs();
  const kpi = calcKPIs(inp);

  const rows = [
    ["Metric", "Value"],
    ["Total Production (t/y)", inp.totalProd],
    ["Export to EU (t/y)", inp.exportEU],
    ["CO2 Intensity (tCO2/t)", inp.co2Intensity],
    ["Carbon Price (€/tCO2)", inp.carbonPrice],
    ["Free Allocation (%)", inp.freeAllow],
    ["Payable CO2 (tCO2)", kpi.payableCO2],
    ["CBAM Cost (€)", kpi.cbamCost],
    ["CBAM €/ton", kpi.cbamPerTon],
    ["Adjusted Intensity (tCO2/t)", kpi.adjustedIntensity],
    ["Risk Score (0-100)", kpi.riskScore],
  ];

  const csv = rows.map(r => r.join(",")).join("\n");
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

function copyShareLink() {
  const inp = getInputs();

  const params = new URLSearchParams({
    prod: inp.totalProd,
    eu: inp.exportEU,
    i: inp.co2Intensity,
    p: inp.carbonPrice,
    free: inp.freeAllow,
    es: inp.elecShare,
    ef: inp.elecEF,
    scrap: inp.scrapShare,
    hbi: inp.hbiShare,
  });

  const link = window.location.origin + window.location.pathname + "?" + params.toString();

  navigator.clipboard.writeText(link).then(() => {
    alert("Share link copied ✔️");
  }).catch(() => {
    prompt("Copy this link:", link);
  });
}

function loadFromURL() {
  const params = new URLSearchParams(window.location.search);

  if (params.has("prod")) $("totalProd").value = params.get("prod");
  if (params.has("eu")) $("exportEU").value = params.get("eu");
  if (params.has("i")) $("co2Intensity").value = params.get("i");
  if (params.has("p")) $("carbonPrice").value = params.get("p");
  if (params.has("free")) $("freeAllow").value = params.get("free");
  if (params.has("es")) $("elecShare").value = params.get("es");
  if (params.has("ef")) $("elecEF").value = params.get("ef");
  if (params.has("scrap")) $("scrapShare").value = params.get("scrap");
  if (params.has("hbi")) $("hbiShare").value = params.get("hbi");
}

function bindEvents() {
  const inputIds = [
    "totalProd",
    "exportEU",
    "co2Intensity",
    "carbonPrice",
    "freeAllow",
    "elecShare",
    "elecEF",
    "scrapShare",
    "hbiShare",
  ];

  inputIds.forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("input", updateUI);
  });

  if ($("btnCsv")) $("btnCsv").addEventListener("click", exportCSV);
  if ($("btnCopyLink")) $("btnCopyLink").addEventListener("click", copyShareLink);

  if ($("btnPrint")) {
    $("btnPrint").addEventListener("click", () => window.print());
  }

  if ($("btnToggleInputs")) {
    $("btnToggleInputs").addEventListener("click", () => {
      const panel = $("inputsPanel");
      if (!panel) return;

      const hidden = panel.getAttribute("aria-hidden") === "true";
      panel.setAttribute("aria-hidden", hidden ? "false" : "true");
      panel.classList.toggle("open", hidden);
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadFromURL();
  bindEvents();
  updateUI();
});
