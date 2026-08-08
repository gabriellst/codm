import React, { SVGProps } from 'react'
/**
 * The CODM brand mark: a green "speech bubble" enclosing the cursive "dm"
 * wordmark. Fixed brand colors (not `currentColor`) — a two-tone brand mark
 * stays consistent across the light/dark theme instead of adapting to text color.
 *
 * The viewBox is the mark's measured bounding box, NOT the 1080x1080 canvas the
 * paths were traced in — that canvas carried ~200px of dead space on each side
 * horizontally and ~287px vertically, which letterboxed the mark inside every
 * caller's icon slot. Do not "round" it back to `0 0 1080 1080`: the padding
 * comes back. `width`/`height` carry the same 4:3 ratio so `w-auto` sizes right.
 */
export default React.forwardRef(function CodmLogoIcon(props: SVGProps<SVGSVGElement>, ref: React.Ref<SVGSVGElement>) {
	return (
		<svg ref={ref} width="64" height="48" viewBox="202.1 287.3 677.5 506.4" fill="none" {...props}>
			<g transform="translate(0,1080) scale(0.1,-0.1)" stroke="none">
				<path
					fill="#8ad12e"
					d="M6130 7920 c-311 -5 -754 -13 -985 -20 -231 -6 -654 -15 -940 -20 -563 -9 -635 -16 -840 -75 -466 -135 -909 -597 -1144 -1193 -123 -313 -139 -445 -151 -1287 -6 -375 -20 -862 -32 -1105 -20 -425 -22 -1242 -3 -1292 9 -23 26 -26 255 -45 311 -26 1284 -25 1690 2 381 26 970 26 1340 2 579 -39 1306 -27 2124 33 365 27 689 170 926 409 268 269 372 576 357 1056 -8 239 7 724 33 1118 74 1099 41 1417 -185 1762 -201 307 -560 567 -881 635 -122 26 -663 33 -1564 20z"
				/>
				<path
					fill="#ffffff"
					d="M4944 7100 c-82 -19 -155 -92 -214 -215 -85 -176 -183 -536 -230 -845 -5 -30 -20 -131 -35 -224 -14 -94 -28 -172 -30 -175 -3 -2 -78 19 -168 47 -189 61 -267 70 -418 52 -194 -24 -348 -93 -534 -240 -214 -170 -328 -407 -329 -685 -1 -196 46 -308 188 -449 246 -243 434 -323 636 -272 139 35 385 175 505 287 65 61 75 67 75 46 0 -35 71 -156 116 -197 118 -110 314 -151 436 -91 93 44 197 150 303 305 58 84 84 152 150 396 106 391 160 451 248 275 27 -56 88 -247 113 -359 41 -186 54 -228 90 -304 58 -121 189 -242 261 -242 74 0 231 243 293 455 47 160 57 202 89 388 32 181 41 204 99 242 127 84 174 17 237 -337 46 -257 170 -449 347 -538 156 -78 239 -38 351 170 72 132 197 491 183 525 -22 58 -94 -26 -193 -226 -122 -245 -136 -266 -180 -278 -80 -22 -98 -17 -152 50 -85 106 -99 140 -146 372 -66 318 -94 386 -199 472 -127 104 -238 116 -391 42 -126 -61 -154 -83 -187 -144 -36 -65 -85 -243 -103 -373 -29 -208 -61 -324 -95 -345 -29 -18 -66 163 -76 380 -4 79 -14 159 -26 205 -11 41 -24 89 -28 105 -52 206 -162 413 -252 472 -111 74 -242 -17 -325 -227 -12 -30 -49 -145 -82 -255 -134 -446 -228 -651 -342 -749 -70 -59 -115 -41 -144 58 -38 127 -12 285 89 539 189 478 283 845 326 1279 45 451 -43 659 -256 608z m-857 -1714 c54 -13 141 -29 193 -36 52 -7 96 -14 97 -15 2 -1 -11 -44 -27 -96 -123 -381 -406 -663 -681 -677 -101 -5 -166 21 -215 86 -128 166 -23 523 199 676 125 86 257 105 434 62z"
				/>
			</g>
		</svg>
	)
})
