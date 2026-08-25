import React, { type SVGProps } from 'react'

export default React.forwardRef(function LoadingIcon(props: SVGProps<SVGSVGElement>, ref: React.Ref<SVGSVGElement>) {
	return (
		<svg ref={ref} viewBox="0 0 100 100" fill="none" style={{ ...(props.style || {}), background: 'transparent' }} {...props}>
			{/* eslint-disable-next-line local/no-hardcoded-jsx-text -- SVG <title> is the icon semantic name, not localized copy */}
			<title>Loading</title>
			<circle
				cx="50"
				cy="50"
				r="40"
				style={{
					fill: 'none',
				}}
				stroke="currentColor"
				strokeWidth="8"
				strokeDasharray="120, 300"
				strokeLinecap="round"
			>
				<animateTransform
					attributeName="transform"
					type="rotate"
					from="0 50 50"
					to="360 50 50"
					dur="1s"
					repeatCount="indefinite"
					keyTimes="0; 0.5; 1"
					keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
					calcMode="spline"
				/>
			</circle>
		</svg>
	)
})
