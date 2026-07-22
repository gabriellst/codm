import React, { SVGProps } from "react";

export default React.forwardRef(function CloseIcon(
  props: SVGProps<SVGSVGElement>,
  ref: React.Ref<SVGSVGElement>,
) {
  return (
    <svg ref={ref} viewBox="0 0 14 14" fill="currentColor" {...props}>
      <path
        d="M2 12L12 2M2 2L12 12"
        stroke="currentColor"
        strokeWidth={props?.strokeWidth ?? "3"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});
