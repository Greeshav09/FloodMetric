/* FloodMetric prototype. All data below is invented sample data. */

// 1. Dataset: 14 pilot sites in the Wake County / Cary area (approximate coordinates)
// failures = documented damage events, vulnerability = condition score 1-5,
// exposure = number of NC-FLEX flood events (out of 78), reports = 311 reports
const sites = [
  { id: "S01", name: "River Landing Rd",       type: "Road",     lat: 35.7570, lon: -78.8400, failures: 7, vulnerability: 4, exposure: 41, reports: 18 },
  { id: "S02", name: "Old Ferry Rd approach",  type: "Road",     lat: 35.7330, lon: -78.8720, failures: 6, vulnerability: 4, exposure: 38, reports: 15 },
  { id: "S03", name: "Rocky Branch Rd",        type: "Culvert",  lat: 35.7840, lon: -78.7050, failures: 5, vulnerability: 4, exposure: 31, reports: 12 },
  { id: "S04", name: "Swift Run Rd",           type: "Culvert",  lat: 35.7620, lon: -78.7790, failures: 4, vulnerability: 5, exposure: 27, reports: 9 },
  { id: "S05", name: "Black Creek Rd",         type: "Road",     lat: 35.7050, lon: -78.7510, failures: 4, vulnerability: 5, exposure: 29, reports: 11 },
  { id: "S06", name: "Tar Bend Rd drainage",   type: "Drainage", lat: 35.8100, lon: -78.6100, failures: 4, vulnerability: 3, exposure: 33, reports: 7 },
  { id: "S07", name: "Marsh Rd bridge",        type: "Bridge",   lat: 35.6750, lon: -78.6500, failures: 5, vulnerability: 3, exposure: 35, reports: 6 },
  { id: "S08", name: "Hollis Creek culvert",   type: "Culvert",  lat: 35.8300, lon: -78.7900, failures: 3, vulnerability: 4, exposure: 19, reports: 2 },
  { id: "S09", name: "Mill Creek Rd bridge",   type: "Bridge",   lat: 35.7900, lon: -78.8300, failures: 3, vulnerability: 3, exposure: 22, reports: 4 },
  { id: "S10", name: "Sandy Run drainage",     type: "Drainage", lat: 35.6500, lon: -78.8200, failures: 2, vulnerability: 3, exposure: 16, reports: 5 },
  { id: "S11", name: "Maple Grove Rd bridge",  type: "Bridge",   lat: 35.8600, lon: -78.6800, failures: 3, vulnerability: 2, exposure: 24, reports: 2 },
  { id: "S12", name: "Pine Hollow Rd culvert", type: "Culvert",  lat: 35.9000, lon: -78.7400, failures: 2, vulnerability: 2, exposure: 9,  reports: 3 },
  { id: "S13", name: "Cedar Fork bridge",      type: "Bridge",   lat: 35.8000, lon: -78.9000, failures: 1, vulnerability: 2, exposure: 6,  reports: 1 },
  { id: "S14", name: "Oak Ridge Rd culvert",   type: "Culvert",  lat: 35.9400, lon: -78.8600, failures: 1, vulnerability: 1, exposure: 4,  reports: 0 }
];

// Simulated 311 reports
const reports = [
  { timestamp: "2026-11-09T07:42:00", type: "Street Flooding", address: "River Landing Rd near Kit Creek",   severity: "High" },
  { timestamp: "2026-11-09T06:15:00", type: "High Water",      address: "Old Ferry Rd at creek crossing",    severity: "High" },
  { timestamp: "2026-11-08T19:30:00", type: "Clogged Drain",   address: "Swift Run Rd, 1200 block",          severity: "Medium" },
  { timestamp: "2026-11-08T16:05:00", type: "Street Flooding", address: "Rocky Branch Rd near the bend",     severity: "Medium" },
  { timestamp: "2026-11-08T11:20:00", type: "Erosion",         address: "Black Creek Rd shoulder",           severity: "Medium" },
  { timestamp: "2026-11-07T21:10:00", type: "High Water",      address: "Marsh Rd under the bridge",         severity: "Medium" },
  { timestamp: "2026-11-07T14:45:00", type: "Clogged Drain",   address: "Tar Bend Rd, storm inlet",          severity: "Low" },
  { timestamp: "2026-11-07T09:00:00", type: "Street Flooding", address: "Black Creek Rd low point",          severity: "High" },
  { timestamp: "2026-11-06T18:25:00", type: "Clogged Drain",   address: "Sandy Run Dr, 300 block",           severity: "Low" },
  { timestamp: "2026-11-06T13:40:00", type: "High Water",      address: "Mill Creek Rd bridge approach",     severity: "Low" },
  { timestamp: "2026-11-05T08:55:00", type: "Erosion",         address: "Hollis Creek culvert outlet",       severity: "Low" },
  { timestamp: "2026-11-04T17:30:00", type: "Clogged Drain",   address: "River Landing Rd storm drain",      severity: "Medium" }
];

