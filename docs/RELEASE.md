# Release & auto-update (SP1)

> Spec: `.specs/2026-08-06-sp1-release-autoupdate-design.md` · Roadmap:
> `.specs/2026-08-06-produto-desktop-roadmap.md`

## Os dois canais

| Canal | Alimentado por | Endpoint que o app consulta |
|---|---|---|
| **beta** | cada merge na `main` (workflow `release-beta`) | `releases/download/beta/latest.json` (prerelease rolante) |
| **stable** | tag `vX.Y.Z` (workflow `release-stable`) | `releases/latest/download/latest.json` (o `latest` do GitHub ignora prereleases) |

O app checa o canal ~10s após o boot (release builds apenas — dev nunca se auto-atualiza), baixa o
artefato de update da sua plataforma (tabela em "Plataformas", abaixo), **verifica a assinatura
minisign** contra a pubkey embarcada, instala e relança. Falha de rede/endpoint é logada e engolida:
update nunca custa o app.

### Trocar o canal de uma máquina

O arquivo `update-channel` vive no data dir do app (`app_data_dir()/data`), que muda por SO:

```bash
# macOS
DATA="$HOME/Library/Application Support/app.codm.desktop/data"
# Linux
DATA="$HOME/.local/share/app.codm.desktop/data"
# Windows (git-bash / PowerShell: $env:APPDATA\app.codm.desktop\data)
DATA="$APPDATA/app.codm.desktop/data"

# entrar no beta (máquinas do founder):
echo beta > "$DATA/update-channel"
# voltar ao stable:
rm "$DATA/update-channel"
```

`CODM_UPDATE_CHANNEL=beta` (env) sobrepõe o arquivo — uso de CI/teste.

## Portas do app empacotado (desde 2026-08-25/26)

O app instalado **não** usa mais as portas de dev (3030/3032) — essas continuam existindo só para
`bun dev`/`.env.example`. O empacotado tenta uma pequena lista de portas incomuns declaradas em
`packages/app/tauri/config/ports.ts` (`PORT_CANDIDATES`) e fica com a primeira livre; se TODAS
estiverem ocupadas, o boot falha alto e a splash de erro nomeia as portas que foram tentadas — nunca
um "não abriu" genérico. Detalhe completo (contrato, CSP, resolução no boot, como o console
descobre a porta escolhida): seção *"Packaged-app ports — a CANDIDATE list, never a fixed value"*
em `.claude/skills/desktop-shell/SKILL.md`.

Se o app não abrir e a splash de erro citar "every candidate port is already taken": outro processo
neste computador está usando toda a faixa (raro — quatro portas incomuns por sidecar). Feche o
processo concorrente (ou aguarde) e clique "Tentar novamente"; se persistir, é sinal de que a faixa
em `config/ports.ts` colidiu com algo novo no ambiente e merece revisão.

## Plataformas (desde 2026-08-25)

| Plataforma | Instalador (humano) | Artefato de update (o que o `latest.json` aponta) | Assinatura do app | Chave no manifest |
|---|---|---|---|---|
| macOS arm64 | `.dmg` | `.app.tar.gz` + `.sig` | Developer ID + notarização | `darwin-aarch64` |
| Linux x64 | `.AppImage` **ou** `.deb` | `.AppImage` + `.sig` | nenhuma | `linux-x86_64` |
| Windows x64 | `-setup.exe` (NSIS) | `-setup.exe` + `.sig` | nenhuma nesta fase (SmartScreen avisa) | `windows-x86_64` |

A chave **minisign** é a mesma para os três: é a pubkey embarcada (`config/updater.ts`) que cada
app verifica. Fora: Windows arm64 (o libsql não publica prebuild `win32-arm64`) e Linux arm64
(depois; o prebuild existe, falta o runner).

Nomes no R2 (`pub-….r2.dev`), por canal:

| | beta (fixo, rolante) | stable (versionado, retenção total) | alias fixo (landing) |
|---|---|---|---|
| macOS | `beta/codm-aarch64.{dmg,app.tar.gz,app.tar.gz.sig}` | `stable/CODM_vX.Y.Z_aarch64.{dmg,app.tar.gz,app.tar.gz.sig}` | `stable/codm-aarch64.dmg` |
| Linux | `beta/codm-linux-x86_64.{AppImage,AppImage.sig,deb}` | `stable/CODM_vX.Y.Z_linux-x86_64.{AppImage,AppImage.sig,deb}` | `stable/codm-linux-x86_64.{AppImage,deb}` |
| Windows | `beta/codm-windows-x86_64-setup.exe{,.sig}` | `stable/CODM_vX.Y.Z_windows-x86_64-setup.exe{,.sig}` | `stable/codm-windows-x86_64-setup.exe` |

Nomes exatos por trás da notação `{...}` acima (o que os `put` do R2 nos workflows escrevem em
`beta/`; o `release-stable` versiona os mesmos nomes sob `stable/CODM_vX.Y.Z_...`):
`codm-linux-x86_64.AppImage`, `codm-linux-x86_64.AppImage.sig`, `codm-linux-x86_64.deb`,
`codm-windows-x86_64-setup.exe`, `codm-windows-x86_64-setup.exe.sig`.

