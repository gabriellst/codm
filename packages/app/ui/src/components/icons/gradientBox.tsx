import React, { SVGProps } from 'react'

export default React.forwardRef(function GradientBoxIcon(props: SVGProps<SVGSVGElement>, ref: React.Ref<SVGSVGElement>) {
	return (
		<svg ref={ref} width="78" height="78" viewBox="0 0 78 78" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<path
				d="M5.59131 27.8249H71.5913M5.59131 27.8249V64.4916C5.59131 66.4365 6.36393 68.3017 7.73919 69.677C9.11446 71.0523 10.9797 71.8249 12.9246 71.8249H64.258C66.2029 71.8249 68.0682 71.0523 69.4434 69.677C70.8187 68.3017 71.5913 66.4365 71.5913 64.4916V27.8249M5.59131 27.8249L14.5746 9.85822C15.1868 8.64329 16.1249 7.62261 17.284 6.91031C18.4431 6.19802 19.7775 5.8222 21.138 5.82488H56.0446C57.4113 5.81537 58.7535 6.18797 59.9196 6.90064C61.0858 7.61331 62.0297 8.63769 62.6446 9.85822L71.5913 27.8249M38.5913 5.82489V27.8249"
				stroke="currentColor"
				strokeWidth="11"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
})
