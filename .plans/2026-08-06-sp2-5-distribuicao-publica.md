# SP2.5 — Distribuição pública: R2 + landing com download real — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** Qualquer pessoa baixa o DMG direto da landing e o app instalado se auto-atualiza — com o repo GitHub permanecendo privado; a landing diz a verdade: um plano, Community, grátis.

**Architecture:** O R2 (`codm-releases`, URL pública `pub-ae0c8cac60c94920b35464575c09e67d.r2.dev`) vira a origem pública: os workflows do SP1 ganham um step de upload via wrangler e passam a apontar o manifest para o R2; os endpoints declarativos do updater (`config/updater.ts` + espelho `updater.rs`, rail DSK-07) trocam de GitHub→R2; a landing Astro ganha download direto, o plano único Community e deploy no Cloudflare Pages. GitHub Releases permanece como registro interno.

**Tech Stack:** GitHub Actions, wrangler (R2 + Pages), Tauri v2 updater, Astro 5

**Spec:** .specs/2026-08-06-sp2-5-distribuicao-publica-design.md
**Tasks:** 5
**Estimated minutes:** 140

> **Base do build:** main **pós-merge do PR #17** (`feat/sp1-release-autoupdate`) — os arquivos de T1/T2 só existem lá. Não iniciar /build antes do merge.
> **Secrets já provisionados** (2026-08-06): `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `TAURI_SIGNING_PRIVATE_KEY`. Token Cloudflare expira **2026-08-13** — rotacionar antes do primeiro release real.

---

## Task T1: Release publica no R2 (beta e stable) mantendo GitHub como registro interno

**Files to write:**
- Modify: `.github/workflows/release-beta.yml` — `--url` do manifest → R2 + step `upload r2`
- Modify: `.github/workflows/release-stable.yml` — idem, com artefatos versionados + alias fixo

**Files to read:**
- `scripts/release/make-manifest.ts` — recebe `--url` por argumento; NÃO muda
- `docs/RELEASE.md` — seção da limitação do repo privado (atualizar? fora de escopo; T1 só workflows)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /commit
**Depends on:** (none)
**Consumes (frozen):** base pública `https://pub-ae0c8cac60c94920b35464575c09e67d.r2.dev`; bucket `codm-releases`; secrets `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`; nomes fixos `codm-aarch64.app.tar.gz`/`codm-aarch64.dmg`; paths `beta/` (rolante, sobrescreve) e `stable/` (retenção total: artefatos versionados `CODM_<tag>_aarch64.*` + alias `stable/codm-aarch64.dmg` sempre na última).
**Scope fence:** DONE elsewhere — endpoints do cliente (T2), landing (T3/T4), Pages (T5). OUT — `make-manifest.ts` (agnóstico de URL), assinatura minisign (inalterada), estrutura de tags/canais do SP1.
**Gate:** `bun x action-validator .github/workflows/release-beta.yml` (ou `yamllint`/parse por `bun -e` com `yaml`) sem erro; grep confirma que NENHUMA URL `github.com/.../releases/download` sobrou nos dois `--url` de manifest.

### Step T1.1 — release-beta.yml: manifest aponta pro R2 e novo step de upload

No step `manifest`, trocar a linha `--url`:

```yaml
          --url "https://pub-ae0c8cac60c94920b35464575c09e67d.r2.dev/beta/codm-aarch64.app.tar.gz"
```

Inserir APÓS o step `publish` (GitHub Release continua sendo criada — registro interno):

```yaml
      # A ORIGEM PÚBLICA é o R2 (spec SP2.5): repo privado ⇒ assets do GitHub 404am anônimos —
      # tanto para o download da landing quanto para o auto-updater. O canal beta é ROLANTE:
      # sobrescreve os mesmos objetos a cada merge; a versão vive no latest.json.
      - name: upload r2
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          bunx wrangler r2 object put codm-releases/beta/codm-aarch64.app.tar.gz --file dist-release/codm-aarch64.app.tar.gz --content-type application/gzip --remote
          bunx wrangler r2 object put codm-releases/beta/codm-aarch64.app.tar.gz.sig --file dist-release/codm-aarch64.app.tar.gz.sig --content-type text/plain --remote
          bunx wrangler r2 object put codm-releases/beta/codm-aarch64.dmg --file dist-release/codm-aarch64.dmg --content-type application/x-apple-diskimage --remote
          bunx wrangler r2 object put codm-releases/beta/latest.json --file dist-release/latest.json --content-type application/json --remote
```

### Step T1.2 — release-stable.yml: idem com retenção total

No step `manifest`, trocar a linha `--url` (artefato VERSIONADO — manifests antigos continuam resolvendo para sempre):

