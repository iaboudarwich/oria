#!/bin/bash
# Step 1: Install Tesseract and LibreOffice via Homebrew
set -euo pipefail

echo ""
echo "========================================"
echo "  Oria — System Dependencies Installer"
echo "========================================"
echo ""

# Tesseract
if command -v tesseract &>/dev/null; then
  TESS_VER=$(tesseract --version 2>&1 | head -1)
  echo "✓ tesseract already installed: $TESS_VER"
else
  echo "→ Installing tesseract..."
  brew install tesseract
  TESS_VER=$(tesseract --version 2>&1 | head -1)
  echo "✓ tesseract installed: $TESS_VER"
fi

# Tesseract language packs (eng, fra, ara)
echo ""
echo "→ Checking Tesseract language data..."
TESSDATA_PREFIX="$(brew --prefix)/share/tessdata"
for lang in eng fra ara; do
  if [ -f "$TESSDATA_PREFIX/$lang.traineddata" ]; then
    echo "  ✓ $lang already present"
  else
    echo "  → Installing tessdata-$lang..."
    brew install tesseract-lang 2>/dev/null || true
    break
  fi
done

# LibreOffice
echo ""
if /Applications/LibreOffice.app/Contents/MacOS/soffice --version &>/dev/null 2>&1; then
  LO_VER=$(/Applications/LibreOffice.app/Contents/MacOS/soffice --version 2>&1 | head -1)
  echo "✓ LibreOffice already installed: $LO_VER"
elif brew list --cask libreoffice &>/dev/null 2>&1; then
  echo "✓ LibreOffice cask already installed (checking version...)"
  /Applications/LibreOffice.app/Contents/MacOS/soffice --version 2>&1 | head -1 || echo "  (app present)"
else
  echo "→ Installing LibreOffice (this downloads ~750MB — please wait)..."
  brew install --cask libreoffice
  echo "✓ LibreOffice installed"
fi

echo ""
echo "========================================"
echo "  DONE — System dependencies ready"
echo "========================================"
echo ""
tesseract --version 2>&1 | head -1
