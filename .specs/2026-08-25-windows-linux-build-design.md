# Build Windows + Linux do app desktop — Design Spec

**Date:** 2026-08-25
**Status:** Proposto — decisões assumidas pelo planner a partir do diagnóstico da sessão (ver §Decisions, cada uma marcada como virável); o founder confirma ou vira antes do `/build`.
**Bounded Context:** desktop-shell (config + Rust) · CI · scripts de release · daemon TS (`agent`, `workspace`, core) · landing (astro) · console (services DI)
**Kind:** feature (infra cross-cutting + correções de portabilidade)
**Story Points:** 21 — três runners, manifesto multi-plataforma, dois workflows reescritos, quatro correções de portabilidade no daemon, um port novo no console, um comando Rust novo, docs.

## Context

O codm é hoje **macOS/arm64 de ponta a ponta por decisão de pipeline, não por arquitetura**
(diagnóstico de 2026-08-25). O que já é portável:

- `packages/app/tauri/config/build-sidecars.ts` conhece `HOST_TRIPLES` para `linux-x64`,
  `linux-arm64` e `win32-x64` e sufixa `.exe` — só nunca rodou fora do Mac.
- O gateway Go usa `modernc.org/sqlite` (puro Go), sem `os/exec`, sem build tags, e
  `store.go:98-113` já resolve o data dir por plataforma.
- O shell Rust compila em Win/Linux: `lifecycle.rs` tem `#[cfg(not(unix))]` no-op para sinais,
  `reaper.rs` tem `process_table()` para macOS/Linux e fallback vazio, `full_disk_access.rs`
  declara `platforms: &[Platform::Macos]`, `keyring` já lista `windows-native` +
  `sync-secret-service`.
- O DI do console (`packages/app/react/src/services`) não tem eixo de SO — a UI ramifica só no
  que um port reporta.
- `bun 1.3.14` cross-compila `bun build --compile` e aceita `bun install --os/--cpu`; o prebuild
  nativo do libsql existe para `linux-x64` (gnu/musl) e `win32-x64-msvc` — **não** para
  `win32-arm64`.

O que trava está concentrado: o pipeline de release (um runner self-hosted macOS, `tauri build`
sem alvo, artefatos `codm-aarch64.*` hardcoded), o manifesto do updater tipado só para
`darwin-aarch64` (`scripts/release/make-manifest.ts:31`), o prebuild do libsql que só é
instalado para o host (`build-sidecars.ts:90`, "CROSS-TRIPLE GAP"), e três quebras reais do
daemon TS no Windows (process group POSIX em `AgentProcess.ts`, spawn de `claude` sem `.cmd`,
`startsWith('/')` em `AddWorkspace.ts:14`).

Convenções que governam esta implementação: `tauri.conf.json`/`capabilities` são GERADOS
(`config/generate.ts`, rails DSK); comandos Rust são tipados via tauri-specta; o console chega
ao host só por `Tauri*Service`; a copy do produto é agnóstica de plataforma ("computador"),
salvo no passo de download e em permissões específicas ([[copy-agnostica-de-plataforma]]).

## Problem

1. Um usuário Linux ou Windows não tem como instalar o codm — não existe artefato, e a landing só
   oferece o DMG.
2. Mesmo que um bundle fosse gerado, o daemon quebraria no Windows: rejeita `C:\…` como
   workspace, não encontra `claude.cmd`, e ao encerrar um run vaza a árvore de processos do
   provider (`kill(-pid)` lança `EINVAL`).
3. O pipeline não sabe produzir nem publicar mais de uma plataforma: um `latest.json` por canal
   com uma única chave, nomes de asset fixos em `aarch64`, passos de assinatura Apple sem gate de
   SO.
4. Uma regressão que quebre o build Linux/Windows só apareceria no dia do lançamento — nenhum
   workflow compila o shell nem os sidecars fora do macOS.

## Goal

Cada merge na `main` produz um beta para **macOS/arm64, Linux/x64 e Windows/x64**, publicado num
único `latest.json` por canal; uma tag `vX.Y.Z` promove os três ao stable. A landing entrega o
instalador do sistema do visitante. O daemon roda no Windows com paridade funcional (workspace,
detecção do CLI, encerramento limpo de agentes). Um PR que quebra o Linux fica vermelho antes do
merge.

