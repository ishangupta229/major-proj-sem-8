const API_BASE = resolveApiBase();
const SENSOR_INTERVAL_MS = 2000;
const MAX_POINTS = 24;
const state = {
  age: null,
  sex: null,
  sensors: null,
  tick: 0,
  charts: {
    hr: null,
    spo2: null,
    stress: null,
    ageDist: null,
    sexDist: null,
    riskDist: null,
    spo2Band: null,
    modelCompare: null,
    featureImportance: null,
    confusionMatrix: null,
  },
  series: {
    labels: [],
    hr: [],
    spo2: [],
    stress: [],
  },
  datasetFilters: {
    sex: "all",
    minAge: "",
    maxAge: "",
    risk: "all",
  },
};

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("intakeForm")) {
    setupIntakePage();
  }

  if (document.getElementById("patientMeta")) {
    setupDashboardPage();
  }

  if (document.getElementById("datasetMeta")) {
    setupDatasetPage();
  }

  if (document.getElementById("modelAccuracy")) {
    setupModelInsightsPage();
  }
});

function setupIntakePage() {
  const form = document.getElementById("intakeForm");

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const age = Number(document.getElementById("age").value);
    const sex = Number(document.getElementById("sex").value);

    const params = new URLSearchParams({ age: String(age), sex: String(sex) });
    window.location.href = `dashboard.html?${params.toString()}`;
  });
}

function setupDashboardPage() {
  const params = new URLSearchParams(window.location.search);
  const ageParam = params.get("age");
  const sexParam = params.get("sex");
  state.age = Number(ageParam);
  state.sex = Number(sexParam);

  if (
    ageParam === null ||
    sexParam === null ||
    !Number.isFinite(state.age) ||
    !Number.isFinite(state.sex) ||
    state.age < 1 ||
    state.age > 120 ||
    (state.sex !== 0 && state.sex !== 1)
  ) {
    window.location.href = "index.html";
    return;
  }

  document.getElementById("patientMeta").textContent =
    `Patient: ${state.age} years, ${state.sex === 1 ? "Male" : "Female"}`;

  state.sensors = buildInitialSensors(state.age);
  initCharts();
  renderRiskRequestFields();
  renderAll();

  setInterval(() => {
    simulateSensors();
    renderAll();
    sendPrediction();
  }, SENSOR_INTERVAL_MS);

  sendPrediction();
}

function buildInitialSensors(age) {
  return {
    heart_rate: randomRange(72, 95),
    respiratory_rate: randomRange(14, 22),
    spo2: randomRange(94, 99),
    pulse_rate: randomRange(72, 96),
    body_temperature: randomRange(36.4, 37.3),
    hrv_rmssd: randomRange(22, 58),
    hrv_sdnn: randomRange(30, 75),
    activity_level: randomRange(20, 85),
    camera_heart_rate: randomRange(72, 98),
    camera_hrv: randomRange(20, 54),
    respiration_rate_camera: randomRange(13, 22),
    stress_score: randomRange(20, 82),
    fatigue_score: randomRange(18, 84),
    estimated_age: clamp(age + randomRange(-2, 2), 1, 120),
    skin_perfusion_index: randomRange(0.7, 1.9),
  };
}

function simulateSensors() {
  const s = state.sensors;
  const drift = Math.sin(state.tick / 4);

  s.heart_rate = clamp(s.heart_rate + randomRange(-4, 4) + drift, 55, 140);
  s.respiratory_rate = clamp(s.respiratory_rate + randomRange(-1.5, 1.5), 10, 30);
  s.spo2 = clamp(s.spo2 + randomRange(-1.2, 0.8), 86, 100);
  s.pulse_rate = clamp(s.heart_rate + randomRange(-2, 2), 50, 145);
  s.body_temperature = clamp(s.body_temperature + randomRange(-0.15, 0.2), 35.8, 39.2);
  s.hrv_rmssd = clamp(s.hrv_rmssd + randomRange(-4, 4), 8, 85);
  s.hrv_sdnn = clamp(s.hrv_sdnn + randomRange(-5, 5), 10, 120);
  s.activity_level = clamp(s.activity_level + randomRange(-8, 8), 0, 100);
  s.camera_heart_rate = clamp(s.heart_rate + randomRange(-3, 3), 50, 145);
  s.camera_hrv = clamp(s.hrv_rmssd + randomRange(-4, 4), 8, 90);
  s.respiration_rate_camera = clamp(s.respiratory_rate + randomRange(-1, 1), 10, 30);
  s.stress_score = clamp(s.stress_score + randomRange(-7, 7), 0, 100);
  s.fatigue_score = clamp(s.fatigue_score + randomRange(-6, 6), 0, 100);
  s.estimated_age = clamp(state.age + randomRange(-2, 2), 1, 120);
  s.skin_perfusion_index = clamp(s.skin_perfusion_index + randomRange(-0.12, 0.12), 0.2, 3.0);

  state.tick += 1;
}

