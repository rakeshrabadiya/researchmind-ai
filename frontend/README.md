# ResearchMind AI frontend

ResearchMind is a Vite + React + TypeScript dashboard with a Tailwind CSS toolchain. The interface uses an editorial observatory visual language to keep a researcher oriented across reading stats, an active paper queue, and a local PDF preview flow.

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

Open the local URL printed by Vite. The PDF picker is front-end-only: it validates and displays a selected PDF in the current page session and does not send a file to a server.

## Test and typecheck

```bash
npm test
npm run typecheck
```

## Production build

```bash
npm run build
```

## Run with Docker

```bash
docker run --rm -p 8080:80 researchmind-frontend
```

Then open <http://localhost:8080>.
