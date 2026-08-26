import React, { SVGProps } from 'react'

export default React.forwardRef(function BoxIcon(props: SVGProps<SVGSVGElement>, ref: React.Ref<SVGSVGElement>) {
	return (
		<svg ref={ref} width="1em" height="1em" viewBox="0 0 35 35" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
			<path
				fill="currentColor"
				d="M21.0714 11H30V27C30 29.2062 28.3984 31 26.4286 31H8.57141C6.60156 31 5 29.2062 5 27V11H13.9286V17C13.9286 18.1062 14.7266 19 15.7142 19H19.2858C20.2734 19 21.0714 18.1062 21.0714 17V11Z"
			/>
			<path
				opacity="0.4"
				fill="currentColor"
				d="M27.1708 4.65632C26.7131 3.64368 25.7869 3 24.7713 3H19.2858L21.0714 11H30L27.1708 4.65632ZM13.9286 11V17C13.9286 18.1062 14.7266 19 15.7142 19H19.2858C20.2734 19 21.0714 18.1062 21.0714 17V11H13.9286ZM13.9286 11L15.7142 3H10.2287C9.21312 3 8.28688 3.64368 7.83484 4.65632L5 11H13.9286Z"
			/>
		</svg>
	)
})
