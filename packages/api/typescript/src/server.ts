// server.ts — MainRouter assembly, extracted out of src/index.ts so production boot and the
// integration test harness (tests/support/integration-server.ts, spec Decision 5) share the SAME
// composition instead of the harness re-enacting it. The harness INHERITS this function rather than
// re-declaring `new MainRouter({ httpRouter, version, routers })` a second time — the founder's
// correction: "the integration server must inherit everything the backend already defines — never
// re-declare or re-instantiate it in the front (or in the harness)."
import { Config, HttpRouter, MainRouter, type Router } from '@codm/core-typescript'
import { container } from 'tsyringe-neo'

/**
 * Resolve the transport (whatever `HttpRouter` is bound to in the caller's active environment) and
 * assemble the `MainRouter` that mounts `routers` on it. Does NOT call `.start()` — the caller
 * decides when to listen (production boots immediately; the harness starts after registering its
 * own `HttpRouter` binding — see the wiring note in `tests/support/integration-server.ts`).
 */
export function assembleMainRouter(routers: Router[]): MainRouter {
	// Resolvido UMA vez aqui (não inline dentro de `new MainRouter(...)`) — a mesma instância é
	// compartilhada com o MainRouter, que monta as rotas dos contextos e sobe o servidor.
	// biome-ignore lint/suspicious/noExplicitAny: tsyringe-neo can't type an abstract class as an injection token — resolve is narrowed on the same expression.
	const httpRouter = container.resolve(HttpRouter as any) as HttpRouter

	return new MainRouter({
		httpRouter,
		version: Config.version,
		routers,
	})
}
