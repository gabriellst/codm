import React, { SVGProps } from "react";

export default React.forwardRef(function SmsIcon(
  props: SVGProps<SVGSVGElement>,
  ref: React.Ref<SVGSVGElement>
) {
  const gradientId = "smsIconGradient";

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      <path fill={`url(#${gradientId})`} d="M7 4h10v14H7z" opacity={0.3}></path>
      <path
        fill={`url(#${gradientId})`}
        d="M16 1H8C6.34 1 5 2.34 5 4v16c0 1.66 1.34 3 3 3h8c1.66 0 3-1.34 3-3V4c0-1.66-1.34-3-3-3m-2 20h-4v-1h4zm3-3H7V4h10z"
      ></path>
    </svg>
  );
});
