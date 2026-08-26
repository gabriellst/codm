# Runner self-hosted Linux x64 (Mac mini do founder)

Desde 2026-08-25 os builds Linux dos workflows `release-beta`, `release-stable` e o job `linux`
de `correctness` rodam **self-hosted**, no MESMO Mac mini onde já roda o runner self-hosted de
macOS (docs/RELEASE.md, "Runner self-hosted") — não num runner hospedado do GitHub. A razão é a
mesma do macOS: custo. Minutos self-hosted não contam na cota (repo privado), e o job Linux que
antes custava ~10 min de cota hospedada por execução passa a custar zero.

O Mac mini é Apple Silicon (arm64); Linux x64 roda dentro de um **container amd64 sob Rosetta**
(`--platform linux/amd64`) — porque o daemon TS (`bun build --compile`) só carrega o prebuild
nativo do libsql do próprio host (o mesmo "CROSS-TRIPLE GAP" de
`packages/app/tauri/config/build-sidecars.ts`), e o release publica `x86_64-unknown-linux-gnu`,
não `aarch64-unknown-linux-gnu`.

## Subir a VM com Rosetta

**Docker Desktop** (macOS): Settings → General → "Use Virtualization framework" ligado, e
Settings → Features in development → "Use Rosetta for x86_64/amd64 emulation on Apple Silicon"
ligado. Depois disso `docker run --platform linux/amd64` já usa Rosetta em vez de qemu (bem mais
rápido).

**Colima** (alternativa mais leve, sem GUI):

```bash
colima start --vm-type vz --vz-rosetta --cpu 6 --memory 12
```

`--vz-rosetta` é o que liga a tradução via Rosetta na VM do Colima; sem ele um container
`linux/amd64` cai em emulação qemu (ordens de magnitude mais lento para compilar Rust). Ajuste
`--cpu`/`--memory` ao que sobra da máquina depois do daemon de produção e do runner macOS.

## Buildar a imagem

```bash
cd infra/runners/linux-x64
docker build --platform linux/amd64 -t codm-runner-linux-x64 .
```

A imagem instala a lista de deps de sistema do Tauri v2 (a mesma que
`.github/workflows/release-beta.yml`/`release-stable.yml`/`correctness.yml` documentam), a
toolchain Rust `stable` e o tarball do runner do GitHub Actions — tudo preinstalado, para que os
workflows não precisem provisionar nada em cada execução (ver o Dockerfile para o porquê de cada
passo). `bun`/`go`/`node` **não** entram na imagem: quem os instala é a `uses:` do próprio
workflow (`oven-sh/setup-bun`, `actions/setup-go`), a cada run — baking essas ferramentas aqui
duplicaria a fonte de verdade da versão instalada. `unzip` e o `gh` CLI também estão assados:
`unzip` porque `oven-sh/setup-bun@v2` extrai um `.zip` e a imagem base não o traz; `gh` porque os
jobs `publish` de release-beta/release-stable rodam `gh release create`/`delete` — rebuilde a
imagem de tempos em tempos para pegar patches do `gh`.

A versão do runner do GitHub Actions é resolvida em BUILD TIME contra a API de releases (não fica
hardcoded no Dockerfile). Rebuilde a imagem de tempos em tempos (`docker build --no-cache`) para
pegar patches do runner.

## Gerar um token de registro

Tokens de registro expiram em ~1h e exigem admin do repo:

```bash
gh api -X POST repos/gabriellst/codm/actions/runners/registration-token --jq .token
```

## Subir o container

```bash
docker run -d \
  --name codm-runner-linux-x64 \
  --platform linux/amd64 \
  --restart unless-stopped \
  --sysctl net.ipv6.conf.lo.disable_ipv6=1 \
  -e RUNNER_TOKEN="$(gh api -X POST repos/gabriellst/codm/actions/runners/registration-token --jq .token)" \
  -v codm-runner-cargo-target:/home/runner/.cache/codm-cargo-target \
  -v codm-runner-cargo:/home/runner/.cargo \
  -v codm-runner-rustup:/home/runner/.rustup \
  codm-runner-linux-x64
```

