import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../lib/cn'
import { alertSurface } from './surfaces'

/**
 * The decision/question card (pen "Cartão / Decisão"): the near-black `alertSurface`, the same
 * highest-emphasis surface as the needs-you panel. Header = bright-green dot + mono code
 * ("APP-12 · D1") + kind ("Decisão") + age on the right; the question in white semibold; the
 * answers (`AskCardOption`, passed as children); a muted note under them.
 *
 * ON-DARK NEUTRALS: the pen's `--on-dark-muted` / `--fg-inverse-20` are not ported (tokens.css —
 * the derivation IS the inversion), so this card uses the house derivation the needs-you panel
 * already uses: `text-background/60` for muted text, `border-background/20` for the outline.
 *
 * `locked` — the viewer may not release this decision (only who can release answers). The card
 * then DISABLES every option through context (real `disabled`, not just dimmed) and exposes
 * `data-locked`; the note is the caller's place to say why.
 */

const AskCardContext = React.createContext<{ locked: boolean }>({ locked: false })

type AskCardProps = Omit<React.ComponentProps<'section'>, 'title'> & {
	/** The mono reference — "APP-12 · D1". */
	code: React.ReactNode
	/** The kind label — "Decisão", "Pergunta". */
	kind: React.ReactNode
	/** Relative age — "há 8 min". */
	age?: React.ReactNode
	question: React.ReactNode
	/** The line under the actions — who may answer, or what happens by default. */
	note?: React.ReactNode
	locked?: boolean
}

function AskCard({ code, kind, age, question, note, locked = false, className, children, ...props }: AskCardProps) {
	const context = React.useMemo(() => ({ locked }), [locked])
	return (
		<section
			data-slot="ask-card"
			data-locked={locked ? '' : undefined}
			className={cn('flex min-w-0 flex-col gap-2.5 rounded-asymmetric-lg p-3.75', alertSurface, className)}
			{...props}
		>
			<header className="flex min-w-0 items-center gap-2 text-xs">
				<span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-success-bright" />
				<span className="shrink-0 font-mono font-bold text-success-bright">{code}</span>
				<span className="min-w-0 truncate text-background/60">{kind}</span>
				{age ? <span className="ml-auto shrink-0 text-background/60">{age}</span> : null}
			</header>
			<p className="text-[15px] font-semibold leading-snug text-background">{question}</p>
			{children ? (
				<AskCardContext.Provider value={context}>
					<div data-slot="ask-card-actions" className="flex flex-wrap gap-2">
						{children}
					</div>
				</AskCardContext.Provider>
			) : null}
			{note ? <p className="text-xs text-background/60">{note}</p> : null}
		</section>
	)
}

const askCardOptionVariants = cva(
	'inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-asymmetric-sm px-3.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-success-bright/60 disabled:cursor-not-allowed disabled:opacity-50',
	{
		variants: {
			variant: {
				primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
				outline: 'border border-background/20 bg-transparent text-background hover:border-success-bright',
			},
		},
		defaultVariants: { variant: 'primary' },
	},
)

type AskCardOptionProps = React.ComponentProps<'button'> & VariantProps<typeof askCardOptionVariants>

/** One answer on the dark card — a real `<button type="button">`, disabled while the card is `locked`. */
function AskCardOption({ variant, disabled, className, ...props }: AskCardOptionProps) {
	const { locked } = React.useContext(AskCardContext)
	return (
		<button
			type="button"
			data-slot="ask-card-option"
			disabled={locked || disabled}
			className={cn(askCardOptionVariants({ variant }), className)}
			{...props}
		/>
	)
}

export { AskCard, AskCardOption, askCardOptionVariants }
