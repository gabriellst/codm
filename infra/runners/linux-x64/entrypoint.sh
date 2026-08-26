#!/usr/bin/env bash
# Entrypoint do container do runner self-hosted Linux x64 — ver README.md ao lado para como
# gerar RUNNER_TOKEN e subir o container.
set -euo pipefail

: "${RUNNER_URL:=https://github.com/gabriellst/codm}"
: "${RUNNER_NAME:=mini-linux-x64}"
: "${RUNNER_LABELS:=self-hosted,Linux,X64}"
: "${RUNNER_TOKEN:?defina RUNNER_TOKEN — token de registro (expira em ~1h): gh api -X POST repos/gabriellst/codm/actions/runners/registration-token --jq .token}"

cd /home/runner/actions-runner

# `.runner` só existe depois de um config.sh bem-sucedido. Num container que sobrevive a restarts
# (--restart unless-stopped, sem recriar), pular o config.sh de novo evita exigir um RUNNER_TOKEN
# novo (o token de registro expira em ~1h; o processo do runner, uma vez registrado, não precisa
# dele para continuar rodando). `--replace` cobre o caso de um registro anterior do MESMO nome
# ainda pendurado no GitHub (container recriado, ou :name reutilizado).
if [ ! -f .runner ]; then
  ./config.sh --unattended \
    --url "$RUNNER_URL" \
    --token "$RUNNER_TOKEN" \
    --labels "$RUNNER_LABELS" \
    --name "$RUNNER_NAME" \
    --replace
fi

# Remove o registro do GitHub ao parar o container (docker stop / SIGTERM) — sem isso o runner
# fica listado como "offline" no repo em vez de desaparecer. Best-effort: um token expirado ou o
# runner já removido não pode derrubar o shutdown.
cleanup() {
  echo "removendo registro do runner..."
  ./config.sh remove --unattended --token "$RUNNER_TOKEN" || true
}
trap cleanup EXIT INT TERM

./run.sh
