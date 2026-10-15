# ResearchMind backend

Minimal FastAPI service for the ResearchMind project.

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

## Test

Run the test suite from `backend/`:

```bash
python -m pytest
```

The equivalent project command is `make test`.

## Deploy

Build and run the included container from `backend/`:

```bash
docker build -t researchmind-backend .
docker run --rm -p 8000:8000 researchmind-backend
```
