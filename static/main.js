let map;
let darkTileLayer;
let lightTileLayer;
let markers = [];
let locations = [];
const batchSize = 50;
const STORM_PROXIMITY_THRESHOLD = 1; //miles
let alertLayer;
let alertPolygons = [];
let cachedAlertGeoJSON = null;

function initMap() {
    map = L.map('map').setView([38.709789, -88.638262], 4);

    map.createPane('openPane');
    map.getPane('openPane').style.zIndex = 390;

    map.createPane('radarPane');
    map.getPane('radarPane').style.zIndex = 400;

    map.createPane('criticalPane');
    map.getPane('criticalPane').style.zIndex = 420;

    map.attributionControl.setPosition('bottomleft');

    // Light tile layer (default)
    lightTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Dark tile layer (hidden initially)
    darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    });

    if (document.body.classList.contains('dark-mode')) {
        map.removeLayer(lightTileLayer);
        darkTileLayer.addTo(map);
    }

}
        
function isInWeatherAlert(lat, lng) {
    const point = turf.point([lng, lat]); // turf uses [lng, lat]
    const buffered = turf.buffer(point, STORM_PROXIMITY_THRESHOLD, { units: 'miles' });
    const bufferedBbox = turf.bbox(buffered); // [minX, minY, maxX, maxY]

    return alertPolygons.some(polygon => {
        try {
            const bounds = polygon.getBounds();
            const polyBbox = [
                bounds.getWest(),
                bounds.getSouth(),
                bounds.getEast(),
                bounds.getNorth()
            ];

            // Quick check: if bounding boxes don't overlap, skip
            if (
                bufferedBbox[2] < polyBbox[0] || // buffered maxX < poly minX
                bufferedBbox[0] > polyBbox[2] || // buffered minX > poly maxX
                bufferedBbox[3] < polyBbox[1] || // buffered maxY < poly minY
                bufferedBbox[1] > polyBbox[3]    // buffered minY > poly maxY
            ) {
                return false;
            }

            const geojson = polygon.toGeoJSON();
            return turf.booleanIntersects(buffered, geojson);
        } catch (err) {
            console.warn('Polygon error:', err);
            return false;
        }
    });
}

function isStormRelated(loc) {
    const status = (loc.status || '').toUpperCase();
    if (status !== 'C' && status !== 'CT') return false;
    if (!loc.last_changed) return false;

    const lastChanged = new Date(loc.last_changed);
    const now = new Date();

    // Only evaluate if closed within last 48 hours
    const hoursClosed = (now - lastChanged) / (1000 * 60 * 60);
    if (hoursClosed > 24) return false;

    // Must also be near an active storm alert
    return isInWeatherAlert(loc.latitude, loc.longitude);
}

function getStatusColor(status, lat, lng, loc) {
    const upperStatus = (status || '').toUpperCase();

    if (upperStatus === 'C' || upperStatus === 'CT') {
        return isStormRelated(loc) ? '#FF0000' : '#FF00FF';
    }

    return '#00FF00'; // open
}

function getMarkerStyle(status, lat, lng, loc) {
    const color = getStatusColor(status, lat, lng, loc);
    const inStorm = isStormRelated(loc);

    let radius = 1;
    if ((status || '').toUpperCase() === 'C' || (status || '').toUpperCase() === 'CT') {
        radius = inStorm ? 5 : 1;
    }

    return {
        radius,
        color,
        fillColor: color,
        fillOpacity: 0.6,
        weight: 1
    };
}

const stateTimeZones = {
    "AL": "America/Chicago",
    "AK": "America/Anchorage",
    "AZ": "America/Phoenix",
    "AR": "America/Chicago",
    "CA": "America/Los_Angeles",
    "CO": "America/Denver",
    "CT": "America/New_York",
    "DE": "America/New_York",
    "FL": "America/New_York",  // Most of FL is Eastern
    "GA": "America/New_York",
    "HI": "Pacific/Honolulu",
    "ID": "America/Boise",     // Western ID is Pacific
    "IL": "America/Chicago",
    "IN": "America/Indiana/Indianapolis",
    "IA": "America/Chicago",
    "KS": "America/Chicago",
    "KY": "America/New_York",  // Western KY is Central
    "LA": "America/Chicago",
    "ME": "America/New_York",
    "MD": "America/New_York",
    "MA": "America/New_York",
    "MI": "America/Detroit",
    "MN": "America/Chicago",
    "MS": "America/Chicago",
    "MO": "America/Chicago",
    "MT": "America/Denver",
    "NE": "America/Chicago",
    "NV": "America/Los_Angeles",
    "NH": "America/New_York",
    "NJ": "America/New_York",
    "NM": "America/Denver",
    "NY": "America/New_York",
    "NC": "America/New_York",
    "ND": "America/Chicago",
    "OH": "America/New_York",
    "OK": "America/Chicago",
    "OR": "America/Los_Angeles",
    "PA": "America/New_York",
    "RI": "America/New_York",
    "SC": "America/New_York",
    "SD": "America/Chicago",
    "TN": "America/Chicago",
    "TX": "America/Chicago",
    "UT": "America/Denver",
    "VT": "America/New_York",
    "VA": "America/New_York",
    "WA": "America/Los_Angeles",
    "WV": "America/New_York",
    "WI": "America/Chicago",
    "WY": "America/Denver",
    // Optional: territories
    "DC": "America/New_York",
    "PR": "America/Puerto_Rico",
    "GU": "Pacific/Guam",
    "VI": "America/St_Thomas"
};

