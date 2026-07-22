import React, { SVGProps } from "react";

export default React.forwardRef(function TagIcon(
  props: SVGProps<SVGSVGElement>,
  ref: React.Ref<SVGSVGElement>,
) {
  return (
    <svg
      ref={ref}
      viewBox="0 0 25 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g id="Frame">
        <path
          id="Vector"
          d="M9.568 2.5H5.25C4.65326 2.5 4.08097 2.73705 3.65901 3.15901C3.23705 3.58097 3 4.15326 3 4.75V9.068C3 9.665 3.237 10.238 3.659 10.659L13.24 20.24C13.939 20.939 15.02 21.112 15.847 20.57C17.9286 19.2066 19.7066 17.4286 21.07 15.347C21.612 14.52 21.439 13.439 20.74 12.74L11.16 3.16C10.951 2.95077 10.7029 2.78478 10.4297 2.67154C10.1565 2.55829 9.86371 2.5 9.568 2.5Z"
          stroke="currentColor"
          strokeOpacity="0.7"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          id="Vector_2"
          d="M6 5.5H6.008V5.508H6V5.5Z"
          stroke="currentColor"
          strokeOpacity="0.7"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
});
