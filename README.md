# XRaySense AI

<p align="center">
  <strong>AI-assisted chest X-ray screening for Normal, Pneumonia and COVID-19</strong><br/>
  Doctor–patient workflows · Grad-CAM explainability · Model evaluation & dataset dashboards · DICOM · Local deployment
</p>

<p align="center">
  <a href="#installation">Installation</a> ·
  <a href="#features">Features</a> ·
  <a href="#api-overview">API</a> ·
  <a href="#ai-model">AI model</a> ·
  <a href="#model-performance">Performance</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a>
</p>

---

## Project overview

**XRaySense AI** is an end-to-end medical imaging application that classifies chest X-rays into **three classes: NORMAL, PNEUMONIA and COVID**. It combines a **TensorFlow / Keras** classifier (EfficientNetB0 transfer learning) with a **FastAPI** backend and a **Next.js** web interface.

The platform supports **doctor and patient roles**. Doctors manage patients, upload X-rays for analysis, add clinical notes, track trends across scans, and invite patients. Patients see their own reports and can ask a health assistant to explain saved findings. Each analysis returns a predicted class, a confidence score, a safe recommendation with a medical disclaimer, an optional Grad-CAM heatmap, and a downloadable PDF report.

Doctors also get two analysis dashboards: **Model Evaluation** (held-out test performance) and **Dataset EDA** (dataset composition and data-quality checks).

Everything runs locally: **PostgreSQL**, model weights, uploads, and the UI.

> **Important:** XRaySense AI is an **academic decision-support prototype**, not a clinically validated diagnostic system. It does **not** provide a medical diagnosis. Always consult qualified healthcare professionals.

---

## Features

| Feature | Description |
|--------|-------------|
| **Three-class screening** | Softmax over **NORMAL / PNEUMONIA / COVID**; the predicted class is the highest probability (argmax) |
| **Doctor–patient workflows** | Doctor accounts, patient roster, email invitations, and per-patient access control |
| **Auth** | Email/password (JWT), email verification, password reset, Google & Microsoft SSO |
| **Image formats** | JPEG, PNG, and **DICOM** (`.dcm` / `.dicom`, converted to PNG before inference) |
| **Image quality checks** | Optional pre-inference validation (minimum width/height, default 224 px) |
| **Grad-CAM explainability** | Heatmap of the regions that most influenced the prediction |
| **Scan history & detail** | Search, filters, thumbnails, clinical notes, and PDF download |
| **Patient trends** | Longitudinal trend charts and side-by-side scan comparison for doctors |
| **Scan AI chat** | Ask questions about a specific scan result |
| **Health assistant** | Gemini-powered chat that explains **saved reports only** (it does not analyze images) |
| **Model Evaluation dashboard** | Three-class confusion matrix, per-class precision/recall/F1, one-vs-rest ROC-AUC, plus a separate Normal-vs-Pneumonia analysis |
| **Dataset EDA dashboard** | Class and split distribution, image dimensions, sample images, duplicate/corruption checks, preprocessing summary |
| **Clinical-style PDF reports** | Hospital-style layout with prediction, images, and disclaimer |
| **Light / dark mode** | Theme toggle across the app |
| **Local-first** | Backend, database, model, and UI on localhost |

### Web application routes

| Route | Who | Purpose |
|-------|-----|---------|
| `/` | Everyone | Landing page |
| `/login`, `/register` | Guests | Sign in; public registration creates **doctor** accounts |
| `/verify-email`, `/forgot-password`, `/reset-password` | Guests | Account verification and recovery |
| `/auth/callback` | Guests | Google / Microsoft SSO callback |
| `/accept-invitation/[token]` | Invited patients | Accept a doctor's invitation and create a patient account |
| `/doctor/dashboard` | Doctor | Overview and statistics |
| `/patients` | Doctor | Patient list, invitations, add/edit patients |
| `/doctor/patients/[patientId]/reports` · `/trends` · `/compare` | Doctor | Patient reports, trend dashboard, scan comparison |
| `/analyze` | Doctor | Upload an X-ray for a selected patient |
| `/history` | Doctor | Scan history with search and filters |
| `/scans/[scanId]` | Doctor & patient | Scan detail (PDF, notes, AI chat) |
| `/doctor/model-evaluation` | Doctor | Model Evaluation dashboard |
| `/doctor/dataset-eda` | Doctor | Dataset EDA dashboard |
| `/patient/dashboard`, `/patient/reports` | Patient | Patient portal |
| `/assistant` | Doctor & patient | Health assistant (report Q&A) |
| `/profile` | Doctor & patient | User profile |

---

## Technology stack

