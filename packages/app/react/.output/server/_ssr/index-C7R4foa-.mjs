import { r as reactExports, c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { B as Button, c as cn } from "./router-NNnLbzcz.mjs";
import { B as Badge } from "./badge-CKHT7bhp.mjs";
import { C as Card, a as CardHeader, b as CardTitle, c as CardDescription, d as CardContent, e as CardFooter } from "./card-f5vvoeSM.mjs";
import { D as Dialog, a as DialogTrigger, b as DialogContent, c as DialogHeader, d as DialogTitle, e as DialogDescription, f as DialogFooter, g as DialogClose } from "./dialog-CDhCxi7G.mjs";
import { I as Input } from "./input-D11kk7yl.mjs";
import { T as Textarea } from "./textarea-864XhA0n.mjs";
import { L as Label } from "./label-DMAOYP1G.mjs";
import { c as cva } from "../_libs/class-variance-authority.mjs";
import { S as Switch } from "./switch-BiZsBu9O.mjs";
import { A as Avatar, a as AvatarFallback, b as AvatarBadge } from "./avatar-CUy_TWwL.mjs";
import { S as Separator } from "./separator-Umrs0kja.mjs";
import { S as Skeleton } from "./skeleton-CMW2_JAA.mjs";
import "../_libs/i18next.mjs";
import "../_libs/sonner.mjs";
import { i as IconArrowRight, e as IconPlus, h as IconCheck, k as IconSearch, j as IconChevronRight, l as IconSparkles, f as IconX, m as IconTrendingUp, n as IconTrendingDown } from "../_libs/tabler__icons-react.mjs";
import { T as TabsRoot, a as TabsList$1, b as TabsTab, c as TabsPanel } from "../_libs/base-ui__react.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__react-query.mjs";
import "../_libs/tanstack__react-router.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "../_libs/clsx.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/tanstack__react-query-devtools.mjs";
import "../_libs/@tanstack/react-router-devtools+[...].mjs";
import "../_libs/react-i18next.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/zod.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/floating-ui__utils.mjs";
const tabsListBg = "bg-muted";
const tabsTriggerActiveBg = "group-data-[variant=default]/tabs-list:data-active:bg-card group-data-[variant=default]/tabs-list:data-active:shadow-sm";
function Tabs({ className, orientation = "horizontal", ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    TabsRoot,
    {
      "data-slot": "tabs",
      "data-orientation": orientation,
      className: cn("gap-2 group/tabs flex data-[orientation=horizontal]:flex-col", className),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/tabs.tsx",
      lineNumber: 19,
      columnNumber: 3
    },
    this
  );
}
const tabsListVariants = cva(
  "rounded-full p-1 group-data-horizontal/tabs:h-9 data-[variant=line]:rounded-none data-[variant=line]:p-0 group/tabs-list text-muted-foreground inline-flex w-fit items-center justify-center group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        default: tabsListBg,
        line: "gap-1 bg-transparent"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function TabsList({ className, variant = "default", ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TabsList$1, { "data-slot": "tabs-list", "data-variant": variant, className: cn(tabsListVariants({ variant }), className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/tabs.tsx",
    lineNumber: 45,
    columnNumber: 3
  }, this);
}
function TabsTrigger({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    TabsTab,
    {
      "data-slot": "tabs-trigger",
      className: cn(
        "gap-1.5 rounded-full px-3.5 py-0.5 text-sm font-medium [&_svg:not([class*='size-'])]:size-4 focus-visible:ring-ring/40 hover:text-foreground dark:hover:text-foreground relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center whitespace-nowrap transition-all group-data-[variant=line]/tabs-list:rounded-none group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start focus-visible:ring-[0.1875rem] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        // Active state — apply the trigger fill as a plain background-image (no border, no clip).
        // Both default and line variants get it; line additionally shows the underline (::after below).
        `${tabsTriggerActiveBg} data-active:text-foreground`,
        "after:bg-foreground after:absolute after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:-bottom-[0.3125rem] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/tabs.tsx",
      lineNumber: 51,
      columnNumber: 3
    },
    this
  );
}
function TabsContent({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TabsPanel, { "data-slot": "tabs-content", className: cn("text-sm flex-1 outline-none", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/tabs.tsx",
    lineNumber: 67,
    columnNumber: 9
  }, this);
}
function MetricDelta({ pct, onColor, className }) {
  const positive = pct >= 0;
  const Icon = positive ? IconTrendingUp : IconTrendingDown;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "span",
    {
      className: cn(
        "inline-flex items-center gap-0.5 text-sm font-medium",
        onColor ? "text-current" : positive ? "text-success-bright" : "text-destructive",
        className
      ),
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Icon, { className: "size-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/metric-delta.tsx",
          lineNumber: 25,
          columnNumber: 4
        }, this),
        `${positive ? "+" : ""}${Math.round(pct * 100)}%`
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/metric-delta.tsx",
      lineNumber: 18,
      columnNumber: 3
    },
    this
  );
}
function Logo() {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "inline-flex items-center text-xl font-bold tracking-tight text-foreground", children: [
    "Code",
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-1 rounded-md bg-primary px-1.5 py-0.5 text-primary-foreground", children: "DM" }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 28,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
    lineNumber: 26,
    columnNumber: 10
  }, this);
}
function Eyebrow({
  children
}) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "label-eyebrow", children }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
    lineNumber: 36,
    columnNumber: 10
  }, this);
}
function Section({
  title,
  hint,
  children
}) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex flex-col gap-6 border-t border-border pt-10", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "heading-display text-2xl text-foreground", children: title }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 49,
        columnNumber: 5
      }, this),
      hint && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-muted-foreground", children: hint }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 50,
        columnNumber: 14
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 48,
      columnNumber: 4
    }, this),
    children
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
    lineNumber: 47,
    columnNumber: 10
  }, this);
}
function Row({
  label,
  children
}) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-40 shrink-0 font-mono text-xs text-muted-foreground", children: label }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 63,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-center gap-3", children }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 64,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
    lineNumber: 62,
    columnNumber: 10
  }, this);
}
function Swatch({
  token,
  className,
  ring
}) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `size-16 rounded-2xl ${className} ${ring ? "border border-border" : ""}` }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 77,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-[0.6875rem] text-muted-foreground", children: token }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 78,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
    lineNumber: 76,
    columnNumber: 10
  }, this);
}
function Dot({
  className
}) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `inline-block size-2 shrink-0 rounded-full ${className}` }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
    lineNumber: 86,
    columnNumber: 10
  }, this);
}
function StyleguideRoute() {
  const [dark, setDark] = reactExports.useState(false);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: dark ? "dark" : void 0, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "min-h-dvh bg-route-background text-foreground", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mx-auto flex max-w-5xl flex-col gap-12 px-6 py-12 md:px-10 md:py-16", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("header", { className: "flex flex-col gap-6", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Logo, {}, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 99,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex cursor-pointer items-center gap-2 text-sm text-muted-foreground", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-xs", children: dark ? "dark" : "light" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 101,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Switch, { checked: dark, onCheckedChange: setDark }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 102,
            columnNumber: 9
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 100,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 98,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Eyebrow, { children: "Design system" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 106,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h1", { className: "heading-display text-5xl text-foreground md:text-6xl", children: "DM your codebase" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 107,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "max-w-xl text-muted-foreground", children: "Monochrome and deliberate: near-black, white and light-gray, with black as the one action color and status carried only by small colored dots. Pill-heavy, hairline-bordered, mono where it counts." }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 108,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 105,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 97,
      columnNumber: 6
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Palette", hint: "Ink, paper, and grays. Color appears only in status dots.", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-5", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { token: "background", className: "bg-background", ring: true }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 118,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { token: "foreground", className: "bg-foreground" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 119,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { token: "primary", className: "bg-primary" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 120,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { token: "secondary", className: "bg-secondary", ring: true }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 121,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { token: "muted", className: "bg-muted", ring: true }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 122,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { token: "accent", className: "bg-accent", ring: true }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 123,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Swatch, { token: "route-bg", className: "bg-route-background", ring: true }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 124,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 117,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Eyebrow, { children: "Status hues — dots only" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 127,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-center gap-6 text-sm", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "inline-flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dot, { className: "bg-success" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
              lineNumber: 130,
              columnNumber: 10
            }, this),
            " success"
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 129,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "inline-flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dot, { className: "bg-warning" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
              lineNumber: 133,
              columnNumber: 10
            }, this),
            " warning"
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 132,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "inline-flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dot, { className: "bg-destructive" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
              lineNumber: 136,
              columnNumber: 10
            }, this),
            " destructive"
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 135,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "inline-flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dot, { className: "bg-info" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
              lineNumber: 139,
              columnNumber: 10
            }, this),
            " info"
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 138,
            columnNumber: 9
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 128,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 126,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 116,
      columnNumber: 6
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Typography", hint: "System grotesque for UI, heavy uppercase for display, mono for the machine.", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "heading-display text-5xl text-foreground", children: "How it works" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 148,
        columnNumber: 8
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "heading-display text-2xl text-foreground", children: "Welcome to CodeDM" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 149,
        columnNumber: 8
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-2xl font-bold text-foreground", children: "1 agent working right now" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 150,
        columnNumber: 8
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "max-w-2xl text-foreground", children: "Body copy is a clean system sans at a comfortable measure. CodeDM connects your channels to coding agents running on this Mac." }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 151,
        columnNumber: 8
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "max-w-2xl text-sm text-muted-foreground", children: "Muted secondary text for descriptions, timestamps, and metadata." }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 155,
        columnNumber: 8
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Eyebrow, { children: "Section label · eyebrow" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 156,
        columnNumber: 8
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "font-mono text-sm text-muted-foreground", children: "~/dev/acme-storefront · pix-payment · v2.4.1 · acme-pr-214.vercel.app" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 157,
        columnNumber: 8
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 147,
      columnNumber: 7
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 146,
      columnNumber: 6
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Buttons", hint: "Fully-rounded pills. Black is the only filled action; the rest stay mono.", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Row, { label: "variants", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { children: "Set up" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 166,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "secondary", children: "Open session" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 167,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "outline", children: "Pause" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 168,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "ghost", children: "Skip" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 169,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "destructive", children: "Archive" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 170,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "link", children: "Replay intro" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 171,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 165,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Row, { label: "with icon", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { children: [
          "Next ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconArrowRight, { "data-icon": "inline-end" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 175,
            columnNumber: 14
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 174,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "outline", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconPlus, { "data-icon": "inline-start" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 178,
            columnNumber: 9
          }, this),
          " Add folder"
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 177,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "secondary", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconCheck, { "data-icon": "inline-start" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 181,
            columnNumber: 9
          }, this),
          " Approve"
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 180,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 173,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Row, { label: "sizes", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { size: "xs", children: "xs" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 185,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { size: "sm", children: "sm" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 186,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { size: "default", children: "default" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 187,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { size: "lg", children: "lg" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 188,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 184,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Row, { label: "icon-only", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { size: "icon-sm", variant: "secondary", "aria-label": "search", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconSearch, {}, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 192,
          columnNumber: 9
        }, this) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 191,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { size: "icon", variant: "outline", "aria-label": "add", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconPlus, {}, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 195,
          columnNumber: 9
        }, this) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 194,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { size: "icon-lg", "aria-label": "go", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconArrowRight, {}, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 198,
          columnNumber: 9
        }, this) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 197,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 190,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Row, { label: "disabled", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { disabled: true, children: "Set up" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 202,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "outline", disabled: true, children: "Deny" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 203,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 201,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 164,
      columnNumber: 6
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Badges & status", hint: "Neutral pills for tags; a small colored dot when a status is in play.", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Row, { label: "tags", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Badge, { children: "git" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 212,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Badge, { children: "Claude project" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 213,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Badge, { variant: "secondary", children: "Detected" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 214,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Badge, { variant: "outline", children: "Not connected" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 215,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Badge, { variant: "solid", children: "DM" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 216,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 211,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Row, { label: "status", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Badge, { variant: "success", children: "Connected" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 219,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Badge, { variant: "warning", children: "Needs attention" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 220,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Badge, { variant: "info", children: "Working" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 221,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Badge, { variant: "error", children: "Blocked" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 222,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 218,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Row, { label: "chips", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-sm text-secondary-foreground", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dot, { className: "bg-success" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 226,
            columnNumber: 9
          }, this),
          " 1 agent running"
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 225,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dot, { className: "bg-success" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 229,
            columnNumber: 9
          }, this),
          " Running"
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 228,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dot, { className: "bg-warning" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 232,
            columnNumber: 9
          }, this),
          " Needs attention"
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 231,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 224,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 210,
      columnNumber: 6
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Inputs", hint: "Pill search fields and a flat composer surface.", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid max-w-2xl gap-6 sm:grid-cols-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Label, { htmlFor: "sg-search", children: "Search" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 241,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Input, { id: "sg-search", placeholder: "Search contacts and groups" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 242,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 240,
        columnNumber: 8
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Label, { htmlFor: "sg-folder", children: "Project folder" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 245,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Input, { id: "sg-folder", defaultValue: "~/dev/acme-storefront", className: "font-mono" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 246,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 244,
        columnNumber: 8
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2 sm:col-span-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Label, { htmlFor: "sg-msg", children: "Message" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 249,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Textarea, { id: "sg-msg", placeholder: "Reply to this thread…" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 250,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 248,
        columnNumber: 8
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Label, { htmlFor: "sg-err", children: "Invalid" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 253,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Input, { id: "sg-err", "aria-invalid": true, defaultValue: "not-a-path" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 254,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 252,
        columnNumber: 8
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-end gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Switch, { defaultChecked: true }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 257,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "pb-1 text-sm text-muted-foreground", children: "Autonomous replies" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 258,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 256,
        columnNumber: 8
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 239,
      columnNumber: 7
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 238,
      columnNumber: 6
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Tabs", hint: "A segmented control, plus an underline variant for wizard steps.", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Tabs, { defaultValue: "chat", className: "max-w-xl", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TabsList, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TabsTrigger, { value: "chat", children: "Chat" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 267,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TabsTrigger, { value: "issues", children: "Issues" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 268,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TabsTrigger, { value: "artifacts", children: "Artifacts" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 269,
            columnNumber: 9
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 266,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TabsContent, { value: "chat", className: "pt-4 text-sm text-muted-foreground", children: "Autonomous — replies send without review." }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 271,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TabsContent, { value: "issues", className: "pt-4 text-sm text-muted-foreground", children: "1 awaiting input · 1 working · 1 completed." }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 274,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TabsContent, { value: "artifacts", className: "pt-4 text-sm text-muted-foreground", children: "Preview deploys and screenshots land here." }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 277,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 265,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Tabs, { defaultValue: "contact", className: "max-w-xl", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TabsList, { variant: "line", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TabsTrigger, { value: "contact", children: "Contact" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 283,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TabsTrigger, { value: "workspace", children: "Workspace" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 284,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TabsTrigger, { value: "agents", children: "Agents" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 285,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TabsTrigger, { value: "review", children: "Review" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 286,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 282,
        columnNumber: 8
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 281,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 264,
      columnNumber: 6
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Cards", hint: "Hairline surfaces with generous padding. Onboarding steps and stat tiles.", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-6 md:grid-cols-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardHeader, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardTitle, { children: "Connect a channel" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 296,
            columnNumber: 10
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardDescription, { children: "WhatsApp, Instagram or Telegram" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 297,
            columnNumber: 10
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 295,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardContent, { className: "flex flex-col gap-4", children: [{
          n: 1,
          t: "Connect a channel",
          d: "Pair via QR code"
        }, {
          n: 2,
          t: "Add a workspace",
          d: "Point at a project folder"
        }, {
          n: 3,
          t: "Attach a thread",
          d: "Contact + folder + agent"
        }].map((step) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold", children: step.n }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 313,
            columnNumber: 12
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-1 flex-col", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm font-semibold text-foreground", children: step.t }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
              lineNumber: 317,
              columnNumber: 13
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-muted-foreground", children: step.d }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
              lineNumber: 318,
              columnNumber: 13
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 316,
            columnNumber: 12
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconChevronRight, { className: "size-4 text-muted-foreground" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 320,
            columnNumber: 12
          }, this)
        ] }, step.n, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 312,
          columnNumber: 32
        }, this)) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 299,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardFooter, { className: "justify-end gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "ghost", size: "sm", children: "Explore demo data" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 324,
            columnNumber: 10
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { size: "sm", children: [
            "Set up ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconArrowRight, { "data-icon": "inline-end" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
              lineNumber: 328,
              columnNumber: 18
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 327,
            columnNumber: 10
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 323,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 294,
        columnNumber: 8
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardHeader, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardTitle, { children: "Today" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 335,
            columnNumber: 10
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardDescription, { children: "Rolling 24h across all threads" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 336,
            columnNumber: 10
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 334,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardContent, { className: "flex flex-col gap-5", children: [{
          label: "Issues opened",
          value: "6",
          pct: 0.32
        }, {
          label: "Issues closed",
          value: "4",
          pct: 0.12
        }, {
          label: "Median response",
          value: "42s",
          pct: -0.16
        }].map((stat) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-end justify-between", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Eyebrow, { children: stat.label }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
              lineNumber: 353,
              columnNumber: 13
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-2xl font-bold tabular-nums text-foreground", children: stat.value }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
              lineNumber: 354,
              columnNumber: 13
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 352,
            columnNumber: 12
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MetricDelta, { pct: stat.pct }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 356,
            columnNumber: 12
          }, this)
        ] }, stat.label, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 351,
          columnNumber: 32
        }, this)) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 338,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 333,
        columnNumber: 8
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 293,
      columnNumber: 7
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 292,
      columnNumber: 6
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Dialog", hint: "Rounded surface, soft shadow, circular close.", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dialog, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogTrigger, { render: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "outline", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconSparkles, { "data-icon": "inline-start" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 367,
          columnNumber: 11
        }, this),
        " Open dialog"
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 366,
        columnNumber: 31
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 366,
        columnNumber: 8
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogContent, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogHeader, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogTitle, { children: "Connect a channel" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 371,
            columnNumber: 10
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogDescription, { children: "Messages in connected channels can be routed to your agents." }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 372,
            columnNumber: 10
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 370,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [{
          t: "Telegram",
          d: "Pair via QR code"
        }, {
          t: "Email (IMAP)",
          d: "Coming soon"
        }].map((opt) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { type: "button", className: "flex items-center gap-3 rounded-2xl border border-border p-3 text-left transition-colors hover:bg-muted", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex size-9 items-center justify-center rounded-full bg-secondary", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconPlus, { className: "size-4" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 383,
            columnNumber: 13
          }, this) }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 382,
            columnNumber: 12
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-1 flex-col", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm font-semibold text-foreground", children: opt.t }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
              lineNumber: 386,
              columnNumber: 13
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-muted-foreground", children: opt.d }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
              lineNumber: 387,
              columnNumber: 13
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 385,
            columnNumber: 12
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconChevronRight, { className: "size-4 text-muted-foreground" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 389,
            columnNumber: 12
          }, this)
        ] }, opt.t, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 381,
          columnNumber: 31
        }, this)) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 374,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogFooter, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogClose, { render: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "ghost", children: "Cancel" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 393,
            columnNumber: 31
          }, this) }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 393,
            columnNumber: 10
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogClose, { render: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { children: "Done" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 394,
            columnNumber: 31
          }, this) }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 394,
            columnNumber: 10
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 392,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 369,
        columnNumber: 8
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 365,
      columnNumber: 7
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 364,
      columnNumber: 6
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Section, { title: "Elements", hint: "Avatars, separators, deltas, and loading states.", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Row, { label: "avatars", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Avatar, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AvatarFallback, { children: "RL" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 404,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AvatarBadge, { className: "bg-success" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
            lineNumber: 405,
            columnNumber: 9
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 403,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Avatar, { size: "lg", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AvatarFallback, { children: "DS" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 408,
          columnNumber: 9
        }, this) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 407,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Avatar, { size: "sm", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AvatarFallback, { children: "CD" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 411,
          columnNumber: 9
        }, this) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 410,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 402,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Row, { label: "deltas", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MetricDelta, { pct: 0.52 }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 415,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MetricDelta, { pct: -0.1 }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 416,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 414,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Row, { label: "separator", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3 text-sm text-muted-foreground", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Chat" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 420,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Separator, { orientation: "vertical", className: "h-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 421,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Issues" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 422,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Separator, { orientation: "vertical", className: "h-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 423,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "Artifacts" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 424,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 419,
        columnNumber: 8
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 418,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Row, { label: "skeleton", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-4 w-48" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 429,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-4 w-32" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 430,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 428,
        columnNumber: 8
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 427,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 401,
      columnNumber: 6
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("footer", { className: "flex items-center justify-between border-t border-border pt-8 text-xs text-muted-foreground", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono", children: "Open source · runs locally · no account needed" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 436,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "inline-flex items-center gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconX, { className: "size-3" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
          lineNumber: 438,
          columnNumber: 8
        }, this),
        " monochrome by design"
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
        lineNumber: 437,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
      lineNumber: 435,
      columnNumber: 6
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
    lineNumber: 95,
    columnNumber: 5
  }, this) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
    lineNumber: 94,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/styleguide/index.tsx?tsr-split=component",
    lineNumber: 93,
    columnNumber: 10
  }, this);
}
export {
  StyleguideRoute as component
};
