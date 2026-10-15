# ResearchMind AI

ResearchMind AI is a research workspace for turning scientific papers into
clearer questions, evidence, and decisions. The current milestone combines a
responsive research dashboard with real, deterministic PDF extraction and
page-aware evidence display.

## Milestone 2 scope

- React + TypeScript + Vite frontend with a Tailwind CSS toolchain.
- Editorial observatory dashboard with responsive navigation, reading queue,
  research stats, and accessible keyboard states.
- PDF picker and drag/drop interface connected to `POST /api/papers/upload`.
- FastAPI validates the upload, writes it to a unique temporary file, extracts
  real text with PyMuPDF, and removes the temporary file on every path.
- Structured Pydantic paper fields use document evidence only. Missing fields
  are `Not reported`; claims include exact supporting text and 1-based pages.
- Image-only pages are reported explicitly. OCR is not implemented.
- No persistence, authentication, or model calls. No external generative AI
  tool is used.

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

Upload one PDF from the dashboard, or use the API directly:

```bash
curl -F "file=@paper.pdf;type=application/pdf" \
  http://127.0.0.1:8000/api/papers/upload
```

The upload endpoint rejects non-PDF MIME types/extensions, invalid PDF headers,
malformed documents, empty uploads, and files larger than 25 MiB. A valid blank
PDF is accepted and reported as having no extracted text.

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

## AI integration status

The OmniRush runtime selected for this workspace is `omnirush/gpt-6-astra`.
The bundled OmniRush documentation describes desktop/cloud provider setup and
managed credentials, but does not expose a verified application request
schema, authentication flow, or response contract for calling this configured
runtime from this FastAPI service. OmniRush Cloud is also signed out in the
current desktop runtime. Therefore this milestone deliberately does not make
model calls or assume an OpenAI-compatible endpoint.

The backend contains a `ProviderAdapter` protocol as a blocked integration
boundary. A future implementation must verify the supported interface first;
until then, all returned analysis is deterministic and text-backed.

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service readiness check |
| `POST` | `/api/papers/upload` | Validate and extract one PDF |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for response fields,
security boundaries, and known limitations.
