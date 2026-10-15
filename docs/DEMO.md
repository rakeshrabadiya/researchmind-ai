# ResearchMind AI demo script

This walkthrough exercises the real local upload, library, comparison, search,
gap, and report flow without external services or model credentials.

## 1. Install and start the services

From the repository root:

```bash
npm --prefix frontend ci
python3.13 -m venv backend/.venv
. backend/.venv/bin/activate
python -m pip install --requirement backend/requirements.lock.txt
```

Start two terminals:

```bash
# Terminal A
cd backend
uvicorn app.main:app --reload
```

```bash
# Terminal B
npm --prefix frontend run dev
```

Open the Vite URL printed in Terminal B.

## 2. Create two deterministic demo PDFs

This creates local demo files only. They are not uploaded to the repository.

```bash
python - <<'PY'
import fitz

papers = {
    "alpha.pdf": """Reliable Alpha Study
By Ada Lovelace
2024
Research Problem
Flood prediction is hard.
Objectives
We evaluate robust models.
Methodology
Controlled trial.
Dataset
100 samples.
Evaluation Metrics
Accuracy.
Results
Accuracy improved.
Limitations
The sample size was small.
Future Work
Investigate rural sites.
An open question remains: does it generalize?""",
    "beta.pdf": """Reliable Beta Study
Authors: Grace Hopper
2023
Research Problem
Flood prediction is hard.
Objectives
We evaluate transfer methods.
Methodology
Field study.
Dataset
250 samples.
Evaluation Metrics
Recall.
Results
Recall improved.
Limitations
The study used one region.""",
}

for filename, text in papers.items():
    document = fitz.open()
    page = document.new_page()
    page.insert_textbox(fitz.Rect(50, 50, 545, 780), text, fontsize=11)
    document.save(filename)
    document.close()
PY
```

## 3. Demonstrate the workflow

1. Upload `alpha.pdf` and `beta.pdf` through the dashboard.
2. Confirm both appear in **Sources in orbit**.
3. Select both papers and choose **Compare selected papers**.
4. Search for `sample` in selected-paper scope. Confirm the result names the
   source paper and reports page 1.
5. Choose **Explore gaps**. Confirm the sample-size limitation and future-work
   evidence are shown with source references.
6. Choose **Download report**. Open the downloaded Markdown file and verify it
   contains summaries, comparison rows, candidate gaps, limitations, and exact
   evidence references.
7. Remove one paper and confirm it leaves the in-memory library.

The same upload contract can be smoke-tested from a terminal:

```bash
curl -F "file=@alpha.pdf;type=application/pdf" \
  http://127.0.0.1:8000/api/papers/upload
curl http://127.0.0.1:8000/api/papers
```

## 4. Important boundaries

- The current library is process-local and resets when FastAPI restarts.
- OCR is not implemented; image-only pages are reported explicitly.
- Comparison, search, gaps, and reports are deterministic and evidence-backed.
- OmniRush `omnirush/gpt-6-astra` is not called because the official bundled
  documentation does not verify an application-level invocation contract.

## 5. 60–90 second presenter script

> ResearchMind AI helps researchers move from a folder of papers to a
> source-grounded working view. I will upload two clearly labeled synthetic
> papers, and the dashboard immediately shows the extracted title, pages, and
> evidence-backed fields. I select both sources to compare their objectives,
> methods, datasets, metrics, results, and limitations side by side. Next, I
> search for a phrase and show the exact matching passage with its source page,
> so the result is auditable instead of a vague summary. The gap explorer then
> surfaces only limitations and explicit open questions that are present in the
> papers. Finally, I download a Markdown report containing the summaries,
> comparison, candidate gaps, and page references. The key boundary is
> intentional: this submission is deterministic and evidence-based, the
> library is process-local, OCR is not implemented, and the OmniRush model
> invocation contract is not verified, so the app never pretends to have used
> an unverified model.

No screenshots are committed because the available verification used the live
local application and container smoke flow. Record the running dashboard
locally using the sequence above if a submission portal requires screenshots.
