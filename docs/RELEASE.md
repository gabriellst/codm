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
- Runner de build: `ubuntu-22.04` hospedado, chave da matriz e do manifest `linux-x86_64`.
- Dados em `~/.local/share/app.codm.desktop/data` (o `app_data_dir` do Tauri + `data`).

### Windows

- Instalador **NSIS** (`-setup.exe`), por usuário, com o WebView2 via *download bootstrapper* —
  a primeira instalação numa máquina sem WebView2 (raro: Win10/11 atualizados já têm) precisa de
  internet. Sem MSI de propósito: o updater instala o NSIS em silêncio; dois formatos seriam dois
  caminhos de update.
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

## Cortar uma release estável

1. Suba a versão em `packages/app/tauri/src-tauri/tauri.conf.json` **via config gerada** (o campo
   `version` da conf; regenere com `bun desktop:generate` se a fonte mudar de lugar) e commite.
2. `git tag v<X.Y.Z> && git push origin v<X.Y.Z>`.
3. O workflow valida **tag == versão da conf** (diverge ⇒ falha sem publicar, antes de qualquer
   build), builda nos três SOs em paralelo (macOS self-hosted, Linux e Windows hospedados), assina
   os artefatos de update e — só se os três passaram — publica a release com DMG + AppImage + deb +
   NSIS + `.sig`s + um `latest.json` de três plataformas, e sobe tudo ao R2 (versionado + aliases).

O beta não pede nada: mergear na main já publica `<versão-base>-beta.<run>` no canal.

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
Linux arm64, rollout percentual, `minVersion` forçado — ver roadmap (SP2/SP4).

## A matriz de build (release-beta / release-stable)

Os dois workflows têm a mesma forma, três jobs:

1. **`prepare`** (ubuntu, segundos) — decide a versão (`<conf>-beta.<run>` ou a tag) e confere os
   insumos que produzem um app quebrado em silêncio (`CODM_CLOUD_URL`, `VITE_POSTHOG_KEY`). No
   stable é aqui que a tag é comparada com a conf — antes de gastar um minuto de build.
2. **`build`** — uma matriz com **um runner por SO, sem cross-compile** (chaves `darwin-aarch64`,
   `linux-x86_64`, `windows-x86_64` — as mesmas que o `make-manifest.ts` usa): o daemon é um `bun
   build --compile` que só carrega o prebuild nativo do libsql do próprio host (`build-sidecars.ts`,
   "CROSS-TRIPLE GAP"), então cada binário nasce no SO em que vai rodar. Cada entrada instala as
   deps do SO, compila os sidecars, **sobe os dois e exige 200 no health** (`scripts/release/
   smoke-sidecars.ts` — o gate que um build sozinho não dá), roda `tauri build --bundles <lista>`
   (macOS `app,dmg`, Linux `appimage,deb`, Windows `nsis`; a conf gerada segue com `targets: all`),
   renomeia os artefatos com o nome fixo da plataforma e os sobe como artifact do run.
   Os passos macOS (keychain temporário + codesign dos Mach-O aninhados, `nice`, `target/` fora do
   workspace, gate do Developer ID) ficam atrás de `if: runner.os == 'macOS'`.
3. **`publish`** (ubuntu) — baixa os três artifacts, confere a lista completa, gera **um**
   `latest.json` com as três plataformas (`make-manifest.ts --platform … --url … --sig-file …` ×3),
   cria a release no GitHub, sobe ao R2 com o content-type certo (o `latest.json` por último) e
   confere por `HEAD` que cada objeto tem o tamanho do arquivo local — o wrangler já saiu 0 sem
   publicar.

**Custo.** macOS é self-hosted (zero). Linux hospedado conta 1×, Windows 2×: um beta custa
~40 min de cota (≈10 min Linux + ≈15 min Windows ×2). Com 2.000 min/mês isso dá ~50 betas — o
filtro de caminhos do `release-beta` (só o que entra no app dispara) é o que mantém isso viável.
O `correctness` tem um job `linux` (cargo check + sidecars + smoke, ~10 min ×1) filtrado do mesmo
jeito por um `git diff` contra a base do PR; Windows **não** roda no gate de PR — quem pega quebra
de Windows é o beta seguinte.

