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
# `unzip` — setup-bun extrai um .zip; medido 2026-08-25.
#
# `nsis lld llvm clang` — desde 2026-08-26, o que a rota de CROSS-COMPILE Windows do Tauri v2 exige
# além do Rust (addendum 2026-08-26 em .specs/2026-08-25-windows-linux-build-design.md): `nsis`
# fornece `makensis`, o empacotador que gera o `-setup.exe` (o Tauri invoca o binário do sistema,
# não baixa um); `lld`/`llvm`/`clang` são o linker e o toolchain que `cargo-xwin` usa para linkar
# contra o SDK do Windows/MSVC baixado por ele (ver `XWIN_CACHE_DIR` abaixo) — MSVC de verdade não
# roda em Linux, `cargo-xwin` cross-linka com `lld-link`/`clang-cl` no lugar dele.
#
# `xdg-utils desktop-file-utils squashfs-tools` — pré-requisitos do BUNDLER Linux do Tauri v2
# (empacota AppImage/.deb; não têm relação com o cross Windows acima). Adicionados como CONJUNTO,
# não um por vez: o rebuild de 2026-08-26 (rerun do run 32926405769) morreu em
# `failed to bundle project: xdg-mime binary not found /usr/bin/xdg-mime` — a lista canônica dos
# workflows nunca precisou deles porque o bundler Linux só rodava self-hosted a partir desta
# mesma imagem, e essa lacuna nunca tinha sido exercida antes do primeiro build cross completo.
# `xdg-utils` dá `xdg-mime` (registra o MIME type do AppImage); `desktop-file-utils` dá
# `desktop-file-validate` (o `.desktop` embutido no AppImage); `squashfs-tools` dá `mksquashfs`
# (o filesystem que vira o AppImage). `file` já está na lista acima (linuxdeploy o usa para
# identificar ELF/Mach-O) — conferido, não duplicado aqui.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      build-essential curl wget file git jq python3 unzip \
      libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf \
      libxdo-dev libssl-dev libdbus-1-dev \
      nsis lld llvm clang \
      xdg-utils desktop-file-utils squashfs-tools \
    && rm -rf /var/lib/apt/lists/*

# Usuário não-root — o runner do GitHub Actions recusa rodar como root sem
# RUNNER_ALLOW_RUNASROOT=1, e não há motivo para forçar isso aqui.
RUN useradd --create-home --shell /bin/bash runner

# Pré-cria os DOIS mountpoints de cache que `docker run -v` vai montar como named volumes NOVOS
# (README.md, "Volumes persistentes"), donos de `runner`, ANTES de qualquer volume ser montado.
# Mecanismo medido (run 32926405769, 2026-08-26): quando um named volume novo é montado num
# caminho que NÃO existe ainda na imagem, o Docker cria o diretório no host ROOT-OWNED (não há
# conteúdo de imagem para semear, então também não há ownership para copiar). `tauri build`
# rodando como `runner` então falha com "Permission denied" ao tentar criar `release/` dentro dele.
# `~/.cargo`/`~/.rustup` (montados como volume também, mais abaixo) escapam desse problema SEM
# precisar deste passo — eles JÁ existem na imagem, donos de `runner` (criados pelo `rustup`
# install, que roda como `USER runner`), e o Docker semeia o volume novo com esse conteúdo E essa
# ownership. `codm-cargo-target` (CARGO_TARGET_DIR) e `cargo-xwin` (XWIN_CACHE_DIR, abaixo) são
# caminhos NOVOS que nada mais cria — por isso precisam do tratamento explícito aqui.
RUN mkdir -p /home/runner/.cache/codm-cargo-target /home/runner/.cache/cargo-xwin \
    && chown -R runner:runner /home/runner/.cache

# Toolchain Rust (stable) — o que dtolnay/rust-toolchain@stable instalaria num runner hospedado.
# Fica pronta na imagem porque este runner é PERSISTENTE (docs/RELEASE.md): nenhum workflow
# reinstala Rust aqui (o `matrix.hosted`/gate correspondente em release-beta.yml/release-stable.yml
# pula esse passo). Desde 2026-08-26 a imagem TAMBÉM carrega o necessário para CROSS-COMPILAR
# Windows a partir daqui — a rota que o próprio Tauri v2 documenta para builds
# Windows-a-partir-de-Linux (addendum 2026-08-26 em .specs/2026-08-25-windows-linux-build-design.md;
# diretriz do founder: "não podemos contar com o billing do GitHub, temos que usar o mac mini").
# Baked na imagem para que a entrada `windows-x86_64` de release-beta.yml/release-stable.yml não
# reinstale nada a cada execução — `rustup target add`/`cargo install` custam minutos que um job
# não precisa pagar de novo toda vez.
USER runner
ENV RUSTUP_HOME=/home/runner/.rustup \
    CARGO_HOME=/home/runner/.cargo \
    PATH=/home/runner/.cargo/bin:$PATH \
    # `cargo-xwin` baixa o SDK do Windows/MSVC (headers + libs da Microsoft, via `xwin`) na
    # PRIMEIRA vez que compila para `x86_64-pc-windows-msvc` — não na instalação do `cargo-xwin`
    # em si (abaixo). Declarado explícito (em vez de deixar cair no default, que já cairia dentro
    # de `$HOME` e persistiria pelo mesmo mecanismo) para o volume dedicado em
    # infra/runners/linux-x64/README.md apontar exatamente para este caminho.
    XWIN_CACHE_DIR=/home/runner/.cache/cargo-xwin
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
      | sh -s -- -y --default-toolchain stable --profile minimal \
    && rustup target add x86_64-pc-windows-msvc \
    && rustup --version && cargo --version

# `cargo-xwin` é o `--runner` que `tauri build --runner cargo-xwin --target
# x86_64-pc-windows-msvc` (release-beta.yml/release-stable.yml, entrada `windows-x86_64`) invoca —
# ele orquestra `lld`/`clang` (apt deps acima) contra o SDK baixado em `$XWIN_CACHE_DIR`. EXPERIMENTAL
# por documentação do próprio Tauri v2; aceito pelo founder nesta fase. `--locked` pela mesma razão
# de sempre: reprodutibilidade contra o Cargo.lock publicado do crate, não um resolve solto no
# momento do build da imagem.
RUN cargo install --locked cargo-xwin \
    && cargo xwin --version

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

# gh CLI — mesmo padrão de resolução via API que o tarball do runner logo acima: a versão é
# resolvida em BUILD TIME contra a API de releases, não hardcoded (rebuildar a imagem é o que pega
# patches do gh). Só os jobs `publish` de release-beta.yml/release-stable.yml usam (`gh release
# create`/`delete`); antes disso eles baixavam esse mesmo tarball para $RUNNER_TEMP a cada
# execução — assar aqui remove aquele passo dos dois workflows. Extrai para /usr/local/bin (já no
# PATH de qualquer shell) porque, diferente do workflow, a imagem é permanente.
RUN GH_VERSION="$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest | jq -r '.tag_name' | sed 's/^v//')" \
    && curl -fsSL -o /tmp/gh.tar.gz \
         "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" \
    && tar -xzf /tmp/gh.tar.gz -C /tmp \
    && install -m 0755 "/tmp/gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/gh \
    && rm -rf /tmp/gh.tar.gz "/tmp/gh_${GH_VERSION}_linux_amd64" \
    && gh --version

COPY --chown=runner:runner entrypoint.sh /home/runner/entrypoint.sh
RUN chmod +x /home/runner/entrypoint.sh

USER runner
WORKDIR /home/runner/actions-runner
ENTRYPOINT ["/home/runner/entrypoint.sh"]
