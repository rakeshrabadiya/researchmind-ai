# ResearchMind backend

FastAPI service for PDF extraction and deterministic multi-paper research
intelligence in ResearchMind AI.

## Setup

Use Python 3.13, create a virtual environment in this directory, and install the pinned dependencies:

```bash
python3.13 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.lock.txt
```

On Windows PowerShell, activate with `.venv\\Scripts\\Activate.ps1`.

## Run

Start the development server from `backend/`:

```bash
uvicorn app.main:app --reload
```

The health check is available at `GET http://127.0.0.1:8000/api/health`.

Upload one PDF with:

```bash
curl -F "file=@paper.pdf;type=application/pdf" http://127.0.0.1:8000/api/papers/upload
```

Uploads must have a `.pdf` filename, `application/pdf` MIME type, a `%PDF-`
magic header, at least one page, and be no larger than 25 MiB. The service
copies each request to a unique temporary file, extracts text locally with
PyMuPDF, and removes the file in all paths. Image-only pages are reported with
an OCR-unavailable warning; OCR is not included in this milestone.

The structured `paper` response is conservative and evidence-preserving:
missing fields are `Not reported`, and important claims contain exact
supporting text plus 1-based source pages. `app.analysis.ProviderAdapter` is a
future provider protocol. Its default adapter is intentionally unconfigured;
no AI/model calls or model-specific API assumptions are made.

## Research intelligence

Successful uploads receive a deterministic `paper_id` and are held in a
process-scoped in-memory library. The service stores validated upload metadata
and extracted page text needed for exact search/evidence; it does not persist
PDFs or content, so restarting the process clears the library.

```text
GET    /api/papers                         list metadata and extracted fields
GET    /api/papers/{paper_id}              inspect page status and evidence
DELETE /api/papers/{paper_id}              remove one in-memory paper
POST   /api/research/compare               compare 2-10 selected paper_ids
GET    /api/research/search?q=...          exact case-insensitive text search
POST   /api/research/gaps                  derive documented evidence-backed gaps
POST   /api/research/report                return deterministic Markdown
```

Comparison, gaps, and report request bodies accept either
`{"paper_ids": ["paper-0001"]}` or the equivalent
`{"selected_paper_ids": ["paper-0001"]}`. Search can scope results with
repeated `paper_ids` query parameters or a comma-separated value. All research
outputs retain exact supporting text and 1-based page references; no generated
conclusions or provider calls are used.

## Test

Run the test suite from `backend/`:

```bash
python -m pytest -q
```

The equivalent project command is `make test`.

## Deploy

Build and run the included container from `backend/`:

```bash
docker build -t researchmind-backend .
docker run --rm -p 8000:8000 researchmind-backend
```
