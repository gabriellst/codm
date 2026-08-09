// packages/app/react/src/components/console/PreconditionsGate.tsx — COMPLETE final file
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { usePreconditions } from '@/services'
import { usePreconditionsStore } from '@/stores/usePreconditionsStore'

/**
 * O QUE FAZ O APP DIZER QUE NÃO PODE FUNCIONAR — e o que faz essa fala aparecer sem o operador
 * pedir.
 *
 * Ele NÃO segura os filhos, ao contrário do `SupervisionGate`, e a diferença é de natureza: lá o
 * problema é que as requisições sairiam condenadas, então nada podia montar antes da resposta. Aqui
 * o problema é uma permissão do sistema — a UI renderiza perfeitamente, ela só não vai conseguir
 * fazer o trabalho. Segurar a tela por isso trocaria uma tela inútil por uma tela em branco.
 *
 * RE-SONDA NO FOCO, e é isso que fecha a Story 1: conceder a permissão acontece FORA do app, nos
 * Ajustes do macOS. Nada notifica o console. O único sinal disponível de "o operador pode ter feito
 * alguma coisa lá fora" é a janela reganhar foco — então é aí que perguntamos de novo, e a pendência
 * some sozinha sem ninguém apertar "verificar de novo".
 *
 * O `catch` silencioso é o caminho de default-satisfeito: um host que não responde não nos disse
 * nada, e nada não é motivo para mandar o operador para uma tela de permissão.
 */
export function PreconditionsGate() {
	const preconditions = usePreconditions()
	const apply = usePreconditionsStore(state => state.apply)
	const pending = usePreconditionsStore(state => state.pending)
	const pathname = useRouterState({ select: state => state.location.pathname })
	const navigate = useNavigate()

	useEffect(() => {
		let cancelled = false

		const probe = () => {
			void preconditions
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
	}, [preconditions, apply])

	useEffect(() => {
		// `pending === null` é "ainda não sondado" e não decide nada — ver o store.
		if (pending && pending.length > 0 && pathname !== '/onboarding') {
			void navigate({ to: '/onboarding' })
		}
	}, [pending, pathname, navigate])

	return null
}
