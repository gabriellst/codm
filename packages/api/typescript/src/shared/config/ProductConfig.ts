import { z } from 'zod'

/**
 * Product env seam — the product-specific analog of the kernel `Config`
 * (`@codm/core-typescript` → `core/src/utils/Config.ts`), mirroring medscall's decision to keep
 * the product Config in `src/shared` (medscall@f04e8a0f `packages/api/src/shared/utils/Config.ts`).
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
 * ref: medscall@f04e8a0f (product Config in src/shared); relocated from the kernel Config by W0-3.
 */
const ProductEnvSchema = z.object({
	// Product display name — the brand string rendered in transactional-email chrome
	// (MailSender `Layout`: header title + footer copyright). Neutral default so a fresh product
	// renders without a brand until it sets this; the port carries NO hard-coded brand.
	PRODUCT_NAME: z.string().default('Your Product'),
})

/** Structural parity export — compared against REPO.env (owners: ts-product | billing-gateway). */
export const PRODUCT_ENV_KEYS = Object.keys(ProductEnvSchema.shape)

export const ProductConfig = {
	env: ProductEnvSchema.parse(process.env),
} as const