## Decisions

Cada decisão abaixo foi tomada pelo planner com base no código; todas são viráveis pelo founder
antes do `/build`. As que mudam a forma do trabalho estão marcadas **(virável — muda escopo)**.

1. **Um runner por SO, sem cross-compile.** macOS continua `[self-hosted, macOS, ARM64]`; Linux
   = `ubuntu-22.04` (x64, multiplicador 1×); Windows = `windows-latest` (x64, 2×; risco
   anotado: a label migra de imagem sem aviso — `windows-2022` seria o pin reprodutível, à
   escolha do founder). Tauri não
   cross-compila bundles e o prebuild do libsql precisa casar com o host do sidecar — o script de
   sidecars já resolve o triple do host. Mesmo filtro de `paths:` de hoje. Steps continuam em
   bash (`defaults.run.shell: bash` → git-bash no Windows). **(virável — custo: runners
   hosted em repo privado consomem cota; alternativa é runner self-hosted Linux/Windows.)**
2. **Alvos desta fase:** `linux-x86_64` (AppImage + deb; o updater só atualiza AppImage) e
   `windows-x86_64` (NSIS, sem MSI). **Fora:** `windows-arm64` (sem prebuild libsql) e
   `linux-arm64` (depois). `tauri build --bundles <lista>` por entrada da matrix; a conf gerada
   (`bundle.targets: "all"`) não muda.
3. **Sem code signing no Windows nesta fase.** O NSIS instala; o SmartScreen mostra o aviso.
   Fica documentado o slot `bundle.windows.signCommand` para Azure Trusted Signing (~US$10/mês,
   roadmap). Linux não assina. As assinaturas **minisign** do updater (mesma
   `TAURI_SIGNING_PRIVATE_KEY`) cobrem as três plataformas. **(virável — assinar já muda 1
   task.)**
4. **Um `latest.json` por canal, multi-plataforma — e nomes de asset CONGELADOS.** Beta
   (alias fixo): `codm-aarch64.{app.tar.gz,dmg}`, `codm-linux-x86_64.{AppImage,deb}`,
   `codm-windows-x86_64-setup.exe` (+ `.sig` dos artefatos de update). Stable (versionado):
   `CODM_vX.Y.Z_aarch64.app.tar.gz`, `CODM_vX.Y.Z_linux-x86_64.AppImage`,
   `CODM_vX.Y.Z_windows-x86_64-setup.exe` (+ `.sig`) e aliases fixos por plataforma para a
   landing (`stable/codm-linux-x86_64.AppImage`, `stable/codm-windows-x86_64-setup.exe`, …). `platforms` com as chaves
   `darwin-aarch64`, `linux-x86_64`, `windows-x86_64`. Os jobs da matrix sobem artefatos; um job
   `publish` (`ubuntu-22.04`) baixa os três, gera o manifesto, cria a release e sobe ao R2. Se um
   SO falha, a release inteira falha — nunca um manifesto parcial.
5. **Chrome de janela: Win/Linux usam decorações NATIVAS.** O console pergunta a um port novo
   `WindowService.chrome()` → `{ titleBar: 'overlay' | 'native' }`; a implementação Tauri chama
   um comando specta `window_chrome` (resolvido por `cfg!(target_os = "macos")`); a browser
   responde `native`. `AppChrome` reserva a faixa dos semáforos só quando o port reporta
   `overlay`. Controles custom de janela ficam FORA (as decorações nativas já os fornecem).
6. **Gestão de processo do agente por estratégia declarada.** Um `ProcessTree` por plataforma
   selecionado por **um** lookup em `process.platform` — POSIX mantém o comportamento atual
   byte a byte (detached + process group, SIGTERM → SIGKILL); Windows spawna sem `detached` e
   encerra a árvore com `taskkill /T … /PID`. Sem `if (platform === 'win32')` espalhado
   (CLAUDE.md não-negociável 5).
