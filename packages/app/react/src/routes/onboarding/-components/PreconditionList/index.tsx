// packages/app/react/src/routes/onboarding/-components/PreconditionList/index.tsx — COMPLETE final file.
// MANTENHA a forma do scaffold: export nomeado, props estendendo ComponentProps, `{ className, ...props }`, `cn(...)`.
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Um módulo de pré-condição do lado do console: o id e como EXPLICAR essa pendência ao operador. A
 * detecção e o reparo pertencem ao host (services/PreconditionsService) — o que sobra para cá é a
 * única responsabilidade que uma webview pode ter das três.
 */
export interface PreconditionModule<Id extends string> {
	id: Id
	Component: () => ReactNode
}

interface PreconditionListProps<Id extends string> extends Omit<ComponentProps<'div'>, 'children'> {
	pending: readonly Id[]
	modules: Record<Id, PreconditionModule<Id>>
}

/**
 * A LISTA NÃO CONHECE NENHUMA PRÉ-CONDIÇÃO, e é isso que ela existe para garantir. Ela recebe o
 * mapa e despacha por índice — nunca uma cadeia de `if`, nunca um `switch` sobre o id (canon
 * CMP-P18). Genérica sobre `Id` para que a prova de extensibilidade (AC-8) possa passar um id que
 * não existe em produção: se a genericidade não estivesse aqui, "somar uma pré-condição sem editar
 * módulo existente" seria uma afirmação sem teste possível.
 *
 * A exaustividade vem do tipo: `Record<Id, …>` faz um id sem entrada parar de compilar (AC-5), então
 * o acesso por índice aqui não precisa de guarda em runtime — não existe caso ausente.
 */
export function PreconditionList<Id extends string>({ pending, modules, className, ...props }: PreconditionListProps<Id>) {
	return (
		<div className={cn('flex w-full flex-col gap-4', className)} {...props}>
			{pending.map(id => {
				const { Component } = modules[id]
				return <Component key={id} />
			})}
		</div>
	)
}
