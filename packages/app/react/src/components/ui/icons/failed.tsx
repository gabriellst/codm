import React, { SVGProps } from "react";

export default React.forwardRef(function FailedIcon(
  props: SVGProps<SVGSVGElement>,
  ref: React.Ref<SVGSVGElement>,
) {
  return (
    <svg ref={ref} fill="none" viewBox="1 1 21 21" strokeWidth="2" stroke="#FF5858" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
});
