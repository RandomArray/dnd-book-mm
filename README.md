# Open Monster Manual (Implementation Start)

This repository starts the implementation of a mobile web app backed by PostgreSQL and Docker containers.

## What is implemented

- Containerized stack:
  - `db`: PostgreSQL 16
  - `api`: FastAPI service with SQLAlchemy models
  - `web`: Nginx serving a mobile-first frontend
- Database schema with:
  - monster types
  - sources and attribution fields
  - monsters and normalized core stats
- Seed ingestion with a first-pass compliance gate:
  - blocks a small set of known proprietary/trademarked names
  - imports only legal-safe seed entries
- API endpoints:
  - `GET /health`
  - `GET /monster-types`
  - `GET /monsters?monster_type=<type>&search=<name>`
- Grouping behavior:
  - grouped by monster type
  - alphabetical by monster name within type
  - per-group numbering via SQL window function (`row_number` partitioned by type)
- Mobile-first web UI for browsing, filtering, and searching

## Quick start

1. Copy env file:

   `copy .env.example .env`

2. Start stack:

   `docker compose up --build`

3. Open app:

   `http://localhost:8080`

4. API docs:

   `http://localhost:8000/docs`

## Production (Traefik)

This project includes a production compose file intended for a Traefik reverse proxy setup.

Files:

- `docker-compose.prod.yml`
- `.env.prod.example`
- `scripts/deploy.sh`
- `scripts/update.sh`
- `web/nginx.dev.conf` (local development web config)
- `web/nginx.prod.conf` (production web image config)

### One-time server setup

1. Clone repo on server.
2. Copy env template: `cp .env.prod.example .env.prod`
3. Set secure values in `.env.prod`.
4. Ensure external Traefik Docker network exists and matches `TRAEFIK_NETWORK`.
5. Run deploy: `bash scripts/deploy.sh`

### Update flow

To update later:

`bash scripts/update.sh`

This will:

1. Pull latest `main`
2. Rebuild and restart production services

## Notes on legal safety

- Current dataset is a starter corpus intended as open/paraphrased content.
- The blocked-name list in `api/app/seed.py` is intentionally minimal and should be expanded.
- Before production data loads, add:
  - a comprehensive trademark/proprietary denylist
  - source-by-source license validation
  - ingest audit records for every imported entry

## Next implementation steps

1. Add source manifest tables and strict license-level validation.
2. Expand importer to consume vetted open-license source files.
3. Add migration tooling and automated tests.
4. Add pagination and richer filtering (HD range, alignment, movement).
5. Add provenance UI and export endpoints.
