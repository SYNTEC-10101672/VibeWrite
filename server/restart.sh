#!/usr/bin/env bash
# Idempotent lifecycle script: revives a dead process or deploys a new build.
# (pm2 startOrReload starts when absent, reloads when online.)
set -euo pipefail
cd "$(dirname "$0")"
pm2 startOrReload ecosystem.config.js && pm2 save