function renderAll() {
  updateKpis();
  updateSeries();
  updateCharts();
  updateSensorList();
  updateWarnings();
}

function updateKpis() {
  const s = state.sensors;
  document.getElementById("heartRate").textContent = `${s.heart_rate.toFixed(0)} bpm`;
  document.getElementById("spo2").textContent = `${s.spo2.toFixed(1)}%`;
  document.getElementById("respRate").textContent = `${s.respiratory_rate.toFixed(0)} rpm`;
  document.getElementById("bodyTemp").textContent = `${s.body_temperature.toFixed(1)} C`;
}

function initCharts() {
  state.charts.hr = new Chart(document.getElementById("hrChart"), buildLineConfig("Heart Rate", "#8B6F47"));
  state.charts.spo2 = new Chart(document.getElementById("spo2Chart"), buildLineConfig("SpO2", "#6F8A6E"));
  state.charts.stress = new Chart(document.getElementById("stressChart"), buildLineConfig("Stress Score", "#AD6A62"));
}

function buildLineConfig(label, color) {
  return {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label,
          data: [],
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          pointRadius: 1.8,
          pointHoverRadius: 4,
          tension: 0.3,
        },
      ],
    },
    options: {
      animation: { duration: 550 },
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: "#6B6B6B" },
          grid: { color: "rgba(107, 107, 107, 0.16)" },
        },
        y: {
          ticks: { color: "#6B6B6B" },
          grid: { color: "rgba(107, 107, 107, 0.16)" },
        },
      },
    },
  };
}

function updateSeries() {
  const label = new Date().toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" });
  pushPoint(state.series.labels, label);
  pushPoint(state.series.hr, state.sensors.heart_rate.toFixed(1));
  pushPoint(state.series.spo2, state.sensors.spo2.toFixed(1));
  pushPoint(state.series.stress, state.sensors.stress_score.toFixed(1));
}

function pushPoint(arr, value) {
  arr.push(value);
  if (arr.length > MAX_POINTS) {
    arr.shift();
  }
}

function updateCharts() {
  const labels = state.series.labels;

  updateChart(state.charts.hr, labels, state.series.hr);
  updateChart(state.charts.spo2, labels, state.series.spo2);
  updateChart(state.charts.stress, labels, state.series.stress);
}

function updateChart(chart, labels, values) {
  chart.data.labels = labels;
  chart.data.datasets[0].data = values;
  chart.update("none");
}

function updateWarnings() {
  const warningBox = document.getElementById("warningBox");
  const warningText = document.getElementById("warningText");

  const warnings = [];
  if (state.sensors.spo2 < 92) {
    warnings.push(`Low oxygen saturation detected (${state.sensors.spo2.toFixed(1)}%).`);
  }
  if (state.sensors.heart_rate > 110) {
    warnings.push(`Elevated heart rate detected (${state.sensors.heart_rate.toFixed(0)} bpm).`);
  }

  if (warnings.length) {
    warningBox.hidden = false;
    warningText.textContent = warnings.join(" ");
  } else {
    warningBox.hidden = true;
  }
}

function updateSensorList() {
  const sensorList = document.getElementById("sensorList");
  const entries = [
    ["Pulse Rate", "pulse_rate ≈ heart_rate ± 2", `${state.sensors.pulse_rate.toFixed(1)} bpm`],
    ["Activity", "activity_level = normalized motion score", `${state.sensors.activity_level.toFixed(1)} / 100`],
    ["Stress Score", "stress_score = normalized stress index", `${state.sensors.stress_score.toFixed(1)} / 100`],
    ["Estimated Age", "estimated_age = age ± 2", `${state.sensors.estimated_age.toFixed(1)} years`],
  ];

  sensorList.innerHTML = "";
  entries.forEach(([name, formula, value]) => {
    const dt = document.createElement("dt");
    dt.innerHTML = `<span class="sensor-name">${name}</span><span class="sensor-formula">${formula}</span>`;
    const dd = document.createElement("dd");
    dd.textContent = value;
    sensorList.appendChild(dt);
    sensorList.appendChild(dd);
  });
}