`latest.json` é **um por canal** com as três plataformas dentro. Se o build de um SO falha, nada é
publicado — um manifest parcial deixaria uma plataforma presa numa versão enquanto as outras
avançam, e o cliente daquela plataforma nunca saberia.

### Linux

- **AppImage é o formato do updater.** O `.deb` existe para quem prefere o gerenciador de pacotes,
  mas **não se auto-atualiza** (o plugin só sabe substituir AppImage): quem instala pelo `.deb`
  atualiza baixando o `.deb` novo. Diga isso na página de download.
- AppImage precisa de FUSE 2 em algumas distros (`sudo apt install libfuse2` no Ubuntu 22.04+; ou
  rode com `--appimage-extract-and-run`). Marque como executável (`chmod +x`) — o browser não faz.
- **Keyring**: o shell guarda a sessão via `keyring` com `sync-secret-service`, que exige um
  Secret Service D-Bus rodando (gnome-keyring, KWallet ≥ 5.97 com o portal, KeePassXC com o
  Secret Service ligado). Sem ele o login não persiste entre aberturas. **Limitação conhecida
  desta fase** — sem fallback em arquivo por enquanto.
- Sem assinatura: não há Gatekeeper/SmartScreen no Linux; a integridade do update é a minisign.
- Runner de build: **self-hosted**, no Mac mini do founder — um container amd64 sob Rosetta
  (`infra/runners/linux-x64/`), desde 2026-08-25. Chave da matriz e do manifest `linux-x86_64`.
- Dados em `~/.local/share/app.codm.desktop/data` (o `app_data_dir` do Tauri + `data`).

### Windows

- Instalador **NSIS** (`-setup.exe`), por usuário, com o WebView2 via *download bootstrapper* —
  a primeira instalação numa máquina sem WebView2 (raro: Win10/11 atualizados já têm) precisa de
  internet. Sem MSI de propósito: o updater instala o NSIS em silêncio; dois formatos seriam dois
  caminhos de update — e, desde 2026-08-26, também é o único formato que a rota de cross-compile
  sabe produzir (abaixo): MSI/WiX não cross-compila.
- **Sem assinatura Authenticode nesta fase.** O SmartScreen mostra "O Windows protegeu o computador"
  → *Mais informações* → *Executar assim mesmo*. O auto-update **não** passa pelo SmartScreen
  (o updater verifica a minisign e roda o instalador em silêncio). Quando a assinatura entrar
  (roadmap: Azure Trusted Signing, ~US$10/mês), o slot é `bundle.windows.signCommand` na conf
  gerada — renderizado por `config/generate.ts` a partir de env, nunca cravado no JSON, pela mesma
  razão que `signingIdentity` fica `'-'` (DSK-10): build local não pode exigir certificado.
- Dados em `%APPDATA%\app.codm.desktop\data`.
- O reaper de órfãos e o desligamento gracioso são diferentes no Windows (não há SIGTERM); o
  daemon é derrubado pelo watchdog de `CODM_PARENT_PID` e pela terminação da árvore — ver o plano
  `.plans/2026-08-25-windows-linux-build.md`.
- **Runner de build: desde 2026-08-26, CROSS-COMPILADO** no MESMO runner self-hosted Linux que
  builda `linux-x86_64` (`infra/runners/linux-x64/`), via `cargo-xwin` — a rota que o próprio
  Tauri v2 documenta para builds Windows-a-partir-de-Linux (`tauri build --runner cargo-xwin
  --target x86_64-pc-windows-msvc`). Diretriz do founder, verbatim: "não podemos contar com o
  billing do GitHub, temos que usar o mac mini" (addendum 2026-08-26 em
  `.specs/2026-08-25-windows-linux-build-design.md`). A rota é **EXPERIMENTAL** por documentação
  do próprio Tauri — aceita pelo founder nesta fase. `windows-latest` não desapareceu: virou
  `.github/workflows/windows-native-tests.yml` (`workflow_dispatch`-only, não-bloqueante), o único
  lugar que ainda executa um Windows nativo — roda os testes `#[cfg(windows)]` do shell e o smoke
  dos sidecars de verdade, coisas que um runner Linux não consegue provar sobre um `.exe` PE que
  acabou de linkar. **A validação manual do NSIS cross-compilado numa máquina Windows real é
  precondição explícita do primeiro stable multi-SO** (AC-15) — nenhum gate automatizado substitui
  essa instalação de verdade. Chave da matriz e do manifest `windows-x86_64`.

## Cortar uma release estável

1. Suba a versão em `packages/app/tauri/src-tauri/tauri.conf.json` **via config gerada** (o campo
   `version` da conf; regenere com `bun desktop:generate` se a fonte mudar de lugar) e commite.
2. `git tag v<X.Y.Z> && git push origin v<X.Y.Z>`.
3. O workflow valida **tag == versão da conf** (diverge ⇒ falha sem publicar, antes de qualquer
   build), builda os três SOs (macOS self-hosted no Mac mini, em paralelo com Linux + Windows
   cross-compilado — os dois últimos no MESMO runner self-hosted Linux, portanto em SÉRIE entre si
   desde 2026-08-26; ver "A matriz de build" abaixo), assina os artefatos de update e — só se os
   três passaram — publica a release com DMG + AppImage + deb + NSIS + `.sig`s + um `latest.json`
   de três plataformas, e sobe tudo ao R2 (versionado + aliases).

