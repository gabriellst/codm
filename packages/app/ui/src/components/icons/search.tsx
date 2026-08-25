import React, { SVGProps } from 'react'

export default React.forwardRef(function SearchIcon(props: SVGProps<SVGSVGElement>, ref: React.Ref<SVGSVGElement>) {
	return (
		<svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="none" {...props}>
			<path
				d="M15.3751 15.3746L11.6939 11.6934M11.6939 11.6934C12.6902 10.697 13.2499 9.34574 13.2499 7.93672C13.2499 6.52771 12.6902 5.1764 11.6939 4.18008C10.6975 3.18375 9.34623 2.62402 7.93721 2.62402C6.5282 2.62402 5.17689 3.18375 4.18057 4.18008C3.18424 5.1764 2.62451 6.52771 2.62451 7.93672C2.62451 9.34574 3.18424 10.697 4.18057 11.6934C5.17689 12.6897 6.5282 13.2494 7.93721 13.2494C9.34623 13.2494 10.6975 12.6897 11.6939 11.6934Z"
				stroke="currentColor"
				strokeOpacity="0.4"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
})