| Layer | Technologies |
|-------|----------------|
| **Machine learning** | TensorFlow 2.x, Keras 3, EfficientNetB0, Grad-CAM |
| **Backend API** | FastAPI, Uvicorn, Pydantic, SQLAlchemy, Alembic |
| **Auth** | JWT (python-jose), bcrypt, Authlib (Google / Microsoft OIDC) |
| **Database** | PostgreSQL |
| **Imaging** | Pillow, pydicom |
| **PDF** | ReportLab |
| **Health assistant** | Google Gemini (`google-genai`) |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 (charts are hand-built SVG, no chart library) |
| **Tooling** | Python 3.10–3.13 (3.11 recommended), Node.js 18+ |

---

## System architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                               XRaySense AI                                 │
├─────────────┬──────────────────────┬────────────────────┬──────────────────┤
│  dataset/   │      backend/        │     frontend/      │      docs/       │
│  X-ray data │  FastAPI + Postgres  │   Next.js web UI   │  Architecture    │
│             │  Auth · inference    │  Doctor / patient  │  Dev guides      │
│             │  PDF · Gemini        │  dashboards        │                  │
└──────┬──────┴──────────┬───────────┴─────────┬──────────┴──────────────────┘
       │                 │                     │
       │ train / eval /  │                     │ REST / JSON
       │ EDA reports     │                     │
       └────────────────►│ backend/model/      │
                         │  (.h5 weights,      │
                         │   evaluation JSON)  │
                         └──────────┬──────────┘
                                    │
                         ┌──────────▼──────────┐
                         │     PostgreSQL       │
                         │  users, patients,    │
                         │  scans, notes, chat  │
                         └──────────────────────┘
```

### Analysis request flow

1. A doctor selects an accepted patient and uploads a chest X-ray (`POST /patients/{id}/predict`).
2. The backend validates the file, converts DICOM to PNG if needed, runs the optional quality check, stores the image under `backend/uploads/`, and runs TensorFlow inference.
3. The model outputs probabilities for NORMAL, PNEUMONIA and COVID; the prediction is the class with the highest probability.
4. An optional Grad-CAM heatmap is generated and saved.
5. A scan record is saved in PostgreSQL, linked to the patient and doctor.
6. The UI shows the result; the doctor or patient can open the detail view, add notes, chat about the scan, or download a PDF report.

For deeper design notes, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Installation

### Prerequisites

| Tool | Version |
|------|---------|
| **Python** | 3.10–3.13 (3.11 recommended; TensorFlow does not support 3.14) |
| **Node.js** | 18+ LTS |
| **PostgreSQL** | 14+ |
| **Git** | Recent |

Optional: an **NVIDIA GPU** for faster training (CPU inference works; TensorFlow ≥ 2.11 has no native-Windows GPU support). A **Gemini API key** from Google AI Studio enables the health assistant.

### Repository layout

```
CareVision-AI/
├── backend/
│   ├── app/                  # FastAPI routes, services, schemas, models
│   ├── model/                # Training, inference, evaluation scripts, chest_xray_model.h5
│   │   └── evaluation/       # Generated dashboard reports (JSON) and EDA sample thumbnails
│   ├── alembic/              # Database migrations
│   ├── scripts/              # init_db and utilities
│   └── tests/                # pytest suite
├── frontend/                 # Next.js application
├── dataset/                  # Chest X-ray splits (images are not committed)
├── docs/                     # Architecture and development guides
├── .env.example              # Environment template (repo root)
└── README.md
```

### Quick setup (Windows PowerShell)

```powershell
# 1. Clone
git clone https://github.com/Khushi-Hirapara/CareVision-AI.git
cd CareVision-AI

# 2. Environment (repo root)
Copy-Item .env.example .env
# Edit DATABASE_URL, JWT_SECRET_KEY, MODEL_PATH, CORS_ORIGINS, FRONTEND_URL,
# and optionally GEMINI_API_KEY / SSO credentials

# 3. Frontend env
"NEXT_PUBLIC_API_BASE_URL=http://localhost:8000" | Set-Content frontend\.env.local

# 4. Python virtual environment + dependencies + database
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
cd backend
python -m scripts.init_db

# 5. Dataset + model (see "AI model" below), or place an existing
#    chest_xray_model.h5 in backend\model\
python model\train_model.py

