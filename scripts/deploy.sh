#!/bin/bash
set -euo pipefail

# Usage: bash scripts/deploy.sh
#
# Ships the committed tree (HEAD) and rebuilds/restarts the static site behind
# the shared Caddy edge (chia-gaming-edge), routed as chialisp.mrdennis.dev. The
# container publishes no host port in production — the edge is the only public face.
#
# The remote directory is replaced, not extracted over: it holds no .env or data,
# and leftovers would keep serving examples that were removed from the repo.
#
# Prerequisites on the host:
#   - the chia-gaming-edge stack is up (owns :80/:443 and the `edge` network)
#   - DNS for chialisp.mrdennis.dev points at the host

HOST="${DEPLOY_HOST:-chiagaming.mrdennis.dev}"
REMOTE_DIR="${DEPLOY_DIR:-/opt/chialisp-playground}"
DOMAIN="chialisp.mrdennis.dev"
COMPOSE="docker compose -f docker/docker-compose.yml -f docker/docker-compose.edge.yml"

echo "=== Test ==="
npm test

echo "=== Pack + upload $(git rev-parse --short HEAD) to $HOST ==="
[ -z "$(git status --porcelain)" ] || echo " -> note: uncommitted changes are NOT deployed (shipping HEAD)"
git archive --format=tar.gz -o /tmp/chialisp-deploy.tar.gz HEAD
scp /tmp/chialisp-deploy.tar.gz "$HOST:/tmp/chialisp-deploy.tar.gz"
rm -f /tmp/chialisp-deploy.tar.gz

echo "=== Build + restart stack ($HOST) ==="
ssh "$HOST" "set -euo pipefail
  rm -rf $REMOTE_DIR
  mkdir -p $REMOTE_DIR
  cd $REMOTE_DIR
  tar xzf /tmp/chialisp-deploy.tar.gz
  rm -f /tmp/chialisp-deploy.tar.gz
  $COMPOSE up -d --build --remove-orphans
  $COMPOSE ps"

echo "=== Health check ==="
ssh "$HOST" "set -euo pipefail
  sleep 4
  code=\$(curl -s -o /dev/null -w '%{http_code}' https://$DOMAIN/ || true)
  echo \"https://$DOMAIN/ -> \$code\"
  [ \"\$code\" = '200' ] && echo ' -> edge OK' || echo ' -> not 200 yet (cert may still be issuing; retry in a few seconds)'"
