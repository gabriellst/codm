import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

/**
 * Overlays de desenvolvimento, isolados NESTE módulo de propósito.
 *
 * O prefixo `-` é a convenção do TanStack Router para "não é rota" — o arquivo vive ao lado do seu
 * único consumidor (`__root.tsx`) sem virar URL.
 *
 * Por que um módulo separado em vez de um `{import.meta.env.DEV && <Devtools/>}` inline: com o
 * import ESTÁTICO lá, o Vite continua emitindo o chunk dos devtools no build de produção mesmo com
 * o JSX virando código morto — medido em 2026-08-07: o app EMPACOTADO exibia os dois overlays, e
 * gatear só a renderização os tirava da tela mas não do bundle. Importado dinamicamente sob
 * `import.meta.env.DEV`, a condição é substituída por `false` literal no `vite build`, o
 * `import()` nunca é alcançado e o chunk deixa de ser emitido.
 */
export function Devtools() {
	return (
		<>
			<TanStackRouterDevtools />
			<ReactQueryDevtools />
		</>
	)
}
