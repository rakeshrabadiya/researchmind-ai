"""Keep process-scoped paper library tests independent."""

from __future__ import annotations

import pytest

from app.library import clear_library


@pytest.fixture(autouse=True)
def clean_paper_library():
    clear_library()
    yield
    clear_library()
