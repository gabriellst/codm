import { c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { a as useRouter } from "../_libs/tanstack__react-router.mjs";
import { B as Button, c as cn } from "./router-NNnLbzcz.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { p as IconChevronLeft } from "../_libs/tabler__icons-react.mjs";
function PageHeader({
  title,
  subtitle,
  action,
  back = true,
  className
}) {
  const router = useRouter();
  const { t } = useTranslation();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: cn("flex items-start justify-between gap-4", className), children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex min-w-0 flex-1 flex-col gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
        back && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Button,
          {
            variant: "secondary",
            size: "icon",
            "aria-label": t("console.back"),
            className: "size-9 shrink-0 rounded-full",
            onClick: () => router.history.back(),
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconChevronLeft, {}, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/PageHeader.tsx",
              lineNumber: 41,
              columnNumber: 8
            }, this)
          },
          void 0,
          false,
          {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/PageHeader.tsx",
            lineNumber: 34,
            columnNumber: 7
          },
          this
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h1", { className: "heading-display text-3xl text-foreground md:text-4xl", children: title }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/PageHeader.tsx",
          lineNumber: 44,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/PageHeader.tsx",
        lineNumber: 32,
        columnNumber: 5
      }, this),
      subtitle && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm text-muted-foreground", children: subtitle }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/PageHeader.tsx",
        lineNumber: 46,
        columnNumber: 18
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/PageHeader.tsx",
      lineNumber: 31,
      columnNumber: 4
    }, this),
    action && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "shrink-0", children: action }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/PageHeader.tsx",
      lineNumber: 48,
      columnNumber: 15
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/PageHeader.tsx",
    lineNumber: 30,
    columnNumber: 3
  }, this);
}
export {
  PageHeader as P
};