function processBatch(batch) {
    return new Promise(resolve => {
        batch.forEach(location => {
            try {
                const lat = parseFloat(location.latitude);
                const lng = parseFloat(location.longitude);

                if (isNaN(lat) || isNaN(lng)) {
                    console.error('Invalid coordinates:', location);
                    return;
                }

                const status = (location.status || '').toUpperCase();
                const markerOptions = getMarkerStyle(status, lat, lng, location);
                const marker = L.circleMarker([lat, lng], markerOptions);

                let closedSinceLine = '';
                if ((status === 'C' || status === 'CT') && location.last_changed) {
                    const timeZone = stateTimeZones[location.state] || "America/New_York";
                    const date = new Date(location.last_changed);
                    const formatted = date.toLocaleString("en-US", { timeZone });
                    closedSinceLine = `<p><strong>Closed since:</strong> ${formatted} <em>(local time)</em></p>`;
                }

                const popupContent = `
                    <div class="info-window">
                        <h3>ID: ${location.storeCode}</h3>
                        <p>${location.address}<br>${location.city}, ${location.state} ${location.postalCode}</p>
                        ${closedSinceLine}
                    </div>
                `;

                marker.bindPopup(popupContent);
                location.marker = marker;
                markers.push(marker);

                // Add to appropriate group
                if (status === 'A') {
                    marker.addTo(onlineLayer);
                } else if ((status === 'C' || status === 'CT') && isStormRelated(location)) {
                    marker.addTo(stormLayer);
                } else {
                    marker.addTo(offlineLayer);
                }

            } catch (error) {
                console.error('Error processing location:', error);
            }
        });
        resolve();
    });
}


function updateMarkers() {
    // Clear any previous markers from the layer groups
    onlineLayer.clearLayers();
    offlineLayer.clearLayers();
    stormLayer.clearLayers();
    markers = [];

    let openCount = 0;
    let closedStormCount = 0;
    let closedNoStormCount = 0;

    const batches = [];
    const numBatches = Math.ceil(locations.length / batchSize);

    for (let i = 0; i < numBatches; i++) {
        const start = i * batchSize;
        const end = start + batchSize;
        batches.push(locations.slice(start, end));
    }

    let currentBatch = 0;

    const processNextBatch = () => {
        if (currentBatch < batches.length) {
            processBatch(batches[currentBatch]).then(() => {
                // Count markers from this batch
                batches[currentBatch].forEach(loc => {
                    const status = (loc.status || '').toUpperCase();
                    if (status === 'A') {
                        openCount++;
                    } else if ((status === 'C' || status === 'CT') && isStormRelated(loc)) {
                        closedStormCount++;
                    } else if (status === 'C' || status === 'CT') {
                        closedNoStormCount++;
                    }
                });

                currentBatch++;
                processNextBatch();
            });
        } else {
            // ✅ All batches processed — update sidebar
            updateSidebarCounts(openCount, closedNoStormCount, closedStormCount);
        }
    };

    processNextBatch();
}

function loadJSON() {
    document.getElementById('status').innerHTML = 'Loading live data...';
    document.getElementById('status').style.display = 'block';

    fetch('/api/waffle-house')
        .then(response => response.json())
        .then(data => {
            return Promise.all([
                data,
                fetch('/sensor-status').then(r => r.json())
            ]);
        })
        .then(([data, statusMap]) => {
            document.getElementById('status').style.display = 'none';
            locations = data.locations || [];

            // 🧠 Add last_changed to each location
            locations.forEach(loc => {
                const statusEntry = statusMap[loc.storeCode];
                loc.last_changed = statusEntry?.last_changed || null;
            });

            updateMarkers();

        })
        .catch(error => {
            document.getElementById('status').innerHTML = 'Error loading data!';
            document.getElementById('status').classList.add('error');
            console.error('Error fetching JSON:', error);
        });
}

