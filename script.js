const CSV_PRIMARY_FILE = "clean_heart_data.csv";
const CSV_FALLBACK_FILE = "heart_disease_uci.csv";

const chartRefs = {
  ageRisk: null,
  cholesterol: null,
  chestPain: null,
  maxHr: null,
  gender: null,
  gauge: null,
};

const ui = {
  recordsCount: document.getElementById("recordsCount"),
  avgHeartRate: document.getElementById("avgHeartRate"),
  avgCholesterol: document.getElementById("avgCholesterol"),
  avgBloodPressure: document.getElementById("avgBloodPressure"),
  diseasePercent: document.getElementById("diseasePercent"),
  gaugeValue: document.getElementById("gaugeValue"),
  messagePanel: document.getElementById("messagePanel"),
  searchInput: document.getElementById("tableSearch"),
  tableHead: document.getElementById("tableHead"),
  tableBody: document.getElementById("tableBody"),
  patientForm: document.getElementById("patientForm"),
  patientAge: document.getElementById("patientAge"),
  patientSex: document.getElementById("patientSex"),
  patientBp: document.getElementById("patientBp"),
  patientChol: document.getElementById("patientChol"),
  patientMaxHr: document.getElementById("patientMaxHr"),
  patientCp: document.getElementById("patientCp"),
  patientKnownDisease: document.getElementById("patientKnownDisease"),
  patientResults: document.getElementById("patientResults"),
  patientRiskLevel: document.getElementById("patientRiskLevel"),
  patientRiskPercent: document.getElementById("patientRiskPercent"),
  patientRiskText: document.getElementById("patientRiskText"),
  patientInsightList: document.getElementById("patientInsightList"),
  patientEmpty: document.querySelector(".patient-empty"),
};

let fullData = [];
let dashboardStats = null;

document.addEventListener("DOMContentLoaded", initDashboard);

async function initDashboard() {
  try {
    const csvText = await loadCsvText();
    const rows = parseCSV(csvText);

    if (!rows.length) {
      throw new Error("CSV file contains no rows.");
    }

    fullData = normalizeRows(rows);
    renderDashboard(fullData);
  } catch (error) {
    showMessage(
      `${error.message} Ensure clean_heart_data.csv is in the same folder and run the page using a local server.`,
    );
  }
}

async function loadCsvText() {
  const candidateFiles = [CSV_PRIMARY_FILE, CSV_FALLBACK_FILE];

  for (const file of candidateFiles) {
    const response = await fetch(file);
    if (response.ok) {
      return response.text();
    }
  }

  throw new Error(`Unable to load ${CSV_PRIMARY_FILE}.`);
}

function parseCSV(text) {
  const cleanText = text.replace(/^\uFEFF/, "").trim();
  const lines = cleanText.split(/\r?\n/).filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCSVLine(lines[i]);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = (values[index] || "").trim();
    });

    rows.push(row);
  }

  return rows;
}

function splitCSVLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  out.push(current);
  return out;
}

function normalizeRows(rows) {
  return rows.map((row) => {
    const normalized = {};

    Object.keys(row).forEach((key) => {
      normalized[key.toLowerCase().trim()] = row[key];
    });

    return normalized;
  });
}

function getNumber(row, possibleKeys) {
  for (const key of possibleKeys) {
    if (row[key] !== undefined && row[key] !== "") {
      const value = Number(row[key]);
      if (!Number.isNaN(value)) {
        return value;
      }
    }
  }
  return NaN;
}

function getGenderLabel(row) {
  const value = getNumber(row, ["sex", "gender"]);

  if (Number.isNaN(value)) {
    return (row.gender || row.sex || "Unknown").toString().trim() || "Unknown";
  }

  if (value === 1) {
    return "Male";
  }

  if (value === 0) {
    return "Female";
  }

  return "Other";
}

function getDiseaseValue(row) {
  const raw = getNumber(row, ["target", "heart_disease", "heartdisease", "num", "disease"]);
  if (Number.isNaN(raw)) {
    return 0;
  }
  return raw > 0 ? 1 : 0;
}

function getChestPainLabel(row) {
  const raw = getNumber(row, ["cp", "chest_pain_type", "chestpain"]);

  if (Number.isNaN(raw)) {
    return (row.cp || row.chest_pain_type || "Unknown").toString();
  }

  const map = {
    0: "Typical Angina",
    1: "Atypical Angina",
    2: "Non-Anginal Pain",
    3: "Asymptomatic",
    4: "Asymptomatic",
  };

  return map[raw] || `Type ${raw}`;
}

