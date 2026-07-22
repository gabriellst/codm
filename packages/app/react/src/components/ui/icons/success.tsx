import React, { SVGProps } from "react";

export default React.forwardRef(function SuccessIcon(
  { color, ...props }: SVGProps<SVGSVGElement>,
  ref: React.Ref<SVGSVGElement>,
) {
  return (
    <svg ref={ref} viewBox="0 0 33 33" fill="none" {...props}>
      <path
        d="M11.875 17.6562L15.3437 21.125L21.125 13.0312M30.375 16.5C30.375 18.3221 30.0161 20.1263 29.3188 21.8097C28.6215 23.4931 27.5995 25.0227 26.3111 26.3111C25.0227 27.5995 23.4931 28.6215 21.8097 29.3188C20.1263 30.0161 18.3221 30.375 16.5 30.375C14.6779 30.375 12.8737 30.0161 11.1903 29.3188C9.50687 28.6215 7.97731 27.5995 6.68889 26.3111C5.40048 25.0227 4.37846 23.4931 3.68117 21.8097C2.98389 20.1263 2.625 18.3221 2.625 16.5C2.625 12.8201 4.08683 9.29096 6.68889 6.68889C9.29096 4.08683 12.8201 2.625 16.5 2.625C20.1799 2.625 23.709 4.08683 26.3111 6.68889C28.9132 9.29096 30.375 12.8201 30.375 16.5Z"
        stroke={color || "currentColor"}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});
