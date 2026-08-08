# Release & auto-update (SP1)

> Spec: `.specs/2026-08-06-sp1-release-autoupdate-design.md` · Roadmap:
> `.specs/2026-08-06-produto-desktop-roadmap.md`

## Os dois canais

| Canal | Alimentado por | Endpoint que o app consulta |
|---|---|---|
| **beta** | cada merge na `main` (workflow `release-beta`) | `releases/download/beta/latest.json` (prerelease rolante) |
| **stable** | tag `vX.Y.Z` (workflow `release-stable`) | `releases/latest/download/latest.json` (o `latest` do GitHub ignora prereleases) |

O app checa o canal ~10s após o boot (release builds apenas — dev nunca se auto-atualiza), baixa o
`.app.tar.gz`, **verifica a assinatura minisign** contra a pubkey embarcada, instala e relança.
Falha de rede/endpoint é logada e engolida: update nunca custa o app.

### Trocar o canal de uma máquina

```bash
# entrar no beta (máquinas do founder):
echo beta > "$HOME/Library/Application Support/app.codm.desktop/data/update-channel"
# voltar ao stable:
rm "$HOME/Library/Application Support/app.codm.desktop/data/update-channel"
```

`CODM_UPDATE_CHANNEL=beta` (env) sobrepõe o arquivo — uso de CI/teste.

## Cortar uma release estável

1. Suba a versão em `packages/app/tauri/src-tauri/tauri.conf.json` **via config gerada** (o campo
   `version` da conf; regenere com `bun desktop:generate` se a fonte mudar de lugar) e commite.
2. `git tag v<X.Y.Z> && git push origin v<X.Y.Z>`.
3. O workflow valida **tag == versão da conf** (diverge ⇒ falha sem publicar), builda, assina os
   artefatos de update e publica a release com DMG + `.app.tar.gz` + `.sig` + `latest.json`.

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
baixe o `codm-aarch64.dmg`, arraste para **Aplicativos** e abra normalmente — sem aviso do
Gatekeeper, sem "Abrir Mesmo Assim".

Builds **anteriores** a essa data saíram ad-hoc e ainda exigem o contorno:

1. Abra o app; o macOS bloqueia com *"não foi possível verificar…"*.
2. **Ajustes → Privacidade e Segurança** → role até o aviso do codm → **Abrir Mesmo Assim**.
3. Só na primeira vez: os auto-updates seguintes não passam pelo Gatekeeper (o updater baixa e
   aplica direto, verificando a assinatura minisign própria).

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

Windows/Linux, rollout percentual, `minVersion` forçado, notarização Apple — ver roadmap (SP2/SP4).

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

### O CI agora escreve na SUA máquina — actions de cache são o risco real

Num runner descartável, uma action que "limpa" o ambiente não tem vítima. Aqui tem, e a primeira
apareceu no primeiro build: `Swatinem/rust-cache@v2` **apagou o binário `rustup`** de
`~/.cargo/bin` no passo `Post Run`, deixando `cargo`, `rustc` e `rustfmt` como symlinks pendurados.
A action faz isso por design — poda `~/.cargo/bin` para salvar um cache enxuto, partindo do
princípio de que a máquina é descartável.

O que torna isso traiçoeiro é a distância entre causa e sintoma: **o build que causou o estrago
passou**, verde. Quem falhou foi o workflow seguinte, com `Executable not found in $PATH: "cargo"`,
e o desenvolvimento local teria falhado igual na próxima vez que alguém rodasse `bun contracts`.

A action foi removida dos dois workflows de release e **não deve voltar**. Num runner persistente
ela não tem função: o disco já persiste. O `target/` do Rust — a única coisa que o
`git clean -ffdx` do checkout apagaria — vive fora do workspace via `CARGO_TARGET_DIR`, e sobrevive
sem action nenhuma.

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
