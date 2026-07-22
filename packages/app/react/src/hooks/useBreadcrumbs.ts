import { useMatches, type LinkProps } from '@tanstack/react-router'

export interface BreadcrumbItem {
	label: string
	to?: LinkProps['to']
}

export function useBreadcrumbs(): BreadcrumbItem[] {
	const matches = useMatches()

	const items: BreadcrumbItem[] = []

	for (const match of matches) {
		if (match.staticData?.breadcrumbs) {
			items.push(...(match.staticData.breadcrumbs as BreadcrumbItem[]))
		} else if (match.staticData?.breadcrumb) {
			items.push({ label: match.staticData.breadcrumb, to: match.pathname } as BreadcrumbItem)
		}
	}

	// Last item is the current page — remove its link
	if (items.length > 0) {
		delete items[items.length - 1].to
	}

	return items
}
