// packages/app/react/src/hooks/useSystemPreconditionProbe.ts — COMPLETE final file
import { useEffect } from 'react'
import { useSystemPreconditions } from '@/services'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'

/**
 * O QUE FAZ O APP DIZER QUE NÃO PODE FUNCIONAR — e o que faz essa fala aparecer sem o operador
 * pedir. Sonda `SystemPreconditionsService.statuses()` no mount e de novo a cada `focus` da janela,
 * publicando o resultado em `useSystemPreconditionsStore`.
 *
 * NÃO NAVEGA (spec Decision 16 / AC-18) — era exatamente esse acoplamento (sondar E decidir para
 * onde ir) que o componente-guarda antigo tinha, e que esta spec desfaz. Hoje quem decide "isso
 * pede navegar para /onboarding" é a guarda de onboarding (`OnboardingGate`), lendo o MESMO store —
 * nunca este hook.
 *
 * RE-SONDA NO FOCO, e é isso que fecha a Story 3: conceder a permissão acontece FORA do app, nos
 * Ajustes do macOS. Nada notifica o console. O único sinal disponível de "o operador pode ter feito
 * alguma coisa lá fora" é a janela reganhar foco — então é aí que perguntamos de novo, e a pendência
 * some sozinha sem ninguém apertar "verificar de novo".
 *
 * O `catch` silencioso é o caminho de default-satisfeito: um host que não responde não nos disse
 * nada, e nada não é motivo para mandar o operador para uma tela de permissão.
 *
 * Mount point: `routes/__root.tsx`, pelo mesmo padrão de ponto-de-montagem fino que `useLoopbackAuth`
 * já usa ali — precisa do container de DI (`useSystemPreconditions`), então só pode rodar dentro de
 * `ServicesProvider`.
 */
export function useSystemPreconditionProbe(): void {
	const systemPreconditions = useSystemPreconditions()
	const apply = useSystemPreconditionsStore(state => state.apply)

	useEffect(() => {
		let cancelled = false

		const probe = () => {
			void systemPreconditions
				.statuses()
				.then(statuses => {
					if (!cancelled) apply(statuses)
				})
				.catch(() => undefined)
		}

		probe()
		window.addEventListener('focus', probe)

		return () => {
			cancelled = true
			window.removeEventListener('focus', probe)
		}
	}, [systemPreconditions, apply])
}
