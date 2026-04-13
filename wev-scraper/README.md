# wev-scraper

run with `./run.sh`

## Proxy Configuration

The scraper uses [Webshare](https://www.webshare.io/) proxies to bypass Cloudflare protection on certain sites (e.g., Ma Communauté).

### Webshare Free Plan
- 10 datacenter proxies
- 1GB/month bandwidth
- Rotating proxy endpoint included

### Setup

Use the **Rotating Proxy Endpoint** for automatic IP rotation:
```bash
PROXY_SERVER=http://p.webshare.io:80  # or ports 1080, 3128, 9999-29999
PROXY_USERNAME=your_username
PROXY_PASSWORD=your_password
```

### Bandwidth Optimization

The scraper automatically blocks images, CSS, fonts, and media when using a proxy to reduce bandwidth usage by 70-90%. This helps stay within the 1GB/month free tier limit.

### How It Works

- Each new connection to `p.webshare.io` automatically uses a different IP from your proxy pool
- The base scraper implements automatic retry logic (up to 3 attempts) for all scrapers
- If a 404 or Cloudflare challenge is detected, it reloads the page to get a new IP
- Bandwidth-saving: blocks images/CSS/fonts automatically when proxy is enabled

### Local Development

Proxies are automatically disabled when running locally (not in GitHub Actions) to speed up development.

## Database migrations

> **All migrations live in `supabase/migrations/` at the repository root.**

To create a new migration, add a `.sql` file to `supabase/migrations/` and apply it to the local environment with `npm run migrate:local` (run from the repository root).

Batch maintenance scripts (values tagging, geocoding, legacy match helpers, env flags) are listed in **`scripts/README.md`**.

## LLM integration

The scraper uses different LLM providers depending on the task and environment:

### Production (default)
- **Job summaries & values**: Groq (llama-3.3-70b) - no grounding required
- **SSE classification**: Gemini 2.5 Flash with Google Search grounding to verify organization type and governance

### Local development (`ENV_MODE=test`)
- **All tasks**: LocalGroundedProvider using Tavily search + Ollama (mistral model)
- Avoids hitting external APIs during development

### Grounding Configuration
**Only SSE classification uses grounding by default** to save API costs and improve performance.

| Task Type | Uses Grounding | Production | Local Development |
|-----------|----------------|------------|-------------------|
| SSE classification | ✅ Yes | Gemini + Google Search | Tavily + Ollama |
| Job summaries | ❌ No | Groq | Ollama |
| Values tagging | ❌ No | Groq | Ollama |
| Location extraction | ❌ No | Groq | Ollama |
| Skills extraction | ❌ No | Groq | Ollama |

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
   - Set `ENV_MODE=test` in `.env`

### Rate limits (Gemini free tier)
- Gemini 2.5 Flash: 4 RPM / 24 RPD
- Gemini 2.5 Flash Lite: 8 RPM / 22 RPD
- SSE classification uses 1 request per job