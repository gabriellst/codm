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

# Reconciliação de toolchain DECLARADO — mecanismo, não patch pontual (medido no rerun da perna
# Windows: `Target x86_64-pc-windows-msvc is not installed (installed targets:
# x86_64-unknown-linux-gnu)`). Os volumes nomeados `codm-runner-rustup`/`codm-runner-cargo`
# (README.md, "Volumes persistentes") são semeados a partir do conteúdo da imagem SÓ na primeira
# vez que cada volume é montado — depois disso eles MASCARAM `~/.rustup`/`~/.cargo` da imagem em
# todo boot seguinte. Um rebuild de imagem que adiciona um rustup target novo (ou uma cargo
# subcommand nova, como `cargo-xwin` para o cross Windows) nunca alcança um container cujo volume já
# existia ANTES desse rebuild — o container continua rodando a toolchain velha para sempre, mesmo
# com `docker run` apontando pra imagem nova. Fix: reconcilia o estado declarado AQUI, a cada boot,
# em vez de confiar que a imagem sozinha basta — idempotente (custo real só na primeira vez que um
# volume desatualizado encontra este entrypoint; toda vez depois disso é uma checagem barata que não
# reinstala nada).
REQUIRED_RUST_TARGETS=(x86_64-pc-windows-msvc)
for target in "${REQUIRED_RUST_TARGETS[@]}"; do
  rustup target add "$target"
done
command -v cargo-xwin >/dev/null 2>&1 || cargo install --locked cargo-xwin

./run.sh
