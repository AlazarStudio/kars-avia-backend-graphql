#!/bin/sh
set -e

echo "[entrypoint] Waiting for MongoDB replica set to become ready..."
MAX_RETRIES=20
i=0
until node -e "
const { PrismaClient } = require('./generated/client/index.js');
const p = new PrismaClient();
p.\$connect().then(() => { console.log('ok'); p.\$disconnect(); process.exit(0); }).catch(e => { process.exit(1); });
" 2>/dev/null; do
  i=$((i+1))
  if [ $i -ge $MAX_RETRIES ]; then
    echo "[entrypoint] MongoDB not available after $MAX_RETRIES attempts. Exiting."
    exit 1
  fi
  echo "[entrypoint] Attempt $i/$MAX_RETRIES — DB not ready, retrying in 5s..."
  sleep 5
done

echo "[entrypoint] DB connected. Running prisma db push..."
npx prisma db push --accept-data-loss

echo "[entrypoint] Starting server..."
exec node server2.js
