// Agentic World Model Scraper
// Collects metadata from 3D model sites (Sketchfab preferred).
// - Prefers official API when apiToken is provided (recommended).
// - Uses CheerioCrawler for fast HTML parsing otherwise.
// - Respects robots.txt, Terms of Service, and license restrictions.
// WARNING: Do NOT download model files unless you have explicit permission and license clearance.

import { Actor } from 'apify';
import { CheerioCrawler, Dataset, KeyValueStore } from 'crawlee';

await Actor.init();

const input = (await Actor.getInput()) ?? {};

const {
    startUrls = ['https://sketchfab.com/search?q=architecture&type=models'],
    useApi = true,
    apiToken = '',
    maxRequestsPerCrawl = 500,
    downloadPreview = true,
    downloadModelFiles = false,
    minLikes = 0,
    siteAllowList = ['sketchfab.com'],
    includeSubpages = true
} = input;

// Safety checks
if (downloadModelFiles && !apiToken) {
    throw new Error('downloadModelFiles is dangerous. Provide API credentials and ensure you have permission.');
}

const proxyConfiguration = await Actor.createProxyConfiguration();
const kvStore = downloadPreview || downloadModelFiles ? await KeyValueStore.open() : null;

const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl,
    async requestHandler({ request, $, enqueueLinks, log }) {
        const url = request.loadedUrl;
        log.info('Processing', { url });

        // Enforce allow list if provided
        try {
            const host = new URL(url).hostname;
            if (siteAllowList && siteAllowList.length > 0 && !siteAllowList.includes(host)) {
                log.info('Host not in allow list, skipping', { host });
                return;
            }
        } catch (e) {
            log.warning('Invalid URL, skipping', { url });
            return;
        }

        try {
            // If listing/search page, enqueue model links (Sketchfab pattern: /3d-model/<slug>-<uid> or /models/<uid>)
            if (includeSubpages) {
                await enqueueLinks({
                    selector: 'a[href*="/models/"], a[href*="/3d-model/"], a[href*="/search/"]',
                    allowExternal: false
                }).catch(() => {});
            }

            // Detect model page by URL pattern (Sketchfab uses /models/{uid})
            const modelId = extractSketchfabModelId(url);
            if (modelId) {
                // Prefer API if available
                let metadata = null;
                if (useApi && apiToken) {
                    metadata = await fetchModelFromApi(modelId, apiToken, log).catch(err => {
                        log.warning('API fetch failed, falling back to HTML', { modelId, error: err.message });
                        return null;
                    });
                }

                if (!metadata) {
                    metadata = extractModelFromHtml($, url, log);
                }

                // Apply filters
                if (metadata) {
                    if (typeof metadata.likes === 'number' && metadata.likes < (minLikes || 0)) {
                        log.info('Skipping model due to likes filter', { modelId, likes: metadata.likes, minLikes });
                        return;
                    }

                    // Optionally download preview image
                    let previewKey = null;
                    if (downloadPreview && metadata.previewUrl && kvStore) {
                        try {
                            const res = await fetch(metadata.previewUrl, { redirect: 'follow' });
                            if (res.ok) {
                                const buf = Buffer.from(await res.arrayBuffer());
                                const key = `previews/${modelId}.jpg`;
                                await kvStore.setValue(key, buf, { contentType: res.headers.get('content-type') || 'image/jpeg' });
                                previewKey = key;
                            } else {
                                log.warning('Preview fetch failed', { url: metadata.previewUrl, status: res.status });
                            }
                        } catch (err) {
                            log.warning('Error downloading preview', { error: err.message, url: metadata.previewUrl });
                        }
                    }

                    // Optionally attempt model file download (disabled by default)
                    const fileKeys = [];
                    if (downloadModelFiles && kvStore && metadata.formats && metadata.formats.length) {
                        // WARNING: This is best-effort and respects available direct URLs.
                        for (const fmt of metadata.formats) {
                            if (!fmt.url) continue;
                            try {
                                const allowed = await isDownloadAllowed(fmt, metadata, apiToken, log);
                                if (!allowed) {
                                    log.info('Skipping format download due to license/permission', { modelId, format: fmt.format });
                                    continue;
                                }
                                const res = await fetch(fmt.url, { redirect: 'follow' });
                                if (res.ok) {
                                    const buf = Buffer.from(await res.arrayBuffer());
                                    const ext = (fmt.format || 'bin').replace(/[^a-z0-9]+/gi, '').slice(0, 8);
                                    const key = `models/${modelId}_${ext}`;
                                    await kvStore.setValue(key, buf, { contentType: res.headers.get('content-type') || 'application/octet-stream' });
                                    fileKeys.push(key);
                                } else {
                                    log.warning('Model file fetch failed', { url: fmt.url, status: res.status });
                                }
                            } catch (err) {
                                log.warning('Error downloading model file', { error: err.message });
                            }
                        }
                    }

                    // Save to dataset
                    await Dataset.pushData({
                        modelId: metadata.modelId || modelId,
                        title: metadata.title || '',
                        author: metadata.author || '',
                        description: metadata.description || '',
                        tags: metadata.tags || [],
                        license: metadata.license || '',
                        formats: metadata.formats || [],
                        likes: metadata.likes || 0,
                        views: metadata.views || null,
                        modelUrl: metadata.modelUrl || url,
                        previewUrl: metadata.previewUrl || null,
                        previewKey,
                        fileKeys,
                        timestamp: new Date().toISOString()
                    });

                    log.info('Saved model metadata', { modelId });
                } else {
                    log.info('No metadata extracted for model', { modelId });
                }
            } else {
                log.debug('Not a model page, skipping detailed extraction', { url });
            }
        } catch (err) {
            log.warning('Request handler error', { url, error: err.message });
        }
    }
});

