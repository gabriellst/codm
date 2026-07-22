import React from "react";
import type { SVGProps } from "react";

export default React.forwardRef(function AddIcon(
  props: SVGProps<SVGSVGElement>,
  ref: React.Ref<SVGSVGElement>,
) {
  return (
    <svg ref={ref} 
        xmlns="http://www.w3.org/2000/svg" 
        width="20" 
        height="20" 
        viewBox="0 0 20 20"
     {...props}>
        <path
         fill="currentColor" 
         fillRule="evenodd" 
         d="M.5 10a.5.5 0 0 1 .5-.5h18a.5.5 0 0 1 0 1H1a.5.5 0 0 1-.5-.5" 
         clipRule="evenodd"
        />
    </svg>
  );
});