`--sysctl net.ipv6.conf.lo.disable_ipv6=1` é OBRIGATÓRIO e nasceu de um vermelho medido
(beta 32924933642, 2026-08-26): dentro do netns default o glibc resolve `localhost` para `::1`
primeiro, então um servidor que binda `"localhost"` escuta SÓ em `::1` — e o cliente do Bun disca
`127.0.0.1` → `ConnectionRefused`. Foi exatamente assim que o prerender do TanStack Start morreu no
`build-spa` (o servidor interno dele sobe em `localhost`). Sem `::1` no loopback, servidor e
cliente caem ambos em `127.0.0.1` (probe: `bind localhost` + `fetch http://localhost` → 200,
medido na imagem). Efeito colateral aceito: nenhum job neste runner pode depender de `::1`.

`--restart unless-stopped` é o que mantém o runner no ar entre reboots da máquina, igual ao runner
macOS. As labels registradas são `self-hosted,Linux,X64` (mesmas que
`runs-on: [self-hosted, Linux, X64]` nos workflows pede) e o nome é `mini-linux-x64` — ambos têm
default no `entrypoint.sh`, mas dá para sobrepor com `-e RUNNER_NAME=...` /
`-e RUNNER_LABELS=...` se um dia houver mais de um runner Linux.

O `entrypoint.sh` roda `./config.sh --unattended --url https://github.com/gabriellst/codm --token
$RUNNER_TOKEN --labels self-hosted,Linux,X64 --name mini-linux-x64 --replace` na primeira subida
e então `./run.sh`. Se o container for só **reiniciado** (não recriado — `docker restart`, ou o
processo do runner caindo e o supervisor do container reexecutando o entrypoint), o registro
(`.runner`) já existe na camada gravável do container e o `config.sh` é pulado — não é preciso
gerar um `RUNNER_TOKEN` novo toda vez. Recriar o container (`docker rm` + `docker run`) sempre
exige um token fresco.

## Volumes persistentes — o que mantém os builds quentes

- `/home/runner/.cache/codm-cargo-target` — `$CARGO_TARGET_DIR` (o mesmo mecanismo do runner
  self-hosted macOS: o `target/` do Rust mora FORA do workspace do checkout, então sobrevive ao
  `git clean -ffdx` que o `actions/checkout` roda a cada execução).
- `/home/runner/.cargo` e `/home/runner/.rustup` — o registry de crates baixadas e a toolchain.
  Já vêm preinstalados NA IMAGEM (`CARGO_HOME`/`RUSTUP_HOME` do Dockerfile), mas montar como
  volume evita perder o cache de download de dependências toda vez que o container é recriado
  (rebuild de imagem, `docker rm`).

Sem esses volumes o runner ainda funciona — só recompila e rebaixa tudo do zero a cada container
novo, o que é o comportamento normal de um runner hospedado descartável.

## Nota de performance — x64 sob Rosetta

Não espere velocidade nativa. Rosetta traduz x86_64 → arm64 instrução a instrução no nível do
processo; para código interpretado ou I/O-bound o overhead é pequeno, mas **o `cargo build` do
shell Tauri é CPU-bound e é a parte lenta** — o mesmo tipo de gargalo que o runner self-hosted
macOS já documenta (11,9 min no primeiro build self-hosted contra ~5,7 min no runner hospedado,
antes do cache esquentar). Aqui a tradução Rosetta soma um custo extra por cima disso. O ganho de
custo (zero cota) compensa, mas o build Linux não fica mais rápido que no `ubuntu-22.04`
hospedado — só mais barato.

## Segurança — mesma ressalva do runner macOS

**Antes de tornar este repositório público, remova este runner** (junto com o macOS): um PR de um
fork passaria a executar código arbitrário nesta máquina. Self-hosted + repo público são decisões
mutuamente exclusivas — ver docs/RELEASE.md, "Runner self-hosted (macOS)".

## Parar / remover

```bash
docker stop codm-runner-linux-x64   # o entrypoint desregistra do GitHub antes de sair (best-effort)
docker rm codm-runner-linux-x64
```