# 6. Run the API (from backend/)
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# 7. Run the UI (new terminal, from frontend/)
cd ..\frontend
npm install
npm run dev
```

Open **http://localhost:3000** (UI) and **http://localhost:8000/docs** (Swagger). If port 3000 is taken, run `npm run dev -- -p 3001` and make sure that origin is listed in `CORS_ORIGINS`.

---

## Backend setup

### Environment variables

Copy `.env.example` to `.env` at the **repository root**. The backend reads configuration from that file only.

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET_KEY` | Secret for access/refresh tokens |
| `MODEL_PATH` | Path to `chest_xray_model.h5` |
| `MODEL_VERSION` | Label stored on each scan and shown on reports (e.g. `v1.0-efficientnetb0`) |
| `MODEL_BACKBONE` | Preprocessing backbone (default `efficientnet`) |
| `PREDICTION_THRESHOLD` | Kept for compatibility with older binary models; **not used** by the current 3-class model |
| `ENABLE_GRAD_CAM` | Generate heatmaps when `true` |
| `ENABLE_IMAGE_QUALITY_CHECK`, `MIN_IMAGE_DIMENSION` | Reject undersized uploads (default 224 px) |
| `UPLOAD_DIR` | Stored X-rays and heatmaps |
| `CORS_ORIGINS` | Frontend origin(s), e.g. `http://localhost:3000,http://localhost:3001` |
| `FRONTEND_URL` | Used for invitation and email links |
| `GEMINI_API_KEY` | Health assistant (optional; leave empty to disable) |
| `GOOGLE_*` / `MICROSOFT_*` | Optional SSO OIDC credentials |

### Database

Create the PostgreSQL database and user to match `DATABASE_URL`, then:

```powershell
cd backend
python -m scripts.init_db
```

Schema migrations live under `backend/alembic/`. Use Alembic for existing databases that already contain data.

### Run the API

```powershell
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

| Resource | URL |
|----------|-----|
| API base | http://localhost:8000 |
| Interactive docs | http://localhost:8000/docs |
| Uploaded images | http://localhost:8000/uploads/... |

### Tests

```powershell
cd backend
python -m pytest tests -q
```

See [backend/README.md](backend/README.md) for additional notes.

---

## Frontend setup

```powershell
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

```powershell
npm run dev          # development — http://localhost:3000
npm run lint
npm run build        # production build
npm start
```

See [frontend/README.md](frontend/README.md) for UI-specific details.

---

## AI model

### Dataset

Images go under `dataset/` with three class folders per split. See [dataset/README.md](dataset/README.md) for import steps.

```
dataset/
  train/   NORMAL/  PNEUMONIA/  COVID/
  val/     NORMAL/  PNEUMONIA/  COVID/   (present but not used by training)
  test/    NORMAL/  PNEUMONIA/  COVID/
```

Current dataset (from the Dataset EDA report):

| Folder | NORMAL | PNEUMONIA | COVID | Total |
|--------|-------:|----------:|------:|------:|
| `dataset/train` | 1,341 | 3,875 | 2,892 | 8,108 |
| `dataset/val` | 8 | 8 | 361 | 377 |
| `dataset/test` | 234 | 390 | 363 | 987 |
| **Total** | **1,583** | **4,273** | **3,616** | **9,472** |

> **Validation split:** `train_model.py` does **not** use `dataset/val`. It holds out **20% of `dataset/train`** (seed 42) for validation: 1,093 / 3,088 / 2,306 images are used for fitting and 248 / 787 / 586 for validation (NORMAL / PNEUMONIA / COVID). `dataset/test` is held out for evaluation.

NORMAL and PNEUMONIA come from the Kaggle *Chest X-Ray Images (Pneumonia)* dataset (JPEG, varied sizes); COVID images come from a separate source (299×299 PNG). The Dataset EDA dashboard flags this, along with class imbalance and duplicate images.

### Train

```powershell
cd backend
python model\train_model.py
```

**Architecture:** EfficientNetB0 (ImageNet weights) with a small dense head; the head is trained first with the backbone frozen, then the top backbone layers are fine-tuned. Output is a softmax over **NORMAL (0) / PNEUMONIA (1) / COVID (2)**.

**Preprocessing:** images are resized to **224×224 RGB** and passed through `efficientnet.preprocess_input`. Training augmentation: random horizontal flip, brightness (±20) and contrast (0.9–1.1). Balanced class weights are enabled by default (`USE_CLASS_WEIGHTS`).

| Artifact | Location |
|----------|----------|
| Best weights | `backend/model/chest_xray_model.h5` |
| Training curves | `backend/model/training_history.png` |

```powershell
# Optional flags
python model\train_model.py --no-use-class-weights
python model\train_model.py --epochs 20 --fine-tune-epochs 10
```

### Prediction rule

Production inference uses **argmax over the three softmax probabilities**: the class with the highest probability is the prediction, and its probability is the confidence. **No probability threshold is applied.**

### Evaluation scripts

Run from `backend/`:

```powershell
python model\evaluate_model.py              # 3-class accuracy, confusion matrix, classification report on dataset/test
python model\evaluate_thresholds.py         # confidence distribution summary
python model\debug_model_predictions.py     # per-image probability debugging
```

### Dashboard reports

Both doctor dashboards read precomputed, aggregate-only JSON reports (no file names or patient data). Regenerate them from `backend/`:

