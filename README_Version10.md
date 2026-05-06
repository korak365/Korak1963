# Agentic World Model Scraper

Crawls 3D-model platforms (Sketchfab) to collect model metadata useful for spatial AI and world-model datasets.

## Key features

- Prefer official API when an API token is provided (recommended).
- Fall back to HTML scraping if API is not available.
- Save structured metadata (title, author, tags, license, likes, preview) to Dataset.
- Optionally download preview thumbnails to Key-Value store.
- Optional (dangerous) model file download behind explicit permission and token.

## Safety & Legal notes (READ BEFORE USE)

- Always respect robots.txt and the site's Terms of Service.
- Prefer official APIs and authenticated access. Using the API reduces legal/rate-limit risks.
- Do NOT download or redistribute model files unless you have explicit permission and license clearance.
- For any production or large-scale data collection contact the content provider and obtain necessary rights.

## Installation

1. Create project folder and paste files into `.actor/` and `src/`.
2. Install dependencies:
```bash
npm install
```

## Usage

Run locally:
```bash
apify run
```

Example INPUT (storage/key_value_stores/default/INPUT.json):
```json
{
  "startUrls": [
    { "url": "https://sketchfab.com/search?q=architecture&type=models" }
  ],
  "useApi": true,
  "apiToken": "",
  "maxRequestsPerCrawl": 500,
  "downloadPreview": true,
  "downloadModelFiles": false,
  "minLikes": 0,
  "siteAllowList": ["sketchfab.com"],
  "includeSubpages": true
}
```

## Output format

Dataset items:
```json
{
  "modelId": "abcdef123456",
  "title": "Modern Pavilion",
  "author": "artist_name",
  "description": "High quality architectural model ...",
  "tags": ["architecture", "pavilion"],
  "license": "CC-BY",
  "formats": [{"format":"obj","url":"https://..."}],
  "likes": 123,
  "views": 4567,
  "modelUrl": "https://sketchfab.com/models/abcdef123456",
  "previewUrl": "https://media.sketchfab.com/.../thumbnail.jpg",
  "previewKey": "previews/abcdef123456.jpg",
  "fileKeys": [],
  "timestamp": "2026-05-06T12:34:56Z"
}
```

## Deploy

1. Login to Apify:
```bash
apify login
```

2. Push to Apify platform:
```bash
apify push
```

## License

ISC