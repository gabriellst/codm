import React, { type SVGProps } from 'react'
export default React.forwardRef(function ProfitIcon(props: SVGProps<SVGSVGElement>, ref: React.Ref<SVGSVGElement>) {
	return (
		<svg ref={ref} xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" {...props}>
			{/* eslint-disable-next-line local/no-hardcoded-jsx-text -- SVG <title> is the icon semantic name, not localized copy */}
			<title>Profit</title>
			<g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}>
				<path d="m3 17l6-6l4 4l8-8" />
				<path d="M17 7h4v4" />
			</g>
		</svg>
	)
})
