import { j as jsxRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { u as useMatches, O as Outlet, a as useRouterState, L as Link } from "../_libs/tanstack__react-router.mjs";
import { c as cva } from "../_libs/class-variance-authority.mjs";
import { c as cn, C as Config, B as Button, E as Empty, a as EmptyDescription, g as getInitials, s as surface, t as tryCatch } from "./router-DnXXQnj2.mjs";
import { c as create, p as persist } from "../_libs/zustand.mjs";
import { u as useDialogStore, D as Dialog, H as HomeIcon, U as UserIcon, E as EngineIcon, G as GradientIcon, B as BkLogoIcon$1, T as TurnoffIcon, A as Avatar, a as AvatarImage, b as AvatarFallback, C as ChevronRightIcon } from "./useDialogStore-QmHyYQ7t.mjs";
import "../_libs/i18next.mjs";
import "../_libs/sonner.mjs";
import { f as fetchEventSource } from "../_libs/microsoft__fetch-event-source.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { m as motion } from "../_libs/framer-motion.mjs";
import { u as useRender, m as mergeProps, P as PopoverRoot, a as PopoverTrigger$1, b as PopoverPortal, c as PopoverPositioner, d as PopoverPopup } from "../_libs/base-ui__react.mjs";
import { I as IconChevronRight, a as IconBell } from "../_libs/tabler__icons-react.mjs";
import { f as formatDistanceToNow } from "../_libs/date-fns.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "../_libs/clsx.mjs";
import "../_libs/ky.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__react-query.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/tanstack__react-query-devtools.mjs";
import "../_libs/@tanstack/react-router-devtools+[...].mjs";
import "../_libs/zod.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/motion-dom.mjs";
import "../_libs/motion-utils.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/reselect.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
import "../_libs/tabbable.mjs";
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
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    motion.aside,
    {
      className: cn("bg-sidebar flex flex-col py-6 px-3 gap-6 z-30 shrink-0 overflow-y-auto overflow-x-hidden", className),
      initial: false,
      animate: { width: isExpanded ? "16rem" : "5rem" },
      transition: TRANSITION,
      onMouseEnter: () => setIsExpanded(true),
      onMouseLeave: () => setIsExpanded(false),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(LogoSection, { isExpanded }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("nav", { className: "flex flex-col gap-1", children: items.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          NavigationEntry,
          {
            item,
            isExpanded,
            activeRoute,
            isOpen: !!openGroups[item.label],
            onToggle: () => toggleGroup(item.label)
          },
          item.label
        )) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(LogoutSection, { isExpanded, onLogout: handleLogout })
      ]
    }
  );
}
function LogoSection({ isExpanded }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2.5 h-10 px-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(GradientIcon, { icon: BkLogoIcon$1, className: "size-7 text-sidebar-foreground shrink-0" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      motion.span,
      {
        className: "text-lg font-semibold text-sidebar-foreground whitespace-nowrap font-serif tracking-tight",
        initial: false,
        animate: { opacity: isExpanded ? 1 : 0 },
        transition: TRANSITION,
        children: "Dash"
      }
    )
  ] });
}
function NavigationEntry({ item, isExpanded, activeRoute, isOpen, onToggle, depth = 0 }) {
  const { t } = useTranslation();
  const hasChildren = !!item.children && item.children.length > 0;
  const isActive = item.path ? activeRoute === item.path || activeRoute?.startsWith(`${item.path}/`) : false;
  const sharedRow = /* @__PURE__ */ jsxRuntimeExports.jsx(EntryContent, { item, isExpanded, hasChildren, isOpen, depth });
  const state = item.disabled ? "disabled" : isActive ? "active" : "default";
  const rowClass = navRow({ nested: depth > 0, state });
  if (hasChildren) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
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
        }
      ),
      isOpen && isExpanded && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-1 mt-1 mb-2", children: item.children.map((child) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        NavigationEntry,
        {
          item: child,
          isExpanded,
          activeRoute,
          isOpen: false,
          onToggle: () => void 0,
          depth: depth + 1
        },
        child.label
      )) })
    ] });
  }
  if (item.path && !item.disabled) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: item.path, className: rowClass, "aria-label": item.label, title: item.label, children: sharedRow });
  }
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: <explanation>
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: rowClass, "aria-label": item.label, title: item.disabled ? `${item.label} — ${t("nav.comingSoon")}` : item.label, children: sharedRow })
  );
}
function EntryContent({
  item,
  isExpanded,
  hasChildren,
  isOpen,
  depth
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(GradientIcon, { icon: item.icon, className: cn(depth === 0 ? "size-5" : "size-4", "shrink-0") }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      motion.span,
      {
        className: "text-sm font-medium whitespace-nowrap flex-1 truncate",
        initial: false,
        animate: { opacity: isExpanded ? 1 : 0 },
        transition: TRANSITION,
        children: item.label
      }
    ),
    hasChildren && /* @__PURE__ */ jsxRuntimeExports.jsx(
      motion.span,
      {
        initial: false,
        animate: { opacity: isExpanded ? 1 : 0, rotate: isOpen ? 90 : 0 },
        transition: TRANSITION,
        className: "shrink-0",
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRightIcon, { className: "size-4" })
      }
    )
  ] });
}
function LogoutSection({ isExpanded, onLogout }) {
  const { t } = useTranslation();
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-auto mb-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    Button,
    {
      variant: "ghost",
      onClick: onLogout,
      className: "flex items-center justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-[linear-gradient(to_right,oklch(from_var(--sidebar-foreground)_l_c_h_/_0.18),transparent)] gap-3 h-10 px-3 w-full",
      "aria-label": t("common.logout"),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(GradientIcon, { icon: TurnoffIcon, className: "size-5 shrink-0" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          motion.span,
          {
            className: "text-sm font-medium whitespace-nowrap",
            initial: false,
            animate: { opacity: isExpanded ? 1 : 0 },
            transition: TRANSITION,
            children: t("common.logout")
          }
        )
      ]
    }
  ) });
}
function Breadcrumb({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("nav", { "aria-label": "breadcrumb", "data-slot": "breadcrumb", className: cn(className), ...props });
}
function BreadcrumbList({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "ol",
    {
      "data-slot": "breadcrumb-list",
      className: cn("text-muted-foreground gap-1.5 text-sm flex flex-wrap items-center break-words", className),
      ...props
    }
  );
}
function BreadcrumbItem({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("li", { "data-slot": "breadcrumb-item", className: cn("gap-1 inline-flex items-center", className), ...props });
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
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "data-slot": "breadcrumb-page", "aria-current": "page", className: cn("font-normal", className), ...props });
}
function BreadcrumbSeparator({ children, className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("li", { "data-slot": "breadcrumb-separator", role: "presentation", "aria-hidden": "true", className: cn("[&>svg]:size-3.5", className), ...props, children: children ?? /* @__PURE__ */ jsxRuntimeExports.jsx(IconChevronRight, {}) });
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
  return /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverRoot, { "data-slot": "popover", ...props });
}
const PopoverTrigger = reactExports.forwardRef(function PopoverTrigger2({ ...props }, ref) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverTrigger$1, { ref, "data-slot": "popover-trigger", ...props });
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
  return /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverPortal, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
    PopoverPositioner,
    {
      align,
      alignOffset,
      side,
      sideOffset,
      positionMethod,
      className: "isolate z-50",
      children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        PopoverPopup,
        {
          "data-slot": "popover-content",
          className: cn(
            surface,
            "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-98 data-open:zoom-in-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 flex flex-col gap-2.5 rounded-lg p-2.5 text-sm duration-200 ease-in-out z-50 w-72 origin-(--transform-origin) outline-hidden supports-backdrop-filter:backdrop-blur-sm",
            className
          ),
          ...props
        }
      )
    }
  ) });
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
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn("p-3 hover:bg-muted/50 transition-colors cursor-pointer", className), "data-slot": "notification-item", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn("size-2 rounded-full mt-1.5 shrink-0", NOTIFICATION_LEVEL_COLORS[notification.level]) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-medium text-sm truncate", children: notification.title }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground line-clamp-2", children: notification.content }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-muted-foreground mt-1", children: formatRelativeTime(notification.createdAt) })
    ] })
  ] }) });
}
function NotificationsPopover({ notifications }) {
  const { t } = useTranslation();
  const hasUnread = notifications.length > 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Popover, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      PopoverTrigger,
      {
        render: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Button,
          {
            variant: "ghost",
            size: "icon",
            className: "relative text-muted-foreground hover:text-foreground",
            "aria-label": t("notifications.aria"),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(IconBell, { className: "size-5" }),
              hasUnread && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute top-1.5 right-1.5 size-2 bg-destructive rounded-full" })
            ]
          }
        )
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(PopoverContent, { align: "end", className: "w-80 p-0", "data-slot": "notifications-popover", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-3 border-b border-border", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold", children: t("notifications.title") }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: t("notifications.unreadCount", { count: notifications.length }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "max-h-80 overflow-y-auto", children: notifications.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(Empty, { className: "border-none py-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyDescription, { children: t("notifications.allCaughtUp") }) }) : notifications.map((n) => /* @__PURE__ */ jsxRuntimeExports.jsx(NotificationItem, { notification: n }, n.id)) })
    ] })
  ] });
}
function UserProfile({ user, className, ...props }) {
  if (!user) return null;
  const name = user.name ?? "Anonymous";
  const picture = user.image ?? null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: cn("flex items-center gap-3", className), "data-slot": "user-profile", ...props, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-right hidden sm:block", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium text-foreground leading-tight", children: name }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Avatar, { size: "lg", className: "border border-border", children: [
      picture && /* @__PURE__ */ jsxRuntimeExports.jsx(AvatarImage, { src: picture, alt: name }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(AvatarFallback, { children: getInitials(name) })
    ] })
  ] });
}
const MOCK_NOTIFICATIONS = { items: [] };
function Header({ className, ...props }) {
  const session = useSession();
  const breadcrumbs = useBreadcrumbs();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "header",
    {
      className: cn("h-[52px] min-h-[52px] bg-card border-b border-border flex items-center justify-between px-6 shrink-0 z-20", className),
      ...props,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Breadcrumb, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(BreadcrumbList, { children: breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(reactExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(BreadcrumbItem, { children: isLast || !crumb.to ? /* @__PURE__ */ jsxRuntimeExports.jsx(BreadcrumbPage, { children: crumb.label }) : /* @__PURE__ */ jsxRuntimeExports.jsx(BreadcrumbLink, { render: /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: crumb.to, children: crumb.label }) }) }),
            !isLast && /* @__PURE__ */ jsxRuntimeExports.jsx(BreadcrumbSeparator, {})
          ] }, `${crumb.label}-${index}`);
        }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(NotificationsPopover, { notifications: MOCK_NOTIFICATIONS.items }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-10 w-px bg-border" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(UserProfile, { user: session?.user })
        ] })
      ]
    }
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
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dark flex h-dvh overflow-hidden bg-route-background", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Sidebar, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "flex-1 overflow-hidden relative flex flex-col", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Header, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn(routeWrapperClassName ?? "mx-auto max-w-[100rem] w-full"), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Outlet, {}) }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange: (isOpen) => !isOpen && hide(), children: content }),
    drawerContent
  ] });
}
export {
  AuthLayout as component
};
