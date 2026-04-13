# Wev Monorepo

Welcome to the Wev project. This repository contains the Bulletin app, the Scraper service, and the Supabase infrastructure.

## 🛠 Prerequisites

- **Docker Desktop**: Required for local Supabase.
- **Node.js**: v18+ (v20+ recommended).
- **Python**: 3.10+ (for the scraper).

## 🚀 Quick Start (Local Development)

### 1. Installation
Install root dependencies and set up venvs:
```bash
npm install
cd wev-scraper && python3 -m venv venv && . venv/bin/activate && pip install -r requirements.txt && cd ..
```

### 2. Environment Setup
Copy the example environment file:
```bash
cp .env.example .env
```
*(Ensure `SUPABASE_SERVICE_ROLE_KEY` matches your local Supabase instance if it changes.)*

### 3. Database & Seeding
Initialize the database, apply migrations, and seed the default dataset:
```bash
npm run migrate:local
```

### 4. Skills Setup
Populate the ESCO skills database (required for profile search):
```bash
npm run skills:index -- --upsert-db
```
*(Optional) Seed embeddings for semantic matching:*
```bash
npm run skills:embeddings
```

### 5. Start the Application
```bash
npm run dev
```
The app will be available at [http://localhost:3000](http://localhost:3000).

## 📧 Testing Email Flow
Local emails are intercepted by **Mailpit**.
- Dashboard: [http://localhost:54324](http://localhost:54324)

## 🐳 Useful Commands
- `npm run migrate:local`: Full database reset & seed.
- `npx supabase status`: Check local Supabase services.
- `npm run scrape`: Run a local scrape iteration.
- `npm run test`: Run all tests across the monorepo.