function mean(values) {
  const valid = values.filter((n) => Number.isFinite(n));
  if (!valid.length) {
    return 0;
  }
  return valid.reduce((sum, n) => sum + n, 0) / valid.length;
}

function percentage(part, whole) {
  if (!whole) {
    return 0;
  }
  return (part / whole) * 100;
}

function renderDashboard(data) {
  const ages = data.map((row) => getNumber(row, ["age"]));
  const disease = data.map((row) => getDiseaseValue(row));
  const cholesterol = data.map((row) => getNumber(row, ["chol", "cholesterol"]));
  const heartRate = data.map((row) => getNumber(row, ["thalach", "maxhr", "max_heart_rate", "heart_rate"]));
  const bloodPressure = data.map((row) => getNumber(row, ["trestbps", "resting_bp", "blood_pressure", "bp"]));

  const avgHr = mean(heartRate);
  const avgChol = mean(cholesterol);
  const avgBp = mean(bloodPressure);
  const diseaseCount = disease.reduce((sum, d) => sum + d, 0);
  const diseasePct = percentage(diseaseCount, data.length);

  dashboardStats = {
    avgHr,
    avgChol,
    avgBp,
    diseasePct,
  };

  const highRiskCount = data.filter((row) => {
    const age = getNumber(row, ["age"]);
    const chol = getNumber(row, ["chol", "cholesterol"]);
    const bp = getNumber(row, ["trestbps", "resting_bp", "blood_pressure", "bp"]);
    const maxHr = getNumber(row, ["thalach", "maxhr", "max_heart_rate", "heart_rate"]);
    const hasDisease = getDiseaseValue(row) === 1;

    let score = 0;
    if (!Number.isNaN(age) && age >= 55) score += 1;
    if (!Number.isNaN(chol) && chol >= 240) score += 1;
    if (!Number.isNaN(bp) && bp >= 140) score += 1;
    if (!Number.isNaN(maxHr) && maxHr < 120) score += 1;
    if (hasDisease) score += 2;

    return score >= 3;
  }).length;

  const highRiskPct = percentage(highRiskCount, data.length);

  ui.recordsCount.textContent = `${data.length} patient records`;
  ui.avgHeartRate.textContent = `${avgHr.toFixed(1)} bpm`;
  ui.avgCholesterol.textContent = `${avgChol.toFixed(1)} mg/dL`;
  ui.avgBloodPressure.textContent = `${avgBp.toFixed(1)} mmHg`;
  ui.diseasePercent.textContent = `${diseasePct.toFixed(1)}%`;
  ui.gaugeValue.textContent = `${highRiskPct.toFixed(1)}%`;

  renderAgeRiskChart(ages, disease);
  renderCholesterolChart(cholesterol);
  renderChestPainChart(data);
  renderMaxHrChart(heartRate, disease);
  renderGenderChart(data);
  renderGauge(highRiskPct);
  renderTable(data);
  setupPatientForm();

  ui.searchInput.addEventListener("input", (event) => {
    const query = event.target.value.toLowerCase().trim();
    const filtered = !query
      ? data
      : data.filter((row) =>
          Object.values(row).some((value) => value.toString().toLowerCase().includes(query)),
        );
    renderTable(filtered);
  });
}

function setupPatientForm() {
  if (!ui.patientForm || ui.patientForm.dataset.bound === "1") {
    return;
  }

  ui.patientForm.addEventListener("submit", handlePatientSubmit);
  ui.patientForm.addEventListener("reset", () => {
    ui.patientResults.hidden = true;
    ui.patientEmpty.hidden = false;
  });

  ui.patientForm.dataset.bound = "1";
}

function handlePatientSubmit(event) {
  event.preventDefault();

  const patient = {
    age: Number(ui.patientAge.value),
    sex: Number(ui.patientSex.value),
    bp: Number(ui.patientBp.value),
    chol: Number(ui.patientChol.value),
    maxHr: Number(ui.patientMaxHr.value),
    cp: Number(ui.patientCp.value),
    knownDisease: ui.patientKnownDisease.checked,
  };

  const analysis = analyzePatientRisk(patient);
  renderPatientInsights(analysis, patient);
}