**Cache.** `Swatinem/rust-cache` volta, mas **só nos runners hospedados** (`if: runner.os !=
'macOS'`): eles são descartáveis, e a poda de `~/.cargo/bin` que apagou o `rustup` do founder
(abaixo) não tem vítima lá.

**Windows, três pegadinhas** já resolvidas nos workflows, para não redescobrir: o shell default é
pwsh (`defaults.run.shell: bash` força git-bash em todo passo); os sidecars ganham `.exe`
(build-sidecars.ts já faz); e não existe `nice` — é um campo da matriz, vazio fora do Mac.

## Runner self-hosted (macOS)

Os builds macOS (`release-beta`, `release-stable`) rodam num **runner self-hosted** no Mac mini do
founder, não nos runners do GitHub. A razão é custo: repo privado consome cota, macOS conta **10×**,
e em 2026-08-07 isso estourou o teto (57 builds macOS num dia ≈ 3.250 minutos faturados contra 2.000
disponíveis), derrubando TODOS os workflows — inclusive os de Linux, que eram baratos. Minutos de
runner self-hosted não contam na cota.

A máquina já era o ambiente de build: mesmo toolchain, a chave de assinatura mora nela, e os caches
de cargo/bun ficam quentes entre execuções.

**Não espere que fique mais rápido de imediato.** O primeiro build self-hosted levou 11,9 min contra
~5,7 no runner do GitHub — `actions/checkout` roda `git clean -ffdx`, então cada execução começa sem
`node_modules` e recompila o Rust do zero. O ganho vem das execuções seguintes, quando o
`Swatinem/rust-cache` e o cache do bun estão quentes; e o `nice -n 10` em todos os passos pesados faz
o CI ceder CPU ao daemon de produção, o que troca alguns minutos de build por uma máquina usável.

**Se o runner estiver offline**, os jobs de macOS ficam na fila em vez de falhar. Para publicar
mesmo assim, troque `runs-on: [self-hosted, macOS, ARM64]` por `macos-14` no workflow — e conte com
o custo em minutos.

**Antes de tornar este repositório público**, remova o runner self-hosted: um PR de fork passaria a
executar código arbitrário na máquina. As duas decisões são mutuamente exclusivas.

Desde 2026-08-25 os builds de **Linux e Windows** rodam em runners hospedados (`ubuntu-22.04`,
`windows-latest`) — não há Mac que os compile, e o daemon não cross-compila. Eles voltam a consumir
cota (1× e 2×); o que os mantém baratos é o filtro de caminhos e o fato de o macOS, o único 10×,
continuar aqui.

### O CI agora escreve na SUA máquina — actions de cache são o risco real

Num runner descartável, uma action que "limpa" o ambiente não tem vítima. Aqui tem, e a primeira
apareceu no primeiro build: `Swatinem/rust-cache@v2` **apagou o binário `rustup`** de
`~/.cargo/bin` no passo `Post Run`, deixando `cargo`, `rustc` e `rustfmt` como symlinks pendurados.
A action faz isso por design — poda `~/.cargo/bin` para salvar um cache enxuto, partindo do
princípio de que a máquina é descartável.

O que torna isso traiçoeiro é a distância entre causa e sintoma: **o build que causou o estrago
passou**, verde. Quem falhou foi o workflow seguinte, com `Executable not found in $PATH: "cargo"`,
e o desenvolvimento local teria falhado igual na próxima vez que alguém rodasse `bun contracts`.

A action foi removida dos passos do runner self-hosted e **não deve voltar a ele**. Nos jobs
hospedados da matriz (Linux/Windows, `if: runner.os != 'macOS'`) ela roda — lá o runner é
descartável e a poda de `~/.cargo/bin` não tem vítima. Num runner persistente ela não tem função: o
disco já persiste. O `target/` do Rust — a única coisa que o `git clean -ffdx` do checkout apagaria
— vive fora do workspace via `CARGO_TARGET_DIR`, e sobrevive sem action nenhuma.

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
