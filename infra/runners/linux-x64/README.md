# Runner self-hosted Linux x64 (Mac mini do founder)

Desde 2026-08-25 os builds Linux dos workflows `release-beta`, `release-stable` e o job `linux`
de `correctness` rodam **self-hosted**, no MESMO Mac mini onde já roda o runner self-hosted de
macOS (docs/RELEASE.md, "Runner self-hosted") — não num runner hospedado do GitHub. A razão é a
mesma do macOS: custo. Minutos self-hosted não contam na cota (repo privado), e o job Linux que
antes custava ~10 min de cota hospedada por execução passa a custar zero.

Desde 2026-08-26 este MESMO runner também produz o instalador Windows — a entrada `windows-x86_64`
de `release-beta`/`release-stable` CROSS-COMPILA aqui via `cargo-xwin`, em vez de rodar num
`windows-latest` hospedado (diretriz do founder, verbatim: "não podemos contar com o billing do
GitHub, temos que usar o mac mini" — addendum 2026-08-26 em
`.specs/2026-08-25-windows-linux-build-design.md`). Ver "Papel de cross-compile Windows" abaixo.

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

Desde 2026-08-26 a imagem também carrega o necessário para CROSS-COMPILAR o instalador Windows
aqui dentro (ver "Papel de cross-compile Windows" abaixo): `nsis` (o `makensis` que empacota o
`-setup.exe`), `lld`/`llvm`/`clang` (o linker que `cargo-xwin` usa no lugar do MSVC de verdade), o
target `x86_64-pc-windows-msvc` (`rustup target add`) e o próprio `cargo-xwin` (`cargo install
--locked`) — tudo preinstalado pelo MESMO motivo que o resto desta lista: para a entrada
`windows-x86_64` de release-beta/release-stable não reinstalar nada a cada execução.

A versão do runner do GitHub Actions é resolvida em BUILD TIME contra a API de releases (não fica
hardcoded no Dockerfile). Rebuilde a imagem de tempos em tempos (`docker build --no-cache`) para
pegar patches do runner.

## Bundling AppImage sob Rosetta

O primeiro build Linux completo neste container (beta run 32929100958, 2026-08-26) morreu três
vezes seguidas em pontos diferentes do bundler AppImage do Tauri — todos os três com a MESMA causa
raiz: o container roda **amd64 sob tradução Rosetta** (ver "Nota de performance" abaixo), e as
ferramentas do `linuxdeploy` não foram desenhadas para esse ambiente. As três correções, diagnosticadas
por probes diferenciais no container ao vivo, viraram MECANISMOS PERMANENTES:

**(A) Cache do `linuxdeploy` pré-baixado e pré-patchado.** O bundler AppImage do Tauri
(`@tauri-apps/cli` ^2.9.6, `crates/tauri-bundler/.../appimage/linuxdeploy.rs`, função
`prepare_tools`) baixa 5 arquivos para `~/.cache/tauri/` na primeira vez que precisa deles, e PULA o
download se um arquivo daquele nome já existe ali — é esse early-return que faz a pré-carga desta
imagem funcionar. O próprio Tauri já zera os bytes 8-10 de `linuxdeploy-x86_64.AppImage` (um `dd`
incondicional no fim de `prepare_tools`, roda TODA vez) — por isso esse arquivo específico sempre
funcionou. Ele NUNCA faz o mesmo para `linuxdeploy-plugin-appimage.AppImage` (baixado uma vez, nunca
mais tocado), que por isso mantém o magic type-2 do formato AppImage (`41 49 02` no offset 8 do
header ELF) — a heurística de binfmt do Rosetta do Docker Desktop não bate com esse magic, então o
kernel executa o arquivo NATIVAMENTE em vez de rotear pelo Rosetta, e ele morre com
`Exec format error`, engolido pelo linuxdeploy como `std::logic_error: subprocess failed (exit code 2)`.
Fix: o Dockerfile baixa os mesmos 5 arquivos que o Tauri baixaria (`AppRun-x86_64`,
`linuxdeploy-x86_64.AppImage`, `linuxdeploy-plugin-gtk.sh`, `linuxdeploy-plugin-gstreamer.sh`,
`linuxdeploy-plugin-appimage.AppImage`) e zera os bytes 8-10 de TODO `*.AppImage` mais
`AppRun-x86_64` de forma defensiva (inócuo onde já está zerado — o padding `e_ident` de um ELF comum
já é zero nesse offset; só um header AppImage type-2 de verdade tem algo ali para apagar).
- **Sintoma sem o fix:** `std::logic_error: subprocess failed (exit code 2)` no passo de bundle,
  sem mais contexto (o linuxdeploy engole o `Exec format error` original).