function showRadarFrame(index) {
    if (!radarTimestamps.length) return;

    const timestamp = radarTimestamps[index];
    const tileUrl = `https://tilecache.rainviewer.com/v2/radar/${timestamp}/256/{z}/{x}/{y}/2/1_1.png`;

    if (radarLayer) {
        map.removeLayer(radarLayer);
    }

    radarLayer = L.tileLayer(tileUrl, {
        tileSize: 256,
        opacity: 0.5,
        zIndex: 1, // optional inside the pane
        pane: 'radarPane', // 🔁 key line
        attribution: 'Radar © RainViewer'
    }).addTo(map);

}

// Initialize RainViewer radar overlay
let radarLayer = null;
let radarVisible = true;
let radarTimestamps = [];
let radarCurrentIndex = 0;

function loadRadarLayer() {
    fetch('https://api.rainviewer.com/public/weather-maps.json')
        .then(response => response.json())
        .then(data => {
            radarTimestamps = (data.radar?.past || []).map(frame => frame.path);
            radarCurrentIndex = radarTimestamps.length - 1;

            if (radarVisible && radarTimestamps.length > 0) {
                showRadarFrame(radarCurrentIndex);
            } else {
                console.warn("No radar timestamps available.");
            }
        })
        .catch(err => console.error("Radar fetch error:", err));
}

async function fetchHurricaneCones() {
    const resp = await fetch("/hurricane-cones");
    return resp.json();
}

let coneLayer = null;
async function loadHurricaneCones() {
    const data = await fetchHurricaneCones();
    if (coneLayer) map.removeLayer(coneLayer);

    coneLayer = L.geoJSON(data, {
        style: {
        color: "#FF4500",
        fillColor: "#FFA500",
        fillOpacity: 0.2,
        weight: 2
        },
        onEachFeature: (feat, layer) => {
        const props = feat.properties;
        layer.bindPopup(
            `<strong>Storm: ${props.stormname}</strong><br/>` +
            `Advisory #${props.advisnum} on ${props.advdate}`
        );
        layer.on('click', () => map.fitBounds(layer.getBounds())); // Add this to zoom to the cone bounds when clicked
        }
    }).addTo(map);
}


async function fetchZoneGeometry(zoneUrl) {
    const match = zoneUrl.match(/zones\/([^/]+)\/([^/]+)/);
    if (!match) return null;

    const [, type, id] = match;

    // \/ This slows down the zone loading dramatically, so it's gone
    // Try local backend only if running from localhost
    /* const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    /* if (isLocalhost) {
        const localUrl = `http://localhost:5000/zones/${type}/${id}`;
        try {
            const response = await fetch(localUrl);
            if (!response.ok) throw new Error("Local backend failed");
            const json = await response.json();
            return json.geometry;
        } catch (e) {
            console.warn("Local backend fetch failed:", e);
        }
    }*/

    // Always fallback to direct request
    try {
        const fallbackResponse = await fetch(zoneUrl);
        const fallbackJson = await fallbackResponse.json();
        return fallbackJson.geometry;
    } catch (fallbackError) {
        console.error("Direct zone fetch failed:", fallbackError);
        return null;
    }
}




const corsProxy = "https://corsproxy.io/?";
async function fetchNWSAlerts() {
    const nwsUrl = "https://api.weather.gov/alerts/active?status=actual&message_type=alert";
    const response = await fetch(corsProxy + encodeURIComponent(nwsUrl));
    const data = await response.json();
    return data.features;
}