7. **Resolução do binário do provider vive inteira no detector.** Tabela declarada por
   plataforma `{ knownDirs, extensions }` (Windows: `PATHEXT` + `%LOCALAPPDATA%\Programs`,
   `%APPDATA%\npm`; Linux: `~/.local/bin`, `~/.npm-global/bin`, …); `whichOnPath` consulta as
   extensões e devolve o caminho absoluto; o runner nunca spawna um nome pelado.
8. **Validação de caminho de workspace aceita POSIX e Windows** (`^/`, letra de drive, UNC) via
   regex utilizável dos dois lados do fio — nunca `node:path` dentro de um schema Zod que o Kubb
   re-emite. Se o contrato de fio muda, há Contract Lock (`bun emit-openapi && bun sdk`).
9. **Data dir default do daemon TS espelha a BASE por plataforma do gateway Go**
   (`os.UserConfigDir()` — a tabela por SO é espelhada exatamente). A FOLHA difere hoje: o Go
   literaliza `"codm"` (store.go:344) e o TS deriva de `PROJECT` (fallback `'app'`); alinhar o
   Go fica como follow-up nomeado (`go-datadir-project`, §Notes do plano) — o shell sempre
   injeta `CODM_DATA_DIR`, então isto só afeta o dev standalone.
10. **Drain no Windows — três pontas, três tasks.** `SIGTERM` não chega no Windows. (a) O
    watchdog do daemon TS EXISTE (`core/src/utils/Watchdog.ts`) mas é cego no Windows nas duas
    pontas — a condição (`ppid` congela no spawn) e a reação (`process.kill(self,'SIGTERM')` =
    TerminateProcess, sem drain): a condição vira uniforme (ppid mudou OU sonda de vida diz que
    o supervisor morreu) e a reação chama o MESMO `shutdown()` dos sinais. (b) O watchdog do
    gateway Go tem a MESMA cegueira (`os.Getppid()` congelado) e ganha o espelho da correção.
    (c) O quit NORMAL do shell no Windows nunca drena o daemon (o passo graceful do
    `lifecycle.rs` é no-op em `not(unix)` e o force é TerminateProcess): o shell passa a
    escrever uma linha-sentinela no stdin do sidecar no passo graceful (todas as plataformas;
    POSIX mantém SIGTERM também) e o daemon — só quando `CODM_PARENT_PID` está setado — trata
    a LINHA-sentinela como "supervisor mandou parar", rodando o mesmo drain. EOF de stdin é
    ignorado deliberadamente (não é mais um gatilho): é redundante com o watchdog do pai (10a) e
    com SIGTERM em POSIX, e vira um footgun para qualquer supervisor que sete `CODM_PARENT_PID`
    sem manter um pipe de stdin vivo (ex.: o smoke de T2 sem `stdin: 'pipe'`).
11. **Reaper no Windows** ganha `process_table()` real (crate gated em
    `[target.'cfg(windows)'.dependencies]` ou parse de `tasklist`, a escolha justificada no
    plano) — sidecars órfãos de uma execução anterior passam a ser recolhidos.
12. **Dev local em Linux/Windows** funciona com `bun desktop:bundle`; o README do shell lista as
    dependências por SO (Linux: `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`,
    `librsvg2-dev`, `patchelf`, `libdbus-1-dev`; Windows: rustup MSVC, bun, go; WebView2 via
    bootstrapper do NSIS).
13. **Smoke de sidecar por SO no CI.** Depois de compilar, o runner sobe `codm-daemon` (cwd =
    `binaries/daemon-runtime`, env igual ao do shell) e `codm-gateway`, e espera o health. É o
    teste que `build-sidecars.ts` diz que "um build sozinho nunca revela". Portas FIXAS de
    smoke (3130/3132 — nunca as de produção 3030/3032, que no runner macOS self-hosted podem
    estar ocupadas pelo daemon real do founder); o gateway sobe num cwd temporário SEM `.env`
    (o `godotenv.Overload` do config.go leria o `.env` de dev por cima do env injetado).
