# Agentic World Model Scraper - AI Agent Instructions

## What are Apify Actors?

Actors are serverless cloud programs that can perform anything from a simple action, like filling out a web form, to a complex operation, like crawling an entire website or removing duplicates from a large dataset.

Actors are programs packaged as Docker images, which accept a well-defined JSON input, perform an action, and optionally produce a well-defined JSON output.

### Apify Actor directory structure

```text
.actor/
├── actor.json # Actor config: name, version, env vars, runtime settings
├── input_schema.json # Input validation & Console form definition
├── dataset_schema.json # Dataset schema definition
└── output_schema.json # Specifies where an Actor stores its output
src/
└── main.js # Actor entry point and orchestrator
storage/ # Local storage (mirrors Cloud during development)
├── datasets/ # Output items (JSON objects)
├── key_value_stores/ # Files, config, INPUT
└── request_queues/ # Pending crawl requests
Dockerfile # Container image definition
AGENTS.md # AI agent instructions (this file)
```

## Purpose

Collect metadata for 3D models (Sketchfab and similar sites) to build datasets useful for spatial AI and world modeling. The Actor prefers official APIs when credentials are provided and includes safeguards for license and permission checks.

## Do

- Prefer official API access (provide apiToken) rather than HTML scraping.
- Validate input early and use the siteAllowList to restrict crawl scope.
- Respect robots.txt, site Terms of Service, and model license terms.
- Download only preview thumbnails by default. Downloading actual model files requires explicit permission and careful license review.
- Set sensible defaults for concurrency and maxRequestsPerCrawl.
- Store metadata in Dataset and media in Key-Value store, and plan retention/consent controls.

## Don't

- Do not download or redistribute models with incompatible licenses (e.g., CC-BY-NC for commercial use).
- Do not enable downloadModelFiles unless you have explicit authorization and legal clearance.
- Do not bypass access controls, paywalls, or authenticated content.
- Do not collect private or sensitive metadata (e.g., unpublished assets) without permission.

## Notes

- Sketchfab and other providers have public APIs and developer docs—use them where possible.
- This Actor provides best-effort heuristics; adapt selectors and API usage based on provider docs and responses.
- For large-scale collection, contact content providers for bulk access or licensing.

## Apify CLI

### Commands

```bash
# Local development
apify run

# Authentication & deployment
apify login
apify push

# Help
apify help
```

## Resources

- Sketchfab API docs (refer to provider website)  
- Crawlee docs: https://crawlee.dev  
- Apify docs: https://docs.apify.com