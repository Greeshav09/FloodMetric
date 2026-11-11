# FloodMetric 🌊
**AI-Assisted Infrastructure Vulnerability & Pattern Recognition Dashboard for North Carolina**

FloodMetric is an interactive geospatial decision-support platform designed to help municipal planners, emergency managers, and civil engineers identify recurring infrastructure vulnerabilities across North Carolina. By locking onto critical physical assets—such as bridges, culverts, pumping stations, and wastewater facilities—the dashboard evaluates each site through three distinct analytical lenses.


Link: https://floodmetricaicc.vercel.app/
---

## 🎯 Core Analytical Lenses

FloodMetric tracks high-risk infrastructure sites across Western North Carolina (Mountain gorges), the Piedmont (urban creeks), and Eastern North Carolina/Outer Banks (river basins and coastal highways) using a three-stage diagnostic workflow:

1. **Historical Failure Patterns (Baseline Diagnostic):**
   Maps documented infrastructure failures from major regional weather events (including Hurricane Helene, Hurricane Florence, Hurricane Floyd, and severe localized downpours) to isolate repeat structural stress points.
2. **Flood Exposure (Environmental Context):**
   Audits tracked assets against environmental flood boundaries and basin extents (modeled after NC-FLEX and FEMA floodplains) to highlight infrastructure failing unexpectedly *outside* traditional designated flood zones.
3. **Predictive Priority Index — PPI (Actionable Ranking):**
   Synthesizes historical failure frequency, flood exposure alignment, and live community 311 hazard observations into a unified urgency score, color-coding sites so maintenance crews can prioritize immediate inspections.

---

## ✨ Key Features

* **Multi-Lens Layer Switching:** Seamlessly toggle between Historical Failure Patterns, Flood Exposure, and the Predictive Priority Index while keeping physical assets locked in place for direct site-by-site comparison.
* **Interactive Storm & Asset Filtering:** Isolate vulnerabilities by specific historical weather events or infrastructure categories.
* **Dynamic Vulnerability Metrics Sidebar:** Real-time summary cards tracking critical priority counts, out-of-zone failure ratios, and regional risk distributions.
* **Community 311 Observation Feed:** Displays localized resident hazard reports alongside structural telemetry to bridge the gap between municipal sensors and on-the-ground conditions.

---

## 🛠️ Tech Stack

* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+)
* **Mapping & Geospatial Rendering:** Leaflet.js with CARTO Basemaps
* **Data Architecture:** Structured geospatial JSON/JS telemetry (`mock_data.js`)
* **Deployment:** Vercel Continuous Deployment via GitHub

---

## 🚀 Getting Started Locally

To run a local instance of FloodMetric on your machine:

1. **Clone the repository:**
   ```bash
   git clone https://github.com
   cd floodmetric
   ```

2. **Configure your Basemap API Key (Optional):**
   Open `app.js` and ensure your CARTO basemap tile layer URL includes a valid key:
   ```javascript
   L.tileLayer("https://{s}://{z}/{x}/{y}{r}.png?key=YOUR_CARTO_API_KEY", {
     maxZoom: 18,
     attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
   }).addTo(map);
   ```

3. **Launch the application:**
   Open `index.html` directly in any modern web browser, or serve it using a local development server (such as the VS Code **Live Server** extension).

---

## 📁 Project Structure

```text
├── index.html          # Main dashboard layout and UI containers
├── style.css           # Responsive grid styling, dark/light theme tokens, and map controls
├── app.js              # Leaflet map initialization, layer switching logic, and metric calculations
├── mock_data.js        # Curated North Carolina infrastructure dataset and 311 hazard logs
└── README.md           # Project documentation
```

---

## 🗺️ Future Roadmap

* **Live Municipal 311 API Integration:** Connect directly to open municipal data portals (such as Town of Cary and City of Raleigh open data feeds) for real-time citizen hazard ingestion.
* **Automated Watershed Polygon Overlays:** Integrate live NOAA precipitation gauges and USGS streamgage river-height thresholds.
* **Exportable Inspection Work Orders:** Allow city engineers to export filtered PPI action lists directly to CSV or PDF reports.
