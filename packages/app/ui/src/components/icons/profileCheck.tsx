import React, { SVGProps } from 'react'
export default React.forwardRef(function ProfileCheckIcon(props: SVGProps<SVGSVGElement>, ref: React.Ref<SVGSVGElement>) {
	return (
		<svg ref={ref} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" {...props}>
			<path
				fill="currentColor"
				d="m21.1 12.5l1.4 1.41l-6.53 6.59L12.5 17l1.4-1.41l2.07 2.08zM10 17l3 3H3v-2c0-2.21 3.58-4 8-4l1.89.11zm1-13a4 4 0 0 1 4 4a4 4 0 0 1-4 4a4 4 0 0 1-4-4a4 4 0 0 1 4-4"
			/>
		</svg>
	)
})