14. **`correctness.yml` ganha um job Linux barato** (`cargo check` do shell + sidecars + smoke)
    para PRs, filtrado por um job `changes` (git diff contra a base — `on.paths` filtraria o
    workflow inteiro); quebra de Windows é pega pelo beta (custo 2×), que também é o único
    executor dos testes `#[cfg(windows)]` do shell (`cargo test --lib` no job Windows).
15. **Landing por SO.** `download.ts` vira tabela declarada por plataforma (QUATRO entradas —
    AppImage e deb para Linux; o CTA Linux aponta o AppImage, formato do updater); o site é
    estático, então a detecção por UA é client-side com progressive enhancement (sem JS o
    visitante vê macOS + a lista completa). A chave de copy `hero.ctaMac` vira o template
    `hero.ctaDownload` ("Download para {platform}") + `hero.otherPlatforms` — copy segue
    agnóstica fora do passo de download.
16. **`docs/RELEASE.md`** ganha seções Linux/Windows (formatos, ausência de assinatura, nota do
    SmartScreen, `libfuse2` do AppImage, Secret Service no Linux), a matrix e a agregação do
    `publish`; a entrada "Windows/Linux" sai de "O que este pipeline NÃO faz".
17. **Sem task para:** `chmod 0o600` do `FileCloudSession` (no Windows o perfil do usuário já é
    ACL por usuário); `MacosLauncher::LaunchAgent` do autostart (o plugin ignora fora do macOS);
    `keyring` sem Secret Service no Linux (limitação documentada nesta fase).

## Addendum (2026-08-26) — Windows deixa de depender de billing hospedado

**Diretriz do founder** (relayed pela sessão coordenadora, verbatim quanto à intenção): *"não
podemos contar com o billing do GitHub, temos que usar o mac mini."* Isso amenda as Decisões 1 e 2
acima: `windows-latest` deixa de ser o runner que produz o instalador Windows oficial.

- **Decisão 1, amendada.** A perna `windows-x86_64` do `build` deixa de rodar num runner hospedado
  e passa a **CROSS-COMPILAR** no MESMO runner `[self-hosted, Linux, X64]` que já builda
  `linux-x86_64` (o Mac mini do founder), via a rota **documentada pelo próprio Tauri v2** para
  builds Windows-a-partir-de-Linux: apt `nsis lld llvm clang`, `rustup target add
  x86_64-pc-windows-msvc`, `cargo install --locked cargo-xwin` (todos baked na imagem
  `infra/runners/linux-x64/`, para nenhum job reinstalar nada a cada execução), e `tauri build
  --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis`. NSIS cross-compila por essa
  rota; **MSI/WiX não** — o que já era uma escolha desta fase (Decisão 2, "sem MSI") passa também a
  ser a razão pela qual a rota funciona, não só uma preferência de formato de instalador. A rota é
  classificada como **EXPERIMENTAL** pela própria documentação do Tauri — aceita pelo founder nesta
  fase por eliminar de vez a exposição a billing hospedado do GitHub. `windows-latest` NÃO
  desaparece: vira `windows-native-tests.yml`, um workflow `workflow_dispatch`-only e
  NÃO-BLOQUEANTE, cujo único papel é validar nativamente o que o cross-build não pode provar
  sozinho (um runner Linux não executa o PE Windows que acabou de linkar).
- **Decisão 2, amendada.** Os alvos desta fase continuam os mesmos (`linux-x86_64`,
  `windows-x86_64`, NSIS sem MSI) — o que muda é ONDE o `windows-x86_64` é produzido, não O QUÊ.
- **Nota sobre a Decisão 14 / `correctness.yml`.** O texto original dizia que o job Windows do
  beta era "o único executor dos testes `#[cfg(windows)]` do shell (`cargo test --lib` no job
  Windows)" — isso ficou desatualizado. O `cargo test --lib` Windows-only foi REMOVIDO de
  `release-beta.yml`/`release-stable.yml` (a entrada cross-compilada não executa o binário que
  produz — não há como rodar `cargo test` de um alvo cross ali) e migrou inteiro para
  `windows-native-tests.yml` (`workflow_dispatch`, `windows-latest`), que passa a ser o ÚNICO
  executor desses testes.
