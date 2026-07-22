import { c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { B as Button, c as cn } from "./router-NNnLbzcz.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { f as IconX } from "../_libs/tabler__icons-react.mjs";
import { D as DialogRoot, d as DialogTrigger$1, e as DialogPopup, f as DialogClose$1, g as DialogTitle$1, h as DialogDescription$1, i as DialogPortal$1, j as DialogBackdrop } from "../_libs/base-ui__react.mjs";
function Dialog({ ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogRoot, { "data-slot": "dialog", ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
    lineNumber: 10,
    columnNumber: 9
  }, this);
}
function DialogTrigger({ ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogTrigger$1, { "data-slot": "dialog-trigger", ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
    lineNumber: 14,
    columnNumber: 9
  }, this);
}
function DialogPortal({ ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogPortal$1, { "data-slot": "dialog-portal", ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
    lineNumber: 18,
    columnNumber: 9
  }, this);
}
function DialogClose({ ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogClose$1, { "data-slot": "dialog-close", ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
    lineNumber: 22,
    columnNumber: 9
  }, this);
}
function DialogOverlay({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    DialogBackdrop,
    {
      "data-slot": "dialog-overlay",
      className: cn(
        "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 bg-black/20 dark:bg-black/40 duration-200 ease-in-out supports-backdrop-filter:backdrop-blur-sm fixed inset-0 isolate z-50",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
      lineNumber: 27,
      columnNumber: 3
    },
    this
  );
}
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}) {
  const { t } = useTranslation();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogPortal, { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogOverlay, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
      lineNumber: 49,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      DialogPopup,
      {
        "data-slot": "dialog-content",
        className: cn(
          "bg-background data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-98 data-open:zoom-in-100 data-closed:slide-out-to-top-2 data-open:slide-in-from-top-2 border border-border shadow-[0_16px_48px_-12px_rgb(0_0_0/0.22)] grid max-w-[calc(100%-2rem)] gap-4 rounded-2xl p-6 text-sm duration-150 ease-out sm:max-w-md fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none",
          className
        ),
        ...props,
        children: [
          children,
          showCloseButton && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            DialogClose$1,
            {
              "data-slot": "dialog-close",
              render: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "secondary", className: "absolute top-4 right-4", size: "icon" }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
                lineNumber: 62,
                columnNumber: 15
              }, this),
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconX, {}, void 0, false, {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
                  lineNumber: 64,
                  columnNumber: 7
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "sr-only", children: t("common.close") }, void 0, false, {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
                  lineNumber: 65,
                  columnNumber: 7
                }, this)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
              lineNumber: 60,
              columnNumber: 6
            },
            this
          )
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
        lineNumber: 50,
        columnNumber: 4
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
    lineNumber: 48,
    columnNumber: 3
  }, this);
}
function DialogHeader({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { "data-slot": "dialog-header", className: cn("gap-2 flex flex-col", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
    lineNumber: 74,
    columnNumber: 9
  }, this);
}
function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}) {
  const { t } = useTranslation();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      "data-slot": "dialog-footer",
      className: cn(
        "bg-muted/40 -mx-6 -mb-6 rounded-b-2xl border-t border-border p-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      ),
      ...props,
      children: [
        children,
        showCloseButton && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogClose$1, { render: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "outline" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
          lineNumber: 96,
          columnNumber: 55
        }, this), children: t("common.close") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
          lineNumber: 96,
          columnNumber: 24
        }, this)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
      lineNumber: 87,
      columnNumber: 3
    },
    this
  );
}
function DialogTitle({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogTitle$1, { "data-slot": "dialog-title", className: cn("text-lg leading-snug font-semibold", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
    lineNumber: 102,
    columnNumber: 9
  }, this);
}
function DialogDescription({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    DialogDescription$1,
    {
      "data-slot": "dialog-description",
      className: cn("text-muted-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3", className),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/dialog.tsx",
      lineNumber: 107,
      columnNumber: 3
    },
    this
  );
}
export {
  Dialog as D,
  DialogTrigger as a,
  DialogContent as b,
  DialogHeader as c,
  DialogTitle as d,
  DialogDescription as e,
  DialogFooter as f,
  DialogClose as g
};
