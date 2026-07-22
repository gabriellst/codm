import type { Page, Locator } from 'playwright'
import type { FileRouteTypes } from '../../app/react/src/routeTree.gen'

type AppRoute = FileRouteTypes['to']

type ExtractParams<T extends string> = T extends `${string}$${infer Param}/${infer Rest}`
	? { [K in Param]: string } & ExtractParams<`/${Rest}`>
	: T extends `${string}$${infer Param}`
		? Record<Param, string>
		: Record<string, never>

// -- Scoping helpers --

/** Scope to a form field by its label text within data-slot="field" */
export function field(scope: Locator | Page, label: string) {
	// Escape special CSS characters in the label for :text()
	const escaped = label.replace(/[()]/g, '\\$&')
	return scope.locator(`[data-slot="field"]:has(label:text("${escaped}"))`)
}

/** Scope to the active dialog */
export function dialog(page: Page) {
	return page.getByRole('dialog')
}

/** Scope to the page header area */
export function header(page: Page) {
	return page.locator('[data-slot="page-header"], header').first()
}

/**
 * Select an option from a dropdown (Combobox or Select) by its visible label.
 * Scopes to the currently open popup via [data-open]. Uses exact-name match so
 * 'Ação' doesn't accidentally match 'Simulação' in strict mode.
 *
 * Prefer `pickOptionByValue` whenever the option binds an enum value — the
 * underlying enum keys (SCREAMING_SNAKE_CASE) can never substring-collide,
 * and the test stays stable across translation tweaks.
 */
export async function pickOption(page: Page, name: string) {
	const openPopup = page.locator('[data-open]')
	const scopedOption = openPopup.getByRole('option', { name, exact: true })

	if ((await scopedOption.count()) > 0) {
		await scopedOption.click()
		return
	}

	// Fallback: unscoped (for Combobox which doesn't use data-open)
	await page.getByRole('option', { name, exact: true }).click()
}

/**
 * Select an option by its underlying value (e.g. an enum key like 'ACTION').
 * Our SelectItem primitive forwards `value` as `data-value`, so this locator
 * is collision-free regardless of label translation.
 *
 * @example
 *   await pickOptionByValue(page, GameGenreEnum.ACTION)
 */
export async function pickOptionByValue(page: Page, value: string) {
	const openPopup = page.locator('[data-open]')
	const scoped = openPopup.locator(`[role="option"][data-value="${value}"]`)

	if ((await scoped.count()) > 0) {
		await scoped.click()
		return
	}

	await page.locator(`[role="option"][data-value="${value}"]`).click()
}

// -- Route params --

/**
 * Extracts typed route params from the current page URL.
 *
 * Usage:
 *   const { unitId } = routeParams(page, '/units/$unitId')
 */
export function routeParams<T extends AppRoute>(page: Page, route: T): ExtractParams<T> {
	const url = new URL(page.url())
	const pathname = url.pathname

	const routeParts = route.split('/')
	const urlParts = pathname.split('/')

	const params: Record<string, string> = {}

	for (let i = 0; i < routeParts.length; i++) {
		const routePart = routeParts[i]
		if (routePart.startsWith('$')) {
			const paramName = routePart.slice(1)
			params[paramName] = urlParts[i] ?? ''
		}
	}

	return params as ExtractParams<T>
}
