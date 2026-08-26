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

### Checksums

Cada release publica um **`SHA256SUMS.txt`** — uma linha por artefato, formato padrão do
`sha256sum`, com os MESMOS nomes dos assets. É gerado no job `publish` a partir dos arquivos que ele
tem em mãos, **antes** de qualquer upload: um checksum recalculado depois de publicar descreveria com
a mesma naturalidade um arquivo corrompido.

- Anexado à release do GitHub (nos dois canais) e subido ao R2: `beta/SHA256SUMS.txt` e
  `stable/SHA256SUMS.txt` (alias fixo, o que a landing linka) mais `stable/CODM_vX.Y.Z_SHA256SUMS.txt`
  (versionado, mesma retenção total dos demais artefatos do stable).
- Content-Type `text/plain` e **sem** `Content-Disposition`: a lista abre no navegador em vez de
  virar um download que ninguém olha.
- Existe por causa do Windows: sem Authenticode, o SmartScreen chama o instalador de suspeito e o
  checksum é o único meio que oferecemos a quem prefere conferir o arquivo a confiar na palavra de
  um site. Quem baixa tudo numa pasta roda `sha256sum -c SHA256SUMS.txt` (Linux/git-bash) ou
  `shasum -a 256 -c SHA256SUMS.txt` (macOS).

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
- Runner de build: **`ubuntu-latest` hospedado**, nativo x86_64 (entre 25/08 e 26/08/2026 foi um
  container amd64 sob Rosetta no Mac mini — ver "Runners", abaixo). Chave da matriz e do manifest
  `linux-x86_64`. O glibc da imagem do runner é o **piso** do AppImage: linkado numa 24.04 ele não
  roda numa 22.04. Se aparecer relato de `GLIBC_2.3x not found`, o conserto é fixar a entrada da
  matriz em `ubuntu-22.04` — ao custo de essa imagem estar em fim de vida no GitHub.
- Dados em `~/.local/share/app.codm.desktop/data` (o `app_data_dir` do Tauri + `data`).

### Windows

- Instalador **NSIS** (`-setup.exe`), por usuário, com o WebView2 via *download bootstrapper* —
  a primeira instalação numa máquina sem WebView2 (raro: Win10/11 atualizados já têm) precisa de
  internet. Sem MSI de propósito: o updater instala o NSIS em silêncio, e dois formatos seriam dois
  caminhos de update.
- **Sem assinatura Authenticode nesta fase.** O SmartScreen mostra "O Windows protegeu o computador"
  → *Mais informações* → *Executar assim mesmo*. O auto-update **não** passa pelo SmartScreen
  (o updater verifica a minisign e roda o instalador em silêncio). Quando a assinatura entrar
  (candidatura ao SignPath Foundation em aberto; alternativa paga: Azure Trusted Signing), o slot é
  `bundle.windows.signCommand` na conf gerada — renderizado por `config/generate.ts` a partir de
  env, nunca cravado no JSON, pela mesma razão que `signingIdentity` fica `'-'` (DSK-10): build
  local não pode exigir certificado. Enquanto isso, quem quiser conferir o arquivo antes de
  executar usa o `SHA256SUMS.txt` publicado ao lado dos instaladores (ver "Checksums", abaixo).
- Dados em `%APPDATA%\app.codm.desktop\data`.
- O reaper de órfãos e o desligamento gracioso são diferentes no Windows (não há SIGTERM); o
  daemon é derrubado pelo watchdog de `CODM_PARENT_PID` e pela terminação da árvore — ver o plano
  `.plans/2026-08-25-windows-linux-build.md`.
