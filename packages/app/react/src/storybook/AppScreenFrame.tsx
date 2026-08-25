// packages/app/react/src/storybook/AppScreenFrame.tsx — moldura de tela para fidelity `kind: 'screens'`.
import type { ComponentProps, ReactNode } from 'react'
import { Sidebar } from '@/components/Navbar'
import { cn } from '@/lib/utils'

// Cores nativas do macOS (traffic lights) — chrome do SO, não um token de design: no app real quem
// desenha esses três pontos é o próprio SO (`titleBarStyle: 'Overlay'` do Tauri, ver
// `packages/app/tauri/config/window.ts`); `AppChrome` (src/components/console/AppChrome.tsx) só
// RESERVA a faixa, nunca os desenha. Aqui é reprodução ESTÁTICA para o screenshot de fidelity — mesmo
// precedente do PopupShell/AppScreenFrame de um produto irmão (sibling codebase).
function TrafficLights({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div className={cn('flex items-center gap-2', className)} {...props}>
			<span className="size-3 rounded-full bg-[#ff5f57]" />
			<span className="size-3 rounded-full bg-[#febc2e]" />
			<span className="size-3 rounded-full bg-[#28c840]" />
		</div>
	)
}

/** Reprodução estática da title bar (mesmo layout de `AppChrome`), com os traffic lights DESENHADOS —
 *  ver `TrafficLights` acima para o porquê de não reusar `AppChrome` direto. Dimensões/cor do spec
 *  `.pen` ("Title Bar", `design/system/pen/screens/*.json`): `height: 40` → `h-10`, `fill: $card` →
 *  `bg-card` (não `bg-route-background` — o título usa a mesma cinza dos cards, não o branco da
 *  página), `padding: [0, 16]` → `px-4` (o inset é do CONTAINER — os traffic lights não carregam
 *  padding próprio no .pen, por isso o antigo `pl-5` deles saiu), stroke `$border` cheio (não `/60`).
 *
 *  `plain` (F3 B2, provado em 6 telas independentes — os cinco specs de onboarding/permissao/tudo-
 *  pronto aqui + `login-wrapper.json` congelada): o nó "Title Bar" desses specs NÃO declara `fill`
 *  nem `stroke` (transparente, herda o `$bg` branco da janela por trás — sampleado no PNG alvo:
 *  (255,255,255) contra o (247,247,247) de `$card` que o app pintava). `height`/`padding` desses
 *  mesmos specs (44/18 vs 40/16 do grupo `bg-card`) ficam de fora — a mesma folga de ~2px já aceita
 *  para o grupo `bg-card` (`h-10`≈42px contra 40 do spec) cobre 44 igual, e o critério de
 *  relevância (UI-FIDELITY.md) trata diffs desse porte como ruído. Só a COR é a régua de estrutura
 *  aqui — daí o variant tocar só `bg-card`/`border-b`, não `h-10`/`px-4`. */
function TitleBar({ variant = 'chrome', className, ...props }: ComponentProps<'header'> & { variant?: 'chrome' | 'plain' }) {
	return (
		<header
			className={cn(
				'grid h-10 shrink-0 grid-cols-[auto_1fr_auto] items-center px-4',
				variant === 'chrome' ? 'border-b border-border bg-card' : 'bg-transparent',
				className,
			)}
			{...props}
		>
			<TrafficLights />
			<div className="flex justify-center">
				{/* eslint-disable-next-line local/no-hardcoded-jsx-text -- brand wordmark, mesma exceção de AppChrome */}
				<span className="select-none text-sm text-muted-foreground">codm</span>
			</div>
			<div />
		</header>
	)
}

interface AppScreenFrameProps extends ComponentProps<'div'> {
	/** Largura do viewport do design — default 1440 (o alvo de fidelity). */
	width?: number
	/** Altura do viewport do design — default 900 (o alvo de fidelity). */
	height?: number
	/** Renderiza a `Sidebar` real ao redor do conteúdo — default `true`. `false` para telas full-bleed
	 *  sem chrome de navegação (onboarding/login), onde a área de conteúdo ocupa a largura toda. */
	sidebar?: boolean
	/** Renderiza a title bar estática (traffic lights + wordmark) — default `true`. `false` para telas
	 *  full-bleed sem chrome de janela (onboarding/login). */
	titleBar?: boolean
	/** Variant da title bar — default `'chrome'` (`bg-card` + `border-b`, o grupo com `fill:$card` no
	 *  spec). `'plain'` é o grupo SEM `fill`/`stroke` no nó "Title Bar" do spec (transparente, herda o
	 *  branco da janela) — ver o docblock de `TitleBar` acima para a evidência (6 specs independentes,
	 *  pixel amostrado). Opt-in: omitir preserva o `'chrome'` de sempre, sem drift nas 22 congeladas. */
	titleBarVariant?: 'chrome' | 'plain'
	children: ReactNode
}

/**
 * F3 Wave 0 — a moldura de janela que as stories de fidelity `kind: 'screens'` compõem em volta de
 * uma rota, para que o "Atual" fotografado reflita o que o app real desenha ao redor da tela: a title
 * bar (chrome do Tauri) e a sidebar (`routes/(app)/route.tsx`), nenhuma das duas pertence à rota em
 * si. `overflow-hidden` no tamanho EXATO do viewport é o que fecha o mismatch de dimensão (o app é
 * uma JANELA — conteúdo que excede rola DENTRO dela, nunca estica a moldura). A sidebar é a
 * `Sidebar` REAL (`@/components/Navbar`) — nunca uma cópia hand-rolled das classes dela — então uma
 * regressão ali aparece aqui também. `sidebar`/`titleBar` (default `true`) omitem essa parte do
 * chrome para telas full-bleed (onboarding/login) que não têm sidebar nem title bar estática.
 */
export function AppScreenFrame({
	width = 1440,
	height = 900,
	sidebar = true,
	titleBar = true,
	titleBarVariant = 'chrome',
	className,
	children,
	style,
	...props
}: AppScreenFrameProps) {
	return (
		<div
			className={cn(
				// Spec ("Window", design/system/pen/screens/*.json): clip:true, stroke:$border 1px inner,
				// cornerRadius [24,24,24,8] — o MESMO shape que `rounded-asymmetric-xl` já expressa
				// (var(--radius-xl) nos 3 cantos + var(--radius-xl)*0.333 no bottom-left).
				'flex flex-col overflow-hidden rounded-asymmetric-xl border border-border bg-route-background text-foreground',
				className,
			)}
			style={{ width, height, ...style }}
			{...props}
		>
			{titleBar && <TitleBar variant={titleBarVariant} />}
			<div className="flex min-h-0 flex-1">
				{sidebar && <Sidebar />}
				<main className="min-h-0 flex-1 overflow-auto">{children}</main>
			</div>
		</div>
	)
}
