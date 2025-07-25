# 🌀 NASTAR Weather Map

A real-time, interactive situational awareness dashboard for monitoring severe weather events, radar activity, and Waffle House location status across the United States. This system is designed for internal use by [the Free Nation of New Athens](https://www.newathensgov.org) under [NASTAR](https://micronations.wiki/wiki/New_Athens_Space_Technology_and_Aerospace_Research) *(New Athens Space Technology and Aerospace Research)* to rapidly identify potentially storm-impacted regions by combining National Weather Service data, hurricane forecasts, radar overlays, and a proprietary sensor network based on Waffle House location status.

---

## 🌍 Overview

The [NASTAR Weather Map](https://weather.newathensgov.org) aggregates multiple types of live weather data and infrastructure telemetry into a single, interactive Leaflet-based map, making it easy to assess the spread and severity of natural disasters. This system is particularly focused on tropical systems, severe thunderstorms, floods, wildfires, and civil emergency zones.

---

## 🔧 Key Features

### 🗺️ Interactive Map Layers

The application displays an interactive map using [Leaflet.js](https://leafletjs.com/), automatically updating all data every five minutes or when the refresh button is clicked, with the following overlay options:

- **Base Maps**:
  - Dark mode (enabled by default).
  - Light mode toggle.
  
- **Radar Overlay**:
  - Uses the RainViewer API to display live precipitation radar.
  - Animates radar sweep over time with controls.

- **National Weather Service Alerts (Polygons)**:
  - Real-time NWS alerts visualized as colored polygons.
  - Each polygon corresponds to a specific alert type (e.g., `Tornado Warning`, `Flood Watch`, `Red Flag Warning`).
  - **Color-coded by alert type** (examples below).
  - Urgent alerts (e.g., Tornado Warnings) flash with a pulsating animation.

- **Hurricane Forecast Cones**:
  - Forecast tracks and uncertainty cones for tropical systems pulled from the National Hurricane Center.
  - Useful for advance warning before landfall and visualizing storm paths.

- **Waffle House Sensor Markers**: (details below)
  - All known Waffle House locations are displayed as markers whose color and size reflect operational status.
  - Markers are color-coded (e.g., green, purple, red) and dynamically updated to highlight storm-related outages.

---

### 📍 Using Waffle Houses as Disaster Sensors

This tool took inspiration from [FEMA](https://en.wikipedia.org/wiki/Federal_Emergency_Management_Agency)'s internal [Waffle House Index](https://en.wikipedia.org/wiki/Waffle_House_Index). Theirs is not publicly available, so this serves as the next best thing.

All known Waffle House locations are monitored and rendered as markers on the map, based on live data scraped from the Waffle House website and stored in `sensor-status.json` upon both automatic and manual refresh.

- **Marker Types**:
  - 🟢 **Online Sensors** – Location is operational.
  - Filtered off by default.
  - 🟣 **Offline Sensors** – Location is closed with no clear reason why, likely benign business reasons like remodeling or a staffing shortage.
  - Filtered off by default.
  - 🔴 **Disaster Sensors** – If a location closes near a major alert (e.g., Hurricane Warning, Tornado Watch), it is classified as a **disaster sensor** (Configurable, 1-mile default). These markers appear **larger and red** to emphasize probable storm impact. 
  - Filtered on by default.

- **Marker Rendering Logic**:
  - Markers are toggled via sidebar checkboxes.
  - A popup box provides info when a marker is clicked such as location ID, address, and, if closed will show a date and time that the location went offline in the location's local time zone.

---

### ⚠️ Weather Alert Categorization

Only serious and high-impact alerts are rendered to reduce noise. Here's a complete list of included types and their color codes:

#### 🟡 Watches (Increased Risk, Be Prepared)
- **Fire Weather Watch** – `#DC143C`
- **Tornado Watch** – `#FF0000`
- **Flood Watch** – `#0066CC`
- **Tropical Storm Watch** – `#FFA500`
- **Hurricane Watch** – `#FF8C00`
- **Storm Surge Watch** – `#FFB347`

#### 🔴 Warnings (Immediate Threat, Take Action)
- **Blizzard Warning** – `#FF1493`
- **Winter Storm Warning** – `#00BFFF`
- **Ice Storm Warning** – `#9400D3`
- **Red Flag Warning** – `#DC143C`
- **Severe Thunderstorm Warning** – `#FF9900`
- **Tornado Warning** – `#FF0000` (Flashing)
- **Storm Warning** – `#A52A2A`
- **Hurricane Force Wind Warning** – `#8B0000`
- **Flash Flood Warning** – `#00CED1` (Flashing)
- **Flood Warning** – `#0066CC` (Flashing)
- **Tropical Storm Warning** – `#FFA500`
- **Hurricane Warning** – `#FF4500`
- **Storm Surge Warning** – `#FF6347`
- **Extreme Wind Warning** – `#B22222`
- **High Wind Warning** – `#D2691E`

#### 🟠 Civil / Emergency Alerts
- **Evacuation - Immediate** – `#DC143C` (Flashing)
- **Civil Emergency Message** – `#808080`
- **Shelter In Place Warning** – `#696969`
- **Radiological or Hazardous Materials Warning** – `#DA70D6`

---

### 📦 Sidebar UI

- **Dark Mode Toggle** – Default: ON.
- **Refresh Button** – Manually reloads data from all sources.
- **Checkboxes**:
  - Toggle layers for:
    - Online Sensors – Default: OFF
    - Offline Sensors – Default: OFF
    - Disaster Sensors – Default: ON
    - Radar Overlay – Default: ON
    - NWS Alerts – Default: ON
- **Counters** – Each sensor type shows a live count in parentheses.
- **Responsive Design** – Sidebar adapts for smaller screens; map maintains visibility on all viewports.

---

## 🧠 How It Works (Architecture)

### 📁 File Structure

```
NASTAR-Weather-Map/
├── app.py
├── README.md
├── static/
│   ├── index.html
│   ├── main.js
│   ├── style.css
│   └── assets/
│       └── logo.png
├── data/
│   └── sensor-status.json
```

### Backend: `Flask (app.py)`
- Serves all frontend files (HTML, JS, CSS, images) from the `/static/` folder.
- Handles dynamic API requests from the frontend to avoid CORS issues:
  - `/api/waffle-house`: Scrapes live Waffle House location data.
  - `/zones/<type>/<id>`: Proxies to `https://api.weather.gov/zones/<type>/<id>` with a custom `User-Agent` (per NOAA policy).
  - `/sensor-status`: Returns the latest Waffle House operational status JSON.
  - `/hurricane-cones`: Proxies hurricane forecast cone data from NOAA's NHC GeoServer.

### Frontend: `index.html`, `main.js`, `styles.css`, `assets/`
- Loaded directly from the Flask server (`localhost:80`), eliminating cross-origin issues.
- Uses `fetch()` to:
  - Load Waffle House status and metadata from Flask (`/api/waffle-house`, `/sensor-status`).
  - Pull and render NOAA weather alerts directly.
  - Query zone metadata through Flask (`/zones/...`) with automatic fallback to `weather.gov` if local proxy is unavailable.
  - Load and render hurricane forecast cones via Flask (`/hurricane-cones`).
- Proximity detection is applied using Turf.js and Leaflet geometry tools.
- Implements custom logic for:
  - Flashing alert polygons for critical warnings.
  - Marker coloring and resizing based on closure type and storm relevance.
  - Efficient batch processing and redraw logic for performance.
- Radar tiles are loaded from the RainViewer API.


---

## 🧪 Example Use Cases

- 📊 **Serve as a visual dashboard for emergency coordination and awareness**.
- 🔴 **Use alert zones and proximity logic to identify infrastructure damage**, likely indicating a severe disaster in the area.
- 🌪 **Identify at-risk locations during active NWS alerts**, like a Tornado Warning or Hurricane Cone.
- ☔ **Visualize the exact path and impact area of tropical storms and hurricanes**, using NHC cones.
- 🛰️ **Compare sensor outages with real-time radar imagery** to spot damage trends.
- 🔄 **Monitor infrastructure status across wide regions**, particularly during wildfire evacuations, major flooding, or winter weather emergencies.
---

## 🚀 Getting Started

### ✅ Prerequisites

- Python 3.7+
- `Flask` (`pip install flask`)

### 🔧 Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-org/nastar-weather-map.git
   cd nastar-weather-map
    ```

2. **Install Dependencies**:
   ```bash
   pip3 install flask
   ```

3. **Run Flask**:

   ```bash
   python app.py
   ```

   Then open: `http://localhost` in your browser.<br>
   The port can be changed from ```80``` to whatever you want at the bottom of ```app.py```.

---

## 📬 Contact

This tool is maintained by [NASTAR](https://micronations.wiki/wiki/New_Athens_Space_Technology_and_Aerospace_Research) under [the Free Nation of New Athens](https://www.newathensgov.org).

* **Admin Contact**: [correspondence@newathensgov.org](mailto:correspondence@newathensgov.org)
* **Project Lead**: Tyler Mullins

---

## 📜 License

This project is intended for internal and educational use. Redistribution or public deployment must comply with NOAA’s API Terms of Service and attribution to [NASTAR](https://micronations.wiki/wiki/New_Athens_Space_Technology_and_Aerospace_Research) is also required.