- **Runner de build: `windows-latest` hospedado, NATIVO.** Entre 25/08 e 26/08/2026 esta perna foi
  cross-compilada num runner Linux via `cargo-xwin` (rota que o Tauri v2 documenta como
  EXPERIMENTAL), porque o billing hospedado do GitHub estava indisponível. Com o repositório
  público os runners voltaram a ser gratuitos, e o cross saiu inteiro: `--runner cargo-xwin`,
  `--target x86_64-pc-windows-msvc` e o modo `--target` do `build-sidecars.ts`. O que o
  cross-compile nunca conseguiu provar — que o PE executa — agora roda no fluxo normal e **gateia a
  release**: os testes `#[cfg(windows)]` do shell (`cargo test --lib`) e o smoke dos sidecars
  (health 200 do daemon e do gateway) acontecem nesta perna, que era o conteúdo do antigo
  `windows-native-tests.yml` (`workflow_dispatch`-only, apagado). Continua valendo a AC-15: instalar
  o `-setup.exe` numa máquina Windows real, abrir e ver daemon/gateway subirem é precondição do
  primeiro stable multi-SO — nenhum gate automatizado substitui a instalação de verdade. Chave da
  matriz e do manifest `windows-x86_64`.

## Cortar uma release estável

1. Suba a versão em `packages/app/tauri/src-tauri/tauri.conf.json` **via config gerada** (o campo
   `version` da conf; regenere com `bun desktop:generate` se a fonte mudar de lugar) e commite.