```yaml
          --url "https://pub-ae0c8cac60c94920b35464575c09e67d.r2.dev/stable/CODM_${GITHUB_REF_NAME}_aarch64.app.tar.gz"
```

Inserir após o `publish`:

```yaml
      # stable = retenção TOTAL (decisão do founder): cada versão fica no R2 sob nome versionado;
      # latest.json e o alias do DMG apontam sempre para a mais nova (o botão da landing usa o alias).
      - name: upload r2
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          bunx wrangler r2 object put "codm-releases/stable/CODM_${GITHUB_REF_NAME}_aarch64.app.tar.gz" --file dist-release/codm-aarch64.app.tar.gz --content-type application/gzip --remote
          bunx wrangler r2 object put "codm-releases/stable/CODM_${GITHUB_REF_NAME}_aarch64.app.tar.gz.sig" --file dist-release/codm-aarch64.app.tar.gz.sig --content-type text/plain --remote
          bunx wrangler r2 object put "codm-releases/stable/CODM_${GITHUB_REF_NAME}_aarch64.dmg" --file dist-release/codm-aarch64.dmg --content-type application/x-apple-diskimage --remote
          bunx wrangler r2 object put codm-releases/stable/codm-aarch64.dmg --file dist-release/codm-aarch64.dmg --content-type application/x-apple-diskimage --remote
          bunx wrangler r2 object put codm-releases/stable/latest.json --file dist-release/latest.json --content-type application/json --remote
```

### Step T1.3 — Gate + commit

- [ ] Parse YAML dos dois workflows sem erro; nenhum `--url` de manifest restante com `github.com`.
- [ ] Commit: `feat(release): artefatos publicam no R2 — origem pública com repo privado (Task T1)`

---

## Task T2: O app instalado se atualiza pelo R2

**Files to write:**
- Modify: `packages/app/tauri/config/updater.ts` — endpoints GitHub → R2
- Modify: `packages/app/tauri/src-tauri/src/updater.rs` — espelho do beta endpoint
- Modify: `packages/app/tauri/src-tauri/tauri.conf.json` — regen (`bun desktop:generate`)

**Files to read:**
- `packages/app/tauri/config/generate.test.ts` — DSK-07 lê `UPDATER.betaEndpoint` dinamicamente; NÃO editar

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /desktop-shell
**Depends on:** (none)
**Consumes (frozen):** base pública `https://pub-ae0c8cac60c94920b35464575c09e67d.r2.dev` (conferir o hash char a char ao colar); paths `stable/latest.json` e `beta/latest.json`.
**Scope fence:** DONE elsewhere — upload (T1), landing (T3/T4). OUT — pubkey/minisign (inalterados), `updateAsset` (nome fixo permanece), canal-resolução em `resolve_channel` (inalterada).
**Gate:** `bun test packages/app/tauri/config` verde (DSK-01..09 incl. DSK-07 com as URLs novas) + `bun packages/app/tauri/config/generate.ts --check` em sincronia + `cargo check` em `src-tauri`.

### Step T2.1 — updater.ts: trocar os dois endpoints

Em `packages/app/tauri/config/updater.ts`, substituir apenas as duas URLs (docblock ganha um parágrafo curto explicando a origem R2 e o porquê — repo privado 404a anônimo):

```typescript
	stableEndpoint: 'https://pub-ae0c8cac60c94920b35464575c09e67d.r2.dev/stable/latest.json',
	betaEndpoint: 'https://pub-ae0c8cac60c94920b35464575c09e67d.r2.dev/beta/latest.json',
```

O campo `repo` permanece (referência interna do registro GitHub); `updateAsset` permanece.

### Step T2.2 — updater.rs: espelho

Em `packages/app/tauri/src-tauri/src/updater.rs` linha do `BETA_ENDPOINT`, espelhar verbatim:

```rust
const BETA_ENDPOINT: &str = "https://pub-ae0c8cac60c94920b35464575c09e67d.r2.dev/beta/latest.json";
```

### Step T2.3 — Regen + gates + commit

- [ ] `cd packages/app/tauri && bun ../../..(root) desktop:generate` (via script raiz `bun desktop:generate`) — `tauri.conf.json` ganha o endpoint stable novo.
- [ ] `bun test packages/app/tauri/config` — DSK-07 prova o espelho; DSK-08 prova o conf.
- [ ] `cargo check` em `packages/app/tauri/src-tauri`.
- [ ] Commit: `feat(desktop-shell): updater aponta pro R2 — update funciona com repo privado (Task T2)`

---

## Task T3: O visitante baixa o DMG direto da landing

