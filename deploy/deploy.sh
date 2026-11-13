#!/bin/sh
# Sends the current code to the server, builds it there and restarts the app. The database on the server is left alone.
#   HEXBRAIN_HOST=root@<server> [HEXBRAIN_SSH_KEY=~/.ssh/key] sh deploy/deploy.sh
set -e
: "${HEXBRAIN_HOST:?Set HEXBRAIN_HOST, for example root@203.0.113.10}"
KEY="${HEXBRAIN_SSH_KEY:-$HOME/.ssh/hexbrain_vps}"
cd "$(dirname "$0")/.."
rsync -az --delete -e "ssh -i $KEY -o IdentitiesOnly=yes" \
  --exclude node_modules --exclude '.next*' --exclude .git --exclude 'data/' --exclude '.env*' --exclude tests \
  ./ "$HEXBRAIN_HOST:/opt/hexbrain/app/"
ssh -i "$KEY" -o IdentitiesOnly=yes "$HEXBRAIN_HOST" '
  set -e
  chown -R hexbrain:hexbrain /opt/hexbrain/app
  sudo -u hexbrain -H env CI=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0 sh -c "cd /opt/hexbrain/app && pnpm install --frozen-lockfile && NODE_ENV=production pnpm build"
  systemctl restart hexbrain && sleep 4 && systemctl is-active hexbrain
  curl -s -o /dev/null -w "app answers: %{http_code}\n" http://127.0.0.1:3000/about'
