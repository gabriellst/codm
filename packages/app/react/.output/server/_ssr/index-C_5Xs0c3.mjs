import { c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { B as Button } from "./router-NNnLbzcz.mjs";
import { u as useGetHomeDashboard } from "./useGetHomeDashboard-DiPbV2MB.mjs";
import { P as PageHeader } from "./PageHeader-D0tGWiN4.mjs";
import { e as enumLabel } from "./enums-By4KP5D8.mjs";
import { C as CHANNEL_KINDS, b as channelGlyph, c as channelLabel } from "./glyphs-D8fG7IZJ.mjs";
import { S as Skeleton } from "./skeleton-CMW2_JAA.mjs";
import { D as Dialog, a as DialogTrigger, b as DialogContent, c as DialogHeader, d as DialogTitle, e as DialogDescription } from "./dialog-CDhCxi7G.mjs";
import "../_libs/i18next.mjs";
import "../_libs/sonner.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { j as IconChevronRight, o as IconQrcode } from "../_libs/tabler__icons-react.mjs";
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
import "../_libs/class-variance-authority.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/tanstack__react-query-devtools.mjs";
import "../_libs/@tanstack/react-router-devtools+[...].mjs";
import "../_libs/base-ui__react.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/zod.mjs";
import "../_http-B7Tvv7R3.mjs";
function ConnectChannelDialog({ trigger }) {
  const { t } = useTranslation();
  const WhatsAppGlyph = channelGlyph.WHATSAPP;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dialog, { children: [
    trigger ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogTrigger, { render: trigger }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx",
      lineNumber: 23,
      columnNumber: 15
    }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogTrigger, { render: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { children: t("channels.connectChannel") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx",
      lineNumber: 23,
      columnNumber: 75
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx",
      lineNumber: 23,
      columnNumber: 52
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogContent, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogHeader, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogTitle, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "inline-flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WhatsAppGlyph, { className: "size-5" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx",
            lineNumber: 28,
            columnNumber: 8
          }, this),
          t("channels.whatsappPairTitle")
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx",
          lineNumber: 27,
          columnNumber: 7
        }, this) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx",
          lineNumber: 26,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogDescription, { children: t("channels.whatsappPairDescription") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx",
          lineNumber: 32,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx",
        lineNumber: 25,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-4 py-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex size-52 items-center justify-center rounded-2xl border border-dashed border-border bg-muted text-muted-foreground", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconQrcode, { className: "size-16" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx",
          lineNumber: 36,
          columnNumber: 7
        }, this) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx",
          lineNumber: 35,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-center text-sm text-muted-foreground", children: t("channels.gatewayWaiting") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx",
          lineNumber: 38,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx",
        lineNumber: 34,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx",
      lineNumber: 24,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx",
    lineNumber: 20,
    columnNumber: 3
  }, this);
}
const CONNECTABLE = ["WHATSAPP"];
function ChannelsSection() {
  const { t } = useTranslation();
  const { data, isLoading } = useGetHomeDashboard();
  const statusByKind = new Map((data?.channels ?? []).map((c) => [c.kind, c.status]));
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-16 pt-20", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PageHeader, { title: t("channels.title"), action: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ConnectChannelDialog, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
      lineNumber: 27,
      columnNumber: 52
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
      lineNumber: 27,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "label-eyebrow px-1", children: t("channels.yourChannels") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
        lineNumber: 30,
        columnNumber: 5
      }, this),
      isLoading ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-16 rounded-2xl" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
          lineNumber: 33,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-16 rounded-2xl" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
          lineNumber: 34,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-16 rounded-2xl" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
          lineNumber: 35,
          columnNumber: 7
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
        lineNumber: 32,
        columnNumber: 6
      }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card", children: CHANNEL_KINDS.map((kind) => {
        const connectable = CONNECTABLE.includes(kind);
        const status = statusByKind.get(kind) ?? "DISCONNECTED";
        const Glyph = channelGlyph[kind];
        const body = /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Glyph, { className: "size-5" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
            lineNumber: 47,
            columnNumber: 11
          }, this) }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
            lineNumber: 46,
            columnNumber: 10
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex min-w-0 flex-1 flex-col", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-semibold text-foreground", children: channelLabel[kind] }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
              lineNumber: 50,
              columnNumber: 11
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm text-muted-foreground", children: connectable ? enumLabel("ChannelStatus", status) : t("channels.comingSoon") }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
              lineNumber: 51,
              columnNumber: 11
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
            lineNumber: 49,
            columnNumber: 10
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
          lineNumber: 45,
          columnNumber: 9
        }, this);
        if (!connectable) {
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4 p-4 opacity-55", "aria-disabled": "true", children: body }, kind, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
            lineNumber: 60,
            columnNumber: 10
          }, this);
        }
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          ConnectChannelDialog,
          {
            trigger: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { type: "button", className: "flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted", children: [
              body,
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconChevronRight, { className: "size-4 shrink-0 text-muted-foreground" }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
                lineNumber: 72,
                columnNumber: 12
              }, this)
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
              lineNumber: 70,
              columnNumber: 11
            }, this)
          },
          kind,
          false,
          {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
            lineNumber: 67,
            columnNumber: 9
          },
          this
        );
      }) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
        lineNumber: 38,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
      lineNumber: 29,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx",
    lineNumber: 26,
    columnNumber: 3
  }, this);
}
function RouteComponent() {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChannelsSection, {}, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/channels/index.tsx?tsr-split=component",
    lineNumber: 3,
    columnNumber: 10
  }, this);
}
export {
  RouteComponent as component
};