function renderRiskRequestFields() {
  const list = document.getElementById("riskRequestFields");

  if (!list) {
    return;
  }

  const fields = [
    ["age", `${state.age} years`],
    ["sex", state.sex === 1 ? "1 (Male)" : "0 (Female)"],
    ["heart_rate", "Live wearable heart rate"],
    ["respiratory_rate", "Breaths per minute"],
    ["spo2", "Oxygen saturation percentage"],
    ["pulse_rate", "Pulse from sensor feed"],
    ["body_temperature", "Body temperature in C"],
    ["activity_level", "Normalized activity score"],
    ["stress_score", "Stress score from simulated stream"],
    ["estimated_age", "Estimated age from camera pipeline"],
  ];

  list.innerHTML = "";
  fields.forEach(([name, description]) => {
    const item = document.createElement("li");
    item.innerHTML = `<strong>${name}</strong>: ${description}`;
    list.appendChild(item);
  });
}

async function sendPrediction() {
  const payload = {
    age: state.age,
    sex: state.sex,
    ...state.sensors,
  };

  try {
    const response = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Prediction request failed");
    }

    const result = await response.json();
    updateRiskUi(result.risk_score, result.risk_level);
  } catch (error) {
    updateRiskUi(null, "Unknown", `API error: ${error.message}`);
  }
}

function updateRiskUi(riskScore, riskLevel, message = "") {
  const scoreEl = document.getElementById("riskScore");
  const badge = document.getElementById("riskBadge");
  const desc = document.getElementById("riskDescription");

  if (riskScore === null) {
    scoreEl.textContent = "--%";
    badge.textContent = "Unavailable";
    badge.className = "risk-badge";
    desc.textContent = message || "Prediction unavailable.";
    return;
  }

  const score = Number(riskScore);
  if (!Number.isFinite(score)) {
    scoreEl.textContent = "--%";
    badge.textContent = "Unavailable";
    badge.className = "risk-badge";
    desc.textContent = message || "Prediction unavailable.";
    return;
  }

  scoreEl.textContent = `${score.toFixed(1)}%`;
  badge.textContent = riskLevel;
  badge.className = "risk-badge";

  if (riskLevel === "Low") {
    badge.classList.add("risk-low");
    desc.textContent = "Current vitals align with a lower near-term cardiac risk pattern.";
  } else if (riskLevel === "Medium") {
    badge.classList.add("risk-medium");
    desc.textContent = "Moderate risk pattern detected. Continue monitoring and clinical review.";
  } else {
    badge.classList.add("risk-high");
    desc.textContent = "High-risk profile detected. Escalate care and validate sensor data quickly.";
  }
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function setupDatasetPage() {
  const filterForm = document.getElementById("datasetFilterForm");
  const resetBtn = document.getElementById("resetFilters");

  if (filterForm) {
    filterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      state.datasetFilters.sex = document.getElementById("filterSex").value;
      state.datasetFilters.minAge = document.getElementById("filterMinAge").value;
      state.datasetFilters.maxAge = document.getElementById("filterMaxAge").value;
      state.datasetFilters.risk = document.getElementById("filterRisk").value;
      loadDatasetDashboard();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      document.getElementById("filterSex").value = "all";
      document.getElementById("filterMinAge").value = "";
      document.getElementById("filterMaxAge").value = "";
      document.getElementById("filterRisk").value = "all";
      state.datasetFilters = { sex: "all", minAge: "", maxAge: "", risk: "all" };
      loadDatasetDashboard();
    });
  }

  await loadDatasetDashboard();
}

