# wev-scraper

run with `./run.sh`

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt
playwright install chromium
```

Copy `.env.example` to `.env` and fill in the required keys.

**For local development (`ENV_MODE=local`)**, two additional tools are needed:

- **Ollama** — runs LLMs locally instead of hitting Gemini/Groq. Install from [ollama.ai](https://ollama.ai), then `ollama pull mistral`.
- **Jina embeddings** — runs skill embeddings locally instead of the Jina REST API. Requires `torch` + `transformers` (included in `requirements-dev.txt`). ~570MB one-time model download on first use.

Set `TAVILY_API_KEY` in `.env` for grounded SSE classification locally.

## Proxy Configuration

Proxy configuration, Cloudflare challenge handling, and bandwidth optimization are documented in [scrapers/README.md](scrapers/README.md).

## Database migrations

> **All migrations live in [`supabase/migrations/`](../supabase/migrations/README.md) at the repository root.**

To create a new migration, add a `.sql` file to `supabase/migrations/` and apply it to the local environment with `npm run migrate` (run from the repository root).

Batch maintenance scripts (values tagging, geocoding, legacy match helpers, env flags) are listed in [scripts/README.md](scripts/README.md).

## LLM integration

The scraper uses different LLM providers depending on the task and environment:

### Production (default)

- **Job summaries & values**: Groq (llama-3.3-70b) - no grounding required
- **SSE classification**: Gemini 2.5 Flash with Google Search grounding to verify organization type and governance

### Local development (`ENV_MODE=local`)

- **All tasks**: LocalGroundedProvider using Tavily search + Ollama (mistral model)
- Avoids hitting external APIs during development

### Grounding Configuration

**Only SSE classification uses grounding by default** to save API costs and improve performance.

| Task Type           | Uses Grounding | Production             | Local Development |
| ------------------- | -------------- | ---------------------- | ----------------- |
| SSE classification  | ✅ Yes         | Gemini + Google Search | Tavily + Ollama   |
| Job summaries       | ❌ No          | Groq                   | Ollama            |
| Values tagging      | ❌ No          | Groq                   | Ollama            |
| Location extraction | ❌ No          | Groq                   | Ollama            |
| Skills extraction   | ❌ No          | Groq                   | Ollama            |

**Environment overrides:**

```bash
# Force grounding for ALL tasks
FORCE_GROUNDING=1

# Disable grounding completely
FORCE_GROUNDING=0
```

### Setup

1. **For production (Gemini/Groq)**:
   - Get Gemini API key: https://aistudio.google.com/app/apikey
   - Set `GEMINI_API_KEY` in `.env`
   - Set `GROQ_API_KEY` in `.env`

2. **For local development**:
   - Install Ollama: https://ollama.ai
   - Run `ollama pull mistral`
   - Get Tavily API key: https://tavily.com
   - Set `TAVILY_API_KEY` in `.env`
   - Set `ENV_MODE=local` in `.env`

### Rate limits (Gemini free tier)

- Gemini 2.5 Flash: 4 RPM / 24 RPD
- Gemini 2.5 Flash Lite: 8 RPM / 22 RPD
- SSE classification uses 1 request per job