async function loadAndRenderAlerts(forceReload = false) {
    if (!forceReload && cachedAlertGeoJSON) {
        renderAlertLayer(cachedAlertGeoJSON);
        return;
    }

    const features = await fetchNWSAlerts();
    const allowedEvents = new Set([
        "Fire Weather Watch", "Tornado Watch", "Flood Watch", "Tropical Storm Watch", "Hurricane Watch",
        "Storm Surge Watch", "Blizzard Warning", "Winter Storm Warning", "Ice Storm Warning", "Red Flag Warning",
        "Severe Thunderstorm Warning", "Tornado Warning", "Storm Warning", "Hurricane Force Wind Warning",
        "Flash Flood Warning", "Flood Warning", "Tropical Storm Warning", "Hurricane Warning", "Storm Surge Warning",
        "Extreme Wind Warning", "High Wind Warning", "Evacuation - Immediate", "Civil Emergency Message",
        "Shelter In Place Warning", "Radiological Hazard Warning", "Hazardous Materials Warning"
    ]);

    const enriched = [];
    for (const f of features) {
        const event = f.properties?.event;
        if (!allowedEvents.has(event)) continue;

        if (["Polygon", "MultiPolygon"].includes(f.geometry?.type)) {
            enriched.push(f);
        } else if (f.geometry === null && f.properties?.affectedZones?.length) {
            for (const zoneUrl of f.properties.affectedZones) {
                const geometry = await fetchZoneGeometry(zoneUrl);
                if (geometry) {
                    const cloned = structuredClone(f);
                    cloned.geometry = geometry;
                    enriched.push(cloned);
                    break;
                }
            }
        }
    }

    cachedAlertGeoJSON = enriched;
    renderAlertLayer(cachedAlertGeoJSON);
}

function renderAlertLayer(alerts) {
    alertPolygons.length = 0;
    alerts.forEach(f => {
        if (f.geometry?.type === "Polygon") {
            const coords = f.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
            alertPolygons.push(L.polygon(coords));
        }
    });

    if (alertLayer) {
        map.removeLayer(alertLayer);
    }

    alertLayer = L.geoJSON(alerts, {
        style: feature => {
            const category = feature.properties.event;
            const color = {
                "Fire Weather Watch": "#DC143C", "Tornado Watch": "#FF8C00", "Flood Watch": "#1E90FF",
                "Tropical Storm Watch": "#20B2AA", "Hurricane Watch": "#FFA500", "Storm Surge Watch": "#FFB6C1",
                "Blizzard Warning": "#FF1493", "Winter Storm Warning": "#1E90FF", "Ice Storm Warning": "#6A5ACD",
                "Red Flag Warning": "#B22222", "Severe Thunderstorm Warning": "#FF4500", "Tornado Warning": "#FF0000",
                "Storm Warning": "#A52A2A", "Hurricane Force Wind Warning": "#800000", "Flash Flood Warning": "#00CED1",
                "Flood Warning": "#1E90FF", "Tropical Storm Warning": "#00BFFF", "Hurricane Warning": "#8B0000",
                "Storm Surge Warning": "#C71585", "Extreme Wind Warning": "#8B0000", "High Wind Warning": "#DAA520",
                "Evacuation - Immediate": "#DC143C", "Civil Emergency Message": "#000000", "Shelter In Place Warning": "#4B0082",
                "Radiological Hazard Warning": "#2F4F4F", "Hazardous Materials Warning": "#8B008B"
            }[category] || "#999";

            const urgentFlashing = new Set([
                "Tornado Warning", "Severe Thunderstorm Warning", "Flash Flood Warning", "Flood Warning",
                "Tropical Storm Warning", "Hurricane Warning", "Storm Surge Warning", "Blizzard Warning",
                "Winter Storm Warning", "Ice Storm Warning", "Red Flag Warning", "Storm Warning",
                "Hurricane Force Wind Warning", "Extreme Wind Warning", "High Wind Warning",
                "Evacuation - Immediate", "Civil Emergency Message", "Shelter In Place Warning",
                "Radiological Hazard Warning", "Hazardous Materials Warning"
            ]);

            return {
                color,
                fillColor: color,
                fillOpacity: 0.3,
                weight: 2,
                className: urgentFlashing.has(category) ? "flashing-alert" : ""
            };
        },
        onEachFeature: (feature, layer) => {
            const props = feature.properties;
            const event = props.event || "Weather Alert";
            const description = props.description || "";
            const instruction = props.instruction || "";
            const expires = props.expires ? new Date(props.expires).toLocaleString() : "Unknown";
            const link = props.web || "#";

            const extractSection = (label) => {
                const regex = new RegExp(`${label}\\.{3}(.*?)(?:\\n\\n|\\n[A-Z]+|$)`, "s");
                const match = description.match(regex);
                return match ? match[1].trim().replace(/\n/g, ' ') : "";
            };

            const hazard = extractSection("HAZARD");
            const impact = extractSection("IMPACT");

            const popupContent = `
                <big><strong>${event}</strong></big><br/>
                <strong>Expires:</strong> ${expires}<br/>
                <a href="${link}" target="_blank">View full alert</a><br/><br/>
                ${hazard ? `<strong>Hazard:</strong> ${hazard}<br/><br/>` : ""}
                ${impact ? `<strong>Impact:</strong> ${impact}<br/><br/>` : ""}
                ${instruction ? `<strong>Instructions:</strong> ${instruction}` : ""}
            `;

            layer.bindPopup(popupContent);
        }
    }).addTo(map);
}



