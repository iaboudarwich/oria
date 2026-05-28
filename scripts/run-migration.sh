#!/bin/bash
# Step 4: Push Supabase migration 0024_document_chunks
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "========================================"
echo "  Oria — Database Migration"
echo "========================================"
echo ""
echo "Pushing migration 0024_document_chunks.sql..."
echo "  → enables pgvector extension"
echo "  → creates document_chunks table (384-dim HNSW)"
echo "  → adds extraction_method / chunk_count / is_chunked / file_hash to uploads"
echo "  → creates match_document_chunks() RPC"
echo ""

cd "$PROJECT_DIR"

npx supabase db push --yes

echo ""
echo "========================================"
echo "  DONE — Migration applied"
echo "========================================"