async function loadDatasetDashboard() {
  try {
    const query = new URLSearchParams();
    if (state.datasetFilters.sex !== "all") query.set("sex", state.datasetFilters.sex);
    if (state.datasetFilters.minAge) query.set("min_age", state.datasetFilters.minAge);
    if (state.datasetFilters.maxAge) query.set("max_age", state.datasetFilters.maxAge);
    if (state.datasetFilters.risk !== "all") query.set("risk", state.datasetFilters.risk);

    const queryString = query.toString() ? `?${query.toString()}` : "";

    const [summaryResp, sampleResp] = await Promise.all([
      fetch(`${API_BASE}/dataset/summary${queryString}`),
      fetch(`${API_BASE}/dataset/sample?limit=80${queryString ? `&${query.toString()}` : ""}`),
    ]);

    if (!summaryResp.ok || !sampleResp.ok) {
      throw new Error("Failed to load dataset dashboard endpoints");
    }

    const summary = await summaryResp.json();
    const sample = await sampleResp.json();

    renderDatasetKpis(summary);
    renderDatasetCharts(summary);
    renderDatasetTable(sample);
  } catch (error) {
    const meta = document.getElementById("datasetMeta");
    if (meta) {
      meta.textContent = `Dataset error: ${error.message}`;
    }
  }
}

function renderDatasetKpis(summary) {
  document.getElementById("datasetMeta").textContent = `Rows: ${summary.rows.toLocaleString()}`;
  document.getElementById("kpiRows").textContent = Number(summary.rows).toLocaleString();
  document.getElementById("kpiColumns").textContent = Number(summary.columns).toLocaleString();
  document.getElementById("kpiPrevalence").textContent = `${Number(summary.disease_prevalence_pct).toFixed(1)}%`;

  const avgHr = summary.selected_feature_means?.heart_rate ?? 0;
  document.getElementById("kpiAvgHr").textContent = `${Number(avgHr).toFixed(1)} bpm`;
}

function renderDatasetCharts(summary) {
  destroyChart("ageDist");
  destroyChart("sexDist");
  destroyChart("riskDist");
  destroyChart("spo2Band");

  state.charts.ageDist = createSimpleBarChart(
    "ageDistChart",
    summary.age_distribution.labels,
    summary.age_distribution.counts,
    "#8B6F47",
  );

  state.charts.sexDist = createSimpleBarChart(
    "sexDistChart",
    summary.sex_risk_distribution.labels,
    summary.sex_risk_distribution.rates,
    "#C2A878",
  );

  state.charts.riskDist = createSimpleBarChart(
    "riskDistChart",
    summary.age_risk_distribution.labels,
    summary.age_risk_distribution.rates,
    "#AD6A62",
  );

  state.charts.spo2Band = createSimpleBarChart(
    "spo2BandChart",
    summary.spo2_band_distribution.labels,
    summary.spo2_band_distribution.counts,
    "#6F8A6E",
  );

  renderDatasetChartInsights(summary);
}

function renderDatasetChartInsights(summary) {
  const ageLabels = summary.age_distribution?.labels || [];
  const ageCounts = summary.age_distribution?.counts || [];
  const ageRiskLabels = summary.age_risk_distribution?.labels || [];
  const ageRiskRates = summary.age_risk_distribution?.rates || [];
  const sexLabels = summary.sex_risk_distribution?.labels || [];
  const sexRates = summary.sex_risk_distribution?.rates || [];
  const spo2Labels = summary.spo2_band_distribution?.labels || [];
  const spo2Counts = summary.spo2_band_distribution?.counts || [];

  const maxAgeCountIdx = indexOfMax(ageCounts);
  const maxAgeRiskIdx = indexOfMax(ageRiskRates);
  const maxSexRiskIdx = indexOfMax(sexRates);
  const lowSpo2Idx = spo2Labels.findIndex((label) => String(label).toLowerCase().includes("low"));

  renderInsightList("ageDistInsight", [
    `Largest cohort: ${safeAt(ageLabels, maxAgeCountIdx, "--")} (${safeAt(ageCounts, maxAgeCountIdx, 0)} records)`,
    `Smallest cohort: ${safeAt(ageLabels, indexOfMin(ageCounts), "--")} (${safeAt(ageCounts, indexOfMin(ageCounts), 0)} records)`,
    `Total filtered rows: ${Number(summary.rows || 0).toLocaleString()}`,
  ]);

  renderInsightList("sexDistInsight", [
    `Highest disease rate: ${safeAt(sexLabels, maxSexRiskIdx, "--")} (${formatPct(safeAt(sexRates, maxSexRiskIdx, 0))})`,
    `Lowest disease rate: ${safeAt(sexLabels, indexOfMin(sexRates), "--")} (${formatPct(safeAt(sexRates, indexOfMin(sexRates), 0))})`,
    `Gap: ${formatPct(Math.abs((safeAt(sexRates, 0, 0)) - (safeAt(sexRates, 1, 0))))}`,
  ]);

  renderInsightList("riskDistInsight", [
    `Highest age-band risk: ${safeAt(ageRiskLabels, maxAgeRiskIdx, "--")} (${formatPct(safeAt(ageRiskRates, maxAgeRiskIdx, 0))})`,
    `Lowest age-band risk: ${safeAt(ageRiskLabels, indexOfMin(ageRiskRates), "--")} (${formatPct(safeAt(ageRiskRates, indexOfMin(ageRiskRates), 0))})`,
    `Overall heart disease rate: ${formatPct(summary.disease_prevalence_pct || 0)}`,
  ]);

  renderInsightList("spo2BandInsight", [
    `Normal SpO2 share: ${computeShare(spo2Counts, 0)} (${safeAt(spo2Counts, 0, 0)} records)`,
    `Caution band share: ${computeShare(spo2Counts, 1)} (${safeAt(spo2Counts, 1, 0)} records)`,
    `Low SpO2 share: ${computeShare(spo2Counts, lowSpo2Idx)} (${safeAt(spo2Counts, lowSpo2Idx, 0)} records)`,
  ]);
}

