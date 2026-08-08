import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import CodmLogoIcon from '@/components/ui/icons/codmLogo'

/**
 * O lockup da marca: o símbolo (bolha verde + "dm") ao lado da palavra "CoDM".
 *
 * A referência do redesign usa os dois juntos no topo da sidebar — o símbolo sozinho não diz o
 * nome, e a palavra sozinha perde a marca. O texto é `currentColor` de propósito: o símbolo tem
 * cores fixas (verde e branco, é marca de duas cores), a palavra acompanha a superfície onde o
 * lockup estiver.
 */
export function Logo({ className, ...props }: ComponentProps<'span'>) {
	return (
		<span className={cn('inline-flex items-center gap-2.5 text-foreground', className)} {...props}>
			<CodmLogoIcon className="h-8 w-auto" />
		</span>
	)
}
