#!/bin/bash
# Download database from gofile.io if not present on the volume
DB_PATH="./server/constructflix.db"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found — downloading from gofile.io..."
  curl -L \
    -H "Cookie: accountToken=RBScJ2slRiJWgAKpoAuarGdNF1GFoG0G" \
    "https://store-na-phx-1.gofile.io/download/direct/138c0077-caa7-407f-938d-2e751f007eec/constructflix.db" \
    -o "$DB_PATH"
  echo "Database downloaded ($(du -sh $DB_PATH | cut -f1))"
else
  echo "Database already present ($(du -sh $DB_PATH | cut -f1)) — skipping download."
fi

# Start the server
exec npm run start:prod
