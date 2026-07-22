import { c as jsxDevRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { E as Empty, b as EmptyTitle, d as EmptyDescription, B as Button } from "./router-NNnLbzcz.mjs";
import { u as useListWorkspaces, l as listWorkspacesQueryKey } from "./useListWorkspaces-TSrW7uqX.mjs";
import { P as PageHeader } from "./PageHeader-D0tGWiN4.mjs";
import { e as enumLabel } from "./enums-By4KP5D8.mjs";
import { B as Badge } from "./badge-CKHT7bhp.mjs";
import { S as Skeleton } from "./skeleton-CMW2_JAA.mjs";
import { u as useQueryClient, b as useMutation, m as mutationOptions } from "../_libs/tanstack__react-query.mjs";
import { f as fetch } from "../_http-B7Tvv7R3.mjs";
import { D as Dialog, a as DialogTrigger, b as DialogContent, c as DialogHeader, d as DialogTitle, e as DialogDescription, f as DialogFooter, g as DialogClose } from "./dialog-CDhCxi7G.mjs";
import { I as Input } from "./input-D11kk7yl.mjs";
import { L as Label } from "./label-DMAOYP1G.mjs";
import "../_libs/i18next.mjs";
import "../_libs/sonner.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { e as IconPlus, c as IconFolder } from "../_libs/tabler__icons-react.mjs";
import "../_libs/tanstack__query-core.mjs";
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
function getAddWorkspaceUrl() {
  const res = { method: "POST", url: `/v1/workspaces` };
  return res;
}
async function addWorkspace(data, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const requestData = data;
  const res = await request({ method: "POST", url: getAddWorkspaceUrl().url.toString(), data: requestData, ...requestConfig });
  return res.data;
}
const addWorkspaceMutationKey = () => [{ url: "/v1/workspaces" }];
function addWorkspaceMutationOptions(config = {}) {
  const mutationKey = addWorkspaceMutationKey();
  return mutationOptions({
    mutationKey,
    mutationFn: async ({ data }) => {
      return addWorkspace(data, config);
    }
  });
}
function useAddWorkspace(options = {}) {
  const { mutation = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...mutationOptions2 } = mutation;
  const mutationKey = mutationOptions2.mutationKey ?? addWorkspaceMutationKey();
  const baseOptions = addWorkspaceMutationOptions(config);
  return useMutation({
    ...baseOptions,
    mutationKey,
    ...mutationOptions2
  }, queryClient);
}
function AddWorkspaceDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = reactExports.useState(false);
  const [path, setPath] = reactExports.useState("");
  const queryClient = useQueryClient();
  const addWorkspace2 = useAddWorkspace();
  const submit = () => {
    const trimmed = path.trim();
    if (!trimmed) return;
    addWorkspace2.mutate(
      { data: { path: trimmed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: listWorkspacesQueryKey() });
          setPath("");
          setOpen(false);
        }
      }
    );
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dialog, { open, onOpenChange: setOpen, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      DialogTrigger,
      {
        render: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconPlus, { "data-icon": "inline-start" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx",
            lineNumber: 48,
            columnNumber: 7
          }, this),
          " ",
          t("workspaces.addFolder")
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx",
          lineNumber: 47,
          columnNumber: 6
        }, this)
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx",
        lineNumber: 45,
        columnNumber: 4
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogContent, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogHeader, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogTitle, { children: t("workspaces.addTitle") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx",
          lineNumber: 54,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogDescription, { children: t("workspaces.addDescription") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx",
          lineNumber: 55,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx",
        lineNumber: 53,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Label, { htmlFor: "workspace-path", children: t("workspaces.projectFolder") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx",
          lineNumber: 58,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Input,
          {
            id: "workspace-path",
            className: "font-mono",
            placeholder: t("workspaces.pathPlaceholder"),
            value: path,
            onChange: (e) => setPath(e.target.value),
            onKeyDown: (e) => e.key === "Enter" && submit()
          },
          void 0,
          false,
          {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx",
            lineNumber: 59,
            columnNumber: 6
          },
          this
        )
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx",
        lineNumber: 57,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogFooter, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogClose, { render: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "ghost", children: t("common.cancel") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx",
          lineNumber: 69,
          columnNumber: 27
        }, this) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx",
          lineNumber: 69,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { onClick: submit, disabled: !path.trim() || addWorkspace2.isPending, children: addWorkspace2.isPending ? t("workspaces.adding") : t("workspaces.addFolder") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx",
          lineNumber: 70,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx",
        lineNumber: 68,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx",
      lineNumber: 52,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx",
    lineNumber: 44,
    columnNumber: 3
  }, this);
}
function WorkspacesSection() {
  const { t } = useTranslation();
  const { data, isLoading } = useListWorkspaces();
  const workspaces = data?.workspaces ?? [];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-16 pt-20", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PageHeader, { title: t("workspaces.title"), action: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AddWorkspaceDialog, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
      lineNumber: 22,
      columnNumber: 54
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
      lineNumber: 22,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "label-eyebrow px-1", children: t("workspaces.projectFolders") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
        lineNumber: 25,
        columnNumber: 5
      }, this),
      isLoading ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-16 rounded-2xl" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
          lineNumber: 28,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-16 rounded-2xl" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
          lineNumber: 29,
          columnNumber: 7
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
        lineNumber: 27,
        columnNumber: 6
      }, this) : workspaces.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Empty, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyTitle, { children: t("workspaces.emptyTitle") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
          lineNumber: 33,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyDescription, { children: t("workspaces.emptyDescription") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
          lineNumber: 34,
          columnNumber: 7
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
        lineNumber: 32,
        columnNumber: 6
      }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card", children: workspaces.map((workspace) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WorkspaceRow, { workspace }, workspace.workspaceId, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
        lineNumber: 39,
        columnNumber: 8
      }, this)) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
        lineNumber: 37,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
      lineNumber: 24,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
    lineNumber: 21,
    columnNumber: 3
  }, this);
}
function WorkspaceRow({ workspace }) {
  const { t } = useTranslation();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4 p-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconFolder, { className: "size-5" }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
      lineNumber: 53,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
      lineNumber: 52,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex min-w-0 flex-1 flex-col gap-1.5", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "truncate font-mono text-sm font-semibold text-foreground", children: workspace.path }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
        lineNumber: 56,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1.5", children: workspace.badges.map((badge) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Badge, { variant: "outline", children: enumLabel("WorkspaceBadge", badge) }, badge, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
        lineNumber: 59,
        columnNumber: 7
      }, this)) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
        lineNumber: 57,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
      lineNumber: 55,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "shrink-0 text-sm text-muted-foreground", children: t("workspaces.threadCount", { count: workspace.threadCount }) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
      lineNumber: 65,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx",
    lineNumber: 51,
    columnNumber: 3
  }, this);
}
function RouteComponent() {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(WorkspacesSection, {}, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/workspaces/index.tsx?tsr-split=component",
    lineNumber: 3,
    columnNumber: 10
  }, this);
}
export {
  RouteComponent as component
};