initMap();
let onlineLayer = L.layerGroup();
let offlineLayer = L.layerGroup();
let stormLayer = L.layerGroup();

// Collapse sidebar on load if screen is small
if (window.innerWidth <= 634) {
    footer.style.bottom = '35px';

    const sidebar = document.getElementById("sidebar");
    sidebar.classList.add("collapsed");

    const toggleBtn = document.getElementById("sidebarToggle");
    if (toggleBtn) toggleBtn.innerHTML = "&lsaquo;";
} else {
    footer.style.bottom = '20px';
}

if (document.getElementById("toggle-online").checked) {
    onlineLayer.addTo(map);
}
if (document.getElementById("toggle-offline").checked) {
    offlineLayer.addTo(map);
}
if (document.getElementById("toggle-storm").checked) {
    stormLayer.addTo(map);
}

document.getElementById("refreshBtn").addEventListener("click", () => {
    cachedAlertGeoJSON = null;
    refreshAll(); // Adjust this to your refresh logic
});

// Ensure checkboxes are initially set to default (storm-related only)
document.getElementById("darkModeToggle").checked = true;
document.getElementById("toggle-online").checked = false;
document.getElementById("toggle-offline").checked = false;
document.getElementById("toggle-storm").checked = true;
document.getElementById("toggle-radar").checked = true;
document.getElementById("toggle-alerts").checked = true;

// Update counts somewhere in your code when markers are added
function updateSidebarCounts(onlineCount, offlineCount, stormCount) {
    document.getElementById("count-online").textContent = onlineCount;
    document.getElementById("count-offline").textContent = offlineCount;
    document.getElementById("count-storm").textContent = stormCount;
}

document.getElementById("toggle-online").addEventListener("change", function () {
    if (this.checked) {
        map.addLayer(onlineLayer);
    } else {
        map.removeLayer(onlineLayer);
    }
});

document.getElementById("toggle-offline").addEventListener("change", function () {
    if (this.checked) {
        map.addLayer(offlineLayer);
    } else {
        map.removeLayer(offlineLayer);
    }
});

document.getElementById("toggle-storm").addEventListener("change", function () {
    if (this.checked) {
        map.addLayer(stormLayer);
    } else {
        map.removeLayer(stormLayer);
    }
});

document.getElementById("toggle-radar").addEventListener("change", function () {
    if (this.checked) {
        map.addLayer(radarLayer);
    } else {
        map.removeLayer(radarLayer);
    }
});

document.getElementById("toggle-alerts").addEventListener("change", function () {
    if (this.checked) {
        loadAndRenderAlerts();
    } else if (alertLayer && map.hasLayer(alertLayer)) {
        map.removeLayer(alertLayer);
    }
});

const darkTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors & CartoDB | Powered by NASTAR',
});

const lightTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors & CartoDB | Powered by NASTAR',
});

// Load dark mode tiles by default
let baseLayer = darkTiles.addTo(map);

// Toggle logic stays the same
document.getElementById("darkModeToggle").addEventListener("change", function () {
    document.body.classList.toggle("dark", this.checked);
    map.removeLayer(baseLayer);
    baseLayer = this.checked ? darkTiles : lightTiles;
    map.addLayer(baseLayer);
});

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("sidebarToggle").addEventListener("click", function () {
        const sidebar = document.getElementById("sidebar");
        sidebar.classList.toggle("collapsed");
        this.innerHTML = sidebar.classList.contains("collapsed") ? "&lsaquo;" : "&rsaquo;";
    });
});




// Ensure correct order: alerts → radar → hurricane cones → locations
Promise.all([
    loadAndRenderAlerts(),  // Load NWS alerts first
    loadRadarLayer(),       // Optional, runs in parallel
    loadHurricaneCones(),   // Optional, runs in parallel
]).then(() => {
    return loadJSON();      // Only load Waffle House locations after alerts
}).catch(error => {
    console.error("Initialization error:", error);
});

function refreshAll() {
    Promise.all([
        loadAndRenderAlerts(),
        loadRadarLayer(),
        loadHurricaneCones()
    ]).then(() => {
        return loadJSON();
    }).catch(error => {
        console.error("Refresh error:", error);
    });
}

// Auto-refresh every 5 minutes
setInterval(refreshAll, 5 * 60 * 1000); // Every 5 minutes