- **Drift caveat:** se um bump futuro do `@tauri-apps/cli` mudar esse conjunto de ferramentas
  (arquivo novo, nome diferente, URL upstream diferente), esta pré-carga ainda semeia o conjunto
  ANTIGO num cache que o Tauri trata como completo para todo arquivo cujo NOME não mudou — um
  arquivo genuinamente NOVO que o Tauri passa a exigir é baixado fresco, SEM PATCH, e o mesmo
  sintoma volta. Não há gate automatizado para esse drift; o reparo é rebuildar esta imagem
  (`docker build --no-cache`) quando o Tauri CLI subir de versão, re-derivando a lista de
  ferramentas de `linuxdeploy.rs` na versão nova se o sintoma reaparecer.

**(B) Staging do daemon filtra o prebuild nativo pelo alvo declarado.** Em qualquer host
`linux-x64-gnu` (este container incluso), `bun install`'s matching por `--os`/`--cpu` resolve TODOS
os variantes de libc para aquele os+cpu — não existe eixo de libc no gate de optional-dep do bun —
então `@libsql/linux-x64-gnu` E `@libsql/linux-x64-musl` resolvem os dois. O walk de staging de
`packages/app/tauri/config/build-sidecars.ts` (`resolveStagedRoots`/`shouldStageOptionalDependency`)
copiava os dois para dentro do bundle; o `ldd` glibc do linuxdeploy morria no `.node` musl. O fix
filtra pelo `DAEMON_RUNTIME.nativePrebuild[target]` declarado — só o prebuild do alvo atual entra no
bundle, uniformemente no path host E no path cross. Ver o comentário de `shouldStageOptionalDependency`
no próprio arquivo para o mecanismo completo.
- **Sintoma sem o fix:** o bundle falha (ou, pior, empacota um `.node` que não roda) ao processar
  `daemon-runtime/node_modules/@libsql/linux-x64-musl` com uma libc estrangeira ao `ldd` glibc.

**(C) Wrapper de `ldd`.** Sob Rosetta, `ldd` no binário single-file do Bun (`codm-daemon`) devolve
SAÍDA VAZIA (o loader trace falha em silêncio) mesmo o binário rodando normalmente — o smoke test
prova — e `ldd` no gateway Go estático (`codm-gateway`) sai com código != 0. O linuxdeploy roda `ldd`
em TODO ELF do AppDir e trata QUALQUER falha (saída vazia ou exit != 0) como fatal. Fix: o Dockerfile
renomeia o `ldd` real para `/usr/bin/ldd.real` e instala `ldd-wrapper.sh` como `/usr/bin/ldd` — o
wrapper responde "sem dependências" (saída vazia, rc 0) sempre que o real falhar ou não imprimir
nada. Ver o cabeçalho de `ldd-wrapper.sh` para a justificativa completa do risco aceito (nossos
sidecars são autocontidos; as deps que têm — glibc base — já estão na blacklist do linuxdeploy).
- **Sintoma sem o fix:** o bundle falha ao rodar `ldd` sobre `codm-daemon` ou `codm-gateway`, antes
  de chegar perto do problema (A) acima.

**Nota relacionada — cache do plugin NSIS.** Desde 2026-08-26 o Dockerfile também pré-baixa
`nsis_tauri_utils.dll` para `~/.cache/tauri/NSIS/Plugins/x86-unicode/additional/`, pela MESMA razão
do cache do `linuxdeploy` em (A): é o único download que o bundler correspondente (agora o NSIS, não
o AppImage) faz em tempo de build, e um cache frio nesse único arquivo já derrubou uma execução (run
32934975156) por um flake de DNS do Docker Desktop. Ver "Papel de cross-compile Windows" abaixo para
o contexto completo do cross Windows.

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
  -v codm-runner-xwin:/home/runner/.cache/cargo-xwin \
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
  `git clean -ffdx` que o `actions/checkout` roda a cada execução). Cross ou nativo — a entrada
  `windows-x86_64` (cross, desde 2026-08-26) escreve dentro do MESMO diretório, no subdiretório
  `x86_64-pc-windows-msvc/` que o Cargo cria sozinho para um `--target` explícito.
- `/home/runner/.cargo` e `/home/runner/.rustup` — o registry de crates baixadas e a toolchain.
  Já vêm preinstalados NA IMAGEM (`CARGO_HOME`/`RUSTUP_HOME` do Dockerfile), mas montar como
  volume evita perder o cache de download de dependências toda vez que o container é recriado
  (rebuild de imagem, `docker rm`).