async function setupModelInsightsPage() {
  try {
    const response = await fetch(`${API_BASE}/model/insights`);
    if (!response.ok) {
      throw new Error("Failed to load model insights");
    }

    const payload = await response.json();
    renderModelOverview(payload);
    renderModelFlow(payload.backend_flow || []);
    renderModelComparison(payload.comparison || {}, payload.model_name || "Selected model");
    renderFeatureImportance(payload.top_features || []);
    renderConfusionMatrix(payload.confusion_matrix || []);
  } catch (error) {
    const meta = document.getElementById("modelMeta");
    if (meta) {
      meta.textContent = `Model insights error: ${error.message}`;
    }
  }
}

function resolveApiBase() {
  const host = window.location.hostname || "";
  const port = window.location.port || "";

  if ((host === "127.0.0.1" || host === "localhost") && port === "8000") {
    return window.location.origin;
  }

  return "http://127.0.0.1:8000";
}

function renderModelOverview(payload) {
  const models = payload.comparison?.models || [];
  const primaryModelName = payload.model_name || "Selected model";
  const primary = models.find((m) => m.model === primaryModelName) || {};
  const bestOther = models
    .filter((m) => m.model !== primaryModelName)
    .reduce((best, current) => (Number(current.balanced_accuracy || 0) > Number(best.balanced_accuracy || -1) ? current : best), {});
  const logistic = models.find((m) => m.model === "Logistic Regression") || {};
  const logisticAuc = Number(logistic.roc_auc || 0);
  const primaryAuc = Number(primary.roc_auc || 0);
  const primaryBalanced = Number(primary.balanced_accuracy || 0);
  const bestOtherBalanced = Number(bestOther.balanced_accuracy || 0);
  const balancedGainVsBest = bestOtherBalanced > 0 ? ((primaryBalanced - bestOtherBalanced) / bestOtherBalanced) * 100 : 0;
  const aucGainVsLogistic = logisticAuc > 0 ? ((primaryAuc - logisticAuc) / logisticAuc) * 100 : 0;

  document.getElementById("modelMeta").textContent = `Model: ${primaryModelName}`;
  document.getElementById("modelAccuracy").textContent = formatPct(Number(payload.metrics?.test_accuracy || 0) * 100);
  document.getElementById("modelAuc").textContent = Number(payload.metrics?.roc_auc || 0).toFixed(3);
  document.getElementById("modelGainAccuracy").textContent = formatPct(payload.comparison?.selected_model_vs_best_other?.balanced_accuracy_gain_pct || balancedGainVsBest);
  document.getElementById("modelGainAuc").textContent = formatPct(aucGainVsLogistic);

  const aucValue = Number(payload.metrics?.roc_auc || 0);
  document.getElementById("modelAucMeaning").textContent = `ROC-AUC (Receiver Operating Characteristic - Area Under the Curve) of ${aucValue.toFixed(3)} means strong class separation across thresholds.`;
  document.getElementById("modelGainBestMeaning").textContent = `${primaryModelName} improves balanced accuracy by ${formatPct(balancedGainVsBest)} versus the best non-selected model.`;
  document.getElementById("modelGainLogMeaning").textContent = `Compared with Logistic Regression, ${primaryModelName} improves ranking quality by ${formatPct(aucGainVsLogistic)}.`;

  const balancedGain = payload.comparison?.selected_model_vs_best_other?.balanced_accuracy_gain_pct || balancedGainVsBest;
  const modelWhy = document.getElementById("modelWhyText");
  modelWhy.textContent = `${primaryModelName} was selected because it delivers the strongest overall trade-off on this benchmark. In this split it improves balanced accuracy by ${formatPct(balancedGain)} versus the best non-selected model and ROC-AUC by ${formatPct(aucGainVsLogistic)} versus logistic regression.`;
}

