import { c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { c as cn } from "./router-NNnLbzcz.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { L as IconLoader2 } from "../_libs/tabler__icons-react.mjs";
function Spinner({ className, ...props }) {
  const { t } = useTranslation();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconLoader2, { "data-slot": "spinner", role: "status", "aria-label": t("common.loading"), className: cn("size-4 animate-spin", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/spinner.tsx",
    lineNumber: 7,
    columnNumber: 9
  }, this);
}
export {
  Spinner as S
};
