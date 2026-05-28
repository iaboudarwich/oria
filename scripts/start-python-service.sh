#!/bin/bash
# Step 2b: Start the Python extraction sidecar
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_DIR="$(dirname "$SCRIPT_DIR")/python"

echo ""
echo "========================================"
echo "  Oria — Python Extraction Service"
echo "========================================"
echo ""
echo "Starting FastAPI sidecar at http://localhost:8000"
echo "Press Ctrl+C to stop."
echo ""

cd "$PYTHON_DIR"

if [ ! -d ".venv" ]; then
  echo "ERROR: .venv not found. Run 'Install Python Deps' task first."
  exit 1
fi

source .venv/bin/activate
echo "Using Python: $(python --version)"
echo ""

# Start with reload for dev; remove --reload for production
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