function renderModelFlow(steps) {
  const container = document.getElementById("backendFlow");
  container.innerHTML = "";

  steps.forEach((step, idx) => {
    const card = document.createElement("div");
    card.className = "flow-step";
    card.innerHTML = `<span class="flow-step-index">${idx + 1}</span><p>${step}</p>`;
    container.appendChild(card);
  });
}

function renderModelComparison(comparison, selectedModelName = "Selected model") {
  destroyChart("modelCompare");
  const models = comparison.models || [];
  const labels = models.map((m) => m.model);
  const balancedAccuracy = models.map((m) => Number((m.balanced_accuracy || 0) * 100).toFixed(1));
  const auc = models.map((m) => Number(m.roc_auc || 0).toFixed(3));

  state.charts.modelCompare = new Chart(document.getElementById("modelCompareChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Balanced Accuracy (%)",
          data: balancedAccuracy,
          backgroundColor: "#8B6F47",
          borderRadius: 6,
        },
        {
          label: "ROC-AUC x100",
          data: auc.map((v) => Number(v) * 100),
          backgroundColor: "#AD6A62",
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: "#6B6B6B" } },
      },
      scales: {
        x: {
          ticks: { color: "#6B6B6B" },
          grid: { color: "rgba(107, 107, 107, 0.16)" },
        },
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { color: "#6B6B6B" },
          grid: { color: "rgba(107, 107, 107, 0.16)" },
        },
      },
    },
  });

  const bestAccuracy = models.reduce((prev, curr) => (curr.balanced_accuracy > (prev.balanced_accuracy || -1) ? curr : prev), {});
  const bestAuc = models.reduce((prev, curr) => (curr.roc_auc > (prev.roc_auc || -1) ? curr : prev), {});

  renderInsightList("modelCompareInsight", [
    `Best balanced accuracy: ${bestAccuracy.model || "--"} (${formatPct((bestAccuracy.balanced_accuracy || 0) * 100)})`,
    `Best ROC-AUC: ${bestAuc.model || "--"} (${Number(bestAuc.roc_auc || 0).toFixed(3)})`,
    `${selectedModelName} vs best other (balanced accuracy): ${formatPct(comparison.selected_model_vs_best_other?.balanced_accuracy_gain_pct || 0)}`,
    `Threshold balance and probability ranking can favor different models on this split.`,
  ]);
}

function renderFeatureImportance(topFeatures) {
  destroyChart("featureImportance");
  const features = topFeatures.slice(0, 8);
  const labels = features.map((f) => f.feature);
  const values = features.map((f) => Number((f.importance || 0) * 100).toFixed(2));

  state.charts.featureImportance = new Chart(document.getElementById("featureImportanceChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Importance (%)",
          data: values,
          backgroundColor: "#6F8A6E",
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { color: "#6B6B6B" },
          grid: { color: "rgba(107, 107, 107, 0.16)" },
        },
        y: {
          ticks: { color: "#6B6B6B" },
          grid: { color: "rgba(107, 107, 107, 0.16)" },
        },
      },
    },
  });

  const top = features[0] || { feature: "--", importance: 0 };
  renderInsightList("featureInsight", [
    `Strongest predictor: ${top.feature} (${formatPct((top.importance || 0) * 100)})`,
    `Top 3 drivers: ${(features.slice(0, 3).map((f) => f.feature).join(", ") || "--")}`,
    `Feature ranking is from the trained model's native importance scores.`,
  ]);
}

