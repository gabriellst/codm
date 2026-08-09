// packages/app/react/src/components/console/OnboardingGate.tsx — COMPLETE final file
import { Navigate } from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'
import { useGetOnboarding } from '@codm/client-typescript/typescript'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'

/**
 * A GUARDA DE ONBOARDING (spec Decision 14) — o único lugar que decide "isso pede /onboarding".
 * `useSystemPreconditionProbe` (montado na raiz) só sonda e publica; NAVEGAR é responsabilidade
 * desta guarda, sobre DOIS fatos de natureza diferente:
 *
 *   · `completedAt` ausente — fato do SERVIDOR (`GET /ui/onboarding`). Sem ele, SEMPRE leva ao
 *     `/onboarding` — não precisa de flag nenhuma, é reavaliado a cada render (AC-1/Story 1).
 *   · `completedAt` presente E algo pendente (`useSystemPreconditionsStore().pending`) — fato do
 *     HOST. Leva ao `/onboarding` UMA VEZ POR EXECUÇÃO do app (AC-11/Story 3): sem esse limite,
 *     apertar "Concluir" devolveria o operador ao `/onboarding` no instante seguinte, porque a
 *     pendência do host (ex.: Acesso Total ao Disco revogado) continua lá.
 *
 * O "já anunciei" vive em memória de MÓDULO e morre com o processo — NÃO é a flag persistida que a
 * spec anterior proibia (AC-4 de `.specs/2026-08-08-preconditions-do-app-design.md`, revertida por
 * esta): aquela escondia o wizard para sempre; esta só evita reanunciar a MESMA pendência dentro de
 * uma execução.
 *
 * Mesma forma de `CloudSessionGate` (o precedente): gate só o `Outlet`, nunca a sidebar/chrome ao
 * redor — um console sem onboarding completo ainda lê como "o app, me levando para configurar",
 * não como uma tela em branco. Nenhum estado de loading dedicado (`!data` renderiza os filhos): a
 * spec pede EXATAMENTE as duas regras acima e mais nada — sem splash, sem retry.
 */
let announced = false

/** Test-only: limpa o "já anunciei" entre casos — em produção ele nunca é resetado (vive e morre
 *  com o processo, spec Decision 14). Não é um atalho de comportamento: só devolve o módulo ao
 *  estado inicial para que um teste não vaze para o próximo. */
export function resetOnboardingGateForTests(): void {
	announced = false
}

export function OnboardingGate({ children }: { children: ReactNode }) {
	const { data } = useGetOnboarding()
	const pending = useSystemPreconditionsStore(state => state.pending)

	const hasPendingAnnouncement = !!data?.completedAt && !!pending && pending.length > 0 && !announced

	useEffect(() => {
		if (hasPendingAnnouncement) announced = true
	}, [hasPendingAnnouncement])

	if (!data) return <>{children}</>
	if (!data.completedAt) return <Navigate to="/onboarding" replace />
	if (hasPendingAnnouncement) return <Navigate to="/onboarding" replace />
	return <>{children}</>
}
