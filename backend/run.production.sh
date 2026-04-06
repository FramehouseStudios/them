#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
set -a
source ./.env.production
set +a
exec node index.js
