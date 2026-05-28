#!/bin/bash
# Step 2a: Set up Python venv and install requirements
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PYTHON_DIR="$PROJECT_DIR/python"

echo ""
echo "========================================"
echo "  Oria — Python Sidecar Setup"
echo "========================================"
echo ""
echo "Project: $PROJECT_DIR"
echo "Python dir: $PYTHON_DIR"
echo ""

cd "$PYTHON_DIR"

# Create venv if it doesn't exist
if [ -d ".venv" ]; then
  echo "✓ .venv already exists"
else
  echo "→ Creating Python virtual environment..."
  python3 -m venv .venv
  echo "✓ .venv created"
fi

# Activate
source .venv/bin/activate
echo "✓ venv activated: $(python --version)"
echo ""

# Upgrade pip silently
pip install --upgrade pip --quiet

# Install requirements
echo "→ Installing requirements (this may take several minutes — torch + docling are large)..."
echo ""
pip install -r requirements.txt

echo ""
echo "========================================"
echo "  DONE — Python dependencies installed"
echo "========================================"
echo ""
echo "Installed packages:"
pip list | grep -E "fastapi|uvicorn|pymupdf4llm|docling|markitdown|pandas|sentence.transformers|torch|tesseract" 2>/dev/null || pip list | head -30
