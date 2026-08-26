/**
 * Os provedores sociais que o produto aceita (spec SP2 decisão 3 — social-only, GitHub e Google).
 *
 * Conjunto fechado, então enum: o valor viaja na query da porta de sign-in e é repassado ao
 * better-auth. Um terceiro provedor entra aqui e o `z.enum` da porta o aceita por consequência.
 */
export enum SocialProvider {
	GITHUB = 'github',
	GOOGLE = 'google',
}
