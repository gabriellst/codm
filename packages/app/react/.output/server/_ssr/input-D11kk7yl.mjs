import { r as reactExports, c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { c as cn } from "./router-NNnLbzcz.mjs";
import { I as Input$1 } from "../_libs/base-ui__react.mjs";
const Input = reactExports.forwardRef(function Input2({ className, type, ...props }, ref) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Input$1,
    {
      ref,
      type,
      "data-slot": "input",
      className: cn(
        "flex h-8 w-full min-w-0 rounded-full border border-border bg-background px-3.5 py-1 text-sm text-foreground",
        "placeholder:text-muted-foreground",
        "transition-colors duration-150 ease-out outline-none",
        "hover:border-foreground/25 focus-visible:border-foreground/40 focus-visible:ring-0",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/input.tsx",
      lineNumber: 10,
      columnNumber: 3
    },
    this
  );
});
export {
  Input as I
};