function analyzePatientRisk(patient) {
  let score = 0;
  const reasons = [];

  if (patient.age >= 55) {
    score += 2;
    reasons.push("Age is in a higher-risk bracket (55+).");
  }

  if (patient.chol >= 240) {
    score += 2;
    reasons.push("Cholesterol is above recommended level (>=240 mg/dL).");
  }

  if (patient.bp >= 140) {
    score += 2;
    reasons.push("Resting blood pressure indicates hypertension range (>=140 mmHg).");
  }

  if (patient.maxHr < 120) {
    score += 1;
    reasons.push("Lower max heart rate can indicate limited cardiovascular reserve.");
  }

  if (patient.cp === 3) {
    score += 2;
    reasons.push("Asymptomatic chest pain profile is commonly associated with silent risk.");
  }

  if (patient.sex === 1) {
    score += 1;
  }

  if (patient.knownDisease) {
    score += 3;
    reasons.push("Existing heart disease diagnosis increases risk burden.");
  }

  const riskPercent = Math.max(5, Math.min(95, (score / 13) * 100));

  let riskLevel = "Low";
  if (riskPercent >= 65) {
    riskLevel = "High";
  } else if (riskPercent >= 35) {
    riskLevel = "Moderate";
  }

  return {
    score,
    reasons,
    riskPercent,
    riskLevel,
  };
}

function renderPatientInsights(analysis, patient) {
  ui.patientResults.hidden = false;
  ui.patientEmpty.hidden = true;

  ui.patientRiskLevel.textContent = `${analysis.riskLevel} Risk`;
  ui.patientRiskLevel.className = `risk-level ${analysis.riskLevel.toLowerCase()}`;
  ui.patientRiskPercent.textContent = `${analysis.riskPercent.toFixed(1)}%`;
  ui.patientRiskText.textContent =
    analysis.riskLevel === "High"
      ? "Patient profile aligns with a high-risk pattern and should be clinically reviewed promptly."
      : analysis.riskLevel === "Moderate"
        ? "Patient profile shows moderate risk factors. Lifestyle and periodic monitoring are recommended."
        : "Patient profile is in a lower-risk range relative to key indicators in this dataset.";

  const insightItems = [
    ...analysis.reasons,
    compareMetric("Cholesterol", patient.chol, dashboardStats?.avgChol, "mg/dL"),
    compareMetric("Blood pressure", patient.bp, dashboardStats?.avgBp, "mmHg"),
    compareMetric("Max heart rate", patient.maxHr, dashboardStats?.avgHr, "bpm"),
  ].filter(Boolean);

  ui.patientInsightList.innerHTML = "";
  insightItems.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    ui.patientInsightList.appendChild(li);
  });
}

function compareMetric(name, patientValue, averageValue, unit) {
  if (!Number.isFinite(patientValue) || !Number.isFinite(averageValue)) {
    return "";
  }

  const diff = patientValue - averageValue;
  const direction = diff >= 0 ? "above" : "below";

  return `${name}: ${patientValue.toFixed(1)} ${unit}, ${Math.abs(diff).toFixed(1)} ${unit} ${direction} cohort average (${averageValue.toFixed(1)} ${unit}).`;
}

function buildDatasetStyle(color) {
  return {
    borderColor: color,
    backgroundColor: color,
    pointRadius: 4,
    pointHoverRadius: 6,
  };
}