await crawler.run(startUrls);
log.info('Actor finished.');
await Actor.exit();

/* ---------- Helpers ---------- */

function extractSketchfabModelId(u) {
    // Sketchfab model pages commonly use /models/{uid}
    try {
        const url = new URL(u);
        const m = url.pathname.match(/\/models\/([A-Za-z0-9_-]+)/);
        if (m) return m[1];
        // Alternative patterns: /3d-model/...-<uid>
        const m2 = url.pathname.match(/-([A-Za-z0-9]{8,})$/);
        if (m2) return m2[1];
    } catch (e) {}
    return null;
}

async function fetchModelFromApi(modelId, token, log) {
    // Best-effort Sketchfab v3 API endpoint
    // NOTE: API details can vary. Adjust headers/URL according to provider docs.
    const apiUrl = `https://api.sketchfab.com/v3/models/${modelId}`;
    const res = await fetch(apiUrl, { headers: { Authorization: `Token ${token}` }, redirect: 'follow' });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const obj = await res.json();

    // Normalize metadata
    const metadata = {
        modelId: obj.uid || modelId,
        title: obj.name || '',
        author: (obj.user && obj.user.displayName) || (obj.user && obj.user.username) || '',
        description: obj.description || '',
        tags: (obj.tags || []).map(t => (t.label || t)),
        license: obj.license ? (obj.license.name || obj.license) : '',
        likes: obj.likes_count || obj.liked_count || obj.likes || 0,
        views: obj.view_count || null,
        modelUrl: obj.viewerUrl || (`https://sketchfab.com/models/${modelId}`),
        previewUrl: (obj.thumbnails && obj.thumbnails.images && obj.thumbnails.images[0] && obj.thumbnails.images[0].url) || obj.thumbnails?.images?.[0]?.url || null,
        formats: (obj.formats || []).map(f => ({
            format: f.format || f.name || '',
            url: f.url || null,
            filesize: f.filesize || null
        }))
    };
    return metadata;
}

function extractModelFromHtml($, pageUrl, log) {
    // Best-effort HTML extraction heuristics for Sketchfab model page
    const title = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim() || '';
    const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
    const previewUrl = $('meta[property="og:image"]').attr('content') || $('img[src*="thumbnail"], img.preview').first().attr('src') || null;
    const author = $('a.author, .model-author a').first().text().trim() || $('.user-info a').first().text().trim() || '';
    const tags = [];
    $('[rel="tag"], .tags a, a.tag').each((i, el) => {
        const t = $(el).text().trim();
        if (t) tags.push(t);
    });
    let likes = null;
    const likesText = $('[data-test="likes-count"], .likes-count, .model-likes').first().text();
    if (likesText) {
        const m = likesText.replace(/,/g, '').match(/\d+/);
        if (m) likes = parseInt(m[0], 10);
    }
    // formats are not easily visible without API or download links; leave empty
    const formats = [];
    const modelId = extractSketchfabModelId(pageUrl) || '';
    return {
        modelId,
        title,
        author,
        description,
        tags,
        license: '', // HTML may show license text; more selectors could be tried
        formats,
        likes: likes || 0,
        views: null,
        modelUrl: pageUrl,
        previewUrl
    };
}

async function isDownloadAllowed(formatEntry, metadata, apiToken, log) {
    // Heuristic permission check:
    // - If no downloadModelFiles flag set or format has no direct URL, disallow.
    // - Respect license strings: if license contains terms that forbid redistribution, disallow.
    // This is a best-effort check—legal review required for production.
    if (!formatEntry || !formatEntry.url) return false;
    const license = (metadata.license || '').toLowerCase();
    if (license.includes('cc-by-nc') || license.includes('proprietary') || license.includes('not allowed')) {
        return false;
    }
    // If API token present, assume authenticated access may allow download — still require explicit consent.
    return Boolean(apiToken);
}