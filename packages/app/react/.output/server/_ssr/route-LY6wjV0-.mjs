import { c as jsxDevRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { u as useMatches, O as Outlet, a as useRouterState, L as Link } from "../_libs/tanstack__react-router.mjs";
import { m as motion } from "../_libs/motion.mjs";
import { c as cva } from "../_libs/class-variance-authority.mjs";
import { c as cn, C as Config, B as Button, E as Empty, a as EmptyDescription, g as getInitials, s as surface, t as tryCatch } from "./router-CPODl6Uk.mjs";
import { c as create, p as persist } from "../_libs/zustand.mjs";
import { u as useDialogStore, D as Dialog, H as HomeIcon, U as UserIcon, E as EngineIcon, G as GradientIcon, B as BkLogoIcon$1, T as TurnoffIcon, C as ChevronRightIcon } from "./useDialogStore-CufGMHV1.mjs";
import "../_libs/i18next.mjs";
import "../_libs/sonner.mjs";
import { f as fetchEventSource } from "../_libs/microsoft__fetch-event-source.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { u as useRender, m as mergeProps, P as PopoverRoot, a as PopoverTrigger$1, b as PopoverPortal, c as PopoverPositioner, d as PopoverPopup, A as AvatarRoot, e as AvatarImage$1, f as AvatarFallback$1 } from "../_libs/base-ui__react.mjs";
import { I as IconChevronRight, a as IconBell } from "../_libs/tabler__icons-react.mjs";
import { f as formatDistanceToNow } from "../_libs/date-fns.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "../_libs/tanstack__history.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "../_libs/framer-motion.mjs";
import "../_libs/motion-dom.mjs";
import "../_libs/motion-utils.mjs";
import "../_libs/clsx.mjs";
import "../_libs/ky.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__react-query.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/tanstack__react-query-devtools.mjs";
import "../_libs/@tanstack/react-router-devtools+[...].mjs";
import "../_libs/zod.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
const OPERATOR_SESSION = {
  user: {
    id: "operator",
    email: "operator@codedm.local",
    name: "Operator",
    image: null,
    emailVerified: true
  },
  session: {
    id: "operator",
    userId: "operator",
    expiresAt: /* @__PURE__ */ new Date("2999-12-31T00:00:00.000Z"),
    ownerId: "operator"
  }
};
const auth = {
  useSession: () => ({ data: OPERATOR_SESSION, isPending: false, error: null }),
  signOut: async () => {
  }
};
const listenEventsQueryKey = () => [{ url: "/v1/ui/events" }];
const useSidebarStore = create()(
  persist(
    (set) => ({
      isExpanded: false,
      setIsExpanded: (isExpanded) => set({ isExpanded })
    }),
    {
      name: "sidebar-storage"
    }
  )
);
function getNavigationItems(t) {
  return [
    { label: t("nav.home"), icon: HomeIcon, path: "/dashboard" },
    {
      label: t("nav.settings"),
      icon: EngineIcon,
      children: [
        { label: t("nav.account"), icon: UserIcon, path: "/settings/account" }
      ]
    }
  ];
}
const TRANSITION = {
  duration: 0.3,
  ease: [0.4, 0, 0.2, 1]
};
const navRow = cva("flex items-center rounded-lg gap-3 h-10 transition-colors", {
  variants: {
    nested: {
      false: "px-3",
      true: "pl-9 pr-3"
    },
    state: {
      default: "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-[linear-gradient(to_right,oklch(from_var(--sidebar-foreground)_l_c_h_/_0.18),transparent)]",
      active: "bg-[linear-gradient(to_right,oklch(from_var(--sidebar-foreground)_l_c_h_/_0.1),transparent)] text-sidebar-foreground",
      disabled: "opacity-40 text-sidebar-foreground/70 pointer-events-none"
    }
  },
  defaultVariants: { nested: false, state: "default" }
});
function Sidebar({ className }) {
  const state = useRouterState();
  const { t } = useTranslation();
  const activeRoute = state.location.pathname;
  const { isExpanded, setIsExpanded } = useSidebarStore();
  const [openGroups, setOpenGroups] = reactExports.useState({});
  const handleLogout = async () => {
    await auth.signOut();
    window.location.href = "/app/dashboard";
  };
  const items = getNavigationItems(t);
  const toggleGroup = (label) => setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    motion.aside,
    {
      className: cn("bg-sidebar flex flex-col py-6 px-3 gap-6 z-30 shrink-0 overflow-y-auto overflow-x-hidden", className),
      initial: false,
      animate: { width: isExpanded ? "16rem" : "5rem" },
      transition: TRANSITION,
      onMouseEnter: () => setIsExpanded(true),
      onMouseLeave: () => setIsExpanded(false),
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(LogoSection, { isExpanded }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
          lineNumber: 98,
          columnNumber: 4
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("nav", { className: "flex flex-col gap-1", children: items.map((item) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          NavigationEntry,
          {
            item,
            isExpanded,
            activeRoute,
            isOpen: !!openGroups[item.label],
            onToggle: () => toggleGroup(item.label)
          },
          item.label,
          false,
          {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
            lineNumber: 102,
            columnNumber: 6
          },
          this
        )) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
          lineNumber: 100,
          columnNumber: 4
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(LogoutSection, { isExpanded, onLogout: handleLogout }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
          lineNumber: 113,
          columnNumber: 4
        }, this)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
      lineNumber: 90,
      columnNumber: 3
    },
    this
  );
}
function LogoSection({ isExpanded }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2.5 h-10 px-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GradientIcon, { icon: BkLogoIcon$1, className: "size-7 text-sidebar-foreground shrink-0" }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
      lineNumber: 121,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      motion.span,
      {
        className: "text-lg font-semibold text-sidebar-foreground whitespace-nowrap font-serif tracking-tight",
        initial: false,
        animate: { opacity: isExpanded ? 1 : 0 },
        transition: TRANSITION,
        children: "Dash"
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
        lineNumber: 122,
        columnNumber: 4
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
    lineNumber: 120,
    columnNumber: 3
  }, this);
}
function NavigationEntry({ item, isExpanded, activeRoute, isOpen, onToggle, depth = 0 }) {
  const { t } = useTranslation();
  const hasChildren = !!item.children && item.children.length > 0;
  const isActive = item.path ? activeRoute === item.path || activeRoute?.startsWith(`${item.path}/`) : false;
  const sharedRow = /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EntryContent, { item, isExpanded, hasChildren, isOpen, depth }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
    lineNumber: 154,
    columnNumber: 20
  }, this);
  const state = item.disabled ? "disabled" : isActive ? "active" : "default";
  const rowClass = navRow({ nested: depth > 0, state });
  if (hasChildren) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          type: "button",
          onClick: item.disabled ? void 0 : onToggle,
          className: cn(rowClass, "w-full text-left cursor-pointer"),
          "aria-label": item.label,
          "aria-expanded": isOpen,
          title: item.label,
          disabled: item.disabled,
          children: sharedRow
        },
        void 0,
        false,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
          lineNumber: 162,
          columnNumber: 5
        },
        this
      ),
      isOpen && isExpanded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1 mt-1 mb-2", children: item.children.map((child) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        NavigationEntry,
        {
          item: child,
          isExpanded,
          activeRoute,
          isOpen: false,
          onToggle: () => void 0,
          depth: depth + 1
        },
        child.label,
        false,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
          lineNumber: 176,
          columnNumber: 8
        },
        this
      )) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
        lineNumber: 174,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
      lineNumber: 161,
      columnNumber: 4
    }, this);
  }
  if (item.path && !item.disabled) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Link, { to: item.path, className: rowClass, "aria-label": item.label, title: item.label, children: sharedRow }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
      lineNumber: 194,
      columnNumber: 4
    }, this);
  }
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: <explanation>
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: rowClass, "aria-label": item.label, title: item.disabled ? `${item.label} — ${t("nav.comingSoon")}` : item.label, children: sharedRow }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
      lineNumber: 202,
      columnNumber: 3
    }, this)
  );
}
function EntryContent({
  item,
  isExpanded,
  hasChildren,
  isOpen,
  depth
}) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GradientIcon, { icon: item.icon, className: cn(depth === 0 ? "size-5" : "size-4", "shrink-0") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
      lineNumber: 223,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      motion.span,
      {
        className: "text-sm font-medium whitespace-nowrap flex-1 truncate",
        initial: false,
        animate: { opacity: isExpanded ? 1 : 0 },
        transition: TRANSITION,
        children: item.label
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
        lineNumber: 224,
        columnNumber: 4
      },
      this
    ),
    hasChildren && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      motion.span,
      {
        initial: false,
        animate: { opacity: isExpanded ? 1 : 0, rotate: isOpen ? 90 : 0 },
        transition: TRANSITION,
        className: "shrink-0",
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronRightIcon, { className: "size-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
          lineNumber: 239,
          columnNumber: 6
        }, this)
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
        lineNumber: 233,
        columnNumber: 5
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
    lineNumber: 222,
    columnNumber: 3
  }, this);
}
function LogoutSection({ isExpanded, onLogout }) {
  const { t } = useTranslation();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-auto mb-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Button,
    {
      variant: "ghost",
      onClick: onLogout,
      className: "flex items-center justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-[linear-gradient(to_right,oklch(from_var(--sidebar-foreground)_l_c_h_/_0.18),transparent)] gap-3 h-10 px-3 w-full",
      "aria-label": t("common.logout"),
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GradientIcon, { icon: TurnoffIcon, className: "size-5 shrink-0" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
          lineNumber: 256,
          columnNumber: 5
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          motion.span,
          {
            className: "text-sm font-medium whitespace-nowrap",
            initial: false,
            animate: { opacity: isExpanded ? 1 : 0 },
            transition: TRANSITION,
            children: t("common.logout")
          },
          void 0,
          false,
          {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
            lineNumber: 257,
            columnNumber: 5
          },
          this
        )
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
      lineNumber: 250,
      columnNumber: 4
    },
    this
  ) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
    lineNumber: 249,
    columnNumber: 3
  }, this);
}
function Breadcrumb({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("nav", { "aria-label": "breadcrumb", "data-slot": "breadcrumb", className: cn(className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/breadcrumb.tsx",
    lineNumber: 9,
    columnNumber: 9
  }, this);
}
function BreadcrumbList({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "ol",
    {
      "data-slot": "breadcrumb-list",
      className: cn("text-muted-foreground gap-1.5 text-sm flex flex-wrap items-center break-words", className),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/breadcrumb.tsx",
      lineNumber: 14,
      columnNumber: 3
    },
    this
  );
}
function BreadcrumbItem({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("li", { "data-slot": "breadcrumb-item", className: cn("gap-1 inline-flex items-center", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/breadcrumb.tsx",
    lineNumber: 23,
    columnNumber: 9
  }, this);
}
function BreadcrumbLink({ className, render, ...props }) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps(
      {
        className: cn("hover:text-foreground transition-colors", className)
      },
      props
    ),
    render,
    state: {
      slot: "breadcrumb-link"
    }
  });
}
function BreadcrumbPage({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { "data-slot": "breadcrumb-page", "aria-current": "page", className: cn("font-normal", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/breadcrumb.tsx",
    lineNumber: 43,
    columnNumber: 9
  }, this);
}
function BreadcrumbSeparator({ children, className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("li", { "data-slot": "breadcrumb-separator", role: "presentation", "aria-hidden": "true", className: cn("[&>svg]:size-3.5", className), ...props, children: children ?? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconChevronRight, {}, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/breadcrumb.tsx",
    lineNumber: 49,
    columnNumber: 17
  }, this) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/breadcrumb.tsx",
    lineNumber: 48,
    columnNumber: 3
  }, this);
}
const useSession = () => {
  const { data: session } = auth.useSession();
  return session;
};
function useBreadcrumbs() {
  const matches = useMatches();
  const items = [];
  for (const match of matches) {
    if (match.staticData?.breadcrumbs) {
      items.push(...match.staticData.breadcrumbs);
    } else if (match.staticData?.breadcrumb) {
      items.push({ label: match.staticData.breadcrumb, to: match.pathname });
    }
  }
  if (items.length > 0) {
    delete items[items.length - 1].to;
  }
  return items;
}
function useServerEventSource() {
  reactExports.useEffect(() => {
    const controller = new AbortController();
    fetchEventSource(`${Config.baseUrl}${listenEventsQueryKey()[0].url}`, {
      credentials: "include",
      signal: controller.signal,
      onmessage(msg) {
        if (!msg.data) return;
        const result = tryCatch(() => JSON.parse(msg.data));
        if (!result.success) {
          console.error("[SSE] Failed to parse server event:", result.error, "Raw data:", msg.data);
          return;
        }
        document.dispatchEvent(new CustomEvent(result.data.name, { detail: result.data }));
      },
      onerror(err) {
        console.error("[SSE] Connection error:", err);
      }
    });
    return () => controller.abort();
  }, []);
}
function Popover({ ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PopoverRoot, { "data-slot": "popover", ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/popover.tsx",
    lineNumber: 8,
    columnNumber: 9
  }, this);
}
const PopoverTrigger = reactExports.forwardRef(function PopoverTrigger2({ ...props }, ref) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PopoverTrigger$1, { ref, "data-slot": "popover-trigger", ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/popover.tsx",
    lineNumber: 12,
    columnNumber: 9
  }, this);
});
function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  positionMethod = "fixed",
  ...props
}) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PopoverPortal, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    PopoverPositioner,
    {
      align,
      alignOffset,
      side,
      sideOffset,
      positionMethod,
      className: "isolate z-50",
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        PopoverPopup,
        {
          "data-slot": "popover-content",
          className: cn(
            surface,
            "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-98 data-open:zoom-in-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 flex flex-col gap-2.5 rounded-lg p-2.5 text-sm duration-200 ease-in-out z-50 w-72 origin-(--transform-origin) outline-hidden supports-backdrop-filter:backdrop-blur-sm",
            className
          ),
          ...props
        },
        void 0,
        false,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/popover.tsx",
          lineNumber: 35,
          columnNumber: 5
        },
        this
      )
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/popover.tsx",
      lineNumber: 27,
      columnNumber: 4
    },
    this
  ) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/popover.tsx",
    lineNumber: 26,
    columnNumber: 3
  }, this);
}
const NOTIFICATION_LEVEL_COLORS = {
  ERROR: "bg-destructive",
  WARNING: "bg-chart-4",
  SUCCESS: "bg-primary",
  INFO: "bg-accent"
};
const formatRelativeTime = (date) => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(dateObj, { addSuffix: true });
};
function NotificationItem({ notification, className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: cn("p-3 hover:bg-muted/50 transition-colors cursor-pointer", className), "data-slot": "notification-item", ...props, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-start gap-3", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: cn("size-2 rounded-full mt-1.5 shrink-0", NOTIFICATION_LEVEL_COLORS[notification.level]) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationItem/index.tsx",
      lineNumber: 35,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-w-0", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "font-medium text-sm truncate", children: notification.title }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationItem/index.tsx",
        lineNumber: 37,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-muted-foreground line-clamp-2", children: notification.content }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationItem/index.tsx",
        lineNumber: 38,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[11px] text-muted-foreground mt-1", children: formatRelativeTime(notification.createdAt) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationItem/index.tsx",
        lineNumber: 39,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationItem/index.tsx",
      lineNumber: 36,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationItem/index.tsx",
    lineNumber: 34,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationItem/index.tsx",
    lineNumber: 33,
    columnNumber: 3
  }, this);
}
function NotificationsPopover({ notifications }) {
  const { t } = useTranslation();
  const hasUnread = notifications.length > 0;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Popover, { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      PopoverTrigger,
      {
        render: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Button,
          {
            variant: "ghost",
            size: "icon",
            className: "relative text-muted-foreground hover:text-foreground",
            "aria-label": t("notifications.aria"),
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconBell, { className: "size-5" }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationsPopover/index.tsx",
                lineNumber: 26,
                columnNumber: 7
              }, this),
              hasUnread && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "absolute top-1.5 right-1.5 size-2 bg-destructive rounded-full" }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationsPopover/index.tsx",
                lineNumber: 27,
                columnNumber: 21
              }, this)
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationsPopover/index.tsx",
            lineNumber: 20,
            columnNumber: 6
          },
          this
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationsPopover/index.tsx",
        lineNumber: 18,
        columnNumber: 4
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PopoverContent, { align: "end", className: "w-80 p-0", "data-slot": "notifications-popover", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 border-b border-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "font-semibold", children: t("notifications.title") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationsPopover/index.tsx",
          lineNumber: 33,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-muted-foreground", children: t("notifications.unreadCount", { count: notifications.length }) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationsPopover/index.tsx",
          lineNumber: 34,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationsPopover/index.tsx",
        lineNumber: 32,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "max-h-80 overflow-y-auto", children: notifications.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Empty, { className: "border-none py-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyDescription, { children: t("notifications.allCaughtUp") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationsPopover/index.tsx",
        lineNumber: 39,
        columnNumber: 8
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationsPopover/index.tsx",
        lineNumber: 38,
        columnNumber: 7
      }, this) : notifications.map((n) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(NotificationItem, { notification: n }, n.id, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationsPopover/index.tsx",
        lineNumber: 42,
        columnNumber: 30
      }, this)) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationsPopover/index.tsx",
        lineNumber: 36,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationsPopover/index.tsx",
      lineNumber: 31,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/NotificationsPopover/index.tsx",
    lineNumber: 17,
    columnNumber: 3
  }, this);
}
reactExports.createContext({ size: "default" });
function Avatar({
  className,
  size = "default",
  ...props
}) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    AvatarRoot,
    {
      "data-slot": "avatar",
      "data-size": size,
      className: cn(
        "size-8 rounded-full after:rounded-full data-[size=lg]:size-10 data-[size=sm]:size-6 after:border-border group/avatar relative flex shrink-0 select-none after:absolute after:inset-0 after:border after:mix-blend-darken dark:after:mix-blend-lighten",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/avatar.tsx",
      lineNumber: 18,
      columnNumber: 3
    },
    this
  );
}
function AvatarImage({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    AvatarImage$1,
    {
      "data-slot": "avatar-image",
      className: cn("rounded-full aspect-square size-full object-cover", className),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/avatar.tsx",
      lineNumber: 32,
      columnNumber: 3
    },
    this
  );
}
function AvatarFallback({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    AvatarFallback$1,
    {
      "data-slot": "avatar-fallback",
      className: cn(
        "bg-muted text-muted-foreground rounded-full flex size-full items-center justify-center text-sm group-data-[size=sm]/avatar:text-xs",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/avatar.tsx",
      lineNumber: 42,
      columnNumber: 3
    },
    this
  );
}
function UserProfile({ user, className, ...props }) {
  if (!user) return null;
  const name = user.name ?? "Anonymous";
  const picture = user.image ?? null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: cn("flex items-center gap-3", className), "data-slot": "user-profile", ...props, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-right hidden sm:block", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm font-medium text-foreground leading-tight", children: name }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/UserProfile/index.tsx",
      lineNumber: 18,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/UserProfile/index.tsx",
      lineNumber: 17,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Avatar, { size: "lg", className: "border border-border", children: [
      picture && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AvatarImage, { src: picture, alt: name }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/UserProfile/index.tsx",
        lineNumber: 21,
        columnNumber: 17
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AvatarFallback, { children: getInitials(name) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/UserProfile/index.tsx",
        lineNumber: 22,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/UserProfile/index.tsx",
      lineNumber: 20,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/UserProfile/index.tsx",
    lineNumber: 16,
    columnNumber: 3
  }, this);
}
const MOCK_NOTIFICATIONS = { items: [] };
function Header({ className, ...props }) {
  const session = useSession();
  const breadcrumbs = useBreadcrumbs();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "header",
    {
      className: cn("h-[52px] min-h-[52px] bg-card border-b border-border flex items-center justify-between px-6 shrink-0 z-20", className),
      ...props,
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Breadcrumb, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BreadcrumbList, { children: breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(reactExports.Fragment, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BreadcrumbItem, { children: isLast || !crumb.to ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BreadcrumbPage, { children: crumb.label }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/index.tsx",
              lineNumber: 33,
              columnNumber: 11
            }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BreadcrumbLink, { render: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Link, { to: crumb.to, children: crumb.label }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/index.tsx",
              lineNumber: 35,
              columnNumber: 35
            }, this) }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/index.tsx",
              lineNumber: 35,
              columnNumber: 11
            }, this) }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/index.tsx",
              lineNumber: 31,
              columnNumber: 9
            }, this),
            !isLast && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BreadcrumbSeparator, {}, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/index.tsx",
              lineNumber: 38,
              columnNumber: 21
            }, this)
          ] }, `${crumb.label}-${index}`, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/index.tsx",
            lineNumber: 30,
            columnNumber: 8
          }, this);
        }) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/index.tsx",
          lineNumber: 26,
          columnNumber: 5
        }, this) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/index.tsx",
          lineNumber: 25,
          columnNumber: 4
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(NotificationsPopover, { notifications: MOCK_NOTIFICATIONS.items }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/index.tsx",
            lineNumber: 46,
            columnNumber: 5
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-10 w-px bg-border" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/index.tsx",
            lineNumber: 47,
            columnNumber: 5
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(UserProfile, { user: session?.user }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/index.tsx",
            lineNumber: 48,
            columnNumber: 5
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/index.tsx",
          lineNumber: 45,
          columnNumber: 4
        }, this)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Header/index.tsx",
      lineNumber: 21,
      columnNumber: 3
    },
    this
  );
}
const CLOSE_ANIMATION_MS = 250;
const useDrawerStore = create((set) => ({
  content: null,
  open: false,
  show: (content) => set({ content, open: true }),
  hide: () => {
    set({ open: false });
    setTimeout(() => {
      if (!useDrawerStore.getState().open) {
        set({ content: null });
      }
    }, CLOSE_ANIMATION_MS);
  }
}));
function AuthLayout() {
  useServerEventSource();
  const matches = useMatches();
  const routeWrapperClassName = [...matches].reverse().find((m) => m.staticData?.wrapperClassName)?.staticData.wrapperClassName;
  const {
    content,
    open,
    hide
  } = useDialogStore();
  const drawerContent = useDrawerStore((s) => s.content);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "dark flex h-dvh overflow-hidden bg-route-background", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Sidebar, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
      lineNumber: 22,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("main", { className: "flex-1 overflow-hidden relative flex flex-col", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Header, {}, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
        lineNumber: 24,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-auto", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: cn(routeWrapperClassName ?? "mx-auto max-w-[100rem] w-full"), children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Outlet, {}, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
        lineNumber: 27,
        columnNumber: 7
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
        lineNumber: 26,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
        lineNumber: 25,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
      lineNumber: 23,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dialog, { open, onOpenChange: (isOpen) => !isOpen && hide(), children: content }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
      lineNumber: 31,
      columnNumber: 4
    }, this),
    drawerContent
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
    lineNumber: 21,
    columnNumber: 10
  }, this);
}
export {
  AuthLayout as component
};