- **AC-15, estendida.** Além do loop de auto-update por SO, a validação manual do **NSIS
  cross-compilado** (produzido no runner Linux, nunca executado ali) numa máquina Windows REAL —
  instala limpo, o app abre, o daemon/gateway sobem — é uma **precondição explícita do primeiro
  stable multi-SO**. Nenhum runner Linux prova que um `.exe` PE cross-linkado roda de verdade num
  Windows de carne e osso; só a execução nativa prova isso — `windows-native-tests.yml` fecha a
  metade que dá pra automatizar (shell + sidecars num Windows hospedado de verdade), a instalação
  manual do `-setup.exe` fecha o resto.

## User Stories

- **Story 1:** Como usuário Linux ou Windows, quero baixar um instalador do meu sistema na
  landing e receber atualizações automáticas, sem saber o que é um binário.
  - Dado um visitante em Windows, quando abre a landing, então o CTA aponta o `-setup.exe` e a
    lista "outras plataformas" mostra macOS e Linux (AC-8).
  - Dado um app Linux instalado (AppImage), quando o beta/stable publica versão maior, então o
    app baixa, verifica a assinatura minisign e relança (AC-3, AC-4).
- **Story 2:** Como founder, quero que um merge na main produza os três bundles de uma vez e
  que uma falha em qualquer SO segure a release inteira.
  - Dado um merge na main, quando o `release-beta` roda, então três jobs de build sobem
    artefatos e um `publish` gera um único `latest.json` com três chaves (AC-1, AC-2).
- **Story 3:** Como operador no Windows, quero anexar `C:\Users\…\projeto` como workspace, ter
  o `claude` detectado e um run de agente encerrado sem processos vazados.
  - Dado um caminho com letra de drive, quando envio `AddWorkspace`, então é aceito (AC-5).
  - Dado `claude.cmd` em `%APPDATA%\npm`, quando o daemon detecta providers, então devolve o
    caminho absoluto e o runner spawna esse caminho (AC-6).
  - Dado um run em andamento, quando o usuário cancela, então a árvore inteira do provider é
    encerrada (AC-7).
  - Dado o app fechado normalmente no Windows, quando o shell encerra os sidecars, então o
    daemon drena os runs antes de sair e o gateway não fica órfão segurando a porta (AC-16,
    AC-17).
- **Story 4:** Como contribuidor, quero que um PR que quebre o build Linux fique vermelho antes
  do merge (AC-9).
- **Story 5:** Como usuário Windows/Linux, quero o console sem uma faixa vazia à esquerda do
  header (AC-10).

## Acceptance Criteria

- [ ] AC-1: `release-beta.yml` e `release-stable.yml` rodam uma matrix com três entradas
      (`[self-hosted, macOS, ARM64]`, `ubuntu-22.04`, `windows-latest`), cada uma compilando
      sidecars nativamente, rodando o smoke (AC-11) e subindo seus artefatos; os passos de
      assinatura Apple executam só no macOS (`if: runner.os == 'macOS'`).
- [ ] AC-2: um job `publish` agrega os artefatos dos três SOs, chama `make-manifest` com três
      plataformas, cria a release (beta rolante / stable versionada) e sobe ao R2 com os nomes
      e content-types por plataforma; se qualquer job de build falhar, `publish` não roda.
- [ ] AC-3: `scripts/release/make-manifest.ts` aceita N `--platform <chave> --url --sig-file`,
      emite `platforms.{darwin-aarch64,linux-x86_64,windows-x86_64}` e rejeita chave
      desconhecida, duplicada ou assinatura vazia — coberto por teste unitário.
- [ ] AC-4: os artefatos de update por plataforma são `.app.tar.gz` (macOS), `.AppImage`
      (Linux) e `-setup.exe` (Windows), todos com `.sig` minisign da mesma chave.
- [ ] AC-5: o schema de `AddWorkspace` aceita `/home/x/p`, `C:\Users\x\p`, `D:/x` e
      `\\srv\share\p`, e continua rejeitando relativo (`./p`, `p`); se o contrato de fio mudou,
      o SDK foi regenerado e `bun tsc` passa.
