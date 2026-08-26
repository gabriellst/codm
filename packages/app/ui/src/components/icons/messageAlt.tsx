import React, { SVGProps } from 'react'

export default React.forwardRef(function MessageAltIcon(props: SVGProps<SVGSVGElement>, ref: React.Ref<SVGSVGElement>) {
	const gradientId = 'messageAltIconGradient'

	return (
		<svg ref={ref} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" {...props}>
			<path
				fill={`url(#${gradientId})`}
				d="M18 3a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-4.724l-4.762 2.857a1 1 0 0 1-1.508-.743L7 21v-2H6a4 4 0 0 1-3.995-3.8L2 15V7a4 4 0 0 1 4-4zm-4 9H8a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2m2-4H8a1 1 0 1 0 0 2h8a1 1 0 0 0 0-2"
			/>
		</svg>
	)
})
