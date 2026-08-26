# Runner self-hosted Linux x64 do release-beta/release-stable/correctness (docs/RELEASE.md
# "Runner self-hosted"). Roda no Mac mini do founder como um container amd64 sob Rosetta — não é
# um Linux nativo, e o objetivo NÃO é performance, é custo zero de cota hospedada (o mesmo
# raciocínio do macOS self-hosted, replicado para o segundo SO caro).
#
# --platform=linux/amd64 é obrigatório: sem ele o Docker Desktop/Colima do host (Apple Silicon)
# construiria uma imagem arm64, e o daemon TS (bun build --compile) precisa do prebuild nativo do
# libsql para x86_64-unknown-linux-gnu — o mesmo "CROSS-TRIPLE GAP" documentado em
# packages/app/tauri/config/build-sidecars.ts. Ver infra/runners/linux-x64/README.md para como
# ligar a VM com Rosetta antes de buildar esta imagem.
FROM --platform=linux/amd64 ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    # AppImage não tem FUSE dentro de um container — sem isso o bundler do Tauri (e qualquer AppImage
    # baixado à mão para depurar) falha ao montar; com a env ele extrai e roda direto, sem FUSE.
    APPIMAGE_EXTRACT_AND_RUN=1 \
    # Builds de release não devem stripar símbolos do binário do shell — mesma convenção que os
    # runners hospedados (macOS/Windows) seguem via a conf do Tauri; aqui é explícito porque o
    # perfil de release do container não herda variáveis de ambiente de nenhum workflow por padrão.
    NO_STRIP=true

# Deps de sistema — a MESMA lista canônica que .github/workflows/release-beta.yml,
# release-stable.yml e correctness.yml documentam para o Tauri v2 no Ubuntu 22.04 (webkit2gtk +
# tray + rsvg + patchelf para o AppImage + libdbus-1-dev para o keyring `sync-secret-service`),
# mais git/jq/python3 que o próprio runner do GitHub Actions e as actions do workflow (actions/
# checkout, setup-go, setup-bun) esperam disponíveis no PATH. bun/go/node NÃO entram aqui de
# propósito — quem os instala é a respectiva `uses:` do workflow (oven-sh/setup-bun,
# actions/setup-go), a cada execução; baking nessas ferramentas aqui duplicaria a fonte de verdade
# da versão instalada.
#
# `ca-certificates` NÃO está na lista canônica dos workflows (eles rodam num runner cuja imagem
# base já a inclui) — mas o ubuntu:22.04 "vanilla" do Docker Hub NÃO a inclui, e sem ela todo
# `curl https://...` abaixo (rustup, tarball do actions-runner) falha com
# "error setting certificate file: /etc/ssl/certs/ca-certificates.crt". Medido no build local desta
# imagem. Fix na causa (non-negotiable 1): a imagem base é diferente do runner de referência, então
# a dependência que ficava implícita lá precisa ficar explícita aqui.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      build-essential curl wget file git jq python3 \
      libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf \
      libxdo-dev libssl-dev libdbus-1-dev \
    && rm -rf /var/lib/apt/lists/*

# Usuário não-root — o runner do GitHub Actions recusa rodar como root sem
# RUNNER_ALLOW_RUNASROOT=1, e não há motivo para forçar isso aqui.
RUN useradd --create-home --shell /bin/bash runner

# Toolchain Rust (stable) — o que dtolnay/rust-toolchain@stable instalaria num runner hospedado.
# Fica pronta na imagem porque este runner é PERSISTENTE (docs/RELEASE.md): nenhum workflow
# reinstala Rust aqui (o `matrix.hosted`/gate correspondente em correctness.yml pula esse passo).
USER runner
ENV RUSTUP_HOME=/home/runner/.rustup \
    CARGO_HOME=/home/runner/.cargo \
    PATH=/home/runner/.cargo/bin:$PATH
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
      | sh -s -- -y --default-toolchain stable --profile minimal \
    && rustup --version && cargo --version

# Runner do GitHub Actions (tarball x64). A versão é resolvida em BUILD TIME contra a API de
# releases — não fica hardcoded no Dockerfile, então rebuildar a imagem periodicamente é o que
# mantém o runner atualizado (não há um "latest" fixo para baixar direto). installdependencies.sh
# instala as libs de runtime do .NET que o Runner.Listener precisa (icu, lttng-ust, krb5 etc.) —
# roda como root porque usa apt; o resto do runner já é dono do usuário `runner`.
USER root
WORKDIR /home/runner/actions-runner
RUN RUNNER_VERSION="$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r '.tag_name' | sed 's/^v//')" \
    && curl -fsSL -o actions-runner.tar.gz \
         "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" \
    && tar xzf actions-runner.tar.gz \
    && rm actions-runner.tar.gz \
    && ./bin/installdependencies.sh \
    && chown -R runner:runner /home/runner/actions-runner

COPY --chown=runner:runner entrypoint.sh /home/runner/entrypoint.sh
RUN chmod +x /home/runner/entrypoint.sh

USER runner
WORKDIR /home/runner/actions-runner
ENTRYPOINT ["/home/runner/entrypoint.sh"]
