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
const __iconNode$C = [["path", { "d": "M12.802 2.165l5.575 2.389c.48 .206 .863 .589 1.07 1.07l2.388 5.574c.22 .512 .22 1.092 0 1.604l-2.389 5.575c-.206 .48 -.589 .863 -1.07 1.07l-5.574 2.388c-.512 .22 -1.092 .22 -1.604 0l-5.575 -2.389a2.036 2.036 0 0 1 -1.07 -1.07l-2.388 -5.574a2.036 2.036 0 0 1 0 -1.604l2.389 -5.575c.206 -.48 .589 -.863 1.07 -1.07l5.574 -2.388a2.036 2.036 0 0 1 1.604 0", "key": "svg-0" }], ["path", { "d": "M12 8v4", "key": "svg-1" }], ["path", { "d": "M12 16h.01", "key": "svg-2" }]];
const IconAlertOctagon = createReactComponent("outline", "alert-octagon", "AlertOctagon", __iconNode$C);
const __iconNode$B = [["path", { "d": "M12 9v4", "key": "svg-0" }], ["path", { "d": "M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0", "key": "svg-1" }], ["path", { "d": "M12 16h.01", "key": "svg-2" }]];
const IconAlertTriangle = createReactComponent("outline", "alert-triangle", "AlertTriangle", __iconNode$B);
const __iconNode$A = [["path", { "d": "M6 18l0 -3", "key": "svg-0" }], ["path", { "d": "M10 18l0 -6", "key": "svg-1" }], ["path", { "d": "M14 18l0 -9", "key": "svg-2" }], ["path", { "d": "M18 18l0 -12", "key": "svg-3" }]];
const IconAntennaBars5 = createReactComponent("outline", "antenna-bars-5", "AntennaBars5", __iconNode$A);
const __iconNode$z = [["path", { "d": "M5 12l14 0", "key": "svg-0" }], ["path", { "d": "M5 12l6 6", "key": "svg-1" }], ["path", { "d": "M5 12l6 -6", "key": "svg-2" }]];
const IconArrowLeft = createReactComponent("outline", "arrow-left", "ArrowLeft", __iconNode$z);
const __iconNode$y = [["path", { "d": "M5 12l14 0", "key": "svg-0" }], ["path", { "d": "M13 18l6 -6", "key": "svg-1" }], ["path", { "d": "M13 6l6 6", "key": "svg-2" }]];
const IconArrowRight = createReactComponent("outline", "arrow-right", "ArrowRight", __iconNode$y);
const __iconNode$x = [["path", { "d": "M12 5l0 14", "key": "svg-0" }], ["path", { "d": "M18 11l-6 -6", "key": "svg-1" }], ["path", { "d": "M6 11l6 -6", "key": "svg-2" }]];
const IconArrowUp = createReactComponent("outline", "arrow-up", "ArrowUp", __iconNode$x);
const __iconNode$w = [["path", { "d": "M12 12l8 -4.5", "key": "svg-0" }], ["path", { "d": "M12 12v9", "key": "svg-1" }], ["path", { "d": "M12 12l-8 -4.5", "key": "svg-2" }], ["path", { "d": "M12 12l8 4.5", "key": "svg-3" }], ["path", { "d": "M12 3v9", "key": "svg-4" }], ["path", { "d": "M12 12l-8 4.5", "key": "svg-5" }]];
const IconAsterisk = createReactComponent("outline", "asterisk", "Asterisk", __iconNode$w);
const __iconNode$v = [["path", { "d": "M4 8a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4l0 -8", "key": "svg-0" }], ["path", { "d": "M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0", "key": "svg-1" }], ["path", { "d": "M16.5 7.5v.01", "key": "svg-2" }]];
const IconBrandInstagram = createReactComponent("outline", "brand-instagram", "BrandInstagram", __iconNode$v);
const __iconNode$u = [["path", { "d": "M15 10l-4 4l6 6l4 -16l-18 7l4 2l2 6l3 -4", "key": "svg-0" }]];
const IconBrandTelegram = createReactComponent("outline", "brand-telegram", "BrandTelegram", __iconNode$u);
const __iconNode$t = [["path", { "d": "M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9", "key": "svg-0" }], ["path", { "d": "M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1", "key": "svg-1" }]];
const IconBrandWhatsapp = createReactComponent("outline", "brand-whatsapp", "BrandWhatsapp", __iconNode$t);
const __iconNode$s = [["path", { "d": "M5 12l5 5l10 -10", "key": "svg-0" }]];
const IconCheck = createReactComponent("outline", "check", "Check", __iconNode$s);
const __iconNode$r = [["path", { "d": "M15 6l-6 6l6 6", "key": "svg-0" }]];
const IconChevronLeft = createReactComponent("outline", "chevron-left", "ChevronLeft", __iconNode$r);
const __iconNode$q = [["path", { "d": "M9 6l6 6l-6 6", "key": "svg-0" }]];
const IconChevronRight = createReactComponent("outline", "chevron-right", "ChevronRight", __iconNode$q);
const __iconNode$p = [["path", { "d": "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "key": "svg-0" }], ["path", { "d": "M9 12l2 2l4 -4", "key": "svg-1" }]];
const IconCircleCheck = createReactComponent("outline", "circle-check", "CircleCheck", __iconNode$p);
const __iconNode$o = [["path", { "d": "M14 3v4a1 1 0 0 0 1 1h4", "key": "svg-0" }], ["path", { "d": "M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2", "key": "svg-1" }]];
const IconFile = createReactComponent("outline", "file", "File", __iconNode$o);
const __iconNode$n = [["path", { "d": "M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2", "key": "svg-0" }]];
const IconFolder = createReactComponent("outline", "folder", "Folder", __iconNode$n);
const __iconNode$m = [["path", { "d": "M19.875 6.27a2.225 2.225 0 0 1 1.125 1.948v7.284c0 .809 -.443 1.555 -1.158 1.948l-6.75 4.27a2.269 2.269 0 0 1 -2.184 0l-6.75 -4.27a2.225 2.225 0 0 1 -1.158 -1.948v-7.285c0 -.809 .443 -1.554 1.158 -1.947l6.75 -3.98a2.33 2.33 0 0 1 2.25 0l6.75 3.98h-.033", "key": "svg-0" }]];
const IconHexagon = createReactComponent("outline", "hexagon", "Hexagon", __iconNode$m);
const __iconNode$l = [["path", { "d": "M5 12l-2 0l9 -9l9 9l-2 0", "key": "svg-0" }], ["path", { "d": "M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7", "key": "svg-1" }], ["path", { "d": "M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6", "key": "svg-2" }]];
const IconHome = createReactComponent("outline", "home", "Home", __iconNode$l);
const __iconNode$k = [["path", { "d": "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0", "key": "svg-0" }], ["path", { "d": "M12 9h.01", "key": "svg-1" }], ["path", { "d": "M11 12h1v4h1", "key": "svg-2" }]];
const IconInfoCircle = createReactComponent("outline", "info-circle", "InfoCircle", __iconNode$k);
const __iconNode$j = [["path", { "d": "M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0", "key": "svg-0" }], ["path", { "d": "M15 9h.01", "key": "svg-1" }]];
const IconKey = createReactComponent("outline", "key", "Key", __iconNode$j);
const __iconNode$i = [["path", { "d": "M9 15l6 -6", "key": "svg-0" }], ["path", { "d": "M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464", "key": "svg-1" }], ["path", { "d": "M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463", "key": "svg-2" }]];
const IconLink = createReactComponent("outline", "link", "Link", __iconNode$i);
const __iconNode$h = [["path", { "d": "M13 5h8", "key": "svg-0" }], ["path", { "d": "M13 9h5", "key": "svg-1" }], ["path", { "d": "M13 15h8", "key": "svg-2" }], ["path", { "d": "M13 19h5", "key": "svg-3" }], ["path", { "d": "M3 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4", "key": "svg-4" }], ["path", { "d": "M3 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4", "key": "svg-5" }]];
const IconListDetails = createReactComponent("outline", "list-details", "ListDetails", __iconNode$h);
const __iconNode$g = [["path", { "d": "M12 3a9 9 0 1 0 9 9", "key": "svg-0" }]];
const IconLoader2 = createReactComponent("outline", "loader-2", "Loader2", __iconNode$g);
const __iconNode$f = [["path", { "d": "M12 6l0 -3", "key": "svg-0" }], ["path", { "d": "M16.25 7.75l2.15 -2.15", "key": "svg-1" }], ["path", { "d": "M18 12l3 0", "key": "svg-2" }], ["path", { "d": "M16.25 16.25l2.15 2.15", "key": "svg-3" }], ["path", { "d": "M12 18l0 3", "key": "svg-4" }], ["path", { "d": "M7.75 16.25l-2.15 2.15", "key": "svg-5" }], ["path", { "d": "M6 12l-3 0", "key": "svg-6" }], ["path", { "d": "M7.75 7.75l-2.15 -2.15", "key": "svg-7" }]];
const IconLoader = createReactComponent("outline", "loader", "Loader", __iconNode$f);
const __iconNode$e = [["path", { "d": "M15 8h.01", "key": "svg-0" }], ["path", { "d": "M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12", "key": "svg-1" }], ["path", { "d": "M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5", "key": "svg-2" }], ["path", { "d": "M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3", "key": "svg-3" }]];
const IconPhoto = createReactComponent("outline", "photo", "Photo", __iconNode$e);
const __iconNode$d = [["path", { "d": "M6 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -12", "key": "svg-0" }], ["path", { "d": "M14 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -12", "key": "svg-1" }]];
const IconPlayerPause = createReactComponent("outline", "player-pause", "PlayerPause", __iconNode$d);
const __iconNode$c = [["path", { "d": "M7 4v16l13 -8l-13 -8", "key": "svg-0" }]];
const IconPlayerPlay = createReactComponent("outline", "player-play", "PlayerPlay", __iconNode$c);
const __iconNode$b = [["path", { "d": "M12 5l0 14", "key": "svg-0" }], ["path", { "d": "M5 12l14 0", "key": "svg-1" }]];
const IconPlus = createReactComponent("outline", "plus", "Plus", __iconNode$b);
const __iconNode$a = [["path", { "d": "M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4", "key": "svg-0" }], ["path", { "d": "M7 17l0 .01", "key": "svg-1" }], ["path", { "d": "M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4", "key": "svg-2" }], ["path", { "d": "M7 7l0 .01", "key": "svg-3" }], ["path", { "d": "M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4", "key": "svg-4" }], ["path", { "d": "M17 7l0 .01", "key": "svg-5" }], ["path", { "d": "M14 14l3 0", "key": "svg-6" }], ["path", { "d": "M20 14l0 .01", "key": "svg-7" }], ["path", { "d": "M14 14l0 3", "key": "svg-8" }], ["path", { "d": "M14 20l3 0", "key": "svg-9" }], ["path", { "d": "M17 17l3 0", "key": "svg-10" }], ["path", { "d": "M20 17l0 3", "key": "svg-11" }]];
const IconQrcode = createReactComponent("outline", "qrcode", "Qrcode", __iconNode$a);
const __iconNode$9 = [["path", { "d": "M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "key": "svg-0" }], ["path", { "d": "M21 21l-6 -6", "key": "svg-1" }]];
const IconSearch = createReactComponent("outline", "search", "Search", __iconNode$9);
const __iconNode$8 = [["path", { "d": "M19.875 6.27a2.225 2.225 0 0 1 1.125 1.948v7.284c0 .809 -.443 1.555 -1.158 1.948l-6.75 4.27a2.269 2.269 0 0 1 -2.184 0l-6.75 -4.27a2.225 2.225 0 0 1 -1.158 -1.948v-7.285c0 -.809 .443 -1.554 1.158 -1.947l6.75 -3.98a2.33 2.33 0 0 1 2.25 0l6.75 3.98h-.033", "key": "svg-0" }], ["path", { "d": "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "key": "svg-1" }]];
const IconSettings2 = createReactComponent("outline", "settings-2", "Settings2", __iconNode$8);
const __iconNode$7 = [["path", { "d": "M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065", "key": "svg-0" }], ["path", { "d": "M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0", "key": "svg-1" }]];
const IconSettings = createReactComponent("outline", "settings", "Settings", __iconNode$7);
const __iconNode$6 = [["path", { "d": "M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06", "key": "svg-0" }], ["path", { "d": "M15 19l2 2l4 -4", "key": "svg-1" }]];
const IconShieldCheck = createReactComponent("outline", "shield-check", "ShieldCheck", __iconNode$6);
const __iconNode$5 = [["path", { "d": "M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6", "key": "svg-0" }]];
const IconSparkles = createReactComponent("outline", "sparkles", "Sparkles", __iconNode$5);
const __iconNode$4 = [["path", { "d": "M8 9l3 3l-3 3", "key": "svg-0" }], ["path", { "d": "M13 15l3 0", "key": "svg-1" }], ["path", { "d": "M3 6a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -12", "key": "svg-2" }]];
const IconTerminal2 = createReactComponent("outline", "terminal-2", "Terminal2", __iconNode$4);
const __iconNode$3 = [["path", { "d": "M4 7l16 0", "key": "svg-0" }], ["path", { "d": "M10 11l0 6", "key": "svg-1" }], ["path", { "d": "M14 11l0 6", "key": "svg-2" }], ["path", { "d": "M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12", "key": "svg-3" }], ["path", { "d": "M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3", "key": "svg-4" }]];
const IconTrash = createReactComponent("outline", "trash", "Trash", __iconNode$3);
const __iconNode$2 = [["path", { "d": "M3 7l6 6l4 -4l8 8", "key": "svg-0" }], ["path", { "d": "M21 10l0 7l-7 0", "key": "svg-1" }]];
const IconTrendingDown = createReactComponent("outline", "trending-down", "TrendingDown", __iconNode$2);
const __iconNode$1 = [["path", { "d": "M3 17l6 -6l4 4l8 -8", "key": "svg-0" }], ["path", { "d": "M14 7l7 0l0 7", "key": "svg-1" }]];
const IconTrendingUp = createReactComponent("outline", "trending-up", "TrendingUp", __iconNode$1);
const __iconNode = [["path", { "d": "M18 6l-12 12", "key": "svg-0" }], ["path", { "d": "M6 6l12 12", "key": "svg-1" }]];
const IconX = createReactComponent("outline", "x", "X", __iconNode);
export {
  IconAlertTriangle as A,
  IconLoader as B,
  IconAlertOctagon as C,
  IconInfoCircle as D,
  IconCircleCheck as E,
  IconTerminal2 as F,
  IconHexagon as G,
  IconBrandTelegram as H,
  IconHome as I,
  IconBrandInstagram as J,
  IconBrandWhatsapp as K,
  IconLoader2 as L,
  IconAsterisk as M,
  IconListDetails as a,
  IconAntennaBars5 as b,
  IconFolder as c,
  IconSettings as d,
  IconPlus as e,
  IconX as f,
  IconArrowLeft as g,
  IconCheck as h,
  IconArrowRight as i,
  IconChevronRight as j,
  IconSearch as k,
  IconSparkles as l,
  IconTrendingUp as m,
  IconTrendingDown as n,
  IconQrcode as o,
  IconChevronLeft as p,
  IconPlayerPlay as q,
  IconPlayerPause as r,
  IconSettings2 as s,
  IconShieldCheck as t,
  IconKey as u,
  IconTrash as v,
  IconArrowUp as w,
  IconLink as x,
  IconFile as y,
  IconPhoto as z
};