O beta não pede nada: mergear na main já publica `<versão-base>-beta.<run>` no canal.

## Repositório público + runner self-hosted (2026-08-26)

Os runners são o **Mac mini do founder** — a mesma máquina que guarda o Developer ID, o container do
runner Linux e os volumes de cache. Enquanto o repositório era privado, só quem já tinha acesso podia
disparar workflow. Público, um PR de fork pode executar código aqui.

O que protege, em três camadas:

1. **Gatilho**: só `correctness.yml` dispara em `pull_request` — os releases saem de `push`/tag, que
   fork nenhum alcança.
2. **Guard no workflow**: os jobs de entrada do `correctness` (`detect`, `changes`) só rodam quando o
   PR vem de um branch DESTE repositório
   (`github.event.pull_request.head.repo.full_name == github.repository`). PR de fork não executa nos
   runners do founder — fica pendente para revisão manual.
3. **Configuração do repositório** (fazer no dashboard, não é código): Settings → Actions → General →
   *Fork pull request workflows from outside collaborators* → **Require approval for all outside
   collaborators**. O default do GitHub aprova automaticamente quem já contribuiu uma vez, o que não
   basta para runner self-hosted.

Segredos o GitHub já não entrega a workflow disparado por fork — o risco aqui é EXECUÇÃO, não
vazamento de secret, e é isso que as três camadas acima endereçam.

## As chaves de assinatura (minisign do Tauri)

- **Pública**: `packages/app/tauri/config/updater.ts` → renderizada na conf. Material público.
- **Privada**: `~/.tauri/codm-updater.key` na máquina do founder **e** secret
  `TAURI_SIGNING_PRIVATE_KEY` no GitHub (Settings → Secrets → Actions). **Nunca no repo.**
- A chave foi gerada com `--ci` (senha vazia): builds fora de TTY exigem
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""` no ambiente — os workflows já o fazem; num build local
  headless, exporte-o também (sem isso: `Device not configured`).
- **Backup é obrigatório**: perder a privada significa que todo app instalado recusará qualquer
  update futuro — o caminho de recuperação é reinstalação manual por todos os usuários.
- Rotação: gerar novo par (`bun x tauri signer generate`), trocar pubkey na config + secret, e
  publicar uma release de transição assinada com a chave antiga que já embarque a nova pubkey.

> Não confunda com a assinatura **Apple** da seção abaixo: minisign autentica o *pacote de
> update*, Developer ID autentica o *app*. São chaves distintas, com backups distintos.

## A assinatura Apple (Developer ID) — 07/08/2026

Antes desta data o app saía **ad-hoc** (`"signingIdentity": "-"`), e isso não era só um aviso do
Gatekeeper: era um defeito funcional. Tudo que o daemon gera é atribuído pelo macOS ao app como
*processo responsável* (o log do `tccd` diz literalmente
`responsible={identifier=app.codm.desktop}`), e os workspaces vivem sob `~/Desktop`, pasta
protegida por TCC. Num app ad-hoc o TCC prende a permissão ao **cdhash** do binário, então **cada
update invalida o acesso ao disco**. Quando isso acontece o pedido parte de um sidecar em segundo
plano, onde o macOS não pode exibir diálogo — ele então *grava* a negação e ela gruda. Medido na
v0.2.0: ~640 negações `System Policy: deny(1) file-read-data /Users/work/Desktop/…` e agentes
morrendo com `provider exited with code 1 (EPERM)`, que é o Bun falhando ao ler o próprio cwd.

**A assinatura do shell É a permissão de disco dos agentes.**

Onde a identidade mora: `tauri.conf.json` é **gerado** (`config/generate.ts`) e commitado, então cravar
o Developer ID nele obrigaria todo build local a ter o certificado. Ele fica com `'-'` — o rail
**DSK-10** guarda isso — e a identidade real chega aos builds de release pela env
`APPLE_SIGNING_IDENTITY`, que sobrepõe o valor da conf.

Essa sobreposição é a premissa que sustenta tudo, e uma sobreposição que falha é **invisível no
artefato**. Por isso os dois workflows conferem a SAÍDA depois do build: `codesign -dv` tem de
reportar `Authority=Developer ID Application`, senão o run falha. Sem esse gate, um secret errado
publicaria um app ad-hoc que só quebra semanas depois, na máquina do usuário, no update seguinte.

- **Identidade**: `Developer ID Application: BK COMPANY LTDA (V4F6T68S5B)`, Team ID `V4F6T68S5B`,
  emitida em 07/08/2026, expira em 08/08/2031.
- **Onde vive**: `~/apple-signing/developer_id.p12` na máquina do founder; cópia em
  `iCloud Drive/CODM - Assinatura Apple/codm-apple-signing-backup.zip`; senhas no Bitwarden
  (item `Apple Developer ID — CODM`). **Nunca no repo.**
- **Secrets do CI**: `APPLE_CERTIFICATE` (o `.p12` em base64), `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_ID`, `APPLE_PASSWORD` (senha de app, não a senha da conta). `APPLE_SIGNING_IDENTITY` e
  `APPLE_TEAM_ID` são literais nos workflows — não são segredo.
- **Entitlements**: ficam como estão. Um executável Bun foi medido rodando sob hardened runtime
  apenas com `com.apple.security.cs.disable-library-validation`; nenhuma entitlement de JIT.

### Emitir um certificado novo

Só é preciso se o `.p12` E a senha se perderem, ou perto de 2031. Custa um dos **5 slots** de
Developer ID da conta, e revogar é chato — então não crie um "por garantia".

```bash
openssl req -new -newkey rsa:2048 -nodes -keyout developer_id.key -out developer_id.csr \
  -subj "/emailAddress=<email>/CN=<nome>/C=BR"
