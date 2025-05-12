import requests
from bs4 import BeautifulSoup
import pandas as pd
import json

def extract_waffle_house_locations(url):
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
    operated_by = custom.get('operated_by', 'N/A')
    online_order_link = custom.get('online_order_link', 'N/A')
    
    processed = {
        'Store Code': location.get('storeCode', 'N/A'),
        'Business Name': location.get('businessName', 'N/A'),
        'Address': ', '.join(location.get('addressLines', [])) or 'N/A',
        'City': location.get('city', 'N/A'),
        'State': location.get('state', 'N/A'),
        'Country': location.get('country', 'N/A'),
        'Operated By': operated_by,
        'Online Order Link': online_order_link,
        'Postal Code': location.get('postalCode', 'N/A'),
        'Latitude': location.get('latitude', 'N/A'),
        'Longitude': location.get('longitude', 'N/A'),
        'Phone Numbers': ', '.join(location.get('phoneNumbers', [])) or 'N/A',
        'Website URL': location.get('websiteURL', 'N/A'),
        'Business Hours': ', '.join(location.get('formattedBusinessHours', [])) or 'N/A',
        'Status': location.get('_status', 'N/A'),
        'Slug': location.get('slug', 'N/A'),
        'Local Page URL': location.get('localPageUrl', 'N/A')
    }
    return processed

def convert_to_csv(data, filename):
    locations = data.get('props', {}).get('pageProps', {}).get('locations', [])
    processed_locations = []
    for loc in locations:
        try:
            processed_locations.append(process_location_data(loc))
        except KeyError as e:
            print(f"Error processing location: {e}")
            continue
    df = pd.DataFrame(processed_locations)
    df.to_csv(filename, index=False)

if __name__ == "__main__":
    url = 'https://locations.wafflehouse.com/'
    data = extract_waffle_house_locations(url)
    if data:
        convert_to_csv(data, 'waffle_house_locations.csv')
        print("Successfully saved to waffle_house_locations.csv")
    else:
        print("No location data found.")
