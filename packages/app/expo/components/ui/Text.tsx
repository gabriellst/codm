import { Text as RNText, type TextProps } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const textVariants = cva('text-foreground', {
	variants: {
		variant: {
			hero: 'font-display text-6xl leading-tight',
			title: 'font-display text-2xl',
			kicker: 'text-[11px] font-sans-semi tracking-eyebrow uppercase text-foreground-subtle',
			body: 'text-base leading-relaxed',
			label: 'text-sm',
			caption: 'text-xs text-foreground-subtle',
		},
	},
	defaultVariants: { variant: 'body' },
})

type TextVariantProps = VariantProps<typeof textVariants>

export function Text({ className, variant, ...props }: TextProps & TextVariantProps) {
	return <RNText className={cn(textVariants({ variant }), className)} {...props} />
}
