#!/bin/sh
set -e

echo "Applying pending database migrations..."
npx prisma migrate deploy

exec "$@"
