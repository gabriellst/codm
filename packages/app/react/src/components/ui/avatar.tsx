'use client'

import * as React from 'react'
import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar'

import { cn } from '@/lib/utils'

const AvatarGroupContext = React.createContext<{ size: 'default' | 'sm' | 'lg' }>({ size: 'default' })

function Avatar({
	className,
	size = 'default',
	...props
}: AvatarPrimitive.Root.Props & {
	size?: 'default' | 'sm' | 'lg'
}) {
	return (
		<AvatarPrimitive.Root
			data-slot="avatar"
			data-size={size}
			// REDONDO, e é exceção deliberada à escada `rounded-asymmetric-*` que rege o resto do sistema
			// (decisão do founder, 07/08/2026). O raio assimétrico existe para SUPERFÍCIES — cards, linhas,
			// chips —, onde o canto menor é assinatura da marca. Um avatar não é superfície: é o rosto de
			// uma pessoa, e rosto lê como círculo. Vale para os três anéis (raiz, imagem e fallback), que
			// precisam concordar ou o recorte da foto aparece por baixo da borda.
			className={cn(
				'size-8 rounded-full after:rounded-full data-[size=lg]:size-10 data-[size=sm]:size-6 after:border-border group/avatar relative flex shrink-0 select-none after:absolute after:inset-0 after:border after:mix-blend-darken dark:after:mix-blend-lighten',
				className,
			)}
			{...props}
		/>
	)
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
	return (
		<AvatarPrimitive.Image
			data-slot="avatar-image"
			className={cn('rounded-full aspect-square size-full object-cover', className)}
			{...props}
		/>
	)
}

function AvatarFallback({ className, ...props }: AvatarPrimitive.Fallback.Props) {
	return (
		<AvatarPrimitive.Fallback
			data-slot="avatar-fallback"
			className={cn(
				// Verde claro com iniciais verde-escuras — o par --secondary/--secondary-foreground, medido na
				// referência (o cinza de antes vinha do template, não do desenho).
				'bg-secondary text-secondary-foreground rounded-full flex size-full items-center justify-center text-sm group-data-[size=sm]/avatar:text-xs',
				className,
			)}
			{...props}
		/>
	)
}

function AvatarBadge({ className, ...props }: React.ComponentProps<'span'>) {
	return (
		<span
			data-slot="avatar-badge"
			className={cn(
				'bg-primary text-primary-foreground ring-background absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-blend-color ring-2 select-none',
				'group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden',
				'group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2',
				'group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2',
				className,
			)}
			{...props}
		/>
	)
}

function AvatarGroup({
	className,
	size = 'default',
	children,
	...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'sm' | 'lg' }) {
	return (
		<AvatarGroupContext.Provider value={{ size }}>
			<div
				data-slot="avatar-group"
				className={cn('*:data-[slot=avatar]:ring-background flex -space-x-2 *:data-[slot=avatar]:ring-2', className)}
				{...props}
			>
				{children}
			</div>
		</AvatarGroupContext.Provider>
	)
}

function AvatarGroupCount({ className, ...props }: React.ComponentProps<'div'>) {
	const { size } = React.useContext(AvatarGroupContext)
	return (
		<div
			data-slot="avatar-group-count"
			className={cn(
				'bg-muted text-muted-foreground rounded-full text-sm ring-background relative flex shrink-0 items-center justify-center ring-2',
				size === 'lg' ? 'size-10 [&>svg]:size-5' : size === 'sm' ? 'size-6 [&>svg]:size-3' : 'size-8 [&>svg]:size-4',
				className,
			)}
			{...props}
		/>
	)
}

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge }
