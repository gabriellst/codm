import { c as jsxDevRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { c as cva } from "../_libs/class-variance-authority.mjs";
import { c as cn, k as translateError } from "./router-GQ4JltwW.mjs";
import { I as Input$1 } from "../_libs/base-ui__react.mjs";
function Label({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "label",
    {
      "data-slot": "label",
      className: cn(
        "gap-2 text-sm leading-none font-medium group-data-[disabled=true]:opacity-50 peer-disabled:opacity-50 flex items-center select-none group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/label.tsx",
      lineNumber: 9,
      columnNumber: 3
    },
    this
  );
}
function FieldGroup({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      "data-slot": "field-group",
      className: cn(
        "gap-5 data-[slot=checkbox-group]:gap-3 [&>[data-slot=field-group]]:gap-4 group/field-group @container/field-group flex w-full flex-col",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/field.tsx",
      lineNumber: 31,
      columnNumber: 3
    },
    this
  );
}
const fieldVariants = cva("data-[invalid=true]:text-destructive gap-2 group/field flex w-full", {
  variants: {
    orientation: {
      vertical: "flex-col [&>*]:w-full [&>.sr-only]:w-auto",
      horizontal: "flex-row items-center [&>[data-slot=field-label]]:flex-auto has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      responsive: "flex-col [&>*]:w-full [&>.sr-only]:w-auto @md/field-group:flex-row @md/field-group:items-center @md/field-group:[&>*]:w-auto @md/field-group:[&>[data-slot=field-label]]:flex-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px"
    }
  },
  defaultVariants: {
    orientation: "vertical"
  }
});
function Field({ className, orientation = "vertical", ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      role: "group",
      "data-slot": "field",
      "data-orientation": orientation,
      className: cn(fieldVariants({ orientation }), className),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/field.tsx",
      lineNumber: 59,
      columnNumber: 3
    },
    this
  );
}
function FieldLabel({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Label,
    {
      "data-slot": "field-label",
      className: cn(
        "has-data-checked:bg-primary/5 has-data-checked:border-primary dark:has-data-checked:bg-primary/10 gap-2 group-data-[disabled=true]/field:opacity-50 has-[>[data-slot=field]]:rounded-lg has-[>[data-slot=field]]:border [&>*]:data-[slot=field]:p-2.5 group/field-label peer/field-label flex w-fit leading-snug",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/field.tsx",
      lineNumber: 77,
      columnNumber: 3
    },
    this
  );
}
function translateErrorMessage(message) {
  if (!message) return message;
  return translateError(message);
}
function FieldError({
  className,
  children,
  errors,
  ...props
}) {
  const content = reactExports.useMemo(() => {
    if (children) {
      return children;
    }
    if (!errors?.length) {
      return null;
    }
    const translatedErrors = errors.map((error) => {
      if (typeof error === "string") return { message: translateErrorMessage(error) };
      return {
        ...error,
        message: translateErrorMessage(error?.message)
      };
    });
    const uniqueErrors = [...new Map(translatedErrors.map((error) => [error?.message, error])).values()];
    if (uniqueErrors?.length === 1) {
      return uniqueErrors[0]?.message;
    }
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("ul", { className: "ml-4 flex list-disc flex-col gap-1", children: uniqueErrors.map((error, index) => error?.message && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("li", { children: error.message }, index, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/field.tsx",
      lineNumber: 182,
      columnNumber: 59
    }, this)) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/field.tsx",
      lineNumber: 181,
      columnNumber: 4
    }, this);
  }, [children, errors]);
  if (!content) {
    return null;
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { role: "alert", "data-slot": "field-error", className: cn("text-destructive text-sm font-normal", className), ...props, children: content }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/field.tsx",
    lineNumber: 192,
    columnNumber: 3
  }, this);
}
const inputBg = "gradient-bg-[var(--background)_-85%,color-mix(in_oklab,var(--background),var(--foreground)_10%)_110%]";
const inputBorder = "gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0)_60%]";
const inputBorderFocus = "focus:gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0.05)_100%]";
const Input = reactExports.forwardRef(function Input2({ className, type, ...props }, ref) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Input$1,
    {
      ref,
      type,
      "data-slot": "input",
      className: cn(
        "gradient-box",
        inputBg,
        inputBorder,
        inputBorderFocus,
        // Smooth hover: the gradient-border swap can't tween (--tw-gradient-border is syntax:"*"),
        // so animate a brightness lift instead — same trick the Button uses.
        "transition-[filter] duration-200 ease-in-out hover:brightness-125",
        "rounded-lg px-2.5 py-1 text-sm placeholder:text-muted-foreground",
        "h-8 w-full min-w-0 outline-none",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:ring-0",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/input.tsx",
      lineNumber: 14,
      columnNumber: 3
    },
    this
  );
});
export {
  FieldGroup as F,
  Input as I,
  Field as a,
  FieldLabel as b,
  FieldError as c
};