- `/home/runner/.cache/cargo-xwin` (`$XWIN_CACHE_DIR`) — desde 2026-08-26, o SDK do Windows/MSVC
  que `cargo-xwin` baixa (headers + libs da Microsoft, via `xwin`) na PRIMEIRA vez que a entrada
  `windows-x86_64` cross-compila. Sem este volume, todo container recriado rebaixaria o SDK inteiro
  no primeiro build cross depois de subir — o volume é o que faz isso acontecer só uma vez.

**Os mountpoints `codm-cargo-target` e `cargo-xwin` são pré-criados NA IMAGEM, donos de
`runner`** (Dockerfile, `RUN mkdir -p ... && chown -R runner:runner`) — de propósito. Um named
volume Docker montado pela primeira vez num caminho que NÃO existe ainda na imagem nasce
ROOT-OWNED no host (não há conteúdo/ownership da imagem para semear); um `tauri build` rodando
como `runner` então falha com "Permission denied" ao criar `release/` dentro dele. Medido: run
32926405769 (2026-08-26). `.cargo`/`.rustup` nunca sofreram disso porque já existem na imagem,
donos de `runner`, então o Docker semeia o volume novo com esse conteúdo E essa ownership.

**Efeito colateral aceito de `.cargo`/`.rustup` serem volumes: eles MASCARAM a toolchain da imagem
depois da primeira montagem.** Um named volume só é semeado a partir do conteúdo da imagem na
PRIMEIRA vez que é criado — depois disso, o volume é a fonte de verdade em todo boot seguinte, e o
que a imagem carrega para aquele caminho deixa de importar. Rebuildar a imagem para adicionar um
rustup target novo (ou uma cargo subcommand nova, como `cargo-xwin` para o cross Windows) NÃO
alcança um container cujos volumes `codm-runner-rustup`/`codm-runner-cargo` já existiam antes desse
rebuild — medido no rerun da perna Windows: `Target x86_64-pc-windows-msvc is not installed
(installed targets: x86_64-unknown-linux-gnu)`, com a imagem já reconstruída e o Dockerfile já
correto. Fix: `entrypoint.sh` reconcilia o toolchain DECLARADO a cada boot, antes de `./run.sh`
(`rustup target add x86_64-pc-windows-msvc` + instala `cargo-xwin` se ausente) — idempotente, então
o custo real só existe na primeira vez que um volume desatualizado encontra o entrypoint novo.

Sem esses volumes o runner ainda funciona — só recompila, rebaixa as dependências e rebaixa o SDK
do Windows do zero a cada container novo, o que é o comportamento normal de um runner hospedado
descartável (custa só tempo, nunca corretude).

## Papel de cross-compile Windows (desde 2026-08-26)

Este mesmo container que builda `linux-x86_64` também CROSS-COMPILA o instalador `windows-x86_64`
— a entrada `windows-x86_64` de `release-beta.yml`/`release-stable.yml` roda `tauri build --runner
cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis` NELE, em vez de num `windows-latest`
hospedado. Diretriz do founder, verbatim: "não podemos contar com o billing do GitHub, temos que
usar o mac mini" (addendum 2026-08-26 em `.specs/2026-08-25-windows-linux-build-design.md`).

A rota é a que o **próprio Tauri v2 documenta** para builds Windows-a-partir-de-Linux: `nsis` (o
`makensis` que empacota o `-setup.exe`) + `x86_64-pc-windows-msvc` (`rustup target add`) +
`cargo-xwin` (que orquestra `lld`/`clang` contra o SDK do Windows/MSVC baixado por ele) — as três
peças já vêm preinstaladas na imagem (Dockerfile). NSIS cross-compila por essa rota; **MSI/WiX
não** — é por isso que o Windows desta release só empacota NSIS, sem alternativa.

**Caveat honesto: a rota é EXPERIMENTAL por documentação do próprio Tauri**, aceita pelo founder
nesta fase justamente para eliminar a dependência de billing hospedado. Um runner Linux não
consegue EXECUTAR o `.exe` PE que acabou de linkar — não há como provar aqui que o instalador
realmente abre, instala e roda num Windows de verdade. Por isso:

- O passo `smoke dos sidecars` desta entrada é PULADO (`matrix.smoke: false`) nos dois workflows de
  release — não há host Windows neste container para subir os binários e checar o health.
- `.github/workflows/windows-native-tests.yml` (`workflow_dispatch`-only, `windows-latest`,
  não-bloqueante) é o validador nativo: roda os testes `#[cfg(windows)]` do shell e o smoke de
  verdade, num Windows hospedado de verdade — mas não instala o `-setup.exe` cross-compilado.
- A validação manual do NSIS cross-compilado, instalando numa máquina Windows REAL, é uma
  **precondição explícita do primeiro stable multi-SO** (AC-15, mesmo spec) — nenhum gate
  automatizado prova que o binário cross roda de verdade; só essa instalação manual prova.

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