- [ ] AC-6: `SystemProviderDetector` resolve `claude` por tabela declarada por plataforma (dirs +
      extensões via `PATHEXT` no Windows) e devolve caminho absoluto; `ClaudeAgentRunner`
      spawna esse caminho — coberto por testes com PATH de fixture em diretório temporário.
- [ ] AC-7: `AgentProcess` seleciona a estratégia de processo por um lookup em
      `process.platform`; a POSIX preserva o comportamento atual (testes existentes verdes); a
      Windows é testada com exec injetado (sem backdoor em código de produção).
- [ ] AC-8: a landing escolhe o CTA pelo UA e lista as três plataformas a partir de uma única
      tabela em `download.ts`; a função de detecção é pura e testada.
- [ ] AC-9: `correctness.yml` tem um job `ubuntu-22.04` que roda `cargo check` do shell,
      `build-sidecars` e o smoke; um PR que quebre qualquer um fica vermelho.
- [ ] AC-10: `AppChrome` reserva a faixa dos semáforos somente quando `WindowService.chrome()`
      reporta `overlay`; o comando `window_chrome` está nos bindings specta; browser e fake
      reportam `native`; coberto por teste com Container de fakes + story.
- [ ] AC-11: existe um script de smoke cross-platform que sobe `codm-daemon` e `codm-gateway`
      recém-compilados com o mesmo env do shell e falha se o health não responder.
- [ ] AC-12: `reaper.rs` tem `process_table()` para `cfg(windows)`; o shell continua compilando
      nos três SOs (`cargo check` no Linux via AC-9; Windows via o beta).
- [ ] AC-13: `docs/RELEASE.md` e `packages/app/tauri/README.md` documentam Linux/Windows
      (formatos, assinatura, dependências de build, limitações conhecidas); a entrada
      "Windows/Linux" sai de "O que este pipeline NÃO faz".
- [ ] AC-14: `bun tsc`, `bun lint`, `bun run test` e `test:tooling` (rails DSK) verdes; o
      `desktop:generate --check` sem drift (a conf gerada não muda).
- [ ] AC-15 (manual, primeiro par de betas multi-SO; ESTENDIDA pelo addendum 2026-08-26): o LOOP
      de auto-update é verificado em cada SO novo — instalar o beta N, publicar N+1, o app baixa,
      verifica minisign e aplica (AppImage substituído no Linux; NSIS silencioso no Windows). Desde
      2026-08-26 o NSIS do Windows é CROSS-COMPILADO no runner Linux (nunca executado ali) — a
      validação manual do instalador cross-compilado numa máquina Windows REAL (instala, abre, o
      daemon/gateway sobem) é **precondição explícita do primeiro stable multi-SO**, além do loop
      de auto-update: nenhum runner Linux prova que o `.exe` PE cross-linkado roda de verdade num
      Windows de carne e osso. Nenhum gate automatizado
      cobre isso; é AC de aceite explícito.
- [ ] AC-16: o watchdog do gateway Go detecta supervisor morto no Windows (sonda de vida com
      probe injetável; `ppid` congelado deixa de cegar) e drena via shutdowner — coberto por
      testes table-driven em `core/pkg/watchdog`.
- [ ] AC-17: no quit do shell, o daemon drena antes de morrer também no Windows — o passo
      graceful escreve a linha-sentinela no stdin do sidecar, o daemon (só com
      `CODM_PARENT_PID` setado) trata a LINHA-sentinela como o mesmo shutdown dos sinais; EOF de
      stdin é ignorado (redundante com o watchdog do pai + SIGTERM em POSIX — ver decisão 10c);
      dupla entrega (SIGTERM + sentinela) é idempotente — coberto por teste do handler puro +
      teste Rust da escalação.

## Fora de escopo (explícito)

Windows ARM64 e Linux ARM64 (decisão 2); code signing Windows (decisão 3); controles custom de
janela em Win/Linux (decisão 5); ACL do token de sessão no Windows, autostart launcher, fallback
de keyring sem Secret Service (decisão 17); rollout percentual e `minVersion` (SP4); runner
self-hosted Linux/Windows.