```powershell
python model\build_evaluation_report.py   # after retraining or replacing the model
python model\build_dataset_eda.py         # after changing the dataset
```

| Report | Output | Notes |
|--------|--------|-------|
| Model Evaluation | `backend/model/evaluation/evaluation_report.json` | Evaluated on `dataset/test`; the binary analysis threshold is chosen on the validation split only. Shows a warning if the deployed model's SHA-256 differs from the evaluated one. |
| Dataset EDA | `backend/model/evaluation/dataset_eda_report.json` | Decodes every image once; also writes metadata-free sample thumbnails to `backend/model/evaluation/eda_samples/` (gitignored). Warns if folder counts change. |

---

## Model performance

Results for model `v1.0-efficientnetb0` on the held-out `dataset/test` split (987 images), using the production argmax rule. Regenerate with `python model\build_evaluation_report.py`; numbers will differ if the model or dataset changes.

**Three-class results (primary)**

| Class | Precision | Recall | F1-score | ROC-AUC (one-vs-rest) | Support |
|-------|----------:|-------:|---------:|----------------------:|--------:|
| NORMAL | 95.3% | 60.7% | 74.2% | 0.977 | 234 |
| PNEUMONIA | 79.7% | 98.5% | 88.1% | 0.987 | 390 |
| COVID | 100.0% | 98.1% | 99.0% | 1.000 | 363 |
| **Macro avg** | 91.7% | 85.7% | 87.1% | 0.988 | 987 |
| **Weighted avg** | 90.9% | 89.4% | 88.8% | 0.990 | 987 |

**Overall accuracy: 89.4%.**

Confusion matrix (rows = true class, columns = predicted):

| True \ Predicted | NORMAL | PNEUMONIA | COVID |
|------------------|-------:|----------:|------:|
| NORMAL | 142 | 92 | 0 |
| PNEUMONIA | 6 | 384 | 0 |
| COVID | 1 | 6 | 356 |

The main weakness is **NORMAL recall**: 92 of 234 normal X-rays (39%) are predicted as pneumonia.

**Binary analysis (Normal vs Pneumonia, secondary)** — the 624 NORMAL and PNEUMONIA test images, with COVID images excluded: sensitivity 98.5%, specificity 60.7%, accuracy 84.3%, ROC-AUC 0.969. This view is for comparison only and is not how the model makes decisions.

**Caveats:** results come from a single public dataset with no external validation. COVID images come from a different source with a fixed size, which likely makes COVID look easier than it would be in practice, and a few test images also appear in the training set. See the Dataset EDA dashboard for details.

---

## API overview

Base URL: `http://localhost:8000`  
Interactive OpenAPI: [http://localhost:8000/docs](http://localhost:8000/docs)

Most endpoints require `Authorization: Bearer <access_token>` after login.

| Area | Endpoints |
|------|-----------|
| **Health** | `GET /health` |
| **Auth** | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`, email verification, password reset, `/auth/sso/...` |
| **Dashboard** | `GET /dashboard/doctor-stats`, `GET /dashboard/patient-stats` |
| **Patients** (doctor) | CRUD under `/patients`, invitations, `POST /patients/{id}/predict`, `GET /patients/{id}/scans` |
| **Invitations** | `GET` / `POST /patient-invitations/accept/{token}` |
| **Scans** | `GET /scans`, `/scans/{id}`, `/scans/{id}/report` (PDF), notes, `POST /scans/{id}/ai-chat` |
| **Patient portal** | `GET /my/scans`, `/my/scans/{id}`, report, notes, AI chat |
| **Health assistant** | `POST /health-assistant/chat`, conversations, knowledge articles |
| **Model evaluation** (doctor) | `GET /model-evaluation/report` |
| **Dataset EDA** (doctor) | `GET /dataset-eda/report`, `GET /dataset-eda/samples/{sample_id}` |

### Analyze a patient X-ray

```bash
curl -X POST "http://localhost:8000/patients/1/predict" \
  -H "Authorization: Bearer <access_token>" \
  -F "file=@chest_xray.jpeg"
```

> `POST /predict` is **deprecated**. Doctors analyze via `POST /patients/{patient_id}/predict` after selecting an accepted patient.

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and data flows |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Extended development guide |
| [dataset/README.md](dataset/README.md) | Dataset layout and Kaggle import |
| [backend/README.md](backend/README.md) | API and backend setup |
| [frontend/README.md](frontend/README.md) | Frontend development |

---

## Disclaimer

XRaySense AI is an **academic decision-support prototype** intended for research and education. It is **not** a clinically validated diagnostic system, and its output is **not a diagnosis**. The health assistant explains saved reports only and must not be treated as clinical advice. When using real patient data, comply with **HIPAA**, **GDPR**, and applicable local regulations.

---

## License

License to be specified by the project maintainers.