# enviar o .csr em developer.apple.com → Certificates → + → Developer ID Application (perfil G2)
# baixar o .cer e montar o p12 (o intermediário na cadeia é obrigatório, senão o runner falha):
openssl x509 -inform DER -in developerID_application.cer -out developer_id.pem
security find-certificate -a -c "Developer ID Certification Authority" -p | \
  awk '/BEGIN/{f=1} f' > ca.pem   # ficar com o bloco cujo subject tem OU=G2
openssl pkcs12 -export -out developer_id.p12 -inkey developer_id.key \
  -in developer_id.pem -certfile apple_g2_ca.pem
```

Conferir que o `.cer` casa com a chave antes de seguir — os dois md5 têm de bater:

```bash
openssl x509 -inform DER -in developerID_application.cer -noout -modulus | openssl md5
openssl rsa -in developer_id.key -noout -modulus | openssl md5
```

### Recuperar numa máquina nova

Precisa de **duas fontes independentes**: o zip (iCloud) e a senha (Bitwarden). O zip não contém
senha alguma — de propósito, para que sozinho ele não assine nada.

```bash
# 1. descompactar o zip do iCloud, depois:
security import developer_id.p12 -k ~/Library/Keychains/login.keychain-db \
  -P '<senha do Bitwarden>' -T /usr/bin/codesign -T /usr/bin/security
security find-identity -v -p codesigning     # deve listar a identidade acima

# 2. religar o CI — secrets do GitHub são write-only, não voltam sozinhos
base64 -i developer_id.p12 | pbcopy          # → secret APPLE_CERTIFICATE
```

Ensaiado em 07/08/2026 num keychain descartável: import → `find-identity` → assinatura real de um
binário → `codesign -v` devolvendo `valid on disk` com a cadeia até a Apple Root CA.

### Depois de restaurar (ou do primeiro build assinado): o Acesso Total ao Disco

O cdhash muda, então a permissão precisa ser concedida **uma vez**. Limpe a negação gravada antes,
ou o "não" persiste:

```bash
tccutil reset SystemPolicyAllFiles app.codm.desktop
tccutil reset SystemPolicyDesktopFolder app.codm.desktop
# Ajustes do Sistema → Privacidade e Segurança → Acesso Total ao Disco → adicionar CODM.app → reiniciar
```

Suspeita de recaída (`log` é builtin do zsh — sem o caminho absoluto a consulta volta vazia e
parece que não há nada):

```bash
/usr/bin/log show --last 30m --predicate 'eventMessage CONTAINS "deny"' --info --debug \
  | grep "System Policy"