**Files to write:**
- Modify: `packages/app/astro/src/components/Nav.astro` — download direto (não deriva mais do link GitHub)
- Modify: `packages/app/astro/src/pages/[locale]/_components/Home.astro` — `downloadHref` = DMG no R2
- Modify: `packages/app/astro/src/pages/[locale]/_components/Hero.astro` — label + nota Gatekeeper
- Modify: `packages/app/astro/src/pages/[locale]/_components/ClosingCta.astro` — mesmo href/label
- Modify: `packages/app/astro/src/pages/[locale]/_content/home.pt.json` — copy download/Gatekeeper
- Modify: `packages/app/astro/src/pages/[locale]/_content/home.en.json` — idem

**Files to read:**
- `packages/app/astro/src/pages/[locale]/_content/config.ts` — schema do content (chaves novas precisam entrar no schema se houver validação)

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /component (astro)
**Depends on:** (none)
**Consumes (frozen):** URL fixa do DMG `https://pub-ae0c8cac60c94920b35464575c09e67d.r2.dev/stable/codm-aarch64.dmg` (o alias que T1 mantém apontando para a última versão). Só existe build macOS Apple Silicon — o botão diz isso; sem detecção de SO.
**Scope fence:** DONE elsewhere — pricing (T4 é quem monta PricingSection e mexe em plans.json), upload (T1). OUT — mudanças estruturais de layout, detecção de SO, downloads de outros sistemas.
**Gate:** `bun x nx run app-astro:build` verde; grep confirma zero `releases` de GitHub restante nos hrefs de download; as chaves i18n novas existem em pt E en.

### Step T3.1 — Home.astro/Nav.astro: href direto

`downloadHref` vira a constante da URL fixa do DMG (declarada uma vez — ex.: const módulo em `Home.astro` e prop pro `Nav`/`Hero`/`ClosingCta`, seguindo o fluxo de props existente). `Nav.astro` para de derivar `downloadHref` de `githubHref`.

### Step T3.2 — Hero/ClosingCta: label honesto + Gatekeeper

Botão principal: `t.hero.downloadMac` — pt: "Download para macOS (Apple Silicon)", en: "Download for macOS (Apple Silicon)". Abaixo do botão do Hero, microcopy `t.hero.gatekeeperNote` — pt: "Sem assinatura Apple por enquanto: no primeiro uso, clique com o botão direito → Abrir.", en: "No Apple signing yet: on first launch, right-click → Open." Outros SOs: `t.hero.otherOs` — pt: "Windows e Linux em breve.", en: "Windows and Linux coming soon."

### Step T3.3 — Content pt/en + schema

Adicionar as chaves novas nos dois JSONs; se `_content/config.ts` valida o shape de `hero`, estender o schema com as três chaves.

### Step T3.4 — Gate + commit

- [ ] `bun x nx run app-astro:build` verde.
- [ ] Commit: `feat(app-astro): download direto do R2 com nota do Gatekeeper (Task T3)`

---

## Task T4: A landing mostra o plano único Community grátis

**Files to write:**
- Modify: `packages/app/astro/src/pages/[locale]/_content/plans/plans.json` — 1 plano Community
- Modify: `packages/app/astro/src/pages/[locale]/_components/Home.astro` — monta `<PricingSection>`

**Files to read:**
- `packages/app/astro/src/pages/[locale]/_components/PricingSection.astro` — já pronto; comentário indica o mount de uma linha
- `packages/app/astro/src/pages/[locale]/_content/loaders/plans.ts` — loader/schema dos planos

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /component (astro)
**Depends on:** T3
**Consumes (frozen):** nome do plano **"Community"** (founder, 2026-08-06 — mesmo nome que o console usará no SP3; o enum de contrato futuro segue `FREE`); produto grátis, plano único.
**Scope fence:** DONE elsewhere — hrefs/copy de download (T3). OUT — segundo plano, preços, CTA de checkout, qualquer menção a Stripe.
**Gate:** `bun x nx run app-astro:build` verde; grep confirma que NENHUMA das strings mortas sobrou em `_content/`: "Pro", "12", "Zero telemetria"/"Zero telemetry", "sem conta"/"no account", "Instagram", "Telegram".

### Step T4.1 — plans.json: um plano só

```json
[
	{
		"id": "community",
		"order": 1,
		"price": { "monthly": 0, "currency": "USD" },
		"highlighted": true,
		"copy": {
			"en": {
				"name": "Community",
				"blurb": "Everything the product does, free. Sign in with GitHub or Google and go.",
				"cta": "Download",
				"features": [
					"Unlimited projects and threads",
					"WhatsApp as your operations channel",
					"Any terminal agent — Claude Code, Codex, OpenCode",
					"Steers, stops and whispers mid-run",
					"Auto-updates, always on the latest"
				]
			},
			"pt": {
				"name": "Community",
				"blurb": "Tudo que o produto faz, de graça. Entre com GitHub ou Google e use.",
				"cta": "Baixar",
				"features": [
					"Projetos e threads ilimitados",
					"WhatsApp como seu canal de operações",
					"Qualquer agente de terminal — Claude Code, Codex, OpenCode",
					"Steers, stops e whispers no meio do run",
					"Auto-update, sempre na última versão"
				]
			}
		}
	}
]
```

