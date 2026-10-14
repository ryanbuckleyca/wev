# Scrapers

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