2. `git tag v<X.Y.Z> && git push origin v<X.Y.Z>`.
3. O workflow valida **tag == versão da conf** (diverge ⇒ falha sem publicar, antes de qualquer
   build), builda os três SOs **em paralelo**, cada um no seu runner hospedado (ver "A matriz de
   build" abaixo), assina os artefatos de update e — só se os três passaram — publica a release com
   DMG + AppImage + deb + NSIS + `.sig`s + `SHA256SUMS.txt` + um `latest.json` de três plataformas,
   e sobe tudo ao R2 (versionado + aliases).

O beta não pede nada: mergear na main já publica `<versão-base>-beta.<run>` no canal.

## Repositório público (2026-08-26)

O repositório ficou **público** em 2026-08-26 (candidatura ao SignPath Foundation). Duas
consequências práticas, nesta ordem de importância:

1. **Actions passou a ser gratuito e ilimitado** nos runners hospedados do GitHub — Linux, Windows e
   macOS. Todo o aparato self-hosted existia por cota; ele saiu no mesmo dia (ver "Runners" abaixo).
2. **O risco de PR de fork executar código na máquina do founder desapareceu junto** — não porque
   foi mitigado, mas porque não há mais job rodando nessa máquina no caminho de merge/release. Era
   por isso que os jobs de entrada do `correctness` ganharam, por algumas horas, um guard
   `head.repo.full_name == github.repository`; o guard saiu com o self-hosted.

A política **Settings → Actions → General → *Fork pull request workflows from outside collaborators*
→ "Require approval for all outside collaborators"** continua ligada e continua valendo — o default
do GitHub aprova automaticamente quem já contribuiu uma vez, e isso não basta nem para runner
hospedado (um fork pode consumir tempo de CI e ler o que o workflow imprime). Segredos o GitHub já
não entrega a workflow disparado por fork.

> Um job self-hosted ainda existe no repositório: `deploy-landing.yml`. Ele dispara só em
> `push`/dispatch (fork nenhum alcança), mas o deploy da landing segue dependendo do Mac mini estar
> ligado — decisão em aberto para o founder, fora do escopo da migração dos releases.

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

## Por que o R2 é a origem pública (e continua sendo)

Entre 06/08 e 26/08/2026 o repositório era privado, e assets de release em repo privado exigem auth
até para baixar: o check do updater nos apps instalados recebia 404. A saída foi publicar os
artefatos também no **R2** (`pub-….r2.dev`) e apontar `config/updater.ts` para lá.

O repositório ficou público em 26/08 e os assets do GitHub voltam a ser baixáveis anonimamente — mas
**o R2 continua sendo a origem**, e não por inércia: a URL do manifest está **embarcada em todo app
já instalado** (`config/updater.ts` é compilado dentro do binário). Trocar a origem hoje deixaria
para trás exatamente quem já usa o produto. A release do GitHub segue existindo, com os mesmos
arquivos, como espelho e histórico.

## O que este pipeline NÃO faz (ainda)

Assinatura Authenticode no Windows (SmartScreen avisa — ver "Windows" acima), Windows arm64 e
Linux arm64, rollout percentual, `minVersion` forçado — ver roadmap (SP2/SP4).

## A matriz de build (release-beta / release-stable)

Os dois workflows têm a mesma forma, três jobs:

1. **`prepare`** (`ubuntu-latest`, segundos) — decide a versão (`<conf>-beta.<run>` ou a tag), confere que
   `packages/app/tauri/src-tauri/shell-env.json` e os demais artefatos gerados do shell estão em
   dia (`bun desktop:generate --check`) e que `VITE_POSTHOG_KEY` está presente. No stable é aqui
   que a tag é comparada com a conf — antes de gastar um minuto de build.
2. **`build`** — uma matriz com **um entry por SO** (chaves `darwin-aarch64`, `linux-x86_64`,
   `windows-x86_64` — as mesmas que o `make-manifest.ts` usa), cada uma no seu runner hospedado
   (`macos-latest`, `ubuntu-latest`, `windows-latest`), **em paralelo**. Todas compilam
   NATIVAMENTE, e isso não é preferência estética: o daemon é um `bun build --compile` que carrega
   o prebuild nativo do libsql resolvido do node_modules do próprio host (`build-sidecars.ts`,
   "CROSS-TRIPLE GAP"), então o binário precisa nascer no SO em que vai rodar.
   Cada entrada compila os sidecars e **sobe os dois exigindo 200 no health**
   (`scripts/release/smoke-sidecars.ts` — o gate que um build sozinho não dá); a perna Windows roda
   ainda `cargo test --lib`, os testes `#[cfg(windows)]` do shell. Confere e exporta a origem da
   nuvem lida do `shell-env.json` comitado (`CODM_CLOUD_URL` NÃO é uma repo variable — é a decisão
   declarada em `config/cloud.ts`, a mesma que `build.rs` entrega ao supervisor Rust), roda
   `tauri build --bundles <lista>` (macOS `app,dmg`, Linux `appimage,deb`, Windows `nsis`; a conf
   gerada segue com `targets: all`), renomeia os artefatos com o nome fixo da plataforma e os sobe
   como artifact do run.
   **Provisionamento**: runner hospedado chega cru, então cada perna instala o que precisa — deps de
   sistema do Tauri no Linux (`if: runner.os == 'Linux'`, a lista canônica com webkit2gtk 4.1,
   libdbus-1-dev e patchelf), `dtolnay/rust-toolchain` + `Swatinem/rust-cache`, Go e Bun. Os passos
   macOS (keychain temporário + codesign dos Mach-O aninhados, gate do Developer ID, o `uname -m`
   que confirma que o runner é arm64) ficam atrás de `if: runner.os == 'macOS'` — condição de
   IDENTIDADE do SO, não de tipo de runner. O `stage` chaveia por `matrix.key`, não por
   `$RUNNER_OS`: a chave da matriz É a chave do manifest.
3. **`publish`** (`ubuntu-latest`) — baixa os três artifacts, confere a lista completa, gera **um**
   `latest.json` com as três plataformas (`make-manifest.ts --platform … --url … --sig-file …` ×3)
   e o `SHA256SUMS.txt` dos arquivos que tem em mãos, cria a release no GitHub, sobe ao R2 com o
   content-type certo (o `latest.json` por último) e confere por `HEAD` que cada objeto tem o
   tamanho do arquivo local — o wrangler já saiu 0 sem publicar.

**Custo.** Zero: repositório público, runners hospedados gratuitos e ilimitados nos três SOs. As
três pernas correm **em paralelo**, em máquinas diferentes — é por isso que os ~356 MB de artefatos
viajam entre `build` e `publish` (não mexa nisso: sem a viagem, `publish` não teria como juntar o
que três máquinas produziram). `publish` exige os três builds via `needs`, então uma falha em
qualquer um derruba a release inteira (D4: sem manifest parcial).

**Windows, as pegadinhas de um runner nativo** (voltaram junto com ele): o shell default é pwsh —
`defaults.run.shell: bash` força git-bash em todo passo, e sem isso `||`, `test` e heredoc falham,
às vezes em silêncio; e os sidecars ganham `.exe` (o `build-sidecars.ts` deriva isso da linha do
target, não de um `if`).

## Runners

**Hoje: todos hospedados pelo GitHub.** `macos-latest` (arm64), `ubuntu-latest`, `windows-latest`
para o `build`; `ubuntu-latest` para `prepare`/`publish` e para os três jobs do `correctness`.
Repositório público ⇒ Actions gratuito e ilimitado, inclusive nos multiplicadores caros.

**A história, porque ela explica o formato dos workflows.** Entre 07/08 e 26/08/2026 os releases
rodaram no Mac mini do founder. A razão era cota: repositório privado fatura minutos, macOS conta
**10×**, e em 2026-08-07 isso estourou o teto (57 builds macOS num dia ≈ 3.250 minutos faturados
contra 2.000 disponíveis) e derrubou TODOS os workflows — inclusive os baratos, porque a cota é uma
só para a conta. Minutos self-hosted não contavam, então macOS foi primeiro, Linux depois
(2026-08-25, num container amd64 sob Rosetta), e por fim o Windows (2026-08-26), que não tem como
rodar nativo num Mac e virou um cross-compile por `cargo-xwin`. No mesmo 26/08 o repositório ficou
público, o custo evaporou, e tudo isso foi desfeito.

**O que saiu junto** — vale saber, porque cada peça existia por causa de uma restrição que não
existe mais:

- o **cross-compile do Windows** (`--runner cargo-xwin`, `--target x86_64-pc-windows-msvc`, o modo
  `--target` do `build-sidecars.ts`) e o `windows-native-tests.yml` que compensava o que ele não
  conseguia provar — hoje a perna é nativa e prova sozinha;
- o **container Linux sob Rosetta** (`infra/runners/linux-x64/`) e toda a pilha que o Rosetta
  exigia: patch dos bytes de magic do linuxdeploy, wrapper de `ldd`, `--sysctl
  net.ipv6.conf.lo.disable_ipv6=1`, reconciliação de toolchain no entrypoint, volumes com dono
  errado. Numa máquina Linux real nada disso é problema;
- o **`security unlock-keychain`** com `MACMINI_KEYCHAIN_PASSWORD` (o keychain de login do mini
  ficava travado quando a sessão não estava desbloqueada) e a **concurrency `release-signing-macos`**
  (dois `codesign` concorrentes disputavam a MESMA lista de busca de keychain — corrida que só
  existe quando os dois jobs são a mesma máquina; num runner efêmero cada job tem o seu);
- o **`CARGO_TARGET_DIR` fora do workspace** (era o que sobrevivia ao `git clean -ffdx` entre
  execuções), a limpeza de bundles acumulados entre runs que ele tornava necessária, e o `nice -n
  10` (o CI cedia CPU ao daemon de produção do founder, que roda na mesma máquina);
- a **serialização**: `prepare`, `linux-x86_64`, `windows-x86_64` e `publish` disputavam um único
  runner Linux e rodavam em série. A v0.5.4 levou ~35 min de wall-clock para ~10 de compute.

**A lição que sobrevive**, para o dia em que alguém voltar a apontar um workflow para uma máquina
persistente: `Swatinem/rust-cache@v2` **apagou o binário `rustup`** de `~/.cargo/bin` no passo
`Post Run` de 2026-08-07, deixando `cargo`/`rustc`/`rustfmt` como symlinks pendurados. A action faz
isso por design — poda `~/.cargo/bin` para salvar um cache enxuto, partindo do princípio de que a
máquina é descartável. O traiçoeiro é a distância entre causa e sintoma: o build que causou o
estrago passou verde, e quem falhou foi o workflow seguinte, com `Executable not found in $PATH:
"cargo"`. Reparo: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
--no-modify-path`. **Regra geral: ao adicionar qualquer action de cache/setup, verifique o que o
passo `Post` dela escreve FORA do workspace.** Num runner hospedado, nada sobrevive ao job e a
action é inofensiva — é por isso que ela está de volta nos três `build`.

**Se precisar voltar uma perna para o mini** (o cenário previsto é o DMG — ver a seção seguinte):
troque o `runner:` daquela entrada da matriz por `["self-hosted", "macOS", "ARM64"]` via
`fromJSON`, reponha os passos self-hosted que esta seção lista (keychain, `CARGO_TARGET_DIR`,
`nice`) e leia de novo a lição acima antes de deixar qualquer action de cache no caminho. É uma
perna de cada vez, não a migração inteira.

### A janela do DMG precisa do Finder — e o Finder pede permissão uma vez

O fundo e a posição dos ícones do DMG ("arraste para instalar", `packages/app/tauri/config/dmg.ts`)
não são metadados do arquivo: o bundler do Tauri os aplica **abrindo o volume no Finder por
AppleScript** e deixando o Finder gravar o `.DS_Store`. Em `CI=true` o bundler pula esse passo
(`--skip-jenkins`, tauri#592) — foi assim que a v0.5.3 saiu com o `background.png` dentro do DMG e a
janela crua mesmo assim. Os dois workflows ligam `TAURI_BUNDLER_DMG_IGNORE_CI=true` na perna macOS —
**e essa linha continua necessária no runner hospedado**: a variável é sobre `CI=true`, não sobre
quem é a máquina.

> **O QUE VERIFICAR NO PRIMEIRO BUILD MACOS HOSPEDADO (2026-08-26).** No Mac mini isso funcionava
> porque o runner era um LaunchAgent **na sessão gráfica** e recebeu, à mão, um grant de Automação →
> Finder. Um runner hospedado do GitHub não tem esse grant, e pode nem ter sessão gráfica utilizável
> para o AppleScript. Dois desfechos possíveis: o DMG sai **cru** (background copiado, sem
> `.DS_Store`), ou o bundler morre com `exit 64` ("failed to run bundle_dmg.sh"). **A decisão, já
> tomada: nesse caso volta SÓ a perna macOS para o mini** (ver "Se precisar voltar uma perna para o
> mini", acima) — não se desfaz a migração de Linux e Windows, que não dependem de Finder nenhum.
> Prova de que deu certo: o DMG montado tem `.DS_Store` ao lado de `.background/` e a janela abre com
> a seta entre os ícones (o `.background/` sozinho não prova nada — a v0.5.3 o tinha).

O restante desta seção é o runbook do **runner self-hosted**, guardado para o caso acima. Controlar
o Finder é Automação (TCC), e o cliente que o macOS enxerga **não é o `Runner.Listener`: é o `node`
com que o runner executa os passos `run:`** — medido:
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

## O gate de merge (correctness)

`correctness.yml` roda em `ubuntu-latest` nos três jobs (`detect`, `changes`, `linux`) desde
2026-08-26 — antes disso esteve no Mac mini, pelo mesmo motivo de cota dos releases (a cota é uma só
para a conta: quando os builds macOS a esgotaram em 2026-08-07, este workflow barato parou junto e o
repositório ficou sem gate). De volta ao hospedado, o gate não depende mais de nenhuma máquina estar
ligada.

`detect` roda `bun run detect`, `bun tsc` e `bun run test` — e `bun run test` inclui `app-tauri:test`
(cargo test do shell, com `dependsOn: sidecars`) e `client:test` (cargo test da SDK rust), então o
job provisiona Go, Rust, cache do cargo e as libs de sistema do Tauri. `linux` compila os sidecars,
faz `cargo check` do shell e roda o smoke; ele é filtrado pelo job `changes`, cujo path-set é preso
ao do `release-beta.yml` por `scripts/release/workflow-paths.test.ts`.
