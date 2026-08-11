import * as React from 'react'
import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// CODM buttons are flat. D3 vocabulary (founder, 11/08/2026) — six variants, one role each:
//   default      primary action, solid brand green ("Continuar", "Vincular conversa")
//   outline      secondary action, hollow ("Voltar", "Cancelar", "Assumir", "Pular"):
//                foreground/20 border + foreground/60 text, NO fill
//   ghost        utility, borderless ("Editar", "Reescanear", "Fechar"): foreground/60 text
//   soft         flat neutral fill ("Pausar"/"Configurar" in the thread header): bg-muted, no border
//   secondary    the ON state of a toggle, and ONLY that ("Ocultar arquivadas" while active) —
//                the pastel is unchanged; what changed is the MEANING: it is no longer
//                "secondary action" (that's `outline` now)
//   destructive  solid red ("Apagar conversa", "Excluir conta")
// Semantic alert actions (Resolver/Aprovar/Reiniciar/Negar) are NOT a variant — they live in
// `surfaces.ts` as the `alertSurface`/`alertActionButton` preset pair; see the note there.
// Sentence case — labels are NOT uppercased. EVERY size uses the asymmetric ladder (decision 6B:
// the D2 "text sizes are 999px pills" measurement was overruled by the D3 merge — pills remain
// only where width==height would make them circles anyway, i.e. nowhere here), stepped by the
// button's own height so the shape stays proportional: h-6→3xs, h-7→2xs, h-8→xs, h-9→sm —
// mirroring what the icon-only sizes already did.
const buttonVariants = cva(
	"focus-visible:ring-ring/40 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 text-sm font-medium focus-visible:ring-2 aria-invalid:ring-2 [&_svg:not([class*='size-'])]:size-4 inline-flex items-center justify-center whitespace-nowrap transition-all duration-150 ease-out cursor-pointer disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none group/button select-none",
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85 font-semibold',
				secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70 active:bg-secondary/60',
				// hover:border-primary is MEASURED (D2, still true in D3): a hollow button hovers by
				// waking its border to brand green, never by filling. Preserved through the D3 recolor.
				outline: 'border border-foreground/20 text-foreground/60 hover:border-primary active:bg-muted/70',
				ghost: 'border border-transparent text-foreground/60 hover:bg-muted aria-expanded:bg-muted',
				soft: 'border border-transparent bg-muted text-foreground hover:bg-muted/70 active:bg-muted/60',
				destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold',
				link: 'text-foreground underline-offset-4 hover:underline aria-expanded:underline',
			},
			size: {
				default: 'h-8 gap-1.5 px-3.5 rounded-asymmetric-xs has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
				xs: "h-6 gap-1 px-2.5 text-xs rounded-asymmetric-3xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-7 gap-1 px-3 text-sm rounded-asymmetric-2xs has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
				lg: 'h-9 gap-1.5 px-5 rounded-asymmetric-sm has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4',
				icon: 'size-8 rounded-asymmetric-xs',
				'icon-xs': "size-6 rounded-asymmetric-3xs [&_svg:not([class*='size-'])]:size-3",
				'icon-sm': 'size-7 rounded-asymmetric-2xs',
				'icon-lg': 'size-9 rounded-asymmetric-sm',
				none: '',
			},
		},
		compoundVariants: [
			{
				// D2 — every icon-only utility button in the reference (back-nav, "+" new conversation,
				// pause, settings gear, modal close) hovers to the secondary pastel (`#EAF6D3`), never the
				// neutral gray `hover:bg-muted` that plain text/list-row hovers use. Scoped to icon sizes
				// only — a text ghost button (menu item, calendar chevron) keeps the neutral hover.
				variant: 'ghost',
				size: ['icon', 'icon-xs', 'icon-sm', 'icon-lg'],
				class: 'hover:bg-secondary aria-expanded:bg-secondary',
			},
		],
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
)

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, ...props }, ref) {
	return <ButtonPrimitive ref={ref} data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
})

export { Button, buttonVariants }
