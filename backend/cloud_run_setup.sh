#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# ExportIQ — Cloud Run deployment script
# ──────────────────────────────────────────────

# 1. Set project
gcloud config set project dummy-project-496508

# 2. Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com

# 3. Create secret for service-account credentials (skip if exists)
if ! gcloud secrets describe exportiq-sa-key --project=dummy-project-496508 >/dev/null 2>&1; then
  echo "Creating secret exportiq-sa-key..."
  gcloud secrets create exportiq-sa-key --data-file=service-account.json
else
  echo "Secret exportiq-sa-key already exists — updating version..."
  gcloud secrets versions add exportiq-sa-key --data-file=service-account.json
fi

# 4. Build and deploy
gcloud run deploy exportiq-backend \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --set-env-vars ENVIRONMENT=production \
  --set-env-vars GOOGLE_CLOUD_PROJECT=dummy-project-496508 \
  --set-env-vars GEMINI_MODEL=gemini-2.5-pro \
  --set-env-vars USE_MOCK_DATA=true \
  --set-env-vars LOG_LEVEL=INFO \
  --set-env-vars FIREBASE_PROJECT_ID=dummy-project-496508 \
  --set-env-vars FIREBASE_STORAGE_BUCKET=dummy-project-496508.appspot.com \
  --set-env-vars "CORS_ORIGINS=*" \
  --set-secrets GOOGLE_APPLICATION_CREDENTIALS_JSON=exportiq-sa-key:latest
