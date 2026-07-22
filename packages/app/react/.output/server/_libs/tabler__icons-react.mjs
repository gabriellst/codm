import { r as reactExports } from "./react.mjs";
var defaultAttributes = {
  outline: {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  },
  filled: {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    stroke: "none"
  }
};
const createReactComponent = (type, iconName, iconNamePascal, iconNode) => {
  const Component = reactExports.forwardRef(
    ({ color = "currentColor", size = 24, stroke = 2, title, className, children, ...rest }, ref) => reactExports.createElement(
      "svg",
      {
        ref,
        ...defaultAttributes[type],
        width: size,
        height: size,
        className: [`tabler-icon`, `tabler-icon-${iconName}`, className].join(" "),
        ...{
          strokeWidth: stroke,
          stroke: color
        },
        ...rest
      },
      [
        title && reactExports.createElement("title", { key: "svg-title" }, title),
        ...iconNode.map(([tag, attrs]) => reactExports.createElement(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    )
  );
  Component.displayName = `${iconNamePascal}`;
  return Component;
};
const __iconNode$k = [["path", { "d": "M12.802 2.165l5.575 2.389c.48 .206 .863 .589 1.07 1.07l2.388 5.574c.22 .512 .22 1.092 0 1.604l-2.389 5.575c-.206 .48 -.589 .863 -1.07 1.07l-5.574 2.388c-.512 .22 -1.092 .22 -1.604 0l-5.575 -2.389a2.036 2.036 0 0 1 -1.07 -1.07l-2.388 -5.574a2.036 2.036 0 0 1 0 -1.604l2.389 -5.575c.206 -.48 .589 -.863 1.07 -1.07l5.574 -2.388a2.036 2.036 0 0 1 1.604 0", "key": "svg-0" }], ["path", { "d": "M12 8v4", "key": "svg-1" }], ["path", { "d": "M12 16h.01", "key": "svg-2" }]];
const IconAlertOctagon = createReactComponent("outline", "alert-octagon", "AlertOctagon", __iconNode$k);
const __iconNode$j = [["path", { "d": "M12 9v4", "key": "svg-0" }], ["path", { "d": "M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0", "key": "svg-1" }], ["path", { "d": "M12 16h.01", "key": "svg-2" }]];
const IconAlertTriangle = createReactComponent("outline", "alert-triangle", "AlertTriangle", __iconNode$j);
const __iconNode$i = [["path", { "d": "M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6", "key": "svg-0" }], ["path", { "d": "M9 17v1a3 3 0 0 0 6 0v-1", "key": "svg-1" }]];
const IconBell = createReactComponent("outline", "bell", "Bell", __iconNode$i);
const __iconNode$h = [["path", { "d": "M5 12l5 5l10 -10", "key": "svg-0" }]];
const IconCheck = createReactComponent("outline", "check", "Check", __iconNode$h);
const __iconNode$g = [["path", { "d": "M6 9l6 6l6 -6", "key": "svg-0" }]];
const IconChevronDown = createReactComponent("outline", "chevron-down", "ChevronDown", __iconNode$g);
const __iconNode$f = [["path", { "d": "M9 6l6 6l-6 6", "key": "svg-0" }]];
const IconChevronRight = createReactComponent("outline", "chevron-right", "ChevronRight", __iconNode$f);
const __iconNode$e = [["path", { "d": "M6 15l6 -6l6 6", "key": "svg-0" }]];
const IconChevronUp = createReactComponent("outline", "chevron-up", "ChevronUp", __iconNode$e);
const __iconNode$d = [["path", { "d": "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "key": "svg-0" }], ["path", { "d": "M9 12l2 2l4 -4", "key": "svg-1" }]];
const IconCircleCheck = createReactComponent("outline", "circle-check", "CircleCheck", __iconNode$d);
const __iconNode$c = [["path", { "d": "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0", "key": "svg-0" }], ["path", { "d": "M12 9h.01", "key": "svg-1" }], ["path", { "d": "M11 12h1v4h1", "key": "svg-2" }]];
const IconInfoCircle = createReactComponent("outline", "info-circle", "InfoCircle", __iconNode$c);
const __iconNode$b = [["path", { "d": "M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0", "key": "svg-0" }], ["path", { "d": "M15 9h.01", "key": "svg-1" }]];
const IconKey = createReactComponent("outline", "key", "Key", __iconNode$b);
const __iconNode$a = [["path", { "d": "M12 3a9 9 0 1 0 9 9", "key": "svg-0" }]];
const IconLoader2 = createReactComponent("outline", "loader-2", "Loader2", __iconNode$a);
const __iconNode$9 = [["path", { "d": "M12 6l0 -3", "key": "svg-0" }], ["path", { "d": "M16.25 7.75l2.15 -2.15", "key": "svg-1" }], ["path", { "d": "M18 12l3 0", "key": "svg-2" }], ["path", { "d": "M16.25 16.25l2.15 2.15", "key": "svg-3" }], ["path", { "d": "M12 18l0 3", "key": "svg-4" }], ["path", { "d": "M7.75 16.25l-2.15 2.15", "key": "svg-5" }], ["path", { "d": "M6 12l-3 0", "key": "svg-6" }], ["path", { "d": "M7.75 7.75l-2.15 -2.15", "key": "svg-7" }]];
const IconLoader = createReactComponent("outline", "loader", "Loader", __iconNode$9);
const __iconNode$8 = [["path", { "d": "M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6", "key": "svg-0" }], ["path", { "d": "M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0", "key": "svg-1" }], ["path", { "d": "M8 11v-4a4 4 0 1 1 8 0v4", "key": "svg-2" }]];
const IconLock = createReactComponent("outline", "lock", "Lock", __iconNode$8);
const __iconNode$7 = [["path", { "d": "M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10", "key": "svg-0" }], ["path", { "d": "M3 7l9 6l9 -6", "key": "svg-1" }]];
const IconMail = createReactComponent("outline", "mail", "Mail", __iconNode$7);
const __iconNode$6 = [["path", { "d": "M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4", "key": "svg-0" }], ["path", { "d": "M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4", "key": "svg-1" }]];
const IconRefresh = createReactComponent("outline", "refresh", "Refresh", __iconNode$6);
const __iconNode$5 = [["path", { "d": "M8 9l4 -4l4 4", "key": "svg-0" }], ["path", { "d": "M16 15l-4 4l-4 -4", "key": "svg-1" }]];
const IconSelector = createReactComponent("outline", "selector", "Selector", __iconNode$5);
const __iconNode$4 = [["path", { "d": "M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06", "key": "svg-0" }], ["path", { "d": "M15 19l2 2l4 -4", "key": "svg-1" }]];
const IconShieldCheck = createReactComponent("outline", "shield-check", "ShieldCheck", __iconNode$4);
const __iconNode$3 = [["path", { "d": "M4 7l16 0", "key": "svg-0" }], ["path", { "d": "M10 11l0 6", "key": "svg-1" }], ["path", { "d": "M14 11l0 6", "key": "svg-2" }], ["path", { "d": "M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12", "key": "svg-3" }], ["path", { "d": "M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3", "key": "svg-4" }]];
const IconTrash = createReactComponent("outline", "trash", "Trash", __iconNode$3);
const __iconNode$2 = [["path", { "d": "M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2", "key": "svg-0" }], ["path", { "d": "M7 9l5 -5l5 5", "key": "svg-1" }], ["path", { "d": "M12 4l0 12", "key": "svg-2" }]];
const IconUpload = createReactComponent("outline", "upload", "Upload", __iconNode$2);
const __iconNode$1 = [["path", { "d": "M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0", "key": "svg-0" }], ["path", { "d": "M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2", "key": "svg-1" }]];
const IconUser = createReactComponent("outline", "user", "User", __iconNode$1);
const __iconNode = [["path", { "d": "M18 6l-12 12", "key": "svg-0" }], ["path", { "d": "M6 6l12 12", "key": "svg-1" }]];
const IconX = createReactComponent("outline", "x", "X", __iconNode);
export {
  IconChevronRight as I,
  IconBell as a,
  IconUser as b,
  IconMail as c,
  IconLock as d,
  IconRefresh as e,
  IconCheck as f,
  IconShieldCheck as g,
  IconKey as h,
  IconTrash as i,
  IconUpload as j,
  IconSelector as k,
  IconChevronUp as l,
  IconChevronDown as m,
  IconX as n,
  IconLoader2 as o,
  IconAlertTriangle as p,
  IconLoader as q,
  IconAlertOctagon as r,
  IconInfoCircle as s,
  IconCircleCheck as t
};
