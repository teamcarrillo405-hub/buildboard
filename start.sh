#!/bin/bash
DB_PATH="./server/constructflix.db"
DB_GZ="/tmp/constructflix.db.gz"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found — downloading from GitHub releases..."
  curl -L \
    "https://github.com/teamcarrillo405-hub/buildboard/releases/download/db-v1/constructflix.db.gz" \
    -o "$DB_GZ"

  echo "Decompressing..."
  gunzip -c "$DB_GZ" > "$DB_PATH"
  rm -f "$DB_GZ"

  # Validate it's actually a SQLite file
  if ! head -c 16 "$DB_PATH" | grep -q "SQLite format"; then
    echo "Download failed or invalid — starting with empty database."
    rm -f "$DB_PATH"
  else
    echo "Database ready ($(du -sh $DB_PATH | cut -f1))"
  fi
else
  echo "Database present ($(du -sh $DB_PATH | cut -f1)) — skipping download."
fi

exec npm run start:prod
