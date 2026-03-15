const API_BASE = window.location.origin.startsWith("http")
  ? window.location.origin
  : "http://127.0.0.1:8000";
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
  state.age = Number(params.get("age"));
  state.sex = Number(params.get("sex"));

  if (!Number.isFinite(state.age) || !Number.isFinite(state.sex)) {
    window.location.href = "index.html";
    return;
  }

  document.getElementById("patientMeta").textContent =
    `Patient: ${state.age} years, ${state.sex === 1 ? "Male" : "Female"}`;

  state.sensors = buildInitialSensors(state.age);
  initCharts();
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
    ["Pulse Rate", `${state.sensors.pulse_rate.toFixed(1)} bpm`],
    ["HRV RMSSD", `${state.sensors.hrv_rmssd.toFixed(1)} ms`],
    ["HRV SDNN", `${state.sensors.hrv_sdnn.toFixed(1)} ms`],
    ["Activity", `${state.sensors.activity_level.toFixed(1)} / 100`],
    ["Camera HR", `${state.sensors.camera_heart_rate.toFixed(1)} bpm`],
    ["Camera HRV", `${state.sensors.camera_hrv.toFixed(1)} ms`],
    ["Respiration Camera", `${state.sensors.respiration_rate_camera.toFixed(1)} rpm`],
    ["Stress Score", `${state.sensors.stress_score.toFixed(1)} / 100`],
    ["Fatigue Score", `${state.sensors.fatigue_score.toFixed(1)} / 100`],
    ["Estimated Age", `${state.sensors.estimated_age.toFixed(1)} years`],
    ["Skin Perfusion Index", `${state.sensors.skin_perfusion_index.toFixed(2)}`],
  ];

  sensorList.innerHTML = "";
  entries.forEach(([name, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = name;
    const dd = document.createElement("dd");
    dd.textContent = value;
    sensorList.appendChild(dt);
    sensorList.appendChild(dd);
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
    updateRiskUi(result.probability, result.risk_level);
  } catch (error) {
    updateRiskUi(null, "Unknown", `API error: ${error.message}`);
  }
}

function updateRiskUi(probability, riskLevel, message = "") {
  const probEl = document.getElementById("riskProbability");
  const badge = document.getElementById("riskBadge");
  const desc = document.getElementById("riskDescription");

  if (probability === null) {
    probEl.textContent = "--%";
    badge.textContent = "Unavailable";
    badge.className = "risk-badge";
    desc.textContent = message || "Prediction unavailable.";
    return;
  }

  const pct = (Number(probability) * 100).toFixed(1);
  probEl.textContent = `${pct}%`;
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

  state.charts.sexDist = createSimpleDoughnutChart(
    "sexDistChart",
    summary.sex_distribution.labels,
    summary.sex_distribution.counts,
    ["#8B6F47", "#C2A878", "#6B6B6B"],
  );

  state.charts.riskDist = createSimpleBarChart(
    "riskDistChart",
    summary.risk_distribution.labels,
    summary.risk_distribution.counts,
    "#AD6A62",
  );

  state.charts.spo2Band = createSimpleBarChart(
    "spo2BandChart",
    summary.spo2_band_distribution.labels,
    summary.spo2_band_distribution.counts,
    "#6F8A6E",
  );
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
