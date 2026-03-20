#!/bin/bash
DB_PATH="./server/constructflix.db"
DB_GZ="/tmp/constructflix.db.gz"

if [ ! -f "$DB_PATH" ]; then
  echo "No database found — starting server immediately, downloading DB in background..."

  # Start server in background so Railway health check passes
  npm run start:prod &
  SERVER_PID=$!

  # Download DB while server is running
  curl -L \
    "https://github.com/teamcarrillo405-hub/buildboard/releases/download/db-v1/constructflix.db.gz" \
    -o "$DB_GZ"

  echo "Download complete — decompressing..."
  gunzip -c "$DB_GZ" > "$DB_PATH" && rm -f "$DB_GZ"

  if head -c 16 "$DB_PATH" | grep -q "SQLite format"; then
    echo "Database ready ($(du -sh $DB_PATH | cut -f1)) — restarting server with real data..."
    kill $SERVER_PID
    wait $SERVER_PID 2>/dev/null
    exit 1  # Triggers Railway ON_FAILURE restart with DB now present
  else
    echo "Download invalid — continuing with empty database."
    rm -f "$DB_PATH"
    wait $SERVER_PID
  fi
else
  echo "Database present ($(du -sh $DB_PATH | cut -f1)) — starting server."
  exec npm run start:prod
fi
