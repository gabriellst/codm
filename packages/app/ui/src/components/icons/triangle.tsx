import React, { SVGProps } from 'react'

export default React.forwardRef(function TriangleIcon(props: SVGProps<SVGSVGElement>, ref: React.Ref<SVGSVGElement>) {
	return (
		<svg ref={ref} viewBox="0 0 17 9" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
			<path
				d="M7.79655 0.696238C8.18622 0.310561 8.81378 0.310561 9.20345 0.696238L15.8648 7.28926C16.4998 7.91772 16.0547 9 15.1613 9H1.83866C0.945265 9 0.500232 7.91772 1.1352 7.28926L7.79655 0.696238Z"
				fillOpacity="0.9"
			/>
		</svg>
	)
})