```

## Instalação do beta (texto para a página de download)

A partir dos builds de 07/08/2026 os dois canais são assinados com Developer ID e notarizados:
baixe o DMG (a URL é o alias fixo `codm-aarch64.dmg`, mas o arquivo salva como
`CoDM_<versão>_aarch64.dmg` — o alias sobe com `Content-Disposition` apontando o nome versionado
que o Tauri estampou), arraste para **Aplicativos** e abra normalmente — sem aviso do
Gatekeeper, sem "Abrir Mesmo Assim".

Builds **anteriores** a essa data saíram ad-hoc e ainda exigem o contorno:

1. Abra o app; o macOS bloqueia com *"não foi possível verificar…"*.
2. **Ajustes → Privacidade e Segurança** → role até o aviso do codm → **Abrir Mesmo Assim**.
3. Só na primeira vez: os auto-updates seguintes não passam pelo Gatekeeper (o updater baixa e
   aplica direto, verificando a assinatura minisign própria).

Linux/Windows: formatos, avisos (SmartScreen, libfuse2, deb sem auto-update) e nomes de arquivo na
seção "Plataformas" acima — a landing gera os CTAs por user-agent (task da lane landing).

## Crash logs

Um panic do shell grava `…/app.codm.desktop/data/crashes/shell-<ts>.log` (payload + backtrace,
últimos 20 mantidos). Ao reportar um problema, anexe o mais recente. Telemetria remota: SP4.

## Limitação conhecida — repo privado (decisão do founder, 2026-08-06)

O repo `gabriellst/codm` é PRIVADO e o founder decidiu mantê-lo assim por ora, publicando as
releases NELE mesmo ("somente fazer essa parte do publish depois no mesmo repo"). Consequências:

- **Publicar funciona** — o `GITHUB_TOKEN` nativo dos workflows escreve releases no próprio repo.
- **Consumir NÃO funciona anonimamente** — assets de release em repo privado exigem auth até para
  download, então o check do updater nos apps instalados recebe 404. O auto-update fica
  efetivamente inerte até a parte pública existir.
- Quando chegar a hora do publish público, o caminho já desenhado é um repo público só de
  releases (`codm-releases`): endpoints em `config/updater.ts` + `--repo` nos workflows + um
  secret `RELEASES_TOKEN` (PAT fine-grained com contents:write) — ~15 min de ajuste.
- Alternativa interina para dogfooding, se desejada antes disso: o updater aceita header de auth
  (builder Rust) com um token nas máquinas do founder — não implementado, registrado apenas.

## O que este pipeline NÃO faz (ainda)

Assinatura Authenticode no Windows (SmartScreen avisa — ver "Windows" acima), Windows arm64 e
Linux arm64, rollout percentual, `minVersion` forçado — ver roadmap (SP2/SP4). Desde 2026-08-26,
billing hospedado do GitHub também NÃO faz parte do caminho de release — os três SOs (incluindo o
Windows cross-compilado) rodam inteiramente no Mac mini self-hosted do founder; a única linha que
ainda consome minutos hospedados é `windows-native-tests.yml`, dispatch-only e fora do caminho
crítico de publicar.

## A matriz de build (release-beta / release-stable)

Os dois workflows têm a mesma forma, três jobs:

1. **`prepare`** (self-hosted desde 2026-08-25, segundos) — decide a versão (`<conf>-beta.<run>` ou a tag), confere que
   `packages/app/tauri/src-tauri/shell-env.json` e os demais artefatos gerados do shell estão em
   dia (`bun desktop:generate --check`) e que `VITE_POSTHOG_KEY` está presente. No stable é aqui
   que a tag é comparada com a conf — antes de gastar um minuto de build.
2. **`build`** — uma matriz com **um entry por SO** (chaves `darwin-aarch64`, `linux-x86_64`,
   `windows-x86_64` — as mesmas que o `make-manifest.ts` usa): macOS e Linux compilam NATIVAMENTE
   (o daemon é um `bun build --compile` que só carrega o prebuild nativo do libsql do próprio host
   — `build-sidecars.ts`, "CROSS-TRIPLE GAP" — então o binário nasce no SO em que vai rodar).
   **Desde 2026-08-26, `windows-x86_64` é a exceção: CROSS-COMPILA** no MESMO runner self-hosted
   Linux que builda `linux-x86_64`, via `cargo-xwin` (addendum 2026-08-26 em
   `.specs/2026-08-25-windows-linux-build-design.md` — a rota documentada pelo Tauri v2,
   EXPERIMENTAL, aceita pelo founder para eliminar a exposição a billing hospedado). Os campos
   DECLARADOS `matrix.sidecarTarget`/`matrix.tauriRunner`/`matrix.crossTarget` alimentam
   `build-sidecars.ts --target win32-x64` e `tauri build --runner cargo-xwin --target
   x86_64-pc-windows-msvc` só nessa entrada — vazios nas outras duas, que buildam pro host.
   Cada entrada compila os sidecars e, quando `matrix.smoke` não é `false` (as duas nativas — a
   cross pula: um runner Linux não executa um PE Windows), **sobe os dois e exige 200 no health**
   (`scripts/release/smoke-sidecars.ts` — o gate que um build sozinho não dá). Confere e exporta a
   origem da nuvem lida do `shell-env.json` comitado (`CODM_CLOUD_URL` NÃO é mais uma repo variable
   — é a decisão declarada em `config/cloud.ts`, a mesma que `build.rs` entrega ao supervisor
   Rust), roda `tauri build --bundles <lista>` (macOS `app,dmg`, Linux `appimage,deb`, Windows
   `nsis`; a conf gerada segue com `targets: all`), renomeia os artefatos com o nome fixo da
   plataforma e os sobe como artifact do run.
   Cada entrada da matriz DECLARA um campo booleano `hosted` — desde 2026-08-26 é `false` nas
   TRÊS (nenhuma entrada deste `build` roda mais num runner hospedado do GitHub) — é ele, não
   `runner.os`, que gate-ia os passos de provisionamento (instalar deps de sistema/Rust, cache do
   cargo, `CARGO_TARGET_DIR` fora do workspace): um runner self-hosted já chega com tudo isso
   pronto (imagem do container, no caso do Linux — `infra/runners/linux-x64/`, que desde
   2026-08-26 também carrega `nsis`/`lld`/`llvm`/`clang`, o target `x86_64-pc-windows-msvc` e
   `cargo-xwin`), um runner hospedado não. O campo `hosted` continua existindo para o dia em que
   uma entrada voltar a ser hospedada — não foi removido, só nunca fica `true` hoje. Os passos
   macOS (keychain temporário + codesign dos Mach-O aninhados, `nice`, gate do Developer ID)
   continuam atrás de `if: runner.os == 'macOS'` — essa condição é sobre IDENTIDADE do SO (só o
   macOS assina Apple), não sobre ser ou não hospedado. Nos passos que ainda distinguem por SO
   (`stage`, que copia o bundle certo para cada nome de artefato fixo), o `case` chaveia por
   `matrix.key` — desde que `linux-x86_64` e `windows-x86_64` (cross) rodam as duas num runner
   `runner.os == 'Linux'`, `$RUNNER_OS` sozinho não distingue mais uma da outra.
3. **`publish`** (self-hosted desde 2026-08-25) — baixa os três artifacts, confere a lista completa, gera **um**
   `latest.json` com as três plataformas (`make-manifest.ts --platform … --url … --sig-file …` ×3),
   cria a release no GitHub, sobe ao R2 com o content-type certo (o `latest.json` por último) e
   confere por `HEAD` que cada objeto tem o tamanho do arquivo local — o wrangler já saiu 0 sem
   publicar. A imagem self-hosted não vem com `gh` (só esta job usa; ver
   `infra/runners/linux-x64/Dockerfile`) — um passo baixa o tarball oficial `linux_amd64` para
   `$RUNNER_TEMP` e o entra no `PATH` via `GITHUB_PATH`; instalar de verdade na imagem exigiria
   rebuild, fora do escopo desta migração (custo de runner, não a imagem).

**Custo.** Desde 2026-08-26, **as TRÊS entradas do `build` são self-hosted — zero cota.** macOS e
Linux nativamente desde sempre/2026-08-25; Windows CROSS-COMPILA no mesmo runner Linux desde
2026-08-26 (diretriz do founder: "não podemos contar com o billing do GitHub, temos que usar o mac
mini" — addendum 2026-08-25-windows-linux-build-design.md). As jobs UTILITY `prepare` e `publish`
de `release-beta`/`release-stable` também rodam no mesmo runner Linux self-hosted desde
2026-08-25. **Resultado: a release inteira (beta e stable) não consome mais NENHUM minuto
hospedado do GitHub para publicar.** A única linha que ainda fatura cota é
`windows-native-tests.yml` (`windows-latest`, 2×) — mas é `workflow_dispatch`-only,
não-bloqueante, fora do caminho crítico de release: só roda quando alguém o dispara manualmente.
O `correctness` tem um job `linux` (cargo check + sidecars + smoke) e um job `changes` (o filtro
que decide se `linux` roda) que também rodam no Mac mini self-hosted e não consomem cota; nenhum
job de `correctness` roda num Windows nativo — quem valida isso é `windows-native-tests.yml`, sob
demanda. **O trade-off de custo virou trade-off de wall-clock**: `prepare`, `linux-x86_64`,
`windows-x86_64` (cross) e `publish` disputam o MESMO runner `[self-hosted, Linux, X64]`, então
rodam em SÉRIE entre si (só o build macOS corre em paralelo, noutro runner) — o tunable é um
SEGUNDO container/runner Linux, não implementado nesta fase (ver o comentário na entrada
`windows-x86_64` de release-beta.yml). `publish` ainda exige os três builds via `needs`, então uma
falha em qualquer um segue derrubando a release inteira (D4: sem manifest parcial).

**Cache.** `Swatinem/rust-cache` só roda **quando `matrix.hosted`** (o campo DECLARADO, não
`runner.os != 'macOS'`): runners hospedados são descartáveis, e a poda de `~/.cargo/bin` que
apagou o `rustup` do founder (abaixo) não tem vítima lá. Desde 2026-08-26 nenhuma entrada do
`build` é hospedada, então esta condição nunca é `true` hoje neste workflow — o campo continua
declarado para o dia em que uma entrada voltar a ser hospedada (ex.: um runner offline — ver
"Runner self-hosted" abaixo).

**Windows, três pegadinhas** históricas de quando `windows-latest` era o runner do `build` (hoje
só relevantes para `windows-native-tests.yml`, que ainda roda num Windows nativo): o shell default
é pwsh (`defaults.run.shell: bash` força git-bash em todo passo); os sidecars ganham `.exe`
(build-sidecars.ts já faz); e não existe `nice` — é um campo da matriz, vazio fora do Mac. A
entrada `windows-x86_64` do `build` não sofre mais nenhuma delas — ela é um runner Linux.

## Runner self-hosted (macOS + Linux)

Os builds macOS (`release-beta`, `release-stable`) rodam num **runner self-hosted** no Mac mini do
founder desde o início, não nos runners do GitHub. A razão é custo: repo privado consome cota,
macOS conta **10×**, e em 2026-08-07 isso estourou o teto (57 builds macOS num dia ≈ 3.250 minutos
faturados contra 2.000 disponíveis), derrubando TODOS os workflows — inclusive os de Linux, que
eram baratos. Minutos de runner self-hosted não contam na cota.

Desde 2026-08-25 os builds **Linux** (`release-beta`, `release-stable`, e o job `linux` de
`correctness`) também rodam self-hosted, no MESMO Mac mini — não mais num `ubuntu-22.04`
hospedado. A razão é a mesma: o job Linux custava ~10 min de cota hospedada por execução (1×), e
virou zero. Como o daemon não cross-compila (o mesmo "CROSS-TRIPLE GAP" do libsql), o Linux x64
roda dentro de um **container amd64 sob Rosetta** — `infra/runners/linux-x64/` tem o Dockerfile e
o runbook completo de como subir a imagem no mini, incluindo os volumes que mantêm o cache do
cargo quente entre execuções.

Na mesma data, a auditoria coordenada com o founder estendeu a migração às jobs **UTILITY** — as
que não fazem parte da matriz por SO, mas custavam minutos hospedados mesmo assim: `prepare` e
`publish` em `release-beta.yml`/`release-stable.yml`, e `changes` em `correctness.yml`. Nenhuma
delas builda nada — só git/bash/jq (`changes`, `prepare`) ou baixa artifacts e fala com GitHub/R2
(`publish`) — então rodam no MESMO runner `[self-hosted, Linux, X64]` do job `linux`/da entrada
`linux-x86_64`, sem provisionamento extra, exceto por uma exceção pontual: a imagem self-hosted
não vem com `gh` (só `publish` usa), e o job baixa o tarball oficial para `$RUNNER_TEMP` em vez de
reconstruir a imagem — ver o comentário no próprio workflow.

**Desde 2026-08-26 o Windows TAMBÉM saiu do runner hospedado.** Não há como rodar um runner
Windows nativo no Mac mini — mas não precisa mais: a entrada `windows-x86_64` CROSS-COMPILA no
MESMO runner `[self-hosted, Linux, X64]` via `cargo-xwin` (rota documentada pelo Tauri v2,
EXPERIMENTAL, aceita pelo founder — addendum 2026-08-26 em
`.specs/2026-08-25-windows-linux-build-design.md`; diretriz verbatim: "não podemos contar com o
billing do GitHub, temos que usar o mac mini"). A imagem `infra/runners/linux-x64/` carrega
`nsis`/`lld`/`llvm`/`clang`, o target `x86_64-pc-windows-msvc` e `cargo-xwin` pré-instalados — ver
"Papel de cross-compile Windows" em `infra/runners/linux-x64/README.md`. Isso remove o ÚLTIMO
gasto de cota hospedada da release: as três entradas do `build`, mais `prepare`/`publish`, rodam
inteiramente self-hosted. O custo que sobra virou wall-clock, não dinheiro — `linux-x86_64` e
`windows-x86_64` disputam o MESMO runner Linux físico e rodam em série entre si (ver "Custo" em "A
matriz de build" acima). `windows-latest` não desapareceu do repo: sobrevive como
`.github/workflows/windows-native-tests.yml`, `workflow_dispatch`-only e fora do caminho de
release — o único lugar que ainda paga o multiplicador 2×, e só quando alguém o dispara.

A máquina já era o ambiente de build do macOS: mesmo toolchain, a chave de assinatura mora nela, e
os caches de cargo/bun ficam quentes entre execuções. O runner Linux é um processo separado —
outro container, outro registro no GitHub com labels `self-hosted,Linux,X64` — na MESMA máquina
física; os dois dividem CPU/memória entre si e com o daemon de produção do founder.

**Não espere que fique mais rápido de imediato — em nenhum dos dois.** O primeiro build macOS
self-hosted levou 11,9 min contra ~5,7 no runner do GitHub — `actions/checkout` roda `git clean
-ffdx`, então cada execução começa sem `node_modules` e recompila o Rust do zero. O Linux tem o
mesmo efeito, mais a tradução Rosetta por cima (x64 sob Rosetta: o `cargo build` é a parte
CPU-bound, e é onde o overhead aparece — ver `infra/runners/linux-x64/README.md`, "Nota de
performance"). O ganho vem das execuções seguintes, quando os caches de cargo/bun estão quentes; e
o `nice -n 10` nos passos pesados do macOS faz o CI ceder CPU ao daemon de produção — o container
Linux não usa `nice` (o campo da matriz fica vazio nessa entrada; ver "A matriz de build" acima).

**Se um runner estiver offline**, os jobs daquele SO ficam na fila em vez de falhar. Para publicar
mesmo assim, troque `runs-on: [self-hosted, macOS, ARM64]` por `macos-14`, ou `runs-on:
[self-hosted, Linux, X64]` por `ubuntu-22.04`, no workflow — e conte com o custo em minutos (10×
macOS, 1× Linux). Como `linux-x86_64` e `windows-x86_64` (cross) compartilham o MESMO runner Linux,
o container offline enfileira as DUAS entradas juntas; o `ubuntu-22.04` hospedado como fallback
também serve para a `windows-x86_64` — o runner hospedado do GitHub tem `cargo`/`rustup` via
`dtolnay/rust-toolchain@stable` (gate `matrix.hosted`), mas NÃO vem com `nsis`/`cargo-xwin`
pré-instalados como a imagem self-hosted: um fallback hospedado da entrada Windows precisaria
reinstalar essas duas peças manualmente antes do `tauri build --runner cargo-xwin`, ou aceitar o
tempo de reinstalação a cada run.

**Antes de tornar este repositório público**, remova os DOIS runners self-hosted: um PR de fork
passaria a executar código arbitrário na máquina. As duas decisões são mutuamente exclusivas.

### A janela do DMG precisa do Finder — e o Finder pede permissão uma vez

O fundo e a posição dos ícones do DMG ("arraste para instalar", `packages/app/tauri/config/dmg.ts`)
não são metadados do arquivo: o bundler do Tauri os aplica **abrindo o volume no Finder por
AppleScript** e deixando o Finder gravar o `.DS_Store`. Em `CI=true` o bundler pula esse passo
(`--skip-jenkins`, tauri#592) — foi assim que a v0.5.3 saiu com o `background.png` dentro do DMG e a
janela crua mesmo assim. Os dois workflows ligam `TAURI_BUNDLER_DMG_IGNORE_CI=true` na perna macOS,
o que só funciona porque o runner é um LaunchAgent **na sessão gráfica** do mini (`launchctl print
gui/$(id -u)` lista `actions.runner.gabriellst-codm.codm-macmini`).

Controlar o Finder é Automação (TCC), e o cliente que o macOS enxerga **não é o `Runner.Listener`:
é o `node` com que o runner executa os passos `run:`** — medido:
`/Users/gabriel/actions-runner/externals/node20/bin/node → com.apple.finder`. Como é um binário
solto e não um app, **o diálogo de permissão não aparece**: o Apple Event fica pendurado 2 min (o
timeout padrão), o macOS grava a negação (`auth_value 0`) e o bundler sai com `exit 64` — no log só
"failed to run bundle_dmg.sh", 2 min depois de "Running bundle_dmg.sh". Foi assim no primeiro run
(beta 32940209483, 2026-08-26). Não há fallback: a release fica vermelha.

1. Deixe o primeiro build falhar (é ele que cria a entrada), depois em **Ajustes do Sistema →
   Privacidade e Segurança → Automação → `node` → ligue "Finder"** e rode o job macOS de novo. O
   grant é permanente para aquele caminho de `node`.
2. **Trocar o `node` do runner recria o problema**: quando o runner migrar de `externals/node20`
   para `node24` (o GitHub já avisa no log), o cliente muda de caminho, a permissão não vale mais e o
   próximo DMG falha do mesmo jeito — repita o passo 1 para o `node` novo.
3. Conferir o estado sem abrir Ajustes:
   `sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db "select client,indirect_object_identifier,auth_value from access where service='kTCCServiceAppleEvents'"`
   — `auth_value` 2 = permitido, 0 = negado. Entradas de `sshd-keygen-wrapper` são do ssh, não do runner.
4. Prova de que funcionou: o DMG montado tem `.DS_Store` ao lado de `.background/` e a janela abre
   com a seta entre os ícones (o `.background/` sozinho não prova nada — a v0.5.3 o tinha).

### O CI agora escreve na SUA máquina — actions de cache são o risco real

Num runner descartável, uma action que "limpa" o ambiente não tem vítima. Aqui tem, e a primeira
apareceu no primeiro build: `Swatinem/rust-cache@v2` **apagou o binário `rustup`** de
`~/.cargo/bin` no passo `Post Run`, deixando `cargo`, `rustc` e `rustfmt` como symlinks pendurados.
A action faz isso por design — poda `~/.cargo/bin` para salvar um cache enxuto, partindo do
princípio de que a máquina é descartável.

O que torna isso traiçoeiro é a distância entre causa e sintoma: **o build que causou o estrago
passou**, verde. Quem falhou foi o workflow seguinte, com `Executable not found in $PATH: "cargo"`,
e o desenvolvimento local teria falhado igual na próxima vez que alguém rodasse `bun contracts`.

A action foi removida dos passos dos runners self-hosted e **não deve voltar a eles** (nem ao
macOS, nem ao Linux — o mesmo incidente vale para qualquer runner persistente). Ela só roda quando
o campo DECLARADO `matrix.hosted` é `true` — hoje só a entrada Windows: lá o runner é descartável e
a poda de `~/.cargo/bin` não tem vítima. Num runner persistente ela não tem função: o disco já
persiste. O `target/` do Rust — a única coisa que o `git clean -ffdx` do checkout apagaria — vive
fora do workspace via `CARGO_TARGET_DIR`, e sobrevive sem action nenhuma, nos dois self-hosted.

Para reparar, se acontecer de novo (as toolchains em `~/.rustup` sobrevivem; falta só o shim):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
```

A regra geral: ao adicionar qualquer action de cache/setup a estes workflows, verifique o que o
passo `Post` dela escreve **fora** do workspace. Dentro do workspace é descartável; no `$HOME`, é a
máquina do founder.

`correctness` e `deploy-landing` **também** migraram para o runner self-hosted, e essa é a parte
contraintuitiva: os dois rodam em Linux com multiplicador 1× e nunca foram o problema de custo. Mas a
cota é **uma só para a conta inteira** — quando o macOS a esgotou, esses dois pararam junto, e o gate
de merge deixou de existir. Enquanto a cota não reseta, mantê-los na nuvem significa mantê-los
mortos.

O trade-off é real e vale dizer em voz alta: o gate de merge agora depende do Mac mini estar ligado.
Na prática ele está ligado exatamente quando há merge para gatear (é a máquina de trabalho), mas se o
`correctness` ficar `queued` para sempre, a causa é essa. Voltar qualquer um deles à nuvem é trocar
uma linha por `ubuntu-latest`.