### Step T4.2 — Montar a PricingSection

Em `Home.astro`, adicionar `<PricingSection locale={locale} t={t.pricing} />` na posição natural (antes do `ClosingCta`), conforme o comentário do próprio componente. Ajustar o grid do componente se um único card pedir centralização (`max-w` menor + `justify-center` — mudança mínima).

### Step T4.3 — Gate + commit

- [ ] `bun x nx run app-astro:build` verde; greps de strings mortas zerados.
- [ ] Commit: `feat(app-astro): pricing verdadeiro — plano único Community grátis (Task T4)`

---

## Task T5: A landing deploya no Cloudflare Pages a cada push na main

**Files to write:**
- Create: `.github/workflows/deploy-landing.yml`

**Files to read:**
- `packages/app/astro/astro.config.mjs` — `output: 'static'` (Pages-ready, nada a mudar)
- `.github/workflows/release-beta.yml` — molde de setup (checkout + bun)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /commit
**Depends on:** (none)
**Consumes (frozen):** projeto Pages `codm-landing`; secrets `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`; build estático do astro sai em `packages/app/astro/dist`.
**Scope fence:** DONE elsewhere — conteúdo da landing (T3/T4). OUT — domínio custom, redirects, headers especiais.
**Gate:** parse YAML sem erro; `bun x nx run app-astro:build` local produz `dist/` (prova que o path do deploy existe).

### Step T5.1 — Workflow

```yaml
# Deploy da landing no Cloudflare Pages (spec SP2.5 decisão 7). Projeto criado idempotente no
# primeiro run; a URL *.pages.dev serve até existir domínio próprio (open question do roadmap).
name: deploy-landing

on:
  push:
    branches: [main]
    paths: ['packages/app/astro/**', '.github/workflows/deploy-landing.yml']
  workflow_dispatch: {}

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - name: deps
        run: bun install --frozen-lockfile

      - name: build
        run: bun x nx run app-astro:build

      - name: deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          bunx wrangler pages project create codm-landing --production-branch=main 2>/dev/null || true
          bunx wrangler pages deploy packages/app/astro/dist --project-name=codm-landing --branch=main
```

### Step T5.2 — Gate + commit

- [ ] Parse YAML sem erro; build local do astro produz `packages/app/astro/dist/`.
- [ ] Commit: `feat(ci): landing deploya no Cloudflare Pages a cada push na main (Task T5)`

---

## Final Validation

- [ ] `bun tsc` — limpo (T2 toca config TS do shell)
- [ ] `bun lint` — limpo
- [ ] `bun test packages/app/tauri/config` + `bun packages/app/tauri/config/generate.ts --check` — rails DSK verdes com endpoints R2 (DSK-07/08)
- [ ] `bun x nx run app-astro:build` — landing compila com o conteúdo novo
- [ ] AC mapping:
  - AC-1 → `curl -I https://pub-ae0c8cac60c94920b35464575c09e67d.r2.dev/stable/codm-aarch64.dmg` retorna 200 APÓS o primeiro release stable (até lá, o smoke `smoke.txt` já provou o caminho anônimo); botão da landing aponta essa URL (grep em T3)
  - AC-2 → ciclo beta completo via R2 — **verificação manual do founder** pós-merge: push na main → workflow beta → app instalado detecta/baixa/reinicia (documentar no PR)
  - AC-3 → greps do T4 (1 plano, strings mortas zeradas) + `PricingSection` montada + build astro verde
  - AC-4 → gates DSK do T2
  - AC-5 → run do `deploy-landing` verde com URL `*.pages.dev` respondendo (manual, pós-merge)
- [ ] E2E: fora do escopo (release/deploy são pipelines de CI; verificação manual documentada no PR)

## Notes

- **Ordem**: mergear PR #17 ANTES do /build (base = main pós-#17). O PR do SP2 (`build/sp2-conta-oauth`) é independente deste plano.
- **Waves**: [T1, T2, T3, T5] em paralelo (arquivos disjuntos) → [T4] (depende de T3 por `Home.astro`).
- **Token Cloudflare expira 2026-08-13** — rotacionar o secret antes do primeiro release real.
- **Cuidado com o hash da URL**: `pub-ae0c8cac60c94920b35464575c09e67d.r2.dev` — conferir char a char nos 4 pontos (2 workflows, updater.ts, landing).
