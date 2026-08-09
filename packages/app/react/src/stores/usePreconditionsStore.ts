// packages/app/react/src/stores/usePreconditionsStore.ts — COMPLETE final file.
// MANTENHA a forma do scaffold: interfaces State/Actions separadas, `initialState` nomeado, e o
// `create<Store>()(set => ({...}))`.
import { create } from 'zustand'
import type { PreconditionStatus } from '@/services'

/**
 * AS PENDÊNCIAS DO AMBIENTE, com DOIS consumidores em subárvores diferentes — o `PreconditionsGate`
 * (que decide para onde o operador vai) e o slide do onboarding (que decide o que renderizar). É
 * exatamente o caso do store: dois irmãos precisando coordenar sem um pai comum que possa segurar o
 * estado, e um dado que não pertence à URL (não é compartilhável nem sobrevive a nada — é fato da
 * máquina, relido a cada foco).
 *
 * NÃO É PERSISTIDO, e isso é uma decisão e não um esquecimento: a spec (AC-4) proíbe qualquer flag
 * de "já visto" governar a exibição. O gatilho é sempre o conjunto de pendências de AGORA.
 */
interface PreconditionsState {
	/**
	 * `null` = ainda não sondado; `[]` = sondado, nada pendente. A distinção é load-bearing: o gate
	 * não pode redirecionar com base em "ainda não sei", e sem os dois valores "não sondado" seria
	 * indistinguível de "tudo certo" — o operador chegaria ao console por um instante antes de ser
	 * mandado de volta, a cada boot.
	 *
	 * Guarda o `PreconditionStatus` INTEIRO, não só o id: o cartão (`FullDiskAccessCard`) precisa da
	 * `repair` de cada pendência para saber se o botão de reparo tem efeito neste host (spec Decision
	 * 11) — informação que um `PreconditionId[]` já teria descartado antes de chegar lá.
	 */
	pending: PreconditionStatus[] | null
}

interface PreconditionsActions {
	/** Recebe o que a porta reportou e guarda os status que ficaram pendentes (satisfeitos são descartados). */
	apply: (statuses: PreconditionStatus[]) => void
	reset: () => void
}

type PreconditionsStore = PreconditionsState & PreconditionsActions

const initialState: PreconditionsState = {
	pending: null,
}

export const usePreconditionsStore = create<PreconditionsStore>()(set => ({
	...initialState,
	apply: statuses => set({ pending: statuses.filter(status => !status.satisfied) }),
	reset: () => set(initialState),
}))
