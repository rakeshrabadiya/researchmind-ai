# ResearchMind AI architecture

## Milestone 1 boundary

The first milestone establishes a reproducible workspace and one complete,
honest user slice:

1. A researcher opens a responsive research dashboard.
2. They choose or drag a PDF into the upload panel.
3. The browser validates the file type and 25 MB limit, then shows the
   selected file in the current page session.
4. The FastAPI service reports readiness at `GET /api/health`.

The browser does **not** upload, parse, persist, or summarize the PDF yet. The
dashboard sample statistics and reading queue are intentionally static seed
content, not claims about a connected research library.

## System shape

```text
                local development
        +-------------------------------+
        | React + TypeScript + Vite      |
        | Tailwind CSS toolchain         |
        | frontend/                      |
        +---------------+---------------+
                        |
                        | browser-only PDF state in milestone 1
                        v
        +-------------------------------+
        | FastAPI + Uvicorn              |
        | backend/app/main.py           |
        | GET /api/health                |
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

The backend begins with a stable health contract before adding domain storage
or model work. This keeps deploy checks useful and gives future upload and
analysis features a clear API home without inventing persistence prematurely.

### No model call in milestone 1

The permitted model integration visible in the OmniRush runtime is
`omnirush/gpt-6-astra`. It is recorded as a future adapter target only. This
repository makes no model calls, uses no external generative AI tool, and
requires no provider credential. The next model-related change must confirm
the buildathon rule and add an explicit adapter plus tests before it is wired
into a user flow.

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

- `POST /api/papers` for validated uploads and durable metadata.
- A document-processing worker for text extraction and page-level provenance.
- A model adapter that accepts only approved provider/model configuration.
- Persistent research collections and user-scoped access control.

These are not implemented by the current scaffold.