// 2. Scoring
const sliders = [0, 1, 2, 3].map(i => document.getElementById("w" + i));
const outputs = [0, 1, 2, 3].map(i => document.getElementById("o" + i));

function getWeights() {
  const raw = sliders.map(s => Number(s.value));
  const total = raw.reduce((a, b) => a + b, 0);
  // If every slider is zero, fall back to equal weights so the score stays defined.
  return total === 0 ? [0.25, 0.25, 0.25, 0.25] : raw.map(v => v / total);
}

function calculateScores() {
  const w = getWeights();
  const maxFail = Math.max(1, ...sites.map(s => s.failures));
  const maxExp  = Math.max(78, ...sites.map(s => s.exposure));
  const maxRep  = Math.max(1, ...sites.map(s => s.reports));

  sites.forEach(s => {
    const parts = [
      s.failures / maxFail,
      (s.vulnerability - 1) / 4,
      s.exposure / maxExp,
      s.reports / maxRep
    ];
    s.ppi = Math.round(100 * parts.reduce((sum, p, i) => sum + p * w[i], 0));
  });
}

function flag(ppi) {
  if (ppi >= 70) return "red";
  if (ppi >= 40) return "amber";
  return "green";
}

function queueStatus(ppi) {
  if (ppi >= 70) return "Priority field inspection";
  if (ppi >= 40) return "Monitor and verify records";
  return "Routine schedule";
}

// 3. Leaderboard
const tbody = document.getElementById("leaderboard");

function renderTable() {
  const ranked = sites.slice().sort((a, b) => b.ppi - a.ppi);
  tbody.innerHTML = "";
  ranked.forEach((s, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + (i + 1) + "</td>" +
      "<td>" + esc(s.name) + "</td>" +
      "<td>" + esc(s.type) + "</td>" +
      '<td class="ppi ' + flag(s.ppi) + '">' + s.ppi + "</td>" +
      "<td>" + s.failures + "</td>" +
      "<td>" + s.vulnerability + "</td>" +
      "<td>" + s.exposure + "</td>" +
      "<td>" + s.reports + "</td>";
    tr.addEventListener("click", () => {
      const m = markers[s.id];
      map.setView(m.getLatLng(), 13);
      m.openPopup();
    });
    tr.style.cursor = "pointer";
    tbody.appendChild(tr);
  });
}

// 4. Map (Leaflet + OpenStreetMap), centered on Cary / Wake County
const map = L.map("map").setView([35.7915, -78.7811], 10);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const colors = { red: "#c0392b", amber: "#d99a1c", green: "#2e8b57" };
const markers = {};

sites.forEach(s => {
  markers[s.id] = L.circleMarker([s.lat, s.lon], {
    radius: 10, weight: 2, color: "#ffffff", fillOpacity: 0.9, fillColor: colors.green
  }).addTo(map).bindPopup("");
});

function updateMarkers() {
  sites.forEach(s => {
    const m = markers[s.id];
    m.setStyle({ fillColor: colors[flag(s.ppi)] });
    m.setPopupContent(
      "<strong>" + esc(s.name) + "</strong><br>" +
      "Asset class: " + esc(s.type) + "<br>" +
      "PPI: <strong>" + s.ppi + "</strong><br>" +
      "Inspection queue: " + queueStatus(s.ppi)
    );
  });
}

// 5. Slider wiring: recalculate everything on every drag
function update() {
  sliders.forEach((s, i) => { outputs[i].textContent = s.value; });
  calculateScores();
  renderTable();
  updateMarkers();
}
sliders.forEach(s => s.addEventListener("input", update));

// 6. 311 sidebar
const filter = document.getElementById("incidentFilter");
const list = document.getElementById("reportList");
const count = document.getElementById("reportCount");

function initFilter() {
  const types = Array.from(new Set(reports.map(r => r.type))).sort();
  filter.innerHTML = "";
  ["All incident types"].concat(types).forEach((t, i) => {
    const opt = document.createElement("option");
    opt.value = i === 0 ? "all" : t;
    opt.textContent = t;
    filter.appendChild(opt);
  });
}

function renderReports() {
  const choice = filter.value;
  const shown = reports
    .filter(r => choice === "all" || r.type === choice)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  list.innerHTML = "";
  shown.forEach(r => {
    const card = document.createElement("div");
    card.className = "report sev-" + r.severity.toLowerCase();
    const when = new Date(r.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    card.innerHTML =
      '<div class="top"><span>' + esc(r.type) + "</span><span>" + esc(r.severity) + "</span></div>" +
      "<div>" + esc(r.address) + "</div>" +
      '<div class="meta">' + when + "</div>";
    list.appendChild(card);
  });
  count.textContent = shown.length + " of " + reports.length + " reports shown. Reports are unverified and do not establish structural damage.";
}
filter.addEventListener("change", renderReports);

function esc(str) {
  return String(str).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Start
initFilter();
renderReports();
update();
