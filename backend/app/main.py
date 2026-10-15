from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles


app = FastAPI(title="ResearchMind API")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _frontend_dist() -> Path:
    """Find the built frontend in both the repository and container layouts."""
    repository_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    container_dist = Path(__file__).resolve().parents[1] / "frontend" / "dist"
    return repository_dist if repository_dist.exists() else container_dist


frontend_dist = _frontend_dist()
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
