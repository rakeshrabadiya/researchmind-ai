FROM python:3.13-slim

WORKDIR /app

COPY requirements.lock.txt ./
RUN python -m pip install --no-cache-dir --requirement requirements.lock.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
