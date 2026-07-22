# Migração do app React (bk-dash-frontend/app → template-fullstack)

> **Como migrar fonts, styles, components, routes** do app de origem para o monorepo,
> mantendo os **design tokens compartilhados** em `packages/app/styles` (`@template/app-styles`).

## Situação: dois forks do mesmo template

| | Origem `bk-dash-frontend/app` (`@template/monorepo-app`) | Alvo `packages/app/react` (`@template/app-react`) |
|---|---|---|
| Stack | TanStack Router + Vite + Tailwind 4 + Base UI/CVA | idêntico |
| Fonte | **Nunito** (300–900) + Newsreader | Poppins + Newsreader (no `tokens.css` compartilhado) |
| Paleta | primary **`#5656be`** (roxo BK), foreground teal, charts verdes, `+success/info/hover/focus`, `sidebar #0d0f0f`, `radius 0.6rem`, **`.dark` completo** | primary teal `oklch(0.5655 .101 182.45)`, tokens de chat/rail/sidebar, `radius 0.65rem` |
| Utilitários CSS | **`gradient-box` / `gradient-bg-*` / `gradient-border-*`** (+ `@property`) | `neo-panel`, `neo-table-wrap`, `chat-doodle-bg` (doodle saúde) |
| DS primitives | `+gradient-icon.tsx`, `+icons/`, `+surfaces.ts` | `+availability.tsx`, `+collapsible.tsx` |
| Componentes | `+DataTable` | `+OriginBadge`, `+assistant-ui` |
| Rotas | `(index)`, `onboarding`, **`(app)/{orders,products,finance,marketing,settings,calculator,tasks,ideas}`** — telas REAIS implementadas | só baseline `(app)` + auth |
| Deps extras | recharts, @tanstack/react-table, tw-shimmer, next-themes, @radix-ui/react-slot, zod-adapter/zod-form-adapter, router-plugin, @fontsource/nunito, @ag-ui + assistant-ui-ag-ui | — |
| SDK | `@template/monorepo-sdk` | `@template/*` (monorepo-sdk / client-typescript) |

**Conclusão:** não é greenfield — é **portar o app bk-dash já construído** (design + telas) para o
monorepo, reconciliando com a camada de **tokens compartilhados** e com o **novo SDK**.

## Onde cada coisa mora (regra do "shared styles")

- **`packages/app/styles/tokens.css`** (consumido por **react** `index.css` E **astro** `global.css`; expo migra depois):
  apenas o que é **cross-app** — `@font` imports, `@theme { --spacing }`, paleta `:root` + bloco `.dark`,
  `--radius`, charts. Mudar aqui **afeta a landing astro** → decisão de marca é cross-app.
- **`packages/app/react/src/index.css`** (app-only): `@import "tailwindcss"` + plugins, `@theme inline`
  (mapeia `--color-*`/`--font-*`/`--radius-*` para utilitários Tailwind), utilitários próprios
  (`gradient-box` & cia, `@property`), overrides do `react-day-picker`, estilos do Sonner, scrollbars.
- **`@template/app-styles` package.json**: hoje declara `@fontsource/poppins`. Trocar/adicionar
  `@fontsource/nunito` aqui (a dep da fonte vive no pacote de estilos, não no app).

## Decisões a travar ANTES de portar (afetam react + astro)

1. **Fonte canônica** — Nunito (origem/bk-dash) vs Poppins (tokens atuais). bk-dash usa **Nunito** →
   atualizar `tokens.css` (`@import @fontsource/nunito/*`) + `--font-sans: "Nunito"` no `@theme inline`
   do react + dep no `app-styles`. Confirmar impacto na astro.
2. **Paleta canônica** — roxo `#5656be` + teal/verde (origem) vs teal atual. Portar a paleta da origem
   para `:root`/`.dark` do `tokens.css`, **convertendo hex → oklch** (`#5656be`, `#0d0f0f`) p/ manter o
   padrão do arquivo. Mapear extras (`success/info/hover/focus`) que o alvo não tem.
