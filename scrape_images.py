#!/usr/bin/env python3
import os
import json
import requests
import csv
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
import time

UPLOAD_DIR = "C:/Users/glcar/Upload"
OUTPUT_DIR = "./output"
IMAGES_DIR = os.path.join(OUTPUT_DIR, "company_images")
MAX_AGENTS = 200
REQUEST_TIMEOUT = 15
MIN_IMAGE_SIZE = 5000

os.makedirs(IMAGES_DIR, exist_ok=True)

class ImageAgent:
    def __init__(self, agent_id):
        self.agent_id = agent_id
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

    def scrape_company(self, company):
        company_id = company['id']
        website = company.get('website', '')
        name = company.get('businessName', 'Unknown')

        result = {
            'companyId': company_id,
            'name': name,
            'status': 'pending',
            'images': 0,
            'paths': []
        }

        if not website or website == 'nan' or len(website) < 4:
            result['status'] = 'no_website'
            return result

        if not website.startswith(('http://', 'https://')):
            website = 'https://' + website

        try:
            response = self.session.get(website, timeout=REQUEST_TIMEOUT)
            soup = BeautifulSoup(response.content, 'html.parser')

            img_urls = []
            for img in soup.find_all('img'):
                src = img.get('src') or img.get('data-src')
                if not src:
                    continue

                if src.startswith('//'):
                    src = 'https:' + src
                elif src.startswith('/'):
                    parsed = urlparse(response.url)
                    src = f"{parsed.scheme}://{parsed.netloc}{src}"
                elif not src.startswith('http'):
                    src = urljoin(response.url, src)

                skip = ['logo', 'icon', 'button', 'banner', 'ad', 'social', 'facebook', 'twitter']
                if any(p in src.lower() for p in skip):
                    continue

                img_urls.append(src)

            result['images'] = len(img_urls)

            safe_id = company_id.replace('/', '_').replace('\\', '_')
            img_dir = os.path.join(IMAGES_DIR, safe_id)
            os.makedirs(img_dir, exist_ok=True)

            for idx, url in enumerate(img_urls[:3]):
                try:
                    img_resp = self.session.get(url, timeout=10, stream=True)

                    ext = '.jpg'
                    if '.' in url.split('?')[0]:
                        p = url.split('?')[0].split('.')[-1].lower()
                        if p in ['jpg', 'jpeg', 'png', 'gif', 'webp']:
                            ext = f'.{p}'

                    filepath = os.path.join(img_dir, f"image_{idx+1}{ext}")
                    with open(filepath, 'wb') as f:
                        for chunk in img_resp.iter_content(8192):
                            f.write(chunk)

                    if os.path.getsize(filepath) >= MIN_IMAGE_SIZE:
                        result['paths'].append(filepath)
                    else:
                        os.remove(filepath)

                except Exception:
                    continue

            result['status'] = 'success' if result['paths'] else 'no_images'

        except Exception as e:
            result['status'] = 'error'

        return result


def build_database():
    csv_files = sorted([f for f in os.listdir(UPLOAD_DIR)
                       if f.endswith('_CONSTRUCTION_DIRECTORY.csv')])

    all_companies = []
    print("Building database...")

    for i, csv_file in enumerate(csv_files, 1):
        state = csv_file.replace('_CONSTRUCTION_DIRECTORY.csv', '')
        try:
            filepath = os.path.join(UPLOAD_DIR, csv_file)
            count = 0
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                reader = csv.DictReader(f)
                for idx, row in enumerate(reader):
                    website = row.get('website', '') or ''
                    website = website.strip()
                    if website.lower() == 'nan':
                        website = ''
                    biz_name = (row.get('business_name', '') or '')[:100]
                    all_companies.append({
                        'id': f"{state}_{idx}",
                        'businessName': biz_name,
                        'website': website,
                        'hasWebsite': bool(website and len(website) > 3)
                    })
                    count += 1
            print(f"[{i:2d}/50] {state}: {count:,} companies")
        except Exception as e:
            print(f"[{i:2d}/50] {state}: ERROR - {e}")

    with open(os.path.join(OUTPUT_DIR, 'companies.json'), 'w') as f:
        json.dump(all_companies, f)

    print(f"\nTotal: {len(all_companies):,} companies")
    return [c for c in all_companies if c['hasWebsite']]


def run_collection(companies):
    results = []
    stats = {'total': len(companies), 'success': 0, 'failed': 0, 'images': 0}

    batch_size = 500
    total_batches = (len(companies) + batch_size - 1) // batch_size

    for batch_num in range(total_batches):
        start = batch_num * batch_size
        batch = companies[start:start + batch_size]

        print(f"\n[BATCH {batch_num+1}/{total_batches}] {len(batch)} companies")

        agents = [ImageAgent(i) for i in range(MAX_AGENTS)]

        with ThreadPoolExecutor(max_workers=MAX_AGENTS) as executor:
            futures = []
            for i, company in enumerate(batch):
                agent = agents[i % MAX_AGENTS]
                future = executor.submit(agent.scrape_company, company)
                futures.append(future)

            completed = 0
            for future in as_completed(futures):
                try:
                    result = future.result(timeout=60)
                    results.append(result)
                    completed += 1

                    if result['status'] == 'success':
                        stats['success'] += 1
                        stats['images'] += len(result['paths'])
                    else:
                        stats['failed'] += 1

                    if completed % 50 == 0:
                        print(f"  {completed} done | Success: {stats['success']} | Images: {stats['images']}")

                except Exception:
                    stats['failed'] += 1

        with open(os.path.join(OUTPUT_DIR, 'progress.json'), 'w') as f:
            json.dump({'stats': stats, 'results': results[-1000:]}, f)

    with open(os.path.join(OUTPUT_DIR, 'results.json'), 'w') as f:
        json.dump(results, f)

    print(f"\n{'='*60}")
    print("COMPLETE!")
    print(f"Total: {stats['total']:,}")
    print(f"Success: {stats['success']:,}")
    print(f"Images: {stats['images']:,}")
    print(f"{'='*60}")


if __name__ == '__main__':
    companies = build_database()
    run_collection(companies)