function renderConfusionMatrix(matrix) {
  destroyChart("confusionMatrix");

  const safeMatrix = Array.isArray(matrix) && matrix.length === 2
    ? matrix
    : [[0, 0], [0, 0]];

  const tn = Number(safeMatrix[0]?.[0] || 0);
  const fp = Number(safeMatrix[0]?.[1] || 0);
  const fn = Number(safeMatrix[1]?.[0] || 0);
  const tp = Number(safeMatrix[1]?.[1] || 0);

  state.charts.confusionMatrix = new Chart(document.getElementById("confusionMatrixChart"), {
    type: "bar",
    data: {
      labels: ["True Negative", "False Positive", "False Negative", "True Positive"],
      datasets: [
        {
          label: "Count",
          data: [tn, fp, fn, tp],
          backgroundColor: ["#6F8A6E", "#B8934C", "#AD6A62", "#8B6F47"],
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: "#6B6B6B" },
          grid: { color: "rgba(107, 107, 107, 0.16)" },
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#6B6B6B" },
          grid: { color: "rgba(107, 107, 107, 0.16)" },
        },
      },
    },
  });

  const total = tn + fp + fn + tp;
  const precision = tp + fp > 0 ? (tp / (tp + fp)) * 100 : 0;
  const recall = tp + fn > 0 ? (tp / (tp + fn)) * 100 : 0;

  renderInsightList("confusionInsight", [
    `True positives: ${tp.toLocaleString()} | False negatives: ${fn.toLocaleString()}`,
    `True negatives: ${tn.toLocaleString()} | False positives: ${fp.toLocaleString()}`,
    `Precision (positive class): ${formatPct(precision)}`,
    `Recall (positive class): ${formatPct(recall)} from ${total.toLocaleString()} test records`,
  ]);
}

function renderInsightList(containerId, lines) {
  const node = document.getElementById(containerId);
  if (!node) {
    return;
  }

  node.innerHTML = "";
  const list = document.createElement("ul");
  list.className = "detail-list formula-list";
  lines.forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    list.appendChild(li);
  });
  node.appendChild(list);
}

function indexOfMax(values) {
  if (!Array.isArray(values) || !values.length) {
    return -1;
  }
  return values.reduce((bestIdx, value, idx, arr) => (Number(value) > Number(arr[bestIdx]) ? idx : bestIdx), 0);
}

function indexOfMin(values) {
  if (!Array.isArray(values) || !values.length) {
    return -1;
  }
  return values.reduce((bestIdx, value, idx, arr) => (Number(value) < Number(arr[bestIdx]) ? idx : bestIdx), 0);
}

function safeAt(values, idx, fallback) {
  if (!Array.isArray(values) || idx < 0 || idx >= values.length) {
    return fallback;
  }
  return values[idx];
}

function formatPct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function computeShare(values, idx) {
  const total = (values || []).reduce((acc, value) => acc + Number(value || 0), 0);
  const current = safeAt(values, idx, 0);
  if (!total) {
    return "0.0%";
  }
  return formatPct((Number(current) / total) * 100);
}

function destroyChart(name) {
  if (state.charts[name]) {
    state.charts[name].destroy();
    state.charts[name] = null;
  }
}

function createSimpleBarChart(canvasId, labels, data, color) {
  return new Chart(document.getElementById(canvasId), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: color,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: "#6B6B6B" },
          grid: { color: "rgba(107, 107, 107, 0.16)" },
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#6B6B6B" },
          grid: { color: "rgba(107, 107, 107, 0.16)" },
        },
      },
    },
  });
}

function createSimpleDoughnutChart(canvasId, labels, data, colors) {
  return new Chart(document.getElementById(canvasId), {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderColor: "#FFFFFF",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#6B6B6B" },
        },
      },
    },
  });
}

function renderDatasetTable(sample) {
  const head = document.getElementById("datasetTableHead");
  const body = document.getElementById("datasetTableBody");

  head.innerHTML = "";
  body.innerHTML = "";

  if (!sample.columns?.length) {
    return;
  }

  const hr = document.createElement("tr");
  sample.columns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col;
    hr.appendChild(th);
  });
  head.appendChild(hr);

  sample.rows.forEach((row) => {
    const tr = document.createElement("tr");
    sample.columns.forEach((col) => {
      const td = document.createElement("td");
      const value = row[col];
      td.textContent = value === null || value === undefined ? "" : String(value);
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}
