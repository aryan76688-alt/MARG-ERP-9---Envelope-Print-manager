#!/bin/bash
# ==============================================================================
# MARG ERP 9+ Envelope Print Manager - 24/7 Cloud Deploy (No Laptop Required)
# ==============================================================================
set -e

echo "=================================================================="
echo "    MARG ERP 9+ ENVELOPE MANAGER - 24/7 CLOUD DEPLOYMENT"
echo "    (Runs 100% in the cloud - works even when laptop is turned off)"
echo "=================================================================="
echo ""
echo "Select your free cloud provider:"
echo "1) Render.com (via GitHub) -> Free URL: https://your-app.onrender.com"
echo "2) Hugging Face Spaces (Direct Git Push) -> Free URL: https://your-name.hf.space"
echo ""

read -p "Select option [1 or 2]: " CHOICE

case $CHOICE in
  1)
    echo ""
    echo "--- RENDER.COM DEPLOYMENT ---"
    echo "1. Create an empty repository at: https://github.com/new"
    echo "2. Paste your repository URL below (e.g. https://github.com/username/repo.git)"
    echo ""
    read -p "GitHub Repository URL: " GITHUB_URL
    if [ -n "$GITHUB_URL" ]; then
      git remote remove origin 2>/dev/null || true
      git remote add origin "$GITHUB_URL"
      echo "Pushing code and database to GitHub..."
      git push -u origin main --force
      echo ""
      echo "✅ Successfully pushed to GitHub!"
      echo "Now open: https://dashboard.render.com -> New + -> Web Service -> Select your repo -> Deploy!"
    else
      echo "Error: URL cannot be empty."
    fi
    ;;
  2)
    echo ""
    echo "--- HUGGING FACE SPACES DEPLOYMENT ---"
    echo "1. Go to: https://huggingface.co/new-space"
    echo "2. Space name: envelope-manager"
    echo "3. Space SDK: Docker (Blank)"
    echo "4. Visibility: Public"
    echo "5. Paste your Space Git URL below (e.g. https://huggingface.co/spaces/username/envelope-manager.git)"
    echo ""
    read -p "Hugging Face Space Git URL: " HF_URL
    if [ -n "$HF_URL" ]; then
      git remote remove hf 2>/dev/null || true
      git remote add hf "$HF_URL"
      echo "Pushing Docker application to Hugging Face Cloud..."
      git push -u hf main --force
      echo ""
      echo "✅ Successfully deployed to Hugging Face Cloud!"
      echo "Your app is building and will run 24/7 in the cloud without needing your laptop on!"
    else
      echo "Error: URL cannot be empty."
    fi
    ;;
  *)
    echo "Invalid option."
    ;;
esac
