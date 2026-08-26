import React from 'react'
import type { SVGProps } from 'react'

export default React.forwardRef(function CheckOutlinedIcon(props: SVGProps<SVGSVGElement>, ref: React.Ref<SVGSVGElement>) {
	return (
		<svg ref={ref} xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" {...props}>
			<path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2.5}
				d="M8.5 11.5L11 14l4-4m6 2a9 9 0 1 1-18 0a9 9 0 0 1 18 0"
			></path>
		</svg>
	)
})
