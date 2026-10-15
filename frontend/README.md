# ResearchMind AI frontend

ResearchMind is a Vite + React + TypeScript dashboard with a Tailwind CSS toolchain. The interface uses an editorial observatory visual language to keep a researcher oriented across reading stats, an in-memory multi-paper library, PDF extraction, comparison, evidence search, gap exploration, and report download.

## Requirements

- Node.js `22.11.0` (see `.nvmrc`)
- npm 10+

## Setup

```bash
npm ci
```

## Run locally

```bash
npm run dev
```

Open the local URL printed by Vite. During development, Vite proxies `/api` requests to `http://127.0.0.1:8000`. The upload flow sends a validated PDF to `POST /api/papers/upload` as multipart `FormData`.

To use a backend at another origin, create a local `.env` file (it is ignored by git) with:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

When `VITE_API_BASE_URL` is omitted, the browser uses the same origin. Start the FastAPI service separately when running locally.

The library and intelligence actions use the backend's current process-local
state. A backend restart clears uploaded papers; the frontend does not claim
durable persistence.

## Test and typecheck

```bash
npm test
npm run typecheck
```

The research intelligence API clients are tested with deterministic mocked HTTP
responses; no external services are required for frontend tests.

## Production build

```bash
npm run build
```

## Run with Docker

```bash
docker run --rm -p 8080:80 researchmind-frontend
```

Then open <http://localhost:8080>.
