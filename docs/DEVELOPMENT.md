# XRaySense AI — Local Development Setup

This guide walks through preparing your machine to run XRaySense AI locally. Application code will be added under `backend/`, `frontend/`, and `model/` in later phases; this document defines the **intended** workflow and prerequisites.

---

## Prerequisites

Install the following before cloning or continuing setup:

| Tool | Minimum version | Purpose |
|------|-----------------|---------|
| **Git** | 2.x | Version control |
| **Python** | 3.10+ | Backend API and model training/inference |
| **Node.js** | 18 LTS or 20 LTS | Frontend toolchain |
| **npm** or **yarn** | Latest stable | Frontend dependencies |
| **PostgreSQL** | 14+ | Scan history, users, metadata |
| **pip** | Latest | Python packages |

### Optional (recommended for ML)

| Tool | Purpose |
|------|---------|
| **CUDA** + compatible GPU drivers | Faster TensorFlow training and inference |
| **Docker** + **Docker Compose** | Consistent PostgreSQL and optional full-stack dev |

Verify installations:

```bash
git --version
python --version
node --version
npm --version
psql --version
```

---

## Repository Layout

Ensure you are at the project root (`CareVision-AI/`):

```
CareVision-AI/
├── backend/
├── frontend/
├── backend/model/
├── dataset/
├── docs/
├── .env.example
├── .gitignore
└── README.md
```

---

## 1. Clone and Configure Environment

```bash
git clone <repository-url> CareVision-AI
cd CareVision-AI
```

Copy the example environment file and edit values for your machine:

```bash
# Windows (PowerShell)
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

Key variables to set in `.env`:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | Strong random string for signing tokens |
| `VITE_API_BASE_URL` | Backend URL as seen by the frontend dev server |
| `MODEL_PATH` | Path to trained `.keras` / SavedModel weights |
| `CORS_ORIGINS` | Frontend origin (e.g. `http://localhost:3000`) |

> **Note:** `.env` is gitignored. Only `.env.example` is committed.

---

## 2. PostgreSQL Setup

### Option A — Local PostgreSQL

1. Create a database and user:

```sql
CREATE USER carevision WITH PASSWORD 'your-password';
CREATE DATABASE carevision OWNER carevision;
GRANT ALL PRIVILEGES ON DATABASE carevision TO carevision;
```

2. Update `.env`:

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=carevision
POSTGRES_PASSWORD=your-password
POSTGRES_DB=carevision
DATABASE_URL=postgresql://carevision:your-password@localhost:5432/carevision
```

3. After backend migrations exist, run them from `backend/` (documented in backend README when available).

### Option B — Docker (example)

When a `docker-compose.yml` is added, typical usage will be:

```bash
docker compose up -d postgres
```

Use the connection string provided by Compose in `.env`.

---

## 3. Dataset Preparation

Chest X-ray data is **not** stored in Git. Place files under `dataset/` locally:

```
dataset/
├── raw/           # Original images
├── processed/     # Optional preprocessing output
└── splits/        # Train / validation / test definitions
```

Recommended public sources for development (document licenses in your project):

- [Chest X-Ray Images (Pneumonia)](https://www.kaggle.com/datasets/paultimothymooney/chest-xray-pneumonia) (Kaggle)
- NIH ChestX-ray14 or similar (subject to terms of use)

Follow dataset-specific instructions in `model/` documentation once training scripts exist.

---

## 4. Python Environment (Backend & Model)

From the project root:

```bash
# Create virtual environment
python -m venv .venv

# Activate
# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate

# Upgrade pip
python -m pip install --upgrade pip
```

When `backend/requirements.txt` and `backend/model/requirements.txt` exist:

```bash
pip install -r backend/requirements.txt
pip install -r backend/model/requirements.txt
```

### TensorFlow notes

- **CPU-only:** `pip install tensorflow` is sufficient for initial development.
- **GPU:** Install `tensorflow` builds matching your CUDA version per [TensorFlow install guide](https://www.tensorflow.org/install/pip).
- Set `TF_CPP_MIN_LOG_LEVEL=2` in `.env` to reduce log noise during development.

### Train or obtain a model

After training scripts are added under `backend/model/`:

```bash
cd backend/model
python train.py   # exact command TBD when implemented
```

Place exported weights at the path specified by `MODEL_PATH` in `.env` (default: `./backend/model/chest_xray_model.h5`).

---

## 5. Frontend Setup

When the frontend scaffold exists:

```bash
cd frontend
npm install
# or: yarn install
```

Ensure `.env` (or `frontend/.env.local`) exposes the API URL to the bundler:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

Start the development server (typical commands once configured):

```bash
npm run dev
```

Default dev URL is often `http://localhost:3000` or `http://localhost:5173` (Vite). Match this origin in `CORS_ORIGINS` on the backend.

---

## 6. Running the Full Stack Locally

Once services are implemented, the usual local workflow will be:

| Terminal | Directory | Command (illustrative) |
|----------|-----------|-------------------------|
| 1 | Project root | Ensure PostgreSQL is running |
| 2 | `backend/` | `uvicorn main:app --reload --host 0.0.0.0 --port 8000` |
| 3 | `frontend/` | `npm run dev` |

Verify:

1. Backend health: `http://localhost:8000/api/v1/health` (endpoint TBD).
2. Frontend loads and can reach the API (check browser network tab).
3. Upload a sample X-ray and confirm prediction, Grad-CAM, and history persistence.

---

## 7. Development Workflow

### Branching

- `main` — stable, deployable
- `develop` — integration branch (if used)
- Feature branches: `feature/<name>`, `fix/<name>`

### Code quality (when configured)

| Area | Typical tools |
|------|----------------|
| Python | `ruff`, `black`, `mypy`, `pytest` |
| Frontend | `eslint`, `prettier`, `vitest` or `jest` |
| Pre-commit | Optional hooks for lint/format before commit |

### Ignored artifacts

Do not commit:

- `.env`, virtualenvs, `node_modules/`
- Trained weights (`*.h5`, `*.keras`, `saved_model/`)
- Raw datasets under `dataset/raw/`
- Generated PDFs and uploads

See root `.gitignore` for the full list.

---

## 8. Troubleshooting

| Issue | Suggestion |
|-------|------------|
| **CORS errors** | Add frontend URL to `CORS_ORIGINS` in `.env`; restart backend. |
| **Database connection refused** | Confirm PostgreSQL is running; check host/port/credentials. |
| **Model not found** | Verify `MODEL_PATH` exists; train or download weights first. |
| **TensorFlow GPU not detected** | Install CUDA-compatible TensorFlow; set `CUDA_VISIBLE_DEVICES`. |
| **Large upload fails** | Increase `MAX_UPLOAD_SIZE_MB` and reverse-proxy body limits if applicable. |

---

## 9. Next Steps

When application code is introduced:

1. Add `backend/requirements.txt`, API entrypoint, and database migrations.
2. Add `frontend/package.json` and UI routes for upload, results, and history.
3. Add `model/train.py`, `model/inference.py`, and Grad-CAM utilities.
4. Document API endpoints in `docs/` or OpenAPI (`/docs` on FastAPI).

---

## Related Documents

- [System Architecture](./ARCHITECTURE.md)
- [Project README](../README.md)
