import React, { type SVGProps } from 'react'
interface MegaphoneIconProps extends SVGProps<SVGSVGElement> {
	isTopBar?: boolean
}

export default React.forwardRef(function MegaphoneIcon({ isTopBar = false, ...props }: MegaphoneIconProps, ref: React.Ref<SVGSVGElement>) {
	return (
		<svg
			ref={ref}
			viewBox="0 0 35 35"
			width={isTopBar ? '28' : '24'}
			height={isTopBar ? '28' : '24'}
			{...(isTopBar
				? {
						strokeWidth: '1.8',
						strokeLinecap: 'round',
						strokeLinejoin: 'round',
						stroke: 'currentColor',
					}
				: {})}
			{...props}
		>
			<path
				d="M28.6111 7C29.3794 7 30 7.67039 30 8.50005V26.5C30 27.3296 29.3794 28 28.6111 28C27.8428 28 27.2222 27.3296 27.2222 26.5V8.50005C27.2222 7.67039 27.8428 7 28.6111 7ZM7.77781 14.4203L25.8333 8.50005V26.5L20.1433 24.6343C19.6787 26.5704 18.0512 28 16.1111 28C13.8108 28 11.9444 25.9843 11.9444 23.5C11.9444 22.9844 12.0269 22.4828 12.1745 22.0234L7.77781 20.5797C7.73875 21.3719 7.13109 22 6.38891 22C5.62063 22 5 21.3298 5 20.4999V14.5001C5 13.6702 5.62063 13 6.38891 13C7.13109 13 7.73875 13.6281 7.77781 14.4203ZM18.1511 23.9782L14.1753 22.675C14.0842 22.9282 14.0322 23.2094 14.0322 23.5C14.0322 24.7423 14.9653 25.7499 16.1155 25.7499C17.1137 25.7499 17.947 24.9907 18.1511 23.9782Z"
				fill="currentColor"
			/>
		</svg>
	)
})
