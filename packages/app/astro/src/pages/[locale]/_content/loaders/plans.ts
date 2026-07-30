import { readFile } from 'node:fs/promises'
import type { Loader } from 'astro/loaders'

export function plansLoader(): Loader {
	return {
		name: 'codm-plans',
		load: async ({ store, parseData, logger }) => {
			// SEAM: when the daemon exposes GET /public/plans, set PLANS_SOURCE_URL at build
			// time and this loader fetches instead of reading the checked-in JSON. Same shape,
			// same Zod schema — the rest of the site never knows the difference.
			const url = import.meta.env.PLANS_SOURCE_URL
			const plans: Array<Record<string, unknown> & { id: string }> = url
				? await fetch(url).then(r => {
						if (!r.ok) throw new Error(`plans fetch ${r.status}`)
						return r.json()
					})
				: JSON.parse(await readFile(new URL('../plans/plans.json', import.meta.url), 'utf-8'))
			store.clear()
			for (const plan of plans) {
				store.set({ id: plan.id, data: await parseData({ id: plan.id, data: plan }) })
			}
			logger.info(`loaded ${plans.length} plans (${url ? 'remote' : 'local'})`)
		},
	}
}
