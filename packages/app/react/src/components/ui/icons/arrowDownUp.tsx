import React, { SVGProps } from "react";

interface Props {
  color: string;
}

export default React.forwardRef(function ArrowDownUpIcon(
  { color, ...props }: SVGProps<SVGSVGElement> & Props,
  ref: React.Ref<SVGSVGElement>,
) {
  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      style={{
        width: "14px",
        height: "14px",
      }}
      {...props}
    >
      <path
        d="M7 4V20M7 20L3 16M7 20L11 16M17 4V20M17 4L21 8M17 4L13 8"
        stroke={color || "#fff"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});
