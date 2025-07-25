from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import json
from email.utils import formatdate
import os
from datetime import datetime


app = Flask(__name__, static_folder='static')
CORS(app)  # Allow access from your local webpage
STATUS_FILE = 'sensor-status.json'


def extract_waffle_house_locations(url='https://locations.wafflehouse.com/'):
    response = requests.get(url)
    soup = BeautifulSoup(response.text, 'html.parser')
    scripts = soup.find_all('script', type='application/json')
    for script in scripts:
        if 'props' in str(script.contents):
            json_data = script.contents[0]
            return json.loads(json_data)
    return None

def process_location_data(location):
    custom = location.get('custom', {})
    return {
        'storeCode': location.get('storeCode', 'N/A'),
        'businessName': location.get('businessName', 'N/A'),
        'address': ', '.join(location.get('addressLines', [])) or 'N/A',
        'city': location.get('city', 'N/A'),
        'state': location.get('state', 'N/A'),
        'postalCode': location.get('postalCode', 'N/A'),
        'latitude': location.get('latitude', None),
        'longitude': location.get('longitude', None),
        'status': location.get('_status', 'N/A').strip().upper(),
    }

@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

@app.route('/sensor-status')
def serve_sensor_status():
    try:
        with open('data/sensor-status.json', 'r') as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        return jsonify({'error': 'Status file not found'}), 404


@app.route('/api/waffle-house', methods=['GET'])
def get_locations():
    raw_data = extract_waffle_house_locations()
    if not raw_data:
        return jsonify({'error': 'Failed to fetch Waffle House data'}), 500

    locations = raw_data.get('props', {}).get('pageProps', {}).get('locations', [])
    processed = [process_location_data(loc) for loc in locations if loc.get('latitude') and loc.get('longitude')]

    # 📁 File path and timestamp
    now = datetime.utcnow().isoformat() + "Z"
    STATUS_FILE = 'data/sensor-status.json'

    # 🧠 Handle sensor-status.json (create or update)
    if not os.path.exists(STATUS_FILE):
        print("Creating sensor-status.json for the first time...")
        status_data = {
            loc['storeCode']: {
                'status': loc['status'],
                'last_changed': now,
                'closed_due_to_storm': False
            } for loc in processed
        }
        with open(STATUS_FILE, 'w') as f:
            json.dump(status_data, f, indent=2)
    else:
        with open(STATUS_FILE, 'r') as f:
            status_data = json.load(f)

        modified = False

        for loc in processed:
            code = loc['storeCode']
            new_status = loc['status']
            new_category = 'C' if new_status in ['C', 'CT'] else new_status

            if code not in status_data:
                # 🆕 New store
                status_data[code] = {
                    'status': new_status,
                    'last_changed': now,
                    'closed_due_to_storm': False
                }
                modified = True
            else:
                old_status = status_data[code]['status']
                old_category = 'C' if old_status in ['C', 'CT'] else old_status

                if old_category != new_category:
                    # 🛠️ Status changed (includes reopen or closure)
                    status_data[code]['status'] = new_status
                    status_data[code]['last_changed'] = now
                    modified = True

        if modified:
            with open(STATUS_FILE, 'w') as f:
                json.dump(status_data, f, indent=2)
            print("sensor-status.json updated with changes.")

    return jsonify({
        'lastUpdated': formatdate(usegmt=True),
        'locations': processed
    })


@app.route('/zones/<zone_type>/<zone_id>')
def get_zone_data(zone_type, zone_id):
    url = f'https://api.weather.gov/zones/{zone_type}/{zone_id}'
    headers = {
        'User-Agent': 'NewAthensWeatherMap (correspondence@newathensgov.org)'
    }
    try:
        response = requests.get(url, headers=headers, timeout=5)
        response.raise_for_status()
        return jsonify(response.json())
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/hurricane-cones')
def get_hurricane_cones():
    url = (
        "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/"
        "NHC_tropical_weather_summary/MapServer/7/query"
        "?where=1=1&outFields=*&f=geojson"
    )
    try:
        headers = {
            'User-Agent': 'NewAthensWeatherMap (correspondence@newathensgov.org)'
        }
        resp = requests.get(url, headers=headers, timeout=5)
        resp.raise_for_status()
        return jsonify(resp.json())
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host="0.0.0.0", port=80)