3. **SDK** — toda import `@template/monorepo-sdk` → `@template/*`. As telas da origem chamam hooks gerados
   contra o backend dela; aqui devem casar com os **Controller Contracts das specs** (`.specs/frontend-screens/`).
   Esta é a maior reconciliação (não é copiar-colar).
4. **Utilitários divergentes** — manter `gradient-box`+`surfaces` (origem) como sistema de superfície;
   decidir se `chat-doodle-bg`/`neo-panel` (alvo) ainda são usados (provavelmente dropar — domínio saúde).

## Fases de migração

**Fase 0 — Fundação de estilo (shared).**
- `app-styles`: add `@fontsource/nunito` (e remover Poppins se não usado pela astro); `tokens.css`
  recebe os `@import` Nunito, a paleta da origem (`:root` + `.dark`, hex→oklch), `--radius`, charts.
- react `index.css`: substituir `@theme inline` `--font-sans`/cores pela paleta nova; portar
  `gradient-box`/`gradient-bg-*`/`gradient-border-*` + `@property`; manter Sonner/rdp/scrollbars;
  remover doodle/neo se descartados. Validar a astro renderizando com os tokens novos.

**Fase 1 — Primitivos do design system.**
- Portar `components/ui/{gradient-icon.tsx, icons/, surfaces.ts}` + presets de superfície.
- Portar `components/DataTable/` (+ dep `@tanstack/react-table`). Reconciliar deltas de `ui/`
  (origem não tem `availability`/`collapsible`; alvo não tem o sistema de gradiente).
- Rodar Storybook (ambos têm `.storybook`) para validar visual dos primitivos.

**Fase 2 — Deps & config.**
- Add no `@template/app-react`: recharts, @tanstack/react-table, tw-shimmer, next-themes,
  @radix-ui/react-slot, @tanstack/zod-adapter, @tanstack/zod-form-adapter, @tanstack/router-plugin.
- Reconciliar `vite.config.ts`, `tsr.config.json`, `components.json`, `.storybook`, `index.html`.
- **Não** trazer `@ag-ui`/assistant-ui-ag-ui a menos que a feature de chat IA seja desejada.

**Fase 3 — Rotas / telas (o grosso).**
- Portar `(index)`, `onboarding`, e o conjunto **`(app)`**: `orders, products, finance, marketing,
  settings, calculator, tasks, ideas`. Estas são as telas que já têm spec em
  `.specs/frontend-screens/` — usar a spec como contrato e **religar os hooks ao novo SDK** + aos
  Controller Contracts (single/multi store dashboard, ListOrders, etc.).
- Ordem sugerida: dashboard `(app)/` → orders → products/cost → finance/cost → marketing → settings →
  calculator/suggestions/tasks. Uma rota por vez, `bun tsc` verde a cada passo.

**Fase 4 — i18n, stores, hooks.**
- Portar `locales/`, `stores/useDialogStore.tsx`, `hooks/{useBreadcrumbs,useDebouncedSearch,
  useRangeSearchParams,useServerEvents,useSession}` (vários já existem no alvo — diff e merge).

## Riscos / notas

- **Ripple na astro**: `tokens.css` é compartilhado; toda mudança de fonte/paleta precisa ser validada
  na landing astro (mesma fonte de verdade). Expo tem `global.css` próprio (uniwind) — espelhar tokens
  depois, fora deste escopo.
- **hex vs oklch**: converter `#5656be`/`#0d0f0f` p/ oklch ao mover p/ `tokens.css` (consistência).
- **`@property` + Tailwind 4**: ambos em 4.1.16 — `gradient-box` deve funcionar; validar build.
- **SDK é o gargalo**: as telas não compilam até os hooks serem religados ao `@template/*` e às specs.
  Travar o SDK (`bun sdk`) antes de portar telas em paralelo.
- **Nome do pacote**: manter `@template/app-react`; reescrever specifiers `@template/*` → `@template/*`
  (a casa já documenta que generated packages devem ser `@template/*`, nunca `@template/*`).

## Próximo passo sugerido

Fase 0 isolada (tokens + fonte + utilitários de gradiente) num PR só — é o que destrava tudo e dá pra
validar visual em react + astro antes de portar qualquer tela. Posso executá-la quando aprovado.
