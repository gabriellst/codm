import { z } from 'zod'

/**
 * Product env seam — the product-specific analog of the kernel `Config`
 * (`@codm/core-typescript` → `core/src/utils/Config.ts`), mirroring the origin fork's decision to keep
 * the product Config in `src/shared` (origin-fork@f04e8a0f `packages/api/src/shared/utils/Config.ts`).
 *
 * The kernel Config holds ONLY generic, product-agnostic env (DB/Redis/OTEL/PORT, generic secrets,
 * GO_* worker topology, credential-vault key). Everything whose existence is dictated by THIS
 * product's third-party integrations — payment-provider / marketing / store-integration OAuth
 * credentials — lives here so a fresh product can drop this seam and author its own without
 * touching the kernel. Rule of thumb: would a brand-new product still need this var? Yes → kernel;
 * no → here.
 *
 * Same shape as the kernel Config: a raw field-level Zod schema parsed once against `process.env`,
 * surfaced as `ProductConfig.env.X`. Defaults/coercion reproduce exactly what these vars had while
 * they lived in the kernel Config, so `ProductConfig.env` keeps identical types for identical
 * inputs. No cross-field derived defaults and no production secrets guard exist for these today
 * (they were plain `.optional()` / `.default('')` in the kernel), so there is no `.transform()` /
 * `.superRefine()` — add one here (not in the kernel) if a product integration later needs it.
 *
 * ref: origin-fork@f04e8a0f (product Config in src/shared); relocated from the kernel Config by W0-3.
 */
const ProductEnvSchema = z.object({
	// Product display name — the brand string rendered in transactional-email chrome
	// (MailSender `Layout`: header title + footer copyright). Neutral default so a fresh product
	// renders without a brand until it sets this; the port carries NO hard-coded brand.
	PRODUCT_NAME: z.string().default('Your Product'),

	// Backstop do watchdog de inatividade do `ClaudeAgentRunner` (§4.3 regra 5) — nenhum frame por
	// este tempo significa que o run travou. `z.coerce` espelha o `Number(<env> ?? default)` anterior
	// para um valor setado; um override impossível de parsear falha ALTO no boot em vez de virar
	// `NaN` em silêncio.
	//
	// Veio do kernel na F3/T1: o `ClaudeAgentRunner` é do contexto `agent`, e o core não tem por que
	// conhecer o orçamento de inatividade de um runtime de agente que só este produto tem. Um core
	// portável não carrega botão de produto.
	CODM_AGENT_INACTIVITY_MS: z.coerce.number().default(180_000),

	// O NOME DO ARQUIVO DE STORE dentro do `CODM_DATA_DIR` (F3/T8).
	//
	// Estava literalizado em 10 lugares, dois deles em LINGUAGENS DIFERENTES que precisam casar byte
	// a byte — `FileLibsqlDriver` aqui e `core/db/sqlite/store.go` do outro lado, cujos comentários
	// admitiam ser espelhos um do outro. Num rebrand pela metade o TS abria um banco e o Go abria
	// outro, sobre o mesmo diretório, sem erro nenhum.
	//
	// O default fica AQUI e no gêmeo Go, e os dois são pinados pelo rail `db-file-name.test.ts`. O
	// literal em si é legítimo: este é o arquivo de configuração DO PRODUTO, e o nome do banco do
	// produto é o produto se nomeando. O que não era legítimo era ele aparecer em mais nove lugares.
	CODM_DB_FILE_NAME: z.string().min(1).default('codm.db'),

	// A TAG DE MENÇÃO de último recurso (F3/T8). O `MentionGate` a cunhava com um literal, e ela é o
	// que o operador DIGITA para invocar o agente — num fork, a marca errada aqui significa um agente
	// que não responde ao próprio nome. O literal fica neste arquivo, que é a config DO PRODUTO, e não
	// mais espalhado por uma regra de domínio.
	CODM_MENTION_FALLBACK_TAG: z.string().trim().min(1).default('codm'),
})

/** Structural parity export — compared against REPO.env (owners: ts-product | billing-gateway). */
export const PRODUCT_ENV_KEYS = Object.keys(ProductEnvSchema.shape)

export const ProductConfig = {
	env: ProductEnvSchema.parse(process.env),
} as const
