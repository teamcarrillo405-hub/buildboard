#!/bin/bash
DB_PATH="./server/constructflix.db"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found — attempting download from gofile.io..."
  curl -L \
    -H "Cookie: accountToken=RBScJ2slRiJWgAKpoAuarGdNF1GFoG0G" \
    "https://store-na-phx-1.gofile.io/download/direct/138c0077-caa7-407f-938d-2e751f007eec/constructflix.db" \
    -o "$DB_PATH"

  # Validate it's actually a SQLite file (starts with "SQLite format 3")
  if ! head -c 16 "$DB_PATH" | grep -q "SQLite format"; then
    echo "Download failed or returned invalid file — starting with empty database."
    rm -f "$DB_PATH"
  else
    echo "Database downloaded successfully ($(du -sh $DB_PATH | cut -f1))"
  fi
else
  echo "Database present ($(du -sh $DB_PATH | cut -f1)) — skipping download."
fi

exec npm run start:prod
