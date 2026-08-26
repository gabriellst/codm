// packages/app/react/src/components/console/OnboardingGate.tsx — COMPLETE final file
import { Navigate } from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'
import { useGetOnboarding } from '@codm/client-typescript/typescript'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { useOnboardingStore } from '@/stores/useOnboardingStore'

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
	const required = useOnboardingStore(state => state.required)

	const hasPendingAnnouncement = !!data?.completedAt && !!pending && pending.length > 0 && !announced

	useEffect(() => {
		if (hasPendingAnnouncement) announced = true
	}, [hasPendingAnnouncement])

	// UMA LEITURA FRESCA COM `completedAt` VENCE o latch `required` (2026-08-25, founder live-test,
	// item 3). `required` existe para cobrir a JANELA em que nenhuma leitura chegou ainda (ver
	// docblock abaixo) — mas nada além de `OnboardingFlow`'s `completeOnboarding.onSuccess` o
	// resetava, então um 403 transitório de QUALQUER rota (ex.: o primeiro render de `/dashboard`
	// antes do próprio redirect) travava `required=true` pelo resto da sessão JS, e uma confirmação
	// LEGÍTIMA de `completedAt` (o operador acabou de concluir o wizard) nunca conseguia vencer essa
	// trava — "Começar" clicado repetidas vezes nunca chegava ao `/dashboard`. `completeOnboarding`
	// agora reseta `required` no sucesso (fix primário); esta reordenação é o belt-and-suspenders —
	// mesmo um `required` travado por OUTRO 403 (fora do fluxo de completar) não sobrevive a uma
	// leitura que já confirma `completedAt`.
	if (data?.completedAt) {
		if (hasPendingAnnouncement) return <Navigate to="/onboarding" replace />
		return <>{children}</>
	}

	// O BACKEND JÁ DISSE (e nenhuma leitura acima confirmou o contrário). Esta linha vem ANTES do
	// `!data` de propósito: quando o middleware recusa por onboarding incompleto, a leitura do
	// próprio `GetOnboarding` também é recusada, `data` fica indefinido, e sem isto o gate renderizava
	// o app — o operador via o toast e não saía do lugar.
	if (required) return <Navigate to="/onboarding" replace />
	if (!data) return <>{children}</>
	return <Navigate to="/onboarding" replace />
}
