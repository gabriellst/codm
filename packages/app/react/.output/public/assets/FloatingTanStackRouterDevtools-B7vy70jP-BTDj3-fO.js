import{bo as ne,bp as Ue,bq as bt,br as _t,bs as Ft,bt as K,bu as tt,bv as He,bw as u,bx as zt,by as w,bz as d,bA as F,bB as W,bC as Ze,bD as Re,bE as j,bF as s,bG as Mt,bH as Ut,bI as O,bJ as pt,bK as Bt,bL as Et,bM as Ot,bN as yt,bO as rt,bP as Dt,bQ as Tt,bR as It}from"./index-D9aBhbqu.js";var Gt="Invariant failed";function At(e,t){if(!e){var n=t,r="".concat(Gt,": ").concat(n);throw new Error(r)}}let Pt={data:""},Rt=e=>{if(typeof window=="object"){let t=(e?e.querySelector("#_goober"):window._goober)||Object.assign(document.createElement("style"),{innerHTML:" ",id:"_goober"});return t.nonce=window.__nonce__,t.parentNode||(e||document.head).appendChild(t),t.firstChild}return e||Pt},Lt=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,Ht=/\/\*[^]*?\*\/|  +/g,ht=/\n+/g,we=(e,t)=>{let n="",r="",p="";for(let l in e){let a=e[l];l[0]=="@"?l[1]=="i"?n=l+" "+a+";":r+=l[1]=="f"?we(a,l):l+"{"+we(a,l[1]=="k"?"":t)+"}":typeof a=="object"?r+=we(a,t?t.replace(/([^,])+/g,f=>l.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,g=>/&/.test(g)?g.replace(/&/g,f):f?f+" "+g:g)):l):a!=null&&(l=/^--/.test(l)?l:l.replace(/[A-Z]/g,"-$&").toLowerCase(),p+=we.p?we.p(l,a):l+":"+a+";")}return n+(t&&p?t+"{"+p+"}":p)+r},$e={},kt=e=>{if(typeof e=="object"){let t="";for(let n in e)t+=n+kt(e[n]);return t}return e},jt=(e,t,n,r,p)=>{let l=kt(e),a=$e[l]||($e[l]=(g=>{let o=0,i=11;for(;o<g.length;)i=101*i+g.charCodeAt(o++)>>>0;return"go"+i})(l));if(!$e[a]){let g=l!==e?e:(o=>{let i,v,h=[{}];for(;i=Lt.exec(o.replace(Ht,""));)i[4]?h.shift():i[3]?(v=i[3].replace(ht," ").trim(),h.unshift(h[0][v]=h[0][v]||{})):h[0][i[1]]=i[2].replace(ht," ").trim();return h[0]})(e);$e[a]=we(p?{["@keyframes "+a]:g}:g,n?"":"."+a)}let f=n&&$e.g?$e.g:null;return n&&($e.g=$e[a]),((g,o,i,v)=>{v?o.data=o.data.replace(v,g):o.data.indexOf(g)===-1&&(o.data=i?g+o.data:o.data+g)})($e[a],t,r,f),a},Nt=(e,t,n)=>e.reduce((r,p,l)=>{let a=t[l];if(a&&a.call){let f=a(n),g=f&&f.props&&f.props.className||/^go/.test(f)&&f;a=g?"."+g:f&&typeof f=="object"?f.props?"":we(f,""):f===!1?"":f}return r+p+(a??"")},"");function Be(e){let t=this||{},n=e.call?e(t.p):e;return jt(n.unshift?n.raw?Nt(n,[].slice.call(arguments,1),t.p):n.reduce((r,p)=>Object.assign(r,p&&p.call?p(t.p):p),{}):n,Rt(t.target),t.g,t.o,t.k)}Be.bind({g:1});Be.bind({k:1});const Vt=typeof window>"u";function et(e){const t={pending:"yellow",success:"green",error:"red",notFound:"purple",redirected:"gray"};return e.isFetching&&e.status==="success"?e.isFetching==="beforeLoad"?"purple":"blue":t[e.status]}function Jt(e,t){const n=e.find(r=>r.routeId===t.id);return n?et(n):"gray"}function Yt(){const[e,t]=ne(!1);return(Vt?Ue:w)(()=>{t(!0)}),e}const qt=e=>{const t=Object.getOwnPropertyNames(Object(e)),n=typeof e=="bigint"?`${e.toString()}n`:e;try{return JSON.stringify(n,t)}catch{return"unable to stringify"}};function Kt(e,t=[n=>n]){return e.map((n,r)=>[n,r]).sort(([n,r],[p,l])=>{for(const a of t){const f=a(n),g=a(p);if(typeof f>"u"){if(typeof g>"u")continue;return 1}if(f!==g)return f>g?1:-1}return r-l}).map(([n])=>n)}const I={colors:{inherit:"inherit",current:"currentColor",transparent:"transparent",black:"#000000",white:"#ffffff",neutral:{50:"#f9fafb",100:"#f2f4f7",200:"#eaecf0",300:"#d0d5dd",400:"#98a2b3",500:"#667085",600:"#475467",700:"#344054",800:"#1d2939",900:"#101828"},darkGray:{50:"#525c7a",100:"#49536e",200:"#414962",300:"#394056",400:"#313749",500:"#292e3d",600:"#212530",700:"#191c24",800:"#111318",900:"#0b0d10"},gray:{50:"#f9fafb",100:"#f2f4f7",200:"#eaecf0",300:"#d0d5dd",400:"#98a2b3",500:"#667085",600:"#475467",700:"#344054",800:"#1d2939",900:"#101828"},blue:{25:"#F5FAFF",50:"#EFF8FF",100:"#D1E9FF",200:"#B2DDFF",300:"#84CAFF",400:"#53B1FD",500:"#2E90FA",600:"#1570EF",700:"#175CD3",800:"#1849A9",900:"#194185"},green:{25:"#F6FEF9",50:"#ECFDF3",100:"#D1FADF",200:"#A6F4C5",300:"#6CE9A6",400:"#32D583",500:"#12B76A",600:"#039855",700:"#027A48",800:"#05603A",900:"#054F31"},red:{50:"#fef2f2",100:"#fee2e2",200:"#fecaca",300:"#fca5a5",400:"#f87171",500:"#ef4444",600:"#dc2626",700:"#b91c1c",800:"#991b1b",900:"#7f1d1d",950:"#450a0a"},yellow:{25:"#FFFCF5",50:"#FFFAEB",100:"#FEF0C7",200:"#FEDF89",300:"#FEC84B",400:"#FDB022",500:"#F79009",600:"#DC6803",700:"#B54708",800:"#93370D",900:"#7A2E0E"},purple:{25:"#FAFAFF",50:"#F4F3FF",100:"#EBE9FE",200:"#D9D6FE",300:"#BDB4FE",400:"#9B8AFB",500:"#7A5AF8",600:"#6938EF",700:"#5925DC",800:"#4A1FB8",900:"#3E1C96"},teal:{25:"#F6FEFC",50:"#F0FDF9",100:"#CCFBEF",200:"#99F6E0",300:"#5FE9D0",400:"#2ED3B7",500:"#15B79E",600:"#0E9384",700:"#107569",800:"#125D56",900:"#134E48"},pink:{25:"#fdf2f8",50:"#fce7f3",100:"#fbcfe8",200:"#f9a8d4",300:"#f472b6",400:"#ec4899",500:"#db2777",600:"#be185d",700:"#9d174d",800:"#831843",900:"#500724"},cyan:{25:"#ecfeff",50:"#cffafe",100:"#a5f3fc",200:"#67e8f9",300:"#22d3ee",400:"#06b6d4",500:"#0891b2",600:"#0e7490",700:"#155e75",800:"#164e63",900:"#083344"}},alpha:{90:"e5",70:"b3",20:"33"},font:{size:{"2xs":"calc(var(--tsrd-font-size) * 0.625)",xs:"calc(var(--tsrd-font-size) * 0.75)",sm:"calc(var(--tsrd-font-size) * 0.875)",md:"var(--tsrd-font-size)"},lineHeight:{xs:"calc(var(--tsrd-font-size) * 1)",sm:"calc(var(--tsrd-font-size) * 1.25)"},weight:{normal:"400",medium:"500",semibold:"600",bold:"700"},fontFamily:{sans:"ui-sans-serif, Inter, system-ui, sans-serif, sans-serif",mono:"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"}},border:{radius:{xs:"calc(var(--tsrd-font-size) * 0.125)",sm:"calc(var(--tsrd-font-size) * 0.25)",md:"calc(var(--tsrd-font-size) * 0.375)",full:"9999px"}},size:{0:"0px",.5:"calc(var(--tsrd-font-size) * 0.125)",1:"calc(var(--tsrd-font-size) * 0.25)",1.5:"calc(var(--tsrd-font-size) * 0.375)",2:"calc(var(--tsrd-font-size) * 0.5)",2.5:"calc(var(--tsrd-font-size) * 0.625)",3:"calc(var(--tsrd-font-size) * 0.75)",3.5:"calc(var(--tsrd-font-size) * 0.875)",4:"calc(var(--tsrd-font-size) * 1)",5:"calc(var(--tsrd-font-size) * 1.25)",8:"calc(var(--tsrd-font-size) * 2)"}},Qt=e=>{const{colors:t,font:n,size:r,alpha:p,border:l}=I,{fontFamily:a,lineHeight:f,size:g}=n,o=e?Be.bind({target:e}):Be;return{devtoolsPanelContainer:o`
      direction: ltr;
      position: fixed;
      bottom: 0;
      right: 0;
      z-index: 99999;
      width: 100%;
      max-height: 90%;
      border-top: 1px solid ${t.gray[700]};
      transform-origin: top;
    `,devtoolsPanelContainerVisibility:i=>o`
        visibility: ${i?"visible":"hidden"};
      `,devtoolsPanelContainerResizing:i=>i()?o`
          transition: none;
        `:o`
        transition: all 0.4s ease;
      `,devtoolsPanelContainerAnimation:(i,v)=>i?o`
          pointer-events: auto;
          transform: translateY(0);
        `:o`
        pointer-events: none;
        transform: translateY(${v}px);
      `,logo:o`
      cursor: pointer;
      display: flex;
      flex-direction: column;
      background-color: transparent;
      border: none;
      font-family: ${a.sans};
      gap: ${I.size[.5]};
      padding: 0px;
      &:hover {
        opacity: 0.7;
      }
      &:focus-visible {
        outline-offset: 4px;
        border-radius: ${l.radius.xs};
        outline: 2px solid ${t.blue[800]};
      }
    `,tanstackLogo:o`
      font-size: ${n.size.md};
      font-weight: ${n.weight.bold};
      line-height: ${n.lineHeight.xs};
      white-space: nowrap;
      color: ${t.gray[300]};
    `,routerLogo:o`
      font-weight: ${n.weight.semibold};
      font-size: ${n.size.xs};
      background: linear-gradient(to right, #84cc16, #10b981);
      background-clip: text;
      -webkit-background-clip: text;
      line-height: 1;
      -webkit-text-fill-color: transparent;
      white-space: nowrap;
    `,devtoolsPanel:o`
      display: flex;
      font-size: ${g.sm};
      font-family: ${a.sans};
      background-color: ${t.darkGray[700]};
      color: ${t.gray[300]};

      @media (max-width: 700px) {
        flex-direction: column;
      }
      @media (max-width: 600px) {
        font-size: ${g.xs};
      }
    `,dragHandle:o`
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 4px;
      cursor: row-resize;
      z-index: 100000;
      &:hover {
        background-color: ${t.purple[400]}${p[90]};
      }
    `,firstContainer:o`
      flex: 1 1 500px;
      min-height: 40%;
      max-height: 100%;
      overflow: auto;
      border-right: 1px solid ${t.gray[700]};
      display: flex;
      flex-direction: column;
    `,routerExplorerContainer:o`
      overflow-y: auto;
      flex: 1;
    `,routerExplorer:o`
      padding: ${I.size[2]};
    `,row:o`
      display: flex;
      align-items: center;
      padding: ${I.size[2]} ${I.size[2.5]};
      gap: ${I.size[2.5]};
      border-bottom: ${t.darkGray[500]} 1px solid;
      align-items: center;
    `,detailsHeader:o`
      font-family: ui-sans-serif, Inter, system-ui, sans-serif, sans-serif;
      position: sticky;
      top: 0;
      z-index: 2;
      background-color: ${t.darkGray[600]};
      padding: 0px ${I.size[2]};
      font-weight: ${n.weight.medium};
      font-size: ${n.size.xs};
      min-height: ${I.size[8]};
      line-height: ${n.lineHeight.xs};
      text-align: left;
      display: flex;
      align-items: center;
    `,maskedBadge:o`
      background: ${t.yellow[900]}${p[70]};
      color: ${t.yellow[300]};
      display: inline-block;
      padding: ${I.size[0]} ${I.size[2.5]};
      border-radius: ${l.radius.full};
      font-size: ${n.size.xs};
      font-weight: ${n.weight.normal};
      border: 1px solid ${t.yellow[300]};
    `,maskedLocation:o`
      color: ${t.yellow[300]};
    `,detailsContent:o`
      padding: ${I.size[1.5]} ${I.size[2]};
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: ${n.size.xs};
    `,routeMatchesToggle:o`
      display: flex;
      align-items: center;
      border: 1px solid ${t.gray[500]};
      border-radius: ${l.radius.sm};
      overflow: hidden;
    `,routeMatchesToggleBtn:(i,v)=>{const C=[o`
        appearance: none;
        border: none;
        font-size: 12px;
        padding: 4px 8px;
        background: transparent;
        cursor: pointer;
        font-family: ${a.sans};
        font-weight: ${n.weight.medium};
      `];if(i){const m=o`
          background: ${t.darkGray[400]};
          color: ${t.gray[300]};
        `;C.push(m)}else{const m=o`
          color: ${t.gray[500]};
          background: ${t.darkGray[800]}${p[20]};
        `;C.push(m)}return v&&C.push(o`
          border-right: 1px solid ${I.colors.gray[500]};
        `),C},detailsHeaderInfo:o`
      flex: 1;
      justify-content: flex-end;
      display: flex;
      align-items: center;
      font-weight: ${n.weight.normal};
      color: ${t.gray[400]};
    `,matchRow:i=>{const h=[o`
        display: flex;
        border-bottom: 1px solid ${t.darkGray[400]};
        cursor: pointer;
        align-items: center;
        padding: ${r[1]} ${r[2]};
        gap: ${r[2]};
        font-size: ${g.xs};
        color: ${t.gray[300]};
      `];if(i){const C=o`
          background: ${t.darkGray[500]};
        `;h.push(C)}return h},matchIndicator:i=>{const h=[o`
        flex: 0 0 auto;
        width: ${r[3]};
        height: ${r[3]};
        background: ${t[i][900]};
        border: 1px solid ${t[i][500]};
        border-radius: ${l.radius.full};
        transition: all 0.25s ease-out;
        box-sizing: border-box;
      `];if(i==="gray"){const C=o`
          background: ${t.gray[700]};
          border-color: ${t.gray[400]};
        `;h.push(C)}return h},matchID:o`
      flex: 1;
      line-height: ${f.xs};
    `,ageTicker:i=>{const h=[o`
        display: flex;
        gap: ${r[1]};
        font-size: ${g.xs};
        color: ${t.gray[400]};
        font-variant-numeric: tabular-nums;
        line-height: ${f.xs};
      `];if(i){const C=o`
          color: ${t.yellow[400]};
        `;h.push(C)}return h},secondContainer:o`
      flex: 1 1 500px;
      min-height: 40%;
      max-height: 100%;
      overflow: auto;
      border-right: 1px solid ${t.gray[700]};
      display: flex;
      flex-direction: column;
    `,thirdContainer:o`
      flex: 1 1 500px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      height: 100%;
      border-right: 1px solid ${t.gray[700]};

      @media (max-width: 700px) {
        border-top: 2px solid ${t.gray[700]};
      }
    `,fourthContainer:o`
      flex: 1 1 500px;
      min-height: 40%;
      max-height: 100%;
      overflow: auto;
      display: flex;
      flex-direction: column;
    `,routesContainer:o`
      overflow-x: auto;
      overflow-y: visible;
    `,routesRowContainer:(i,v)=>{const C=[o`
        display: flex;
        border-bottom: 1px solid ${t.darkGray[400]};
        align-items: center;
        padding: ${r[1]} ${r[2]};
        gap: ${r[2]};
        font-size: ${g.xs};
        color: ${t.gray[300]};
        cursor: ${v?"pointer":"default"};
        line-height: ${f.xs};
      `];if(i){const m=o`
          background: ${t.darkGray[500]};
        `;C.push(m)}return C},routesRow:i=>{const h=[o`
        flex: 1 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: ${g.xs};
        line-height: ${f.xs};
      `];if(!i){const C=o`
          color: ${t.gray[400]};
        `;h.push(C)}return h},routesRowInner:o`
      display: 'flex';
      align-items: 'center';
      flex-grow: 1;
      min-width: 0;
    `,routeParamInfo:o`
      color: ${t.gray[400]};
      font-size: ${g.xs};
      line-height: ${f.xs};
    `,nestedRouteRow:i=>o`
        margin-left: ${i?0:r[3.5]};
        border-left: ${i?"":`solid 1px ${t.gray[700]}`};
      `,code:o`
      font-size: ${g.xs};
      line-height: ${f.xs};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `,matchesContainer:o`
      flex: 1 1 auto;
      overflow-y: auto;
    `,cachedMatchesContainer:o`
      flex: 1 1 auto;
      overflow-y: auto;
      max-height: 50%;
    `,historyContainer:o`
      display: flex;
      flex: 1 1 auto;
      overflow-y: auto;
      max-height: 50%;
    `,historyOverflowContainer:o`
      padding: ${r[1]} ${r[2]};
      font-size: ${I.font.size.xs};
    `,maskedBadgeContainer:o`
      flex: 1;
      justify-content: flex-end;
      display: flex;
    `,matchDetails:o`
      display: flex;
      flex-direction: column;
      padding: ${I.size[2]};
      font-size: ${I.font.size.xs};
      color: ${I.colors.gray[300]};
      line-height: ${I.font.lineHeight.sm};
    `,matchStatus:(i,v)=>{const C=v&&i==="success"?v==="beforeLoad"?"purple":"blue":{pending:"yellow",success:"green",error:"red",notFound:"purple",redirected:"gray"}[i];return o`
        display: flex;
        justify-content: center;
        align-items: center;
        height: 40px;
        border-radius: ${I.border.radius.sm};
        font-weight: ${I.font.weight.normal};
        background-color: ${I.colors[C][900]}${I.alpha[90]};
        color: ${I.colors[C][300]};
        border: 1px solid ${I.colors[C][600]};
        margin-bottom: ${I.size[2]};
        transition: all 0.25s ease-out;
      `},matchDetailsInfo:o`
      display: flex;
      justify-content: flex-end;
      flex: 1;
    `,matchDetailsInfoLabel:o`
      display: flex;
    `,mainCloseBtn:o`
      background: ${t.darkGray[700]};
      padding: ${r[1]} ${r[2]} ${r[1]} ${r[1.5]};
      border-radius: ${l.radius.md};
      position: fixed;
      z-index: 99999;
      display: inline-flex;
      width: fit-content;
      cursor: pointer;
      appearance: none;
      border: 0;
      gap: 8px;
      align-items: center;
      border: 1px solid ${t.gray[500]};
      font-size: ${n.size.xs};
      cursor: pointer;
      transition: all 0.25s ease-out;

      &:hover {
        background: ${t.darkGray[500]};
      }
    `,mainCloseBtnPosition:i=>o`
        ${i==="top-left"?`top: ${r[2]}; left: ${r[2]};`:""}
        ${i==="top-right"?`top: ${r[2]}; right: ${r[2]};`:""}
        ${i==="bottom-left"?`bottom: ${r[2]}; left: ${r[2]};`:""}
        ${i==="bottom-right"?`bottom: ${r[2]}; right: ${r[2]};`:""}
      `,mainCloseBtnAnimation:i=>i?o`
        opacity: 0;
        pointer-events: none;
        visibility: hidden;
      `:o`
          opacity: 1;
          pointer-events: auto;
          visibility: visible;
        `,routerLogoCloseButton:o`
      font-weight: ${n.weight.semibold};
      font-size: ${n.size.xs};
      background: linear-gradient(to right, #98f30c, #00f4a3);
      background-clip: text;
      -webkit-background-clip: text;
      line-height: 1;
      -webkit-text-fill-color: transparent;
      white-space: nowrap;
    `,mainCloseBtnDivider:o`
      width: 1px;
      background: ${I.colors.gray[600]};
      height: 100%;
      border-radius: 999999px;
      color: transparent;
    `,mainCloseBtnIconContainer:o`
      position: relative;
      width: ${r[5]};
      height: ${r[5]};
      background: pink;
      border-radius: 999999px;
      overflow: hidden;
    `,mainCloseBtnIconOuter:o`
      width: ${r[5]};
      height: ${r[5]};
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      filter: blur(3px) saturate(1.8) contrast(2);
    `,mainCloseBtnIconInner:o`
      width: ${r[4]};
      height: ${r[4]};
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    `,panelCloseBtn:o`
      position: absolute;
      cursor: pointer;
      z-index: 100001;
      display: flex;
      align-items: center;
      justify-content: center;
      outline: none;
      background-color: ${t.darkGray[700]};
      &:hover {
        background-color: ${t.darkGray[500]};
      }

      top: 0;
      right: ${r[2]};
      transform: translate(0, -100%);
      border-right: ${t.darkGray[300]} 1px solid;
      border-left: ${t.darkGray[300]} 1px solid;
      border-top: ${t.darkGray[300]} 1px solid;
      border-bottom: none;
      border-radius: ${l.radius.sm} ${l.radius.sm} 0px 0px;
      padding: ${r[1]} ${r[1.5]} ${r[.5]} ${r[1.5]};

      &::after {
        content: ' ';
        position: absolute;
        top: 100%;
        left: -${r[2.5]};
        height: ${r[1.5]};
        width: calc(100% + ${r[5]});
      }
    `,panelCloseBtnIcon:o`
      color: ${t.gray[400]};
      width: ${r[2]};
      height: ${r[2]};
    `,navigateButton:o`
      background: none;
      border: none;
      padding: 0 0 0 4px;
      margin: 0;
      color: ${t.gray[400]};
      font-size: ${g.md};
      cursor: pointer;
      line-height: 1;
      vertical-align: middle;
      margin-right: 0.5ch;
      flex-shrink: 0;
      &:hover {
        color: ${t.blue[300]};
      }
    `}};function Ee(){const e=bt(yt),[t]=ne(Qt(e));return t}const Wt=e=>{try{const t=localStorage.getItem(e);return typeof t=="string"?JSON.parse(t):void 0}catch{return}};function We(e,t){const[n,r]=ne();return Ue(()=>{const l=Wt(e);r(typeof l>"u"||l===null?typeof t=="function"?t():t:l)}),[n,l=>{r(a=>{let f=l;typeof l=="function"&&(f=l(a));try{localStorage.setItem(e,JSON.stringify(f))}catch{}return f})}]}var Zt=O('<span><svg xmlns=http://www.w3.org/2000/svg width=12 height=12 fill=none viewBox="0 0 24 24"><path stroke=currentColor stroke-linecap=round stroke-linejoin=round stroke-width=2 d="M9 18l6-6-6-6">'),Je=O("<div>"),Xt=O("<button><span> "),er=O("<div><div><button> [<!> ... <!>]"),tr=O("<button><span></span> 🔄 "),rr=O("<span>:"),ir=O("<span>");const vt=({expanded:e,style:t={}})=>{const n=Ct();return(()=>{var r=Zt(),p=r.firstChild;return w(l=>{var a=n().expander,f=j(n().expanderIcon(e));return a!==l.e&&d(r,l.e=a),f!==l.t&&s(p,"class",l.t=f),l},{e:void 0,t:void 0}),r})()};function nr(e,t){if(t<1)return[];let n=0;const r=[];for(;n<e.length;)r.push(e.slice(n,n+t)),n=n+t;return r}function or(e){return Symbol.iterator in e}function Me({value:e,defaultExpanded:t,pageSize:n=100,filterSubEntries:r,...p}){const[l,a]=ne(!!t),f=()=>a(H=>!H),g=K(()=>typeof e()),o=K(()=>{let H=[];const ie=$=>{const y=t===!0?{[$.label]:!0}:t?.[$.label];return{...$,value:()=>$.value,defaultExpanded:y}};return Array.isArray(e())?H=e().map(($,y)=>ie({label:y.toString(),value:$})):e()!==null&&typeof e()=="object"&&or(e())&&typeof e()[Symbol.iterator]=="function"?H=Array.from(e(),($,y)=>ie({label:y.toString(),value:$})):typeof e()=="object"&&e()!==null&&(H=Object.entries(e()).map(([$,y])=>ie({label:$,value:y}))),r?r(H):H}),i=K(()=>nr(o(),n)),[v,h]=ne([]),[C,m]=ne(void 0),D=Ct(),L=()=>{m(e()())},Q=H=>F(Me,He({value:e,filterSubEntries:r},p,H));return(()=>{var H=Je();return u(H,(()=>{var ie=W(()=>!!i().length);return()=>ie()?[(()=>{var $=Xt(),y=$.firstChild,S=y.firstChild;return $.$$click=()=>f(),u($,F(vt,{get expanded(){return l()??!1}}),y),u($,()=>p.label,y),u(y,()=>String(g).toLowerCase()==="iterable"?"(Iterable) ":"",S),u(y,()=>o().length,S),u(y,()=>o().length>1?"items":"item",null),w(ee=>{var te=D().expandButton,X=D().info;return te!==ee.e&&d($,ee.e=te),X!==ee.t&&d(y,ee.t=X),ee},{e:void 0,t:void 0}),$})(),W(()=>W(()=>!!(l()??!1))()?W(()=>i().length===1)()?(()=>{var $=Je();return u($,()=>o().map((y,S)=>Q(y))),w(()=>d($,D().subEntries)),$})():(()=>{var $=Je();return u($,()=>i().map((y,S)=>(()=>{var ee=er(),te=ee.firstChild,X=te.firstChild,fe=X.firstChild,ue=fe.nextSibling,me=ue.nextSibling,G=me.nextSibling;return G.nextSibling,X.$$click=()=>h(M=>M.includes(S)?M.filter(J=>J!==S):[...M,S]),u(X,F(vt,{get expanded(){return v().includes(S)}}),fe),u(X,S*n,ue),u(X,S*n+n-1,G),u(te,(()=>{var M=W(()=>!!v().includes(S));return()=>M()?(()=>{var J=Je();return u(J,()=>y.map(N=>Q(N))),w(()=>d(J,D().subEntries)),J})():null})(),null),w(M=>{var J=D().entry,N=j(D().labelButton,"labelButton");return J!==M.e&&d(te,M.e=J),N!==M.t&&d(X,M.t=N),M},{e:void 0,t:void 0}),ee})())),w(()=>d($,D().subEntries)),$})():null)]:W(()=>g()==="function")()?F(Me,{get label(){return(()=>{var $=tr(),y=$.firstChild;return $.$$click=L,u(y,()=>p.label),w(()=>d($,D().refreshValueBtn)),$})()},value:C,defaultExpanded:{}}):[(()=>{var $=rr(),y=$.firstChild;return u($,()=>p.label,y),$})()," ",(()=>{var $=ir();return u($,()=>qt(e())),w(()=>d($,D().value)),$})()]})()),w(()=>d(H,D().entry)),H})()}const lr=e=>{const{colors:t,font:n,size:r}=I,{fontFamily:p,lineHeight:l,size:a}=n,f=e?Be.bind({target:e}):Be;return{entry:f`
      font-family: ${p.mono};
      font-size: ${a.xs};
      line-height: ${l.sm};
      outline: none;
      word-break: break-word;
    `,labelButton:f`
      cursor: pointer;
      color: inherit;
      font: inherit;
      outline: inherit;
      background: transparent;
      border: none;
      padding: 0;
    `,expander:f`
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: ${r[3]};
      height: ${r[3]};
      padding-left: 3px;
      box-sizing: content-box;
    `,expanderIcon:g=>g?f`
          transform: rotate(90deg);
          transition: transform 0.1s ease;
        `:f`
        transform: rotate(0deg);
        transition: transform 0.1s ease;
      `,expandButton:f`
      display: flex;
      gap: ${r[1]};
      align-items: center;
      cursor: pointer;
      color: inherit;
      font: inherit;
      outline: inherit;
      background: transparent;
      border: none;
      padding: 0;
    `,value:f`
      color: ${t.purple[400]};
    `,subEntries:f`
      margin-left: ${r[2]};
      padding-left: ${r[2]};
      border-left: 2px solid ${t.darkGray[400]};
    `,info:f`
      color: ${t.gray[500]};
      font-size: ${a["2xs"]};
      padding-left: ${r[1]};
    `,refreshValueBtn:f`
      appearance: none;
      border: 0;
      cursor: pointer;
      background: transparent;
      color: inherit;
      padding: 0;
      font-family: ${p.mono};
      font-size: ${a.xs};
    `}};function Ct(){const e=bt(yt),[t]=ne(lr(e));return t}rt(["click"]);var sr=O("<div><div></div><div>/</div><div></div><div>/</div><div>");function Xe(e){const t=["s","min","h","d"],n=[e/1e3,e/6e4,e/36e5,e/864e5];let r=0;for(let l=1;l<n.length&&!(n[l]<1);l++)r=l;return new Intl.NumberFormat(navigator.language,{compactDisplay:"short",notation:"compact",maximumFractionDigits:0}).format(n[r])+t[r]}function Ye({match:e,router:t}){const n=Ee();if(!e)return null;const r=t().looseRoutesById[e.routeId];if(!r.options.loader)return null;const p=Date.now()-e.updatedAt,l=r.options.staleTime??t().options.defaultStaleTime??0,a=r.options.gcTime??t().options.defaultGcTime??1800*1e3;return(()=>{var f=sr(),g=f.firstChild,o=g.nextSibling,i=o.nextSibling,v=i.nextSibling,h=v.nextSibling;return u(g,()=>Xe(p)),u(i,()=>Xe(l)),u(h,()=>Xe(a)),w(()=>d(f,j(n().ageTicker(p>l)))),f})()}var ar=O("<button type=button>➔");function qe({to:e,params:t,search:n,router:r}){const p=Ee();return(()=>{var l=ar();return l.$$click=a=>{a.stopPropagation(),r().navigate({to:e,params:t,search:n})},s(l,"title",`Navigate to ${e}`),w(()=>d(l,p().navigateButton)),l})()}rt(["click"]);var dr=O("<button><div>TANSTACK</div><div>TanStack Router v1"),cr=O("<div style=display:flex;align-items:center;width:100%><div style=flex-grow:1;min-width:0>"),fr=O("<code> "),Le=O("<code>"),ur=O("<div><div role=button><div>"),Ke=O("<div>"),gr=O("<div><ul>"),pr=O('<div><button><svg xmlns=http://www.w3.org/2000/svg width=10 height=6 fill=none viewBox="0 0 10 6"><path stroke=currentColor stroke-linecap=round stroke-linejoin=round stroke-width=1.667 d="M1 1l4 4 4-4"></path></svg></button><div><div></div><div><div></div></div></div><div><div><div><span>Pathname</span></div><div><code></code></div><div><div><button type=button>Routes</button><button type=button>Matches</button><button type=button>History</button></div><div><div>age / staleTime / gcTime</div></div></div><div>'),hr=O("<div><span>masked"),$t=O("<div role=button><div>"),vr=O("<li><div>"),$r=O("<li>This panel displays the most recent 15 navigations."),mr=O("<div><div><div>Cached Matches</div><div>age / staleTime / gcTime</div></div><div>"),xr=O("<div><div>Match Details</div><div><div><div><div></div></div><div><div>ID:</div><div><code></code></div></div><div><div>State:</div><div></div></div><div><div>Last Updated:</div><div></div></div></div></div><div>Explorer</div><div>"),br=O("<div>Loader Data"),yr=O("<div><div><span>Search Params</span></div><div>"),kr=O("<span style=margin-left:0.5rem>"),Cr=O('<button type=button aria-label="Copy value to clipboard"style=cursor:pointer>');const mt=15;function wr(e){const{className:t,...n}=e,r=Ee();return(()=>{var p=dr(),l=p.firstChild,a=l.nextSibling;return tt(p,He(n,{get class(){return j(r().logo,t?t():"")}}),!1,!0),w(f=>{var g=r().tanstackLogo,o=r().routerLogo;return g!==f.e&&d(l,f.e=g),o!==f.t&&d(a,f.t=o),f},{e:void 0,t:void 0}),p})()}function Qe(e){return(()=>{var t=cr(),n=t.firstChild;return u(t,()=>e.left,n),u(n,()=>e.children),u(t,()=>e.right,null),w(()=>d(t,e.class)),t})()}function wt({routerState:e,router:t,route:n,isRoot:r,activeId:p,setActiveId:l}){const a=Ee(),f=K(()=>e().pendingMatches||e().matches),g=K(()=>e().matches.find(v=>v.routeId===n.id)),o=K(()=>{try{if(g()?.params){const v=g()?.params,h=n.path||pt(n.id);if(h.startsWith("$")){const C=h.slice(1);if(v[C])return`(${v[C]})`}}return""}catch{return""}}),i=K(()=>{if(r||!n.path)return;const v=Object.assign({},...f().map(C=>C.params)),h=Bt({path:n.fullPath,params:v,decoder:t().pathParamsDecoder});return h.isMissingParams?void 0:h.interpolatedPath});return(()=>{var v=ur(),h=v.firstChild,C=h.firstChild;return h.$$click=()=>{g()&&l(p()===n.id?"":n.id)},u(h,F(Qe,{get class(){return j(a().routesRow(!!g()))},get left(){return F(Et,{get when(){return i()},children:m=>F(qe,{get to(){return m()},router:t})})},get right(){return F(Ye,{get match(){return g()},router:t})},get children(){return[(()=>{var m=fr(),D=m.firstChild;return u(m,()=>r?Re:n.path||pt(n.id),D),w(()=>d(m,a().code)),m})(),(()=>{var m=Le();return u(m,o),w(()=>d(m,a().routeParamInfo)),m})()]}}),null),u(v,(()=>{var m=W(()=>!!n.children?.length);return()=>m()?(()=>{var D=Ke();return u(D,()=>[...n.children].sort((L,Q)=>L.rank-Q.rank).map(L=>F(wt,{routerState:e,router:t,route:L,activeId:p,setActiveId:l}))),w(()=>d(D,a().nestedRouteRow(!!r))),D})():null})(),null),w(m=>{var D=`Open match details for ${n.id}`,L=j(a().routesRowContainer(n.id===p(),!!g())),Q=j(a().matchIndicator(Jt(f(),n)));return D!==m.e&&s(h,"aria-label",m.e=D),L!==m.t&&d(h,m.t=L),Q!==m.a&&d(C,m.a=Q),m},{e:void 0,t:void 0,a:void 0}),v})()}const Sr=function({...t}){const{isOpen:n=!0,setIsOpen:r,handleDragStart:p,router:l,routerState:a,shadowDOMTarget:f,...g}=t,{onCloseClick:o}=_t(),i=Ee(),{className:v,style:h,...C}=g;At(l,"No router was found for the TanStack Router Devtools. Please place the devtools in the <RouterProvider> component tree or pass the router instance to the devtools manually.");const[m,D]=We("tanstackRouterDevtoolsActiveTab","routes"),[L,Q]=We("tanstackRouterDevtoolsActiveRouteId",""),[H,ie]=ne([]),[$,y]=ne(!1);Ue(()=>{const G=a().matches,M=G[G.length-1];if(!M)return;const J=Ft(()=>H()),N=J[0],ge=N&&N.pathname===M.pathname&&JSON.stringify(N.search??{})===JSON.stringify(M.search??{});(!N||!ge)&&(J.length>=mt&&y(!0),ie(pe=>{const E=[M,...pe];return E.splice(mt),E}))});const S=K(()=>[...a().pendingMatches??[],...a().matches,...a().cachedMatches].find(M=>M.routeId===L()||M.id===L())),ee=K(()=>Object.keys(a().location.search).length),te=K(()=>({...l(),state:a()})),X=K(()=>Object.fromEntries(Kt(Object.keys(te()),["state","routesById","routesByPath","options","manifest"].map(G=>M=>M!==G)).map(G=>[G,te()[G]]).filter(G=>typeof G[1]!="function"&&!["__store","basepath","injectedHtml","subscribers","latestLoadPromise","navigateTimeout","resetNextScroll","tempLocationKey","latestLocation","routeTree","history"].includes(G[0])))),fe=K(()=>S()?.loaderData),ue=K(()=>S()),me=K(()=>a().location.search);return(()=>{var G=pr(),M=G.firstChild,J=M.firstChild,N=M.nextSibling,ge=N.firstChild,pe=ge.nextSibling,E=pe.firstChild,R=N.nextSibling,Y=R.firstChild,Z=Y.firstChild;Z.firstChild;var re=Z.nextSibling,ke=re.firstChild,P=re.nextSibling,le=P.firstChild,se=le.firstChild,he=se.nextSibling,ae=he.nextSibling,Se=le.nextSibling,_e=P.nextSibling;return tt(G,He({get class(){return j(i().devtoolsPanel,"TanStackRouterDevtoolsPanel",v?v():"")},get style(){return h?h():""}},C),!1,!0),u(G,p?(()=>{var c=Ke();return zt(c,"mousedown",p,!0),w(()=>d(c,i().dragHandle)),c})():null,M),M.$$click=c=>{r&&r(!1),o(c)},u(ge,F(wr,{"aria-hidden":!0,onClick:c=>{r&&r(!1),o(c)}})),u(E,F(Me,{label:"Router",value:X,defaultExpanded:{state:{},context:{},options:{}},filterSubEntries:c=>c.filter(x=>typeof x.value()!="function")})),u(Z,(()=>{var c=W(()=>!!a().location.maskedLocation);return()=>c()?(()=>{var x=hr(),B=x.firstChild;return w(U=>{var z=i().maskedBadgeContainer,_=i().maskedBadge;return z!==U.e&&d(x,U.e=z),_!==U.t&&d(B,U.t=_),U},{e:void 0,t:void 0}),x})():null})(),null),u(ke,()=>a().location.pathname),u(re,(()=>{var c=W(()=>!!a().location.maskedLocation);return()=>c()?(()=>{var x=Le();return u(x,()=>a().location.maskedLocation?.pathname),w(()=>d(x,i().maskedLocation)),x})():null})(),null),se.$$click=()=>{D("routes")},he.$$click=()=>{D("matches")},ae.$$click=()=>{D("history")},u(_e,F(Ut,{get children(){return[F(Ze,{get when(){return m()==="routes"},get children(){return F(wt,{routerState:a,router:l,get route(){return l().routeTree},isRoot:!0,activeId:L,setActiveId:Q})}}),F(Ze,{get when(){return m()==="matches"},get children(){var c=Ke();return u(c,()=>(a().pendingMatches?.length?a().pendingMatches:a().matches)?.map((x,B)=>(()=>{var U=$t(),z=U.firstChild;return U.$$click=()=>Q(L()===x.id?"":x.id),u(U,F(Qe,{get left(){return F(qe,{get to(){return x.pathname},get params(){return x.params},get search(){return x.search},router:l})},get right(){return F(Ye,{match:x,router:l})},get children(){var _=Le();return u(_,()=>`${x.routeId===Re?Re:x.pathname}`),w(()=>d(_,i().matchID)),_}}),null),w(_=>{var b=`Open match details for ${x.id}`,T=j(i().matchRow(x===S())),q=j(i().matchIndicator(et(x)));return b!==_.e&&s(U,"aria-label",_.e=b),T!==_.t&&d(U,_.t=T),q!==_.a&&d(z,_.a=q),_},{e:void 0,t:void 0,a:void 0}),U})())),c}}),F(Ze,{get when(){return m()==="history"},get children(){var c=gr(),x=c.firstChild;return u(x,F(Mt,{get each(){return H()},children:(B,U)=>(()=>{var z=vr(),_=z.firstChild;return u(z,F(Qe,{get left(){return F(qe,{get to(){return B.pathname},get params(){return B.params},get search(){return B.search},router:l})},get right(){return F(Ye,{match:B,router:l})},get children(){var b=Le();return u(b,()=>`${B.routeId===Re?Re:B.pathname}`),w(()=>d(b,i().matchID)),b}}),null),w(b=>{var T=j(i().matchRow(B===S())),q=j(i().matchIndicator(U()===0?"green":"gray"));return T!==b.e&&d(z,b.e=T),q!==b.t&&d(_,b.t=q),b},{e:void 0,t:void 0}),z})()}),null),u(x,(()=>{var B=W(()=>!!$());return()=>B()?(()=>{var U=$r();return w(()=>d(U,i().historyOverflowContainer)),U})():null})(),null),c}})]}})),u(R,(()=>{var c=W(()=>!!a().cachedMatches.length);return()=>c()?(()=>{var x=mr(),B=x.firstChild,U=B.firstChild,z=U.nextSibling,_=B.nextSibling;return u(_,()=>a().cachedMatches.map(b=>(()=>{var T=$t(),q=T.firstChild;return T.$$click=()=>Q(L()===b.id?"":b.id),u(T,F(Qe,{get left(){return F(qe,{get to(){return b.pathname},get params(){return b.params},get search(){return b.search},router:l})},get right(){return F(Ye,{match:b,router:l})},get children(){var A=Le();return u(A,()=>`${b.id}`),w(()=>d(A,i().matchID)),A}}),null),w(A=>{var de=`Open match details for ${b.id}`,oe=j(i().matchRow(b===S())),ce=j(i().matchIndicator(et(b)));return de!==A.e&&s(T,"aria-label",A.e=de),oe!==A.t&&d(T,A.t=oe),ce!==A.a&&d(q,A.a=ce),A},{e:void 0,t:void 0,a:void 0}),T})())),w(b=>{var T=i().cachedMatchesContainer,q=i().detailsHeader,A=i().detailsHeaderInfo;return T!==b.e&&d(x,b.e=T),q!==b.t&&d(B,b.t=q),A!==b.a&&d(z,b.a=A),b},{e:void 0,t:void 0,a:void 0}),x})():null})(),null),u(G,(()=>{var c=W(()=>!!(S()&&S()?.status));return()=>c()?(()=>{var x=xr(),B=x.firstChild,U=B.nextSibling,z=U.firstChild,_=z.firstChild,b=_.firstChild,T=_.nextSibling,q=T.firstChild,A=q.nextSibling,de=A.firstChild,oe=T.nextSibling,ce=oe.firstChild,Ce=ce.nextSibling,xe=oe.nextSibling,Fe=xe.firstChild,ve=Fe.nextSibling,be=U.nextSibling,ye=be.nextSibling;return u(b,(()=>{var k=W(()=>!!(S()?.status==="success"&&S()?.isFetching));return()=>k()?"fetching":S()?.status})()),u(de,()=>S()?.id),u(Ce,(()=>{var k=W(()=>!!a().pendingMatches?.find(V=>V.id===S()?.id));return()=>k()?"Pending":a().matches.find(V=>V.id===S()?.id)?"Active":"Cached"})()),u(ve,(()=>{var k=W(()=>!!S()?.updatedAt);return()=>k()?new Date(S()?.updatedAt).toLocaleTimeString():"N/A"})()),u(x,(()=>{var k=W(()=>!!fe());return()=>k()?[(()=>{var V=br();return w(()=>d(V,i().detailsHeader)),V})(),(()=>{var V=Ke();return u(V,F(Me,{label:"loaderData",value:fe,defaultExpanded:{}})),w(()=>d(V,i().detailsContent)),V})()]:null})(),be),u(ye,F(Me,{label:"Match",value:ue,defaultExpanded:{}})),w(k=>{var V=i().thirdContainer,je=i().detailsHeader,ze=i().matchDetails,Ne=i().matchStatus(S()?.status,S()?.isFetching),Oe=i().matchDetailsInfoLabel,Ve=i().matchDetailsInfo,De=i().matchDetailsInfoLabel,Te=i().matchDetailsInfo,Ie=i().matchDetailsInfoLabel,Ge=i().matchDetailsInfo,Ae=i().detailsHeader,Pe=i().detailsContent;return V!==k.e&&d(x,k.e=V),je!==k.t&&d(B,k.t=je),ze!==k.a&&d(z,k.a=ze),Ne!==k.o&&d(_,k.o=Ne),Oe!==k.i&&d(T,k.i=Oe),Ve!==k.n&&d(A,k.n=Ve),De!==k.s&&d(oe,k.s=De),Te!==k.h&&d(Ce,k.h=Te),Ie!==k.r&&d(xe,k.r=Ie),Ge!==k.d&&d(ve,k.d=Ge),Ae!==k.l&&d(be,k.l=Ae),Pe!==k.u&&d(ye,k.u=Pe),k},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0,r:void 0,d:void 0,l:void 0,u:void 0}),x})():null})(),null),u(G,(()=>{var c=W(()=>!!ee());return()=>c()?(()=>{var x=yr(),B=x.firstChild;B.firstChild;var U=B.nextSibling;return u(B,typeof navigator<"u"?(()=>{var z=kr();return u(z,F(_r,{getValue:()=>{const _=a().location.search;return JSON.stringify(_)}})),z})():null,null),u(U,F(Me,{value:me,get defaultExpanded(){return Object.keys(a().location.search).reduce((z,_)=>(z[_]={},z),{})}})),w(z=>{var _=i().fourthContainer,b=i().detailsHeader,T=i().detailsContent;return _!==z.e&&d(x,z.e=_),b!==z.t&&d(B,z.t=b),T!==z.a&&d(U,z.a=T),z},{e:void 0,t:void 0,a:void 0}),x})():null})(),null),w(c=>{var x=i().panelCloseBtn,B=i().panelCloseBtnIcon,U=i().firstContainer,z=i().row,_=i().routerExplorerContainer,b=i().routerExplorer,T=i().secondContainer,q=i().matchesContainer,A=i().detailsHeader,de=i().detailsContent,oe=i().detailsHeader,ce=i().routeMatchesToggle,Ce=m()==="routes",xe=j(i().routeMatchesToggleBtn(m()==="routes",!0)),Fe=m()==="matches",ve=j(i().routeMatchesToggleBtn(m()==="matches",!0)),be=m()==="history",ye=j(i().routeMatchesToggleBtn(m()==="history",!1)),k=i().detailsHeaderInfo,V=j(i().routesContainer);return x!==c.e&&d(M,c.e=x),B!==c.t&&s(J,"class",c.t=B),U!==c.a&&d(N,c.a=U),z!==c.o&&d(ge,c.o=z),_!==c.i&&d(pe,c.i=_),b!==c.n&&d(E,c.n=b),T!==c.s&&d(R,c.s=T),q!==c.h&&d(Y,c.h=q),A!==c.r&&d(Z,c.r=A),de!==c.d&&d(re,c.d=de),oe!==c.l&&d(P,c.l=oe),ce!==c.u&&d(le,c.u=ce),Ce!==c.c&&(se.disabled=c.c=Ce),xe!==c.w&&d(se,c.w=xe),Fe!==c.m&&(he.disabled=c.m=Fe),ve!==c.f&&d(he,c.f=ve),be!==c.y&&(ae.disabled=c.y=be),ye!==c.g&&d(ae,c.g=ye),k!==c.p&&d(Se,c.p=k),V!==c.b&&d(_e,c.b=V),c},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0,r:void 0,d:void 0,l:void 0,u:void 0,c:void 0,w:void 0,m:void 0,f:void 0,y:void 0,g:void 0,p:void 0,b:void 0}),G})()};function _r({getValue:e}){const[t,n]=ne(!1);let r=null;const p=async()=>{if(typeof navigator>"u"||!navigator.clipboard?.writeText){console.warn("TanStack Router Devtools: Clipboard API unavailable");return}try{const l=e();await navigator.clipboard.writeText(l),n(!0),r&&clearTimeout(r),r=setTimeout(()=>n(!1),2500)}catch(l){console.error("TanStack Router Devtools: Failed to copy",l)}};return Ot(()=>{r&&clearTimeout(r)}),(()=>{var l=Cr();return l.$$click=p,u(l,()=>t()?"✅":"📋"),w(()=>s(l,"title",t()?"Copied!":"Copy")),l})()}rt(["click","mousedown"]);var Fr=O('<svg xmlns=http://www.w3.org/2000/svg enable-background="new 0 0 634 633"viewBox="0 0 634 633"><g transform=translate(1)><linearGradient x1=-641.486 x2=-641.486 y1=856.648 y2=855.931 gradientTransform="matrix(633 0 0 -633 406377 542258)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#6bdaff></stop><stop offset=0.319 stop-color=#f9ffb5></stop><stop offset=0.706 stop-color=#ffa770></stop><stop offset=1 stop-color=#ff7373></stop></linearGradient><circle cx=316.5 cy=316.5 r=316.5 fill-rule=evenodd clip-rule=evenodd></circle><defs><filter width=454 height=396.9 x=-137.5 y=412 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=-137.5 y=412 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=89.5 cy=610.5 fill=#015064 fill-rule=evenodd stroke=#00CFE2 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=454 height=396.9 x=316.5 y=412 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=316.5 y=412 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=543.5 cy=610.5 fill=#015064 fill-rule=evenodd stroke=#00CFE2 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=454 height=396.9 x=-137.5 y=450 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=-137.5 y=450 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=89.5 cy=648.5 fill=#015064 fill-rule=evenodd stroke=#00A8B8 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=454 height=396.9 x=316.5 y=450 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=316.5 y=450 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=543.5 cy=648.5 fill=#015064 fill-rule=evenodd stroke=#00A8B8 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=454 height=396.9 x=-137.5 y=486 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=-137.5 y=486 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=89.5 cy=684.5 fill=#015064 fill-rule=evenodd stroke=#007782 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=454 height=396.9 x=316.5 y=486 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=316.5 y=486 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=543.5 cy=684.5 fill=#015064 fill-rule=evenodd stroke=#007782 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=176.9 height=129.3 x=272.2 y=308 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=176.9 height=129.3 x=272.2 y=308 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><g><path fill=none stroke=#000 stroke-linecap=round stroke-linejoin=bevel stroke-width=11 d="M436 403.2l-5 28.6m-140-90.3l-10.9 62m52.8-19.4l-4.3 27.1"></path><linearGradient x1=-645.656 x2=-646.499 y1=854.878 y2=854.788 gradientTransform="matrix(-184.159 -32.4722 11.4608 -64.9973 -128419.844 34938.836)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ee2700></stop><stop offset=1 stop-color=#ff008e></stop></linearGradient><path fill-rule=evenodd d="M344.1 363l97.7 17.2c5.8 2.1 8.2 6.2 7.1 12.1-1 5.9-4.7 9.2-11 9.9l-106-18.7-57.5-59.2c-3.2-4.8-2.9-9.1.8-12.8 3.7-3.7 8.3-4.4 13.7-2.1l55.2 53.6z"clip-rule=evenodd></path><path fill=#D8D8D8 fill-rule=evenodd stroke=#FFF stroke-linecap=round stroke-linejoin=bevel stroke-width=7 d="M428.3 384.5l.9-6.5m-33.9 1.5l.9-6.5m-34 .5l.9-6.1m-38.9-16.1l4.2-3.9m-25.2-16.1l4.2-3.9"clip-rule=evenodd></path></g><defs><filter width=280.6 height=317.4 x=73.2 y=113.9 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=280.6 height=317.4 x=73.2 y=113.9 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><g><linearGradient x1=-646.8 x2=-646.8 y1=854.844 y2=853.844 gradientTransform="matrix(-100.1751 48.8587 -97.9753 -200.879 19124.773 203538.61)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#a17500></stop><stop offset=1 stop-color=#5d2100></stop></linearGradient><path fill-rule=evenodd d="M192.3 203c8.1 37.3 14 73.6 17.8 109.1 3.8 35.4 2.8 75.2-2.9 119.2l61.2-16.7c-15.6-59-25.2-97.9-28.6-116.6-3.4-18.7-10.8-51.8-22.2-99.6l-25.3 4.6"clip-rule=evenodd></path><linearGradient x1=-635.467 x2=-635.467 y1=852.115 y2=851.115 gradientTransform="matrix(92.6873 4.8575 2.0257 -38.6535 57323.695 36176.047)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M195 183.9s-12.6-22.1-36.5-29.9c-15.9-5.2-34.4-1.5-55.5 11.1 15.9 14.3 29.5 22.6 40.7 24.9 16.8 3.6 51.3-6.1 51.3-6.1z"clip-rule=evenodd></path><linearGradient x1=-636.573 x2=-636.573 y1=855.444 y2=854.444 gradientTransform="matrix(109.9945 5.7646 6.3597 -121.3507 64719.133 107659.336)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M194.9 184.5s-47.5-8.5-83.2 15.7c-23.8 16.2-34.3 49.3-31.6 99.3 30.3-27.8 52.1-48.5 65.2-61.9 19.8-20 49.6-53.1 49.6-53.1z"clip-rule=evenodd></path><linearGradient x1=-632.145 x2=-632.145 y1=854.174 y2=853.174 gradientTransform="matrix(62.9558 3.2994 3.5021 -66.8246 37035.367 59284.227)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M195 183.9c-.8-21.9 6-38 20.6-48.2 14.6-10.2 29.8-15.3 45.5-15.3-6.1 21.4-14.5 35.8-25.2 43.4-10.7 7.5-24.4 14.2-40.9 20.1z"clip-rule=evenodd></path><linearGradient x1=-638.224 x2=-638.224 y1=853.801 y2=852.801 gradientTransform="matrix(152.4666 7.9904 3.0934 -59.0251 94939.86 55646.855)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M194.9 184.5c31.9-30 64.1-39.7 96.7-29 32.6 10.7 50.8 30.4 54.6 59.1-35.2-5.5-60.4-9.6-75.8-12.1-15.3-2.6-40.5-8.6-75.5-18z"clip-rule=evenodd></path><linearGradient x1=-637.723 x2=-637.723 y1=855.103 y2=854.103 gradientTransform="matrix(136.467 7.1519 5.2165 -99.5377 82830.875 89859.578)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M194.9 184.5c35.8-7.6 65.6-.2 89.2 22 23.6 22.2 37.7 49 42.3 80.3-39.8-9.7-68.3-23.8-85.5-42.4-17.2-18.5-32.5-38.5-46-59.9z"clip-rule=evenodd></path><linearGradient x1=-631.79 x2=-631.79 y1=855.872 y2=854.872 gradientTransform="matrix(60.8683 3.19 8.7771 -167.4773 31110.818 145537.61)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M194.9 184.5c-33.6 13.8-53.6 35.7-60.1 65.6-6.5 29.9-3.6 63.1 8.7 99.6 27.4-40.3 43.2-69.6 47.4-88 4.2-18.3 5.5-44.1 4-77.2z"clip-rule=evenodd></path><path fill=none stroke=#2F8A00 stroke-linecap=round stroke-width=8 d="M196.5 182.3c-14.8 21.6-25.1 41.4-30.8 59.4-5.7 18-9.4 33-11.1 45.1"></path><path fill=none stroke=#2F8A00 stroke-linecap=round stroke-width=8 d="M194.8 185.7c-24.4 1.7-43.8 9-58.1 21.8-14.3 12.8-24.7 25.4-31.3 37.8m99.1-68.9c29.7-6.7 52-8.4 67-5 15 3.4 26.9 8.7 35.8 15.9m-110.8-5.9c20.3 9.9 38.2 20.5 53.9 31.9 15.7 11.4 27.4 22.1 35.1 32"></path></g><defs><filter width=532 height=633 x=50.5 y=399 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=532 height=633 x=50.5 y=399 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><linearGradient x1=-641.104 x2=-641.278 y1=856.577 y2=856.183 gradientTransform="matrix(532 0 0 -633 341484.5 542657)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#fff400></stop><stop offset=1 stop-color=#3c8700></stop></linearGradient><ellipse cx=316.5 cy=715.5 fill-rule=evenodd clip-rule=evenodd rx=266 ry=316.5></ellipse><defs><filter width=288 height=283 x=391 y=-24 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=288 height=283 x=391 y=-24 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><g><g transform="translate(397 -24)"><linearGradient x1=-1036.672 x2=-1036.672 y1=880.018 y2=879.018 gradientTransform="matrix(227 0 0 -227 235493 199764)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffdf00></stop><stop offset=1 stop-color=#ff9d00></stop></linearGradient><circle cx=168.5 cy=113.5 r=113.5 fill-rule=evenodd clip-rule=evenodd></circle><linearGradient x1=-1017.329 x2=-1018.602 y1=658.003 y2=657.998 gradientTransform="matrix(30 0 0 -1 30558 771)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M30 113H0"></path><linearGradient x1=-1014.501 x2=-1015.774 y1=839.985 y2=839.935 gradientTransform="matrix(26.5 0 0 -5.5 26925 4696.5)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M33.5 79.5L7 74"></path><linearGradient x1=-1016.59 x2=-1017.862 y1=852.671 y2=852.595 gradientTransform="matrix(29 0 0 -8 29523 6971)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M34 146l-29 8"></path><linearGradient x1=-1011.984 x2=-1013.257 y1=863.523 y2=863.229 gradientTransform="matrix(24 0 0 -13 24339 11407)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M45 177l-24 13"></path><linearGradient x1=-1006.673 x2=-1007.946 y1=869.279 y2=868.376 gradientTransform="matrix(20 0 0 -19 20205 16720)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M67 204l-20 19"></path><linearGradient x1=-992.85 x2=-993.317 y1=871.258 y2=870.258 gradientTransform="matrix(13.8339 0 0 -22.8467 13825.796 20131.938)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M94.4 227l-13.8 22.8"></path><linearGradient x1=-953.835 x2=-953.965 y1=871.9 y2=870.9 gradientTransform="matrix(7.5 0 0 -24.5 7278 21605)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M127.5 243.5L120 268"></path><linearGradient x1=244.504 x2=244.496 y1=871.898 y2=870.898 gradientTransform="matrix(.5 0 0 -24.5 45.5 21614)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M167.5 252.5l.5 24.5">');function xt(){const e=It();return(()=>{var t=Fr(),n=t.firstChild,r=n.firstChild,p=r.nextSibling,l=p.nextSibling,a=l.firstChild,f=l.nextSibling,g=f.firstChild,o=f.nextSibling,i=o.nextSibling,v=i.firstChild,h=i.nextSibling,C=h.firstChild,m=h.nextSibling,D=m.nextSibling,L=D.firstChild,Q=D.nextSibling,H=Q.firstChild,ie=Q.nextSibling,$=ie.nextSibling,y=$.firstChild,S=$.nextSibling,ee=S.firstChild,te=S.nextSibling,X=te.nextSibling,fe=X.firstChild,ue=X.nextSibling,me=ue.firstChild,G=ue.nextSibling,M=G.nextSibling,J=M.firstChild,N=M.nextSibling,ge=N.firstChild,pe=N.nextSibling,E=pe.nextSibling,R=E.firstChild,Y=E.nextSibling,Z=Y.firstChild,re=Y.nextSibling,ke=re.firstChild,P=ke.nextSibling,le=P.nextSibling,se=re.nextSibling,he=se.firstChild,ae=se.nextSibling,Se=ae.firstChild,_e=ae.nextSibling,c=_e.firstChild,x=c.nextSibling,B=x.nextSibling,U=B.nextSibling,z=U.nextSibling,_=z.nextSibling,b=_.nextSibling,T=b.nextSibling,q=T.nextSibling,A=q.nextSibling,de=A.nextSibling,oe=de.nextSibling,ce=oe.nextSibling,Ce=ce.nextSibling,xe=_e.nextSibling,Fe=xe.firstChild,ve=xe.nextSibling,be=ve.firstChild,ye=ve.nextSibling,k=ye.nextSibling,V=k.nextSibling,je=V.firstChild,ze=V.nextSibling,Ne=ze.firstChild,Oe=ze.nextSibling,Ve=Oe.firstChild,De=Ve.firstChild,Te=De.nextSibling,Ie=Te.nextSibling,Ge=Ie.nextSibling,Ae=Ge.nextSibling,Pe=Ae.nextSibling,it=Pe.nextSibling,nt=it.nextSibling,ot=nt.nextSibling,lt=ot.nextSibling,st=lt.nextSibling,at=st.nextSibling,dt=at.nextSibling,ct=dt.nextSibling,ft=ct.nextSibling,ut=ft.nextSibling,gt=ut.nextSibling,St=gt.nextSibling;return s(r,"id",`a-${e}`),s(p,"fill",`url(#a-${e})`),s(a,"id",`b-${e}`),s(f,"id",`c-${e}`),s(g,"filter",`url(#b-${e})`),s(o,"mask",`url(#c-${e})`),s(v,"id",`d-${e}`),s(h,"id",`e-${e}`),s(C,"filter",`url(#d-${e})`),s(m,"mask",`url(#e-${e})`),s(L,"id",`f-${e}`),s(Q,"id",`g-${e}`),s(H,"filter",`url(#f-${e})`),s(ie,"mask",`url(#g-${e})`),s(y,"id",`h-${e}`),s(S,"id",`i-${e}`),s(ee,"filter",`url(#h-${e})`),s(te,"mask",`url(#i-${e})`),s(fe,"id",`j-${e}`),s(ue,"id",`k-${e}`),s(me,"filter",`url(#j-${e})`),s(G,"mask",`url(#k-${e})`),s(J,"id",`l-${e}`),s(N,"id",`m-${e}`),s(ge,"filter",`url(#l-${e})`),s(pe,"mask",`url(#m-${e})`),s(R,"id",`n-${e}`),s(Y,"id",`o-${e}`),s(Z,"filter",`url(#n-${e})`),s(re,"mask",`url(#o-${e})`),s(P,"id",`p-${e}`),s(le,"fill",`url(#p-${e})`),s(he,"id",`q-${e}`),s(ae,"id",`r-${e}`),s(Se,"filter",`url(#q-${e})`),s(_e,"mask",`url(#r-${e})`),s(c,"id",`s-${e}`),s(x,"fill",`url(#s-${e})`),s(B,"id",`t-${e}`),s(U,"fill",`url(#t-${e})`),s(z,"id",`u-${e}`),s(_,"fill",`url(#u-${e})`),s(b,"id",`v-${e}`),s(T,"fill",`url(#v-${e})`),s(q,"id",`w-${e}`),s(A,"fill",`url(#w-${e})`),s(de,"id",`x-${e}`),s(oe,"fill",`url(#x-${e})`),s(ce,"id",`y-${e}`),s(Ce,"fill",`url(#y-${e})`),s(Fe,"id",`z-${e}`),s(ve,"id",`A-${e}`),s(be,"filter",`url(#z-${e})`),s(ye,"id",`B-${e}`),s(k,"fill",`url(#B-${e})`),s(k,"mask",`url(#A-${e})`),s(je,"id",`C-${e}`),s(ze,"id",`D-${e}`),s(Ne,"filter",`url(#C-${e})`),s(Oe,"mask",`url(#D-${e})`),s(De,"id",`E-${e}`),s(Te,"fill",`url(#E-${e})`),s(Ie,"id",`F-${e}`),s(Ge,"stroke",`url(#F-${e})`),s(Ae,"id",`G-${e}`),s(Pe,"stroke",`url(#G-${e})`),s(it,"id",`H-${e}`),s(nt,"stroke",`url(#H-${e})`),s(ot,"id",`I-${e}`),s(lt,"stroke",`url(#I-${e})`),s(st,"id",`J-${e}`),s(at,"stroke",`url(#J-${e})`),s(dt,"id",`K-${e}`),s(ct,"stroke",`url(#K-${e})`),s(ft,"id",`L-${e}`),s(ut,"stroke",`url(#L-${e})`),s(gt,"id",`M-${e}`),s(St,"stroke",`url(#M-${e})`),t})()}var zr=O("<button type=button><div><div></div><div></div></div><div>-</div><div>TanStack Router");function Ur({initialIsOpen:e,panelProps:t={},closeButtonProps:n={},toggleButtonProps:r={},position:p="bottom-left",containerElement:l="footer",router:a,routerState:f,shadowDOMTarget:g}){const[o,i]=ne();let v;const[h,C]=We("tanstackRouterDevtoolsOpen",e),[m,D]=We("tanstackRouterDevtoolsHeight",null),[L,Q]=ne(!1),[H,ie]=ne(!1),$=Yt(),y=Ee(),S=(E,R)=>{if(R.button!==0)return;ie(!0);const Y={originalHeight:E?.getBoundingClientRect().height??0,pageY:R.pageY},Z=ke=>{const P=Y.pageY-ke.pageY,le=Y.originalHeight+P;D(le),le<70?C(!1):C(!0)},re=()=>{ie(!1),document.removeEventListener("mousemove",Z),document.removeEventListener("mouseUp",re)};document.addEventListener("mousemove",Z),document.addEventListener("mouseup",re)};h(),Ue(()=>{Q(h()??!1)}),Ue(()=>{if(L()){const E=o()?.parentElement?.style.paddingBottom,R=()=>{const Y=v.getBoundingClientRect().height;o()?.parentElement&&i(Z=>(Z?.parentElement&&(Z.parentElement.style.paddingBottom=`${Y}px`),Z))};if(R(),typeof window<"u")return window.addEventListener("resize",R),()=>{window.removeEventListener("resize",R),o()?.parentElement&&typeof E=="string"&&i(Y=>(Y.parentElement.style.paddingBottom=E,Y))}}else o()?.parentElement&&i(E=>(E?.parentElement&&E.parentElement.removeAttribute("style"),E))}),Ue(()=>{if(o()){const E=o(),R=getComputedStyle(E).fontSize;E?.style.setProperty("--tsrd-font-size",R)}});const{style:ee={},...te}=t,{style:X={},onClick:fe,...ue}=n,{onClick:me,class:G,...M}=r;if(!$())return null;const J=K(()=>m()??500),N=K(()=>j(y().devtoolsPanelContainer,y().devtoolsPanelContainerVisibility(!!h()),y().devtoolsPanelContainerResizing(H),y().devtoolsPanelContainerAnimation(L(),J()+16))),ge=K(()=>({height:`${J()}px`,...ee||{}})),pe=K(()=>j(y().mainCloseBtn,y().mainCloseBtnPosition(p),y().mainCloseBtnAnimation(!!h()),G));return F(Tt,{component:l,ref:i,class:"TanStackRouterDevtools",get children(){return[F(Dt.Provider,{value:{onCloseClick:fe??(()=>{})},get children(){return F(Sr,He({ref(E){var R=v;typeof R=="function"?R(E):v=E}},te,{router:a,routerState:f,className:N,style:ge,get isOpen(){return L()},setIsOpen:C,handleDragStart:E=>S(v,E),shadowDOMTarget:g}))}}),(()=>{var E=zr(),R=E.firstChild,Y=R.firstChild,Z=Y.nextSibling,re=R.nextSibling,ke=re.nextSibling;return tt(E,He(M,{"aria-label":"Open TanStack Router Devtools",onClick:P=>{C(!0),me&&me(P)},get class(){return pe()}}),!1,!0),u(Y,F(xt,{})),u(Z,F(xt,{})),w(P=>{var le=y().mainCloseBtnIconContainer,se=y().mainCloseBtnIconOuter,he=y().mainCloseBtnIconInner,ae=y().mainCloseBtnDivider,Se=y().routerLogoCloseButton;return le!==P.e&&d(R,P.e=le),se!==P.t&&d(Y,P.t=se),he!==P.a&&d(Z,P.a=he),ae!==P.o&&d(re,P.o=ae),Se!==P.i&&d(ke,P.i=Se),P},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0}),E})()]}})}export{Ur as FloatingTanStackRouterDevtools,Ur as default};
