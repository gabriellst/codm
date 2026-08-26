import type { SVGProps } from 'react'
import React from 'react'

export default React.forwardRef(function ChevronRightIcon(props: SVGProps<SVGSVGElement>, ref: React.Ref<SVGSVGElement>) {
	return (
		<svg ref={ref} xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" {...props}>
			<path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m9 6l6 6l-6 6"></path>
		</svg>
	)
})
