FROM python:3.12-slim

WORKDIR /workspace

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Chromium and its system dependencies (required for headless scraping)
RUN playwright install --with-deps chromium

COPY . .

CMD ["python", "scrape.py"]
