FROM python:3.12-slim

WORKDIR /workspace

# Copy requirements first for better layer caching
COPY wev-scraper/requirements.txt wev-scraper/requirements.txt
RUN pip install --no-cache-dir -r wev-scraper/requirements.txt

# Install Chromium and its system dependencies (required for headless scraping)
RUN playwright install --with-deps chromium

# Copy shared taxonomy files (required by governance_taxonomy.py)
COPY shared /workspace/shared

# Copy scraper code, preserving directory structure
COPY wev-scraper /workspace/wev-scraper

WORKDIR /workspace/wev-scraper

CMD ["python", "scrape.py"]
