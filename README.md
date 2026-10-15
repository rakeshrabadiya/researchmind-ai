# ResearchMind AI

ResearchMind AI is a research workspace for turning scientific papers into
clearer questions, evidence, and decisions. This repository contains the
first working scaffold: a responsive research dashboard, a front-end PDF
selection flow, and a FastAPI health endpoint.

## Milestone 1 scope

- React + TypeScript + Vite frontend with a Tailwind CSS toolchain.
- Editorial observatory dashboard with responsive navigation, reading queue,
  research stats, and accessible keyboard states.
- PDF picker and drag/drop interface with PDF and 25 MB validation.
- FastAPI `GET /api/health` endpoint.
- No server upload, PDF parsing, persistence, authentication, or model calls
  yet. Selected PDFs stay in browser memory for this page session.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system boundary and
next-step contracts.

## Requirements

- Node.js `22.11.0` (see `.nvmrc`)
- Python `3.13.14` (see `backend/.python-version`)
- npm 10+
- Docker Desktop or Docker Engine for the container workflow
- `make` is recommended on Linux/macOS; the equivalent npm commands work on
  Windows.

## Setup

Clone the repository and enter the project directory:

```bash
git clone https://github.com/rakeshrabadiya/researchmind-ai.git
cd researchmind-ai
```

Install the locked frontend dependencies and Python dependencies. The Python
environment is project-local and should not be installed globally:

```bash
npm --prefix frontend ci
python3.13 -m venv backend/.venv
. backend/.venv/bin/activate
python -m pip install --requirement backend/requirements.lock.txt
```

On Windows PowerShell, activate with:

```powershell
backend\.venv\Scripts\Activate.ps1
```

No API credentials are needed for this milestone. If environment variables are
used later, copy `.env.example` to `.env` and keep the real file untracked.

## Run locally

Use two terminals from the repository root.

Terminal 1 — frontend:

```bash
npm --prefix frontend run dev
```

Terminal 2 — backend:

```bash
cd backend
uvicorn app.main:app --reload
```

Open the Vite URL printed in terminal 1. The API health response is available
at <http://127.0.0.1:8000/api/health>.

## Checks

The canonical offline test command after dependencies are installed is:

```bash
make test
```

Equivalent commands when `make` is unavailable:

```bash
npm run test
npm run typecheck
npm run build
```

The backend-only check is `cd backend && python -m pytest`. Tests use local
code and do not call external services.

## Docker

The root Dockerfile builds the frontend with the locked npm graph, installs
the locked Python graph, and runs FastAPI. FastAPI serves the built frontend
when the build output is present.

```bash
docker build -t researchmind-ai .
docker run --rm -p 8000:8000 researchmind-ai
```

Open <http://127.0.0.1:8000> and check
<http://127.0.0.1:8000/api/health>.

## Model integration status

The OmniRush runtime selected for this workspace is `omnirush/gpt-6-astra`.
The application does not call it in milestone 1, and no external generative
AI tool or API credential is committed. Any future model adapter must first
confirm the buildathon's permitted integration and add an explicit, tested
boundary.