function renderAgeRiskChart(ages, disease) {
  const points = ages
    .map((age, index) => ({ x: age, y: disease[index] }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  replaceChart("ageRisk", "ageRiskChart", {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Heart Disease Presence",
          data: points,
          ...buildDatasetStyle("rgba(21, 116, 212, 0.75)"),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: "Age" } },
        y: {
          title: { display: true, text: "Disease (0 = No, 1 = Yes)" },
          min: -0.05,
          max: 1.05,
          ticks: { stepSize: 1 },
        },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderCholesterolChart(cholesterolValues) {
  const values = cholesterolValues.filter(Number.isFinite);
  if (!values.length) {
    return;
  }

  const min = Math.floor(Math.min(...values) / 20) * 20;
  const max = Math.ceil(Math.max(...values) / 20) * 20;
  const labels = [];
  const counts = [];

  for (let start = min; start < max; start += 20) {
    const end = start + 19;
    labels.push(`${start}-${end}`);
    counts.push(values.filter((v) => v >= start && v <= end).length);
  }

  replaceChart("cholesterol", "cholesterolChart", {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Patients",
          data: counts,
          backgroundColor: "rgba(15, 157, 157, 0.72)",
          borderColor: "rgba(15, 157, 157, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: "Cholesterol Range (mg/dL)" } },
        y: { title: { display: true, text: "Patient Count" }, beginAtZero: true },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderChestPainChart(data) {
  const grouped = {};

  data.forEach((row) => {
    const label = getChestPainLabel(row);
    if (!grouped[label]) {
      grouped[label] = { withDisease: 0, withoutDisease: 0 };
    }

    if (getDiseaseValue(row) === 1) {
      grouped[label].withDisease += 1;
    } else {
      grouped[label].withoutDisease += 1;
    }
  });

  const labels = Object.keys(grouped);

  replaceChart("chestPain", "chestPainChart", {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Heart Disease: Yes",
          data: labels.map((label) => grouped[label].withDisease),
          backgroundColor: "rgba(214, 59, 84, 0.74)",
        },
        {
          label: "Heart Disease: No",
          data: labels.map((label) => grouped[label].withoutDisease),
          backgroundColor: "rgba(21, 116, 212, 0.65)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true },
      },
    },
  });
}

function renderMaxHrChart(heartRateValues, diseaseValues) {
  const points = heartRateValues
    .map((hr, index) => ({ x: hr, y: diseaseValues[index] }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  replaceChart("maxHr", "maxHrChart", {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Max HR vs Disease",
          data: points,
          ...buildDatasetStyle("rgba(219, 139, 11, 0.82)"),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: "Max Heart Rate (bpm)" } },
        y: {
          title: { display: true, text: "Disease (0/1)" },
          min: -0.05,
          max: 1.05,
          ticks: { stepSize: 1 },
        },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderGenderChart(data) {
  const grouped = {};

  data.forEach((row) => {
    if (getDiseaseValue(row) !== 1) {
      return;
    }
    const gender = getGenderLabel(row);
    grouped[gender] = (grouped[gender] || 0) + 1;
  });

  const labels = Object.keys(grouped);
  const values = labels.map((label) => grouped[label]);

  replaceChart("gender", "genderChart", {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: [
            "rgba(21, 116, 212, 0.78)",
            "rgba(214, 59, 84, 0.75)",
            "rgba(15, 157, 157, 0.76)",
          ],
          borderColor: "#ffffff",
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
        },
      },
    },
  });
}

function renderGauge(value) {
  const safeValue = Math.max(0, Math.min(100, value));

  replaceChart("gauge", "riskGauge", {
    type: "doughnut",
    data: {
      labels: ["High Risk", "Remaining"],
      datasets: [
        {
          data: [safeValue, 100 - safeValue],
          backgroundColor: ["rgba(214, 59, 84, 0.9)", "rgba(19, 54, 88, 0.14)"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      rotation: 270,
      circumference: 180,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.label}: ${context.parsed.toFixed(1)}%`;
            },
          },
        },
      },
    },
  });
}

function renderTable(data) {
  const headers = fullData.length ? Object.keys(fullData[0]) : [];

  ui.tableHead.innerHTML = "";
  ui.tableBody.innerHTML = "";

  if (!headers.length) {
    return;
  }

  const trHead = document.createElement("tr");
  headers.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    trHead.appendChild(th);
  });
  ui.tableHead.appendChild(trHead);

  const fragment = document.createDocumentFragment();
  data.forEach((row) => {
    const tr = document.createElement("tr");
    headers.forEach((header) => {
      const td = document.createElement("td");
      td.textContent = row[header] ?? "";
      tr.appendChild(td);
    });
    fragment.appendChild(tr);
  });

  ui.tableBody.appendChild(fragment);
}

function replaceChart(refName, canvasId, config) {
  if (chartRefs[refName]) {
    chartRefs[refName].destroy();
  }

  const ctx = document.getElementById(canvasId);
  chartRefs[refName] = new Chart(ctx, config);
}

function showMessage(message) {
  ui.messagePanel.hidden = false;
  ui.messagePanel.textContent = message;
  ui.recordsCount.textContent = "Data unavailable";
}
