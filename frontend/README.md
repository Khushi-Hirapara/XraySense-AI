# XRaySense AI — Frontend

Next.js 16 app for chest X-ray analysis. Connects to the local FastAPI backend at **http://localhost:8000**.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home — overview and recent scans |
| `/analyze` | Upload X-ray, run `POST /predict`, view results |
| `/history` | `GET /scans` — scan cards |
| `/scans/[scanId]` | `GET /scans/{id}` — scan details + **Download PDF** (`GET /scans/{id}/report`) |

## Setup

```bash
cd frontend
npm install
cp .env.local.example .env.local   # optional; default API URL is localhost:8000
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Ensure the backend is running:

```bash
cd backend
uvicorn app.main:app --reload
```

## Stack

- Next.js (App Router), React 19, TypeScript
- Tailwind CSS v4
- `lib/api.ts` — REST client for predict, scans, and PDF download
