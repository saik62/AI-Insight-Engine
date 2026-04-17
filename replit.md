# AI-Powered Hybrid Phishing Detection System

## Overview

A full-stack phishing email detection web app combining rule-based keyword scoring and a lightweight ML-style hybrid scoring system.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/phishing-detector)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Architecture

### Detection Engine (artifacts/api-server/src/routes/phishing.ts)

Hybrid scoring system:
1. **Rule-based score** (55% weight): Keyword matching against 40+ phishing keywords + regex pattern detection + safe email indicator reduction
2. **ML-style score** (45% weight): TF-IDF-inspired word frequency scoring + URL presence + capitalization patterns + exclamation marks

Final hybrid score → threshold 0.25 → Phishing or Safe verdict + confidence (50–99%)

### API Endpoints
- `POST /api/predict` — Analyze email text, returns prediction, confidence, keywords, ml_score, rule_score
- `GET /api/history` — Recent scan history (paginated)
- `GET /api/stats` — Aggregate detection statistics

### Database Schema
- `predictions` table: id, text_preview, full_text, prediction, confidence, ml_score, rule_score, keywords (JSON), created_at

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/phishing-detector run dev` — run frontend locally
