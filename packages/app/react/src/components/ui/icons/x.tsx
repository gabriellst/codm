import React, { SVGProps } from "react";

export default React.forwardRef(function XIcon(
  props: SVGProps<SVGSVGElement>,
  ref: React.Ref<SVGSVGElement>,
) {
  return (
    <svg
      ref={ref}
      viewBox="0 0 18 17"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g id="Frame">
        <path
          id="Vector"
          d="M6.06079 11.4385L12.0364 5.46289M6.06079 5.46289L12.0364 11.4385"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
});
