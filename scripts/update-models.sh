#!/bin/bash
# Runs the model registry updater. Designed to be called every 3 hours.
# Auto-commits & pushes if the generated JSON changed.
#
# Setup:
#   1. chmod +x scripts/update-models.sh
#   2. Add to crontab: 0 */3 * * * cd /path/to/blend && ./scripts/update-models.sh >> /tmp/blend-models.log 2>&1

set -euo pipefail

cd "$(dirname "$0")/.."

# Load .env.local if exists (for local dev)
if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
fi

# Run the updater
npx tsx scripts/update-models.ts

# Check if generated file changed
if ! git diff --quiet src/data/available-models.generated.json 2>/dev/null; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Model registry updated. Committing..."
  git add src/data/available-models.generated.json
  git commit -m "chore(models): auto-update registry [$(date -u +"%Y-%m-%d %H:%M UTC")]"
  git push origin HEAD
  echo "Pushed."
else
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] No changes."
fi
