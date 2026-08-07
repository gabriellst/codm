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

> Assinatura **Apple** (Developer ID + notarização) é outra coisa e está deliberadamente FORA do
> beta — entra no SP2 como gate de cobrança (roadmap decisão 7).

## Instalação do beta (texto para a página de download)

O beta não tem assinatura Apple, então o macOS avisa na primeira abertura:

1. Baixe o `codm-aarch64.dmg` e arraste o app para **Aplicativos**.
2. Abra o app; o macOS vai bloquear com *"não foi possível verificar…"*.
3. **Ajustes → Privacidade e Segurança** → role até o aviso do codm → **Abrir Mesmo Assim**.
4. Só na primeira vez: os auto-updates seguintes não passam pelo Gatekeeper (o updater baixa e
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
de cargo/bun ficam quentes entre execuções (o build cai de ~5,7 min para 2–3).

**Se o runner estiver offline**, os jobs de macOS ficam na fila em vez de falhar. Para publicar
mesmo assim, troque `runs-on: [self-hosted, macOS, ARM64]` por `macos-14` no workflow — e conte com
o custo em minutos.

**Antes de tornar este repositório público**, remova o runner self-hosted: um PR de fork passaria a
executar código arbitrário na máquina. As duas decisões são mutuamente exclusivas.

`correctness` e `deploy-landing` continuam nos runners do GitHub (Linux, 1×, baratos) de propósito —
se o Mac mini cair, o type-check, os testes e a landing seguem funcionando.
