# ResearchMind AI architecture

## Milestone 3 boundary

The current milestone preserves the first dashboard and adds one complete,
honest PDF processing slice:

1. A researcher opens a responsive research dashboard.
2. They choose or drag a PDF into the upload panel.
3. The browser validates the file type and 25 MB limit, then sends it as
   multipart form data to `POST /api/papers/upload`.
4. FastAPI validates the bytes, extracts real text with PyMuPDF, and removes
   its temporary file.
5. The upload receives a process-local `paper_id` and appears in the research
   library without persisting the PDF.
6. The researcher can select papers, inspect/remove them, compare fields,
   search exact passages, explore documented gaps, and download a Markdown
   report.
7. The dashboard displays extraction metadata, per-page status, evidence-backed
   paper fields, claims, and 1-based source pages.
8. The FastAPI service reports readiness at `GET /api/health`.

The backend does not persist uploaded files or send them to a model. The
library stores validated metadata and extracted page text only for the current
Python process. A restart clears it. The dashboard sample statistics and
reading queue are intentionally static seed content, not claims about a
connected research library.

## System shape

```text
                local development
        +-------------------------------+
        | React + TypeScript + Vite      |
        | Tailwind CSS toolchain         |
        | frontend/                      |
        +---------------+---------------+
                        |
                        | multipart uploads + research JSON/report responses
                        v
        +-------------------------------+
        | FastAPI + Uvicorn              |
        | backend/app/main.py           |
        | GET /api/health                |
        | POST /api/papers/upload        |
        | GET/DELETE /api/papers         |
        | POST /api/research/*           |
        +-------------------------------+

                production container
        +----------------------------------------------+
        | FastAPI serves /api/health and frontend/dist  |
        +----------------------------------------------+
```

## Repository layout

| Path | Responsibility |
| --- | --- |
| `frontend/` | Vite application, React UI, Tailwind configuration, browser tests |
| `backend/app/` | FastAPI application package |
| `backend/tests/` | API behavior tests using FastAPI `TestClient` |
| `docs/` | Architecture and implementation notes |
| `Dockerfile` | Reproducible two-stage build; serves the built UI through FastAPI |
| `Makefile` | Linux-friendly install, test, typecheck, build, and dev entry points |
| `.env.example` | Non-secret configuration placeholders only |

## Design decisions

### Editorial observatory UI

The dashboard uses a warm paper palette, editorial serif headings, and an
orbit/radar upload visual. The anchor is the upload panel: it looks like a
research instrument rather than a generic SaaS drop zone while keeping the
interaction keyboard accessible and visually explicit.

### Thin API boundary

The backend keeps the stable health contract and adds bounded upload and
research routes. Every research route resolves explicit paper IDs through the
in-memory library and returns validated JSON or deterministic Markdown instead
of inventing a persistence layer prematurely.

### Process-scoped library lifecycle

`backend/app/library.py` stores `UploadResponse` metadata plus extracted page
text in a thread-safe in-memory dictionary. IDs are deterministic within one
process (`paper-0001`, `paper-0002`, ...). `GET /api/papers` lists newest first;
`GET /api/papers/{paper_id}` exposes field-level provenance without raw page
text; `DELETE` removes the record. No PDF path or binary is retained after the
upload request, and all records disappear on process restart. Durable storage
is intentionally deferred rather than implied.

### Deterministic cross-paper intelligence

`backend/app/intelligence.py` provides transparent operations:

- Comparison copies structured values and attaches exact matched evidence.
- Search performs bounded, case-insensitive substring matching over extracted
  page lines/sentences and returns the source paper and 1-based page.
- Gap exploration accepts only documented limitations, future directions, or
  sentences with explicit open-question wording.
- Reports are Markdown assembled from the same validated values and evidence;
  they include an explicit no-model-generated-conclusions notice.

No operation infers contradictions, citations, missing results, or scientific
conclusions.

### Evidence-preserving extraction

`backend/app/extraction.py` uses PyMuPDF to read each page's text layer. It
never executes document content. Each page is reported as `text_extracted`,
`empty`, or `image_only`; the latter sets `ocr_unavailable=true` and emits a
warning. `backend/app/analysis.py` uses conservative heading and sentence
heuristics. It copies supporting evidence and source pages; it does not infer
facts or generate citations.

### Upload safety

The upload route requires a `.pdf` filename, `application/pdf` MIME type, a
`%PDF-` header, at least one page, and a 25 MiB limit. Input is streamed in
bounded chunks to a unique temporary file. The sanitized filename is display
only, and cleanup runs in `finally`. Uploaded bytes are not logged or stored.

### No model call in milestone 3

The permitted model integration visible in the OmniRush runtime is
`omnirush/gpt-6-astra`. The bundled OmniRush docs describe provider setup but
do not verify a callable application API, request schema, authentication
mechanism, or response format for this service. The current runtime is signed
out of OmniRush Cloud. The repository therefore includes only the
`ProviderAdapter` protocol and an unconfigured implementation. No model call,
OpenAI-compatible assumption, credential, or fabricated analysis is present.
The reviewed OmniRush references are `cloud/get-started.mdx`,
`cloud/share-with-your-team/managed-llm-provider.mdx`, and
`cloud/share-with-your-team/custom-llm-provider.mdx`; they document desktop
and Cloud provider setup rather than a callable FastAPI application interface.

### Reproducibility

- Node is pinned by `.nvmrc` and `frontend/.nvmrc`.
- Python is pinned by `backend/.python-version`.
- npm dependencies are locked in `frontend/package-lock.json` and the root
  `package-lock.json`.
- Python runtime and test dependencies are pinned in
  `backend/requirements.lock.txt`.
- Generated environments (`node_modules`, `.venv`, caches, and `dist`) are
  ignored and never required in git.

## Follow-on boundaries

Future milestones can add the following behind explicit contracts:

- Durable metadata and document retention behind an explicit storage contract.
- OCR for image-only pages, with its own dependency and tests.
- A model adapter that accepts only approved provider/model configuration.
- Persistent research collections and user-scoped access control.
- Cross-process job queues and larger-library search indexing.

These are not implemented by the current milestone.
