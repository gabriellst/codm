import{b8 as ne,b9 as Ce,ba as S,bb as St,bc as Ot,bd as rt,be as Bt,bf as q,bg as Tt,bh as nt,bi as He,bj as h,bk as Dt,bl as d,bm as w,bn as K,bo as Qe,bp as Le,bq as Z,br as s,bs as It,bt as Gt,bu as wt,bv as U,bw as vt,bx as At,by as Rt,bz as ot,bA as Pt,bB as Lt,bC as jt}from"./index-DAJmjZEC.js";let Ht={data:""},Nt=e=>{if(typeof window=="object"){let t=(e?e.querySelector("#_goober"):window._goober)||Object.assign(document.createElement("style"),{innerHTML:" ",id:"_goober"});return t.nonce=window.__nonce__,t.parentNode||(e||document.head).appendChild(t),t.firstChild}return e||Ht},Vt=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,Jt=/\/\*[^]*?\*\/|  +/g,$t=/\n+/g,Fe=(e,t)=>{let o="",r="",g="";for(let l in e){let c=e[l];l[0]=="@"?l[1]=="i"?o=l+" "+c+";":r+=l[1]=="f"?Fe(c,l):l+"{"+Fe(c,l[1]=="k"?"":t)+"}":typeof c=="object"?r+=Fe(c,t?t.replace(/([^,])+/g,p=>l.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,f=>/&/.test(f)?f.replace(/&/g,p):p?p+" "+f:f)):l):c!=null&&(l=l[1]=="-"?l:l.replace(/[A-Z]/g,"-$&").toLowerCase(),g+=Fe.p?Fe.p(l,c):l+":"+c+";")}return o+(t&&g?t+"{"+g+"}":g)+r},ke={},_t=e=>{if(typeof e=="object"){let t="";for(let o in e)t+=o+_t(e[o]);return t}return e},Yt=(e,t,o,r,g)=>{let l=_t(e),c=ke[l]||(ke[l]=(f=>{let n=0,i=11;for(;n<f.length;)i=101*i+f.charCodeAt(n++)>>>0;return"go"+i})(l));if(!ke[c]){let f=l!==e?e:(n=>{let i,x,$=[{}];for(;i=Vt.exec(n.replace(Jt,""));)i[4]?$.shift():i[3]?(x=i[3].replace($t," ").trim(),$.unshift($[0][x]=$[0][x]||{})):$[0][i[1]]=i[2].replace($t," ").trim();return $[0]})(e);ke[c]=Fe(g?{["@keyframes "+c]:f}:f,o?"":"."+c)}let p=o&&ke.g;return o&&(ke.g=ke[c]),((f,n,i,x)=>{x?n.data=n.data.replace(x,f):n.data.indexOf(f)===-1&&(n.data=i?f+n.data:n.data+f)})(ke[c],t,r,p),c},qt=(e,t,o)=>e.reduce((r,g,l)=>{let c=t[l];if(c&&c.call){let p=c(o),f=p&&p.props&&p.props.className||/^go/.test(p)&&p;c=f?"."+f:p&&typeof p=="object"?p.props?"":Fe(p,""):p===!1?"":p}return r+g+(c??"")},"");function Ue(e){let t=this||{},o=e.call?e(t.p):e;return Yt(o.unshift?o.raw?qt(o,[].slice.call(arguments,1),t.p):o.reduce((r,g)=>Object.assign(r,g&&g.call?g(t.p):g),{}):o,Nt(t.target),t.g,t.o,t.k)}Ue.bind({g:1});Ue.bind({k:1});var A={colors:{inherit:"inherit",current:"currentColor",transparent:"transparent",black:"#000000",white:"#ffffff",neutral:{50:"#f9fafb",100:"#f2f4f7",200:"#eaecf0",300:"#d0d5dd",400:"#98a2b3",500:"#667085",600:"#475467",700:"#344054",800:"#1d2939",900:"#101828"},darkGray:{50:"#525c7a",100:"#49536e",200:"#414962",300:"#394056",400:"#313749",500:"#292e3d",600:"#212530",700:"#191c24",800:"#111318",900:"#0b0d10"},gray:{50:"#f9fafb",100:"#f2f4f7",200:"#eaecf0",300:"#d0d5dd",400:"#98a2b3",500:"#667085",600:"#475467",700:"#344054",800:"#1d2939",900:"#101828"},blue:{25:"#F5FAFF",50:"#EFF8FF",100:"#D1E9FF",200:"#B2DDFF",300:"#84CAFF",400:"#53B1FD",500:"#2E90FA",600:"#1570EF",700:"#175CD3",800:"#1849A9",900:"#194185"},green:{25:"#F6FEF9",50:"#ECFDF3",100:"#D1FADF",200:"#A6F4C5",300:"#6CE9A6",400:"#32D583",500:"#12B76A",600:"#039855",700:"#027A48",800:"#05603A",900:"#054F31"},red:{50:"#fef2f2",100:"#fee2e2",200:"#fecaca",300:"#fca5a5",400:"#f87171",500:"#ef4444",600:"#dc2626",700:"#b91c1c",800:"#991b1b",900:"#7f1d1d",950:"#450a0a"},yellow:{25:"#FFFCF5",50:"#FFFAEB",100:"#FEF0C7",200:"#FEDF89",300:"#FEC84B",400:"#FDB022",500:"#F79009",600:"#DC6803",700:"#B54708",800:"#93370D",900:"#7A2E0E"},purple:{25:"#FAFAFF",50:"#F4F3FF",100:"#EBE9FE",200:"#D9D6FE",300:"#BDB4FE",400:"#9B8AFB",500:"#7A5AF8",600:"#6938EF",700:"#5925DC",800:"#4A1FB8",900:"#3E1C96"},teal:{25:"#F6FEFC",50:"#F0FDF9",100:"#CCFBEF",200:"#99F6E0",300:"#5FE9D0",400:"#2ED3B7",500:"#15B79E",600:"#0E9384",700:"#107569",800:"#125D56",900:"#134E48"},pink:{25:"#fdf2f8",50:"#fce7f3",100:"#fbcfe8",200:"#f9a8d4",300:"#f472b6",400:"#ec4899",500:"#db2777",600:"#be185d",700:"#9d174d",800:"#831843",900:"#500724"},cyan:{25:"#ecfeff",50:"#cffafe",100:"#a5f3fc",200:"#67e8f9",300:"#22d3ee",400:"#06b6d4",500:"#0891b2",600:"#0e7490",700:"#155e75",800:"#164e63",900:"#083344"}},alpha:{90:"e5",70:"b3",20:"33"},font:{size:{"2xs":"calc(var(--tsrd-font-size) * 0.625)",xs:"calc(var(--tsrd-font-size) * 0.75)",sm:"calc(var(--tsrd-font-size) * 0.875)",md:"var(--tsrd-font-size)"},lineHeight:{xs:"calc(var(--tsrd-font-size) * 1)",sm:"calc(var(--tsrd-font-size) * 1.25)"},weight:{normal:"400",medium:"500",semibold:"600",bold:"700"},fontFamily:{sans:"ui-sans-serif, Inter, system-ui, sans-serif, sans-serif",mono:"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"}},border:{radius:{xs:"calc(var(--tsrd-font-size) * 0.125)",sm:"calc(var(--tsrd-font-size) * 0.25)",md:"calc(var(--tsrd-font-size) * 0.375)",full:"9999px"}},size:{0:"0px",.5:"calc(var(--tsrd-font-size) * 0.125)",1:"calc(var(--tsrd-font-size) * 0.25)",1.5:"calc(var(--tsrd-font-size) * 0.375)",2:"calc(var(--tsrd-font-size) * 0.5)",2.5:"calc(var(--tsrd-font-size) * 0.625)",3:"calc(var(--tsrd-font-size) * 0.75)",3.5:"calc(var(--tsrd-font-size) * 0.875)",4:"calc(var(--tsrd-font-size) * 1)",5:"calc(var(--tsrd-font-size) * 1.25)",8:"calc(var(--tsrd-font-size) * 2)"}},Kt=e=>{const{colors:t,font:o,size:r,alpha:g,border:l}=A,{fontFamily:c,lineHeight:p,size:f}=o,n=e?Ue.bind({target:e}):Ue;return{devtoolsPanelContainer:n`
      direction: ltr;
      position: fixed;
      bottom: 0;
      right: 0;
      z-index: 99999;
      width: 100%;
      max-height: 90%;
      border-top: 1px solid ${t.gray[700]};
      transform-origin: top;
    `,devtoolsPanelContainerVisibility:i=>n`
        visibility: ${i?"visible":"hidden"};
      `,devtoolsPanelContainerResizing:i=>i()?n`
          transition: none;
        `:n`
        transition: all 0.4s ease;
      `,devtoolsPanelContainerAnimation:(i,x)=>i?n`
          pointer-events: auto;
          transform: translateY(0);
        `:n`
        pointer-events: none;
        transform: translateY(${x}px);
      `,logo:n`
      cursor: pointer;
      display: flex;
      flex-direction: column;
      background-color: transparent;
      border: none;
      font-family: ${c.sans};
      gap: ${A.size[.5]};
      padding: 0px;
      &:hover {
        opacity: 0.7;
      }
      &:focus-visible {
        outline-offset: 4px;
        border-radius: ${l.radius.xs};
        outline: 2px solid ${t.blue[800]};
      }
    `,tanstackLogo:n`
      font-size: ${o.size.md};
      font-weight: ${o.weight.bold};
      line-height: ${o.lineHeight.xs};
      white-space: nowrap;
      color: ${t.gray[300]};
    `,routerLogo:n`
      font-weight: ${o.weight.semibold};
      font-size: ${o.size.xs};
      background: linear-gradient(to right, #84cc16, #10b981);
      background-clip: text;
      -webkit-background-clip: text;
      line-height: 1;
      -webkit-text-fill-color: transparent;
      white-space: nowrap;
    `,devtoolsPanel:n`
      display: flex;
      font-size: ${f.sm};
      font-family: ${c.sans};
      background-color: ${t.darkGray[700]};
      color: ${t.gray[300]};

      @media (max-width: 700px) {
        flex-direction: column;
      }
      @media (max-width: 600px) {
        font-size: ${f.xs};
      }
    `,dragHandle:n`
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 4px;
      cursor: row-resize;
      z-index: 100000;
      &:hover {
        background-color: ${t.purple[400]}${g[90]};
      }
    `,firstContainer:n`
      flex: 1 1 500px;
      min-height: 40%;
      max-height: 100%;
      overflow: auto;
      border-right: 1px solid ${t.gray[700]};
      display: flex;
      flex-direction: column;
    `,routerExplorerContainer:n`
      overflow-y: auto;
      flex: 1;
    `,routerExplorer:n`
      padding: ${A.size[2]};
    `,row:n`
      display: flex;
      align-items: center;
      padding: ${A.size[2]} ${A.size[2.5]};
      gap: ${A.size[2.5]};
      border-bottom: ${t.darkGray[500]} 1px solid;
      align-items: center;
    `,detailsHeader:n`
      font-family: ui-sans-serif, Inter, system-ui, sans-serif, sans-serif;
      position: sticky;
      top: 0;
      z-index: 2;
      background-color: ${t.darkGray[600]};
      padding: 0px ${A.size[2]};
      font-weight: ${o.weight.medium};
      font-size: ${o.size.xs};
      min-height: ${A.size[8]};
      line-height: ${o.lineHeight.xs};
      text-align: left;
      display: flex;
      align-items: center;
    `,maskedBadge:n`
      background: ${t.yellow[900]}${g[70]};
      color: ${t.yellow[300]};
      display: inline-block;
      padding: ${A.size[0]} ${A.size[2.5]};
      border-radius: ${l.radius.full};
      font-size: ${o.size.xs};
      font-weight: ${o.weight.normal};
      border: 1px solid ${t.yellow[300]};
    `,maskedLocation:n`
      color: ${t.yellow[300]};
    `,detailsContent:n`
      padding: ${A.size[1.5]} ${A.size[2]};
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: ${o.size.xs};
    `,routeMatchesToggle:n`
      display: flex;
      align-items: center;
      border: 1px solid ${t.gray[500]};
      border-radius: ${l.radius.sm};
      overflow: hidden;
    `,routeMatchesToggleBtn:(i,x)=>{const $=[n`
        appearance: none;
        border: none;
        font-size: 12px;
        padding: 4px 8px;
        background: transparent;
        cursor: pointer;
        font-family: ${c.sans};
        font-weight: ${o.weight.medium};
      `];if(i){const O=n`
          background: ${t.darkGray[400]};
          color: ${t.gray[300]};
        `;$.push(O)}else{const O=n`
          color: ${t.gray[500]};
          background: ${t.darkGray[800]}${g[20]};
        `;$.push(O)}return x&&$.push(n`
          border-right: 1px solid ${A.colors.gray[500]};
        `),$},detailsHeaderInfo:n`
      flex: 1;
      justify-content: flex-end;
      display: flex;
      align-items: center;
      font-weight: ${o.weight.normal};
      color: ${t.gray[400]};
    `,matchRow:i=>{const x=[n`
        display: flex;
        border-bottom: 1px solid ${t.darkGray[400]};
        cursor: pointer;
        align-items: center;
        padding: ${r[1]} ${r[2]};
        gap: ${r[2]};
        font-size: ${f.xs};
        color: ${t.gray[300]};
      `];if(i){const $=n`
          background: ${t.darkGray[500]};
        `;x.push($)}return x},matchIndicator:i=>{const x=[n`
        flex: 0 0 auto;
        width: ${r[3]};
        height: ${r[3]};
        background: ${t[i][900]};
        border: 1px solid ${t[i][500]};
        border-radius: ${l.radius.full};
        transition: all 0.25s ease-out;
        box-sizing: border-box;
      `];if(i==="gray"){const $=n`
          background: ${t.gray[700]};
          border-color: ${t.gray[400]};
        `;x.push($)}return x},matchID:n`
      flex: 1;
      line-height: ${p.xs};
    `,ageTicker:i=>{const x=[n`
        display: flex;
        gap: ${r[1]};
        font-size: ${f.xs};
        color: ${t.gray[400]};
        font-variant-numeric: tabular-nums;
        line-height: ${p.xs};
      `];if(i){const $=n`
          color: ${t.yellow[400]};
        `;x.push($)}return x},secondContainer:n`
      flex: 1 1 500px;
      min-height: 40%;
      max-height: 100%;
      overflow: auto;
      border-right: 1px solid ${t.gray[700]};
      display: flex;
      flex-direction: column;
    `,thirdContainer:n`
      flex: 1 1 500px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      height: 100%;
      border-right: 1px solid ${t.gray[700]};

      @media (max-width: 700px) {
        border-top: 2px solid ${t.gray[700]};
      }
    `,fourthContainer:n`
      flex: 1 1 500px;
      min-height: 40%;
      max-height: 100%;
      overflow: auto;
      display: flex;
      flex-direction: column;
    `,routesContainer:n`
      overflow-x: auto;
      overflow-y: visible;
    `,routesRowContainer:(i,x)=>{const $=[n`
        display: flex;
        border-bottom: 1px solid ${t.darkGray[400]};
        align-items: center;
        padding: ${r[1]} ${r[2]};
        gap: ${r[2]};
        font-size: ${f.xs};
        color: ${t.gray[300]};
        cursor: ${x?"pointer":"default"};
        line-height: ${p.xs};
      `];if(i){const O=n`
          background: ${t.darkGray[500]};
        `;$.push(O)}return $},routesRow:i=>{const x=[n`
        flex: 1 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: ${f.xs};
        line-height: ${p.xs};
      `];if(!i){const $=n`
          color: ${t.gray[400]};
        `;x.push($)}return x},routesRowInner:n`
      display: 'flex';
      align-items: 'center';
      flex-grow: 1;
      min-width: 0;
    `,routeParamInfo:n`
      color: ${t.gray[400]};
      font-size: ${f.xs};
      line-height: ${p.xs};
    `,nestedRouteRow:i=>n`
        margin-left: ${i?0:r[3.5]};
        border-left: ${i?"":`solid 1px ${t.gray[700]}`};
      `,code:n`
      font-size: ${f.xs};
      line-height: ${p.xs};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `,matchesContainer:n`
      flex: 1 1 auto;
      overflow-y: auto;
    `,cachedMatchesContainer:n`
      flex: 1 1 auto;
      overflow-y: auto;
      max-height: 50%;
    `,historyContainer:n`
      display: flex;
      flex: 1 1 auto;
      overflow-y: auto;
      max-height: 50%;
    `,historyOverflowContainer:n`
      padding: ${r[1]} ${r[2]};
      font-size: ${A.font.size.xs};
    `,maskedBadgeContainer:n`
      flex: 1;
      justify-content: flex-end;
      display: flex;
    `,matchDetails:n`
      display: flex;
      flex-direction: column;
      padding: ${A.size[2]};
      font-size: ${A.font.size.xs};
      color: ${A.colors.gray[300]};
      line-height: ${A.font.lineHeight.sm};
    `,matchStatus:(i,x)=>{const $=x&&i==="success"?x==="beforeLoad"?"purple":"blue":{pending:"yellow",success:"green",error:"red",notFound:"purple",redirected:"gray"}[i];return n`
        display: flex;
        justify-content: center;
        align-items: center;
        height: 40px;
        border-radius: ${A.border.radius.sm};
        font-weight: ${A.font.weight.normal};
        background-color: ${A.colors[$][900]}${A.alpha[90]};
        color: ${A.colors[$][300]};
        border: 1px solid ${A.colors[$][600]};
        margin-bottom: ${A.size[2]};
        transition: all 0.25s ease-out;
      `},matchDetailsInfo:n`
      display: flex;
      justify-content: flex-end;
      flex: 1;
    `,matchDetailsInfoLabel:n`
      display: flex;
    `,mainCloseBtn:n`
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
      font-size: ${o.size.xs};
      cursor: pointer;
      transition: all 0.25s ease-out;

      &:hover {
        background: ${t.darkGray[500]};
      }
    `,mainCloseBtnPosition:i=>n`
        ${i==="top-left"?`top: ${r[2]}; left: ${r[2]};`:""}
        ${i==="top-right"?`top: ${r[2]}; right: ${r[2]};`:""}
        ${i==="bottom-left"?`bottom: ${r[2]}; left: ${r[2]};`:""}
        ${i==="bottom-right"?`bottom: ${r[2]}; right: ${r[2]};`:""}
      `,mainCloseBtnAnimation:i=>i?n`
        opacity: 0;
        pointer-events: none;
        visibility: hidden;
      `:n`
          opacity: 1;
          pointer-events: auto;
          visibility: visible;
        `,routerLogoCloseButton:n`
      font-weight: ${o.weight.semibold};
      font-size: ${o.size.xs};
      background: linear-gradient(to right, #98f30c, #00f4a3);
      background-clip: text;
      -webkit-background-clip: text;
      line-height: 1;
      -webkit-text-fill-color: transparent;
      white-space: nowrap;
    `,mainCloseBtnDivider:n`
      width: 1px;
      background: ${A.colors.gray[600]};
      height: 100%;
      border-radius: 999999px;
      color: transparent;
    `,mainCloseBtnIconContainer:n`
      position: relative;
      width: ${r[5]};
      height: ${r[5]};
      background: pink;
      border-radius: 999999px;
      overflow: hidden;
    `,mainCloseBtnIconOuter:n`
      width: ${r[5]};
      height: ${r[5]};
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      filter: blur(3px) saturate(1.8) contrast(2);
    `,mainCloseBtnIconInner:n`
      width: ${r[4]};
      height: ${r[4]};
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    `,panelCloseBtn:n`
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
    `,panelCloseBtnIcon:n`
      color: ${t.gray[400]};
      width: ${r[2]};
      height: ${r[2]};
    `,navigateButton:n`
      background: none;
      border: none;
      padding: 0 0 0 4px;
      margin: 0;
      color: ${t.gray[400]};
      font-size: ${f.md};
      cursor: pointer;
      line-height: 1;
      vertical-align: middle;
      margin-right: 0.5ch;
      flex-shrink: 0;
      &:hover {
        color: ${t.blue[300]};
      }
    `}};function Ee(){const[e]=ne(Kt(St(wt)));return e}var Wt=e=>{try{const t=localStorage.getItem(e);return typeof t=="string"?JSON.parse(t):void 0}catch{return}};function We(e,t){const[o,r]=ne();return Ce(()=>{const l=Wt(e);r(typeof l>"u"||l===null?typeof t=="function"?t():t:l)}),[o,l=>{r(c=>{let p=l;typeof l=="function"&&(p=l(c));try{localStorage.setItem(e,JSON.stringify(p))}catch{}return p})}]}var Zt=typeof window>"u";function it(e){return e.isFetching&&e.status==="success"?e.isFetching==="beforeLoad"?"purple":"blue":{pending:"yellow",success:"green",error:"red",notFound:"purple",redirected:"gray"}[e.status]}function Qt(e,t){const o=e.find(r=>r.routeId===t.id);return o?it(o):"gray"}function Xt(){const[e,t]=ne(!1);return(Zt?Ce:S)(()=>{t(!0)}),e}var er=Symbol.for("tanstack.rsc.stream"),mt=Symbol.for("tanstack.rsc.renderable"),Ze=Symbol.for("tanstack.rsc.slotUsages");function tr(e){let t=e.length;for(;t>0&&e[t-1]===void 0;)t--;return t===0||t===e.length?e:e.slice(0,t)}var lt=e=>(typeof e=="object"||typeof e=="function")&&e!==null&&er in e,Ft=e=>{if(!lt(e))return null;const t=e;return mt in t&&t[mt]===!0?"renderableValue":"compositeSource"},zt=e=>{if(!lt(e))return[];const t=e,o=[];if(Ze in t){const r=t[Ze];if(Array.isArray(r))for(const g of r){const l=g?.slot;typeof l=="string"&&!o.includes(l)&&o.push(l)}}return o},rr=e=>{if(!lt(e))return[];const t=e;if(!(Ze in t))return[];const o=t[Ze];return Array.isArray(o)?o.filter(r=>r&&typeof r=="object"&&typeof r.slot=="string"&&(r.args===void 0||Array.isArray(r.args))):[]},ir=e=>{const t=rr(e),o={};for(const r of t){const g=tr(r.args??[]),l=o[r.slot]??(o[r.slot]={count:0,invocations:[]});l.count++,l.invocations.push(g)}return o},Xe=e=>{if(e==="React element")return"React element";const t=Ft(e);if(t==="compositeSource"){const g=zt(e);return g.length>0?`RSC composite source (${g.length} ${g.length===1?"slot":"slots"})`:"RSC composite source"}if(t==="renderableValue")return"RSC renderable value";const o=Object.getOwnPropertyNames(Object(e)),r=typeof e=="bigint"?`${e.toString()}n`:e;try{return JSON.stringify(r,o)}catch{return"unable to stringify"}};function nr(e,t=[o=>o]){return e.map((o,r)=>[o,r]).sort(([o,r],[g,l])=>{for(const c of t){const p=c(o),f=c(g);if(typeof p>"u"){if(typeof f>"u")continue;return 1}if(p!==f)return p>f?1:-1}return r-l}).map(([o])=>o)}var or=U('<span><svg xmlns=http://www.w3.org/2000/svg width=12 height=12 fill=none viewBox="0 0 24 24"><path stroke=currentColor stroke-linecap=round stroke-linejoin=round stroke-width=2 d="M9 18l6-6-6-6">'),Ve=U("<div>"),lr=U("<button><span>:</span><span>"),sr=U("<div><span>slots</span><div>"),xt=U("<span>:"),bt=U("<span>"),ar=U("<button><span> "),dr=U("<div><div><button> [<!> ... <!>]"),cr=U("<button><span></span> 🔄 "),et=({expanded:e,style:t={}})=>{const o=Mt();return(()=>{var r=or(),g=r.firstChild;return S(l=>{var c=o().expander,p=Z(o().expanderIcon(e));return c!==l.e&&d(r,l.e=c),p!==l.t&&s(g,"class",l.t=p),l},{e:void 0,t:void 0}),r})()};function fr(e,t){if(t<1)return[];let o=0;const r=[];for(;o<e.length;)r.push(e.slice(o,o+t)),o=o+t;return r}function ur(e){return Symbol.iterator in e}function gr(e){if(!e||typeof e!="object")return!1;const t=Object.getPrototypeOf(e);return t===Object.prototype||t===null}function ze({value:e,defaultExpanded:t,pageSize:o=100,filterSubEntries:r,...g}){const[l,c]=ne(!!t),p=()=>c(R=>!R),f=q(()=>typeof e()),n=q(()=>{let R=[];const X=a=>{const k=t===!0?{[a.label]:!0}:t?.[a.label];return{...a,value:()=>a.value,defaultExpanded:k}};if(Array.isArray(e())&&e().length===2&&e()[0]==="React element"&&gr(e()[1])){const a=e();R=[X({label:"0",value:a[0]}),...Object.entries(a[1]).map(([k,D])=>X({label:k,value:D}))]}else Array.isArray(e())?R=e().map((a,k)=>X({label:k.toString(),value:a})):e()!==null&&typeof e()=="object"&&ur(e())&&typeof e()[Symbol.iterator]=="function"?R=Array.from(e(),(a,k)=>X({label:k.toString(),value:a})):typeof e()=="object"&&e()!==null&&(R=Object.entries(e()).map(([a,k])=>X({label:a,value:k})));return r?r(R):R}),i=q(()=>fr(n(),o)),[x,$]=ne([]),[O,H]=ne(void 0),m=Mt(),j=()=>{H(e()())},te=R=>w(ze,He({value:e,filterSubEntries:r},g,R)),ie=q(()=>Ft(e())),de=q(()=>zt(e())),Se=q(()=>ir(e())),W=q(()=>ie()==="compositeSource"&&de().length>0);return(()=>{var R=Ve();return h(R,(()=>{var X=K(()=>ie()!==null);return()=>X()?K(()=>!!W())()?[(()=>{var a=lr(),k=a.firstChild,D=k.firstChild,I=k.nextSibling;return a.$$click=()=>p(),h(a,w(et,{get expanded(){return l()??!1}}),k),h(k,()=>g.label,D),h(I,()=>Xe(e())),S(G=>{var P=m().expandButton,oe=m().compositeComponent;return P!==G.e&&d(a,G.e=P),oe!==G.t&&d(I,G.t=oe),G},{e:void 0,t:void 0}),a})(),K(()=>K(()=>!!(l()??!1))()?(()=>{var a=sr(),k=a.firstChild,D=k.nextSibling;return h(D,()=>de().map(I=>{const G=Se()[I];return G?w(ze,{label:`${I}:`,value:()=>G.invocations.map(P=>P.length===1?P[0]:P)}):null})),S(I=>{var G=m().rscMetaRow,P=m().rscMetaLabel,oe=m().subEntries;return G!==I.e&&d(a,I.e=G),P!==I.t&&d(k,I.t=P),oe!==I.a&&d(D,I.a=oe),I},{e:void 0,t:void 0,a:void 0}),a})():null)]:[(()=>{var a=xt(),k=a.firstChild;return h(a,()=>g.label,k),a})()," ",(()=>{var a=bt();return h(a,()=>Xe(e())),S(()=>d(a,ie()==="compositeSource"?m().compositeComponent:m().renderableComponent)),a})()]:K(()=>!!i().length)()?[(()=>{var a=ar(),k=a.firstChild,D=k.firstChild;return a.$$click=()=>p(),h(a,w(et,{get expanded(){return l()??!1}}),k),h(a,()=>g.label,k),h(k,()=>String(f).toLowerCase()==="iterable"?"(Iterable) ":"",D),h(k,()=>n().length,D),h(k,()=>n().length>1?"items":"item",null),S(I=>{var G=m().expandButton,P=m().info;return G!==I.e&&d(a,I.e=G),P!==I.t&&d(k,I.t=P),I},{e:void 0,t:void 0}),a})(),K(()=>K(()=>!!(l()??!1))()?K(()=>i().length===1)()?(()=>{var a=Ve();return h(a,()=>n().map((k,D)=>te(k))),S(()=>d(a,m().subEntries)),a})():(()=>{var a=Ve();return h(a,()=>i().map((k,D)=>(()=>{var I=dr(),G=I.firstChild,P=G.firstChild,oe=P.firstChild,z=oe.nextSibling,Y=z.nextSibling.nextSibling;return Y.nextSibling,P.$$click=()=>$(N=>N.includes(D)?N.filter(L=>L!==D):[...N,D]),h(P,w(et,{get expanded(){return x().includes(D)}}),oe),h(P,D*o,z),h(P,D*o+o-1,Y),h(G,(()=>{var N=K(()=>!!x().includes(D));return()=>N()?(()=>{var L=Ve();return h(L,()=>k.map(y=>te(y))),S(()=>d(L,m().subEntries)),L})():null})(),null),S(N=>{var L=m().entry,y=Z(m().labelButton,"labelButton");return L!==N.e&&d(G,N.e=L),y!==N.t&&d(P,N.t=y),N},{e:void 0,t:void 0}),I})())),S(()=>d(a,m().subEntries)),a})():null)]:K(()=>f()==="function")()?w(ze,{get label(){return(()=>{var a=cr(),k=a.firstChild;return a.$$click=j,h(k,()=>g.label),S(()=>d(a,m().refreshValueBtn)),a})()},value:O,defaultExpanded:{}}):[(()=>{var a=xt(),k=a.firstChild;return h(a,()=>g.label,k),a})()," ",(()=>{var a=bt();return h(a,()=>Xe(e())),S(()=>d(a,m().value)),a})()]})()),S(()=>d(R,m().entry)),R})()}var pr=e=>{const{colors:t,font:o,size:r,border:g}=A,{fontFamily:l,lineHeight:c,size:p}=o,f=e?Ue.bind({target:e}):Ue;return{entry:f`
      font-family: ${l.mono};
      font-size: ${p.xs};
      line-height: ${c.sm};
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
    `,expanderIcon:n=>n?f`
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
    `,compositeComponent:f`
      display: inline-flex;
      align-items: center;
      padding: 1px ${r[1]};
      border-radius: ${g.radius.full};
      border: 1px solid ${t.darkGray[500]};
      background: ${t.darkGray[700]};
      color: ${t.cyan[300]};
      font-style: normal;
      font-weight: ${o.weight.medium};
    `,renderableComponent:f`
      display: inline-flex;
      align-items: center;
      padding: 1px ${r[1]};
      border-radius: ${g.radius.full};
      border: 1px solid ${t.darkGray[500]};
      background: ${t.darkGray[700]};
      color: ${t.teal[300]};
      font-style: normal;
      font-weight: ${o.weight.medium};
    `,rscMetaRow:f`
      display: flex;
      gap: ${r[1]};
      align-items: flex-start;
      margin-left: calc(${r[3]} + ${r[1]});
      margin-top: ${r[.5]};
      flex-wrap: wrap;
    `,rscMetaLabel:f`
      color: ${t.gray[500]};
      font-size: ${p["2xs"]};
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding-top: 2px;
    `,rscChipRow:f`
      display: flex;
      gap: ${r[1]};
      flex-wrap: wrap;
    `,rscChip:f`
      display: inline-flex;
      align-items: center;
      gap: ${r[.5]};
      padding: 1px ${r[1]};
      border-radius: ${g.radius.full};
      border: 1px solid ${t.darkGray[500]};
      background: ${t.darkGray[800]};
      color: ${t.gray[200]};
      font-size: ${p["2xs"]};
      line-height: ${c.xs};
    `,rscChipName:f`
      color: ${t.gray[100]};
    `,rscChipMeta:f`
      color: ${t.gray[400]};
      font-size: ${p["2xs"]};
    `,subEntries:f`
      margin-left: ${r[2]};
      padding-left: ${r[2]};
      border-left: 2px solid ${t.darkGray[400]};
    `,info:f`
      color: ${t.gray[500]};
      font-size: ${p["2xs"]};
      padding-left: ${r[1]};
    `,refreshValueBtn:f`
      appearance: none;
      border: 0;
      cursor: pointer;
      background: transparent;
      color: inherit;
      padding: 0;
      font-family: ${l.mono};
      font-size: ${p.xs};
    `}};function Mt(){const[e]=ne(pr(St(wt)));return e}ot(["click"]);var hr=U("<div><div></div><div>/</div><div></div><div>/</div><div>");function tt(e){const t=["s","min","h","d"],o=[e/1e3,e/6e4,e/36e5,e/864e5];let r=0;for(let g=1;g<o.length&&!(o[g]<1);g++)r=g;return new Intl.NumberFormat(navigator.language,{compactDisplay:"short",notation:"compact",maximumFractionDigits:0}).format(o[r])+t[r]}function Je({match:e,router:t}){const o=Ee();if(!e)return null;const r=t().looseRoutesById[e.routeId];if(!r.options.loader)return null;const g=Date.now()-e.updatedAt,l=r.options.staleTime??t().options.defaultStaleTime??0,c=r.options.gcTime??t().options.defaultGcTime??1800*1e3;return(()=>{var p=hr(),f=p.firstChild,n=f.nextSibling.nextSibling,i=n.nextSibling.nextSibling;return h(f,()=>tt(g)),h(n,()=>tt(l)),h(i,()=>tt(c)),S(()=>d(p,Z(o().ageTicker(g>l)))),p})()}var vr=U("<button type=button>➔");function Ye({to:e,params:t,search:o,router:r}){const g=Ee();return(()=>{var l=vr();return l.$$click=c=>{c.stopPropagation(),r().navigate({to:e,params:t,search:o})},s(l,"title",`Navigate to ${e}`),S(()=>d(l,g().navigateButton)),l})()}ot(["click"]);var $r=U("<button><div>TANSTACK</div><div>TanStack Router v1"),mr=U("<div style=display:flex;align-items:center;width:100%><div style=flex-grow:1;min-width:0>"),xr=U("<code> "),je=U("<code>"),br=U("<div><div role=button><div>"),qe=U("<div>"),yr=U("<div><ul>"),kr=U('<div><button><svg xmlns=http://www.w3.org/2000/svg width=10 height=6 fill=none viewBox="0 0 10 6"><path stroke=currentColor stroke-linecap=round stroke-linejoin=round stroke-width=1.667 d="M1 1l4 4 4-4"></path></svg></button><div><div></div><div><div></div></div></div><div><div><div><span>Pathname</span></div><div><code></code></div><div><div><button type=button>Routes</button><button type=button>Matches</button><button type=button>History</button></div><div><div>age / staleTime / gcTime</div></div></div><div>'),Cr=U("<div><span>masked"),yt=U("<div role=button><div>"),Sr=U("<li><div>"),wr=U("<li>This panel displays the most recent 15 navigations."),_r=U("<div><div><div>Cached Matches</div><div>age / staleTime / gcTime</div></div><div>"),Fr=U("<div><div>Match Details</div><div><div><div><div></div></div><div><div>ID:</div><div><code></code></div></div><div><div>State:</div><div></div></div><div><div>Last Updated:</div><div></div></div></div></div><div>Explorer</div><div>"),zr=U("<div>Loader Data"),Mr=U("<div><div><span>Search Params</span></div><div>"),Ur=U("<span style=margin-left:0.5rem>"),Er=U('<button type=button aria-label="Copy value to clipboard"style=cursor:pointer>'),kt=15;function Or(e){const{className:t,...o}=e,r=Ee();return(()=>{var g=$r(),l=g.firstChild,c=l.nextSibling;return nt(g,He(o,{get class(){return Z(r().logo,t?t():"")}}),!1,!0),S(p=>{var f=r().tanstackLogo,n=r().routerLogo;return f!==p.e&&d(l,p.e=f),n!==p.t&&d(c,p.t=n),p},{e:void 0,t:void 0}),g})()}function Ke(e){return(()=>{var t=mr(),o=t.firstChild;return h(t,()=>e.left,o),h(o,()=>e.children),h(t,()=>e.right,null),S(()=>d(t,e.class)),t})()}function Ut({routerState:e,pendingMatches:t,router:o,route:r,isRoot:g,activeId:l,setActiveId:c}){const p=Ee(),f=q(()=>t().length?t():e().matches),n=q(()=>e().matches.find($=>$.routeId===r.id)),i=q(()=>{try{if(n()?.params){const $=n()?.params,O=r.path||vt(r.id);if(O.startsWith("$")){const H=O.slice(1);if($[H])return`(${$[H]})`}}return""}catch{return""}}),x=q(()=>{if(g||!r.path)return;const $=Object.assign({},...f().map(H=>H.params)),O=At({path:r.fullPath,params:$,decoder:o().pathParamsDecoder});return O.isMissingParams?void 0:O.interpolatedPath});return(()=>{var $=br(),O=$.firstChild,H=O.firstChild;return O.$$click=()=>{n()&&c(l()===r.id?"":r.id)},h(O,w(Ke,{get class(){return Z(p().routesRow(!!n()))},get left(){return w(Rt,{get when(){return x()},children:m=>w(Ye,{get to(){return m()},router:o})})},get right(){return w(Je,{get match(){return n()},router:o})},get children(){return[(()=>{var m=xr(),j=m.firstChild;return h(m,()=>g?Le:r.path||vt(r.id),j),S(()=>d(m,p().code)),m})(),(()=>{var m=je();return h(m,i),S(()=>d(m,p().routeParamInfo)),m})()]}}),null),h($,(()=>{var m=K(()=>!!r.children?.length);return()=>m()?(()=>{var j=qe();return h(j,()=>[...r.children].sort((te,ie)=>te.rank-ie.rank).map(te=>w(Ut,{routerState:e,pendingMatches:t,router:o,route:te,activeId:l,setActiveId:c}))),S(()=>d(j,p().nestedRouteRow(!!g))),j})():null})(),null),S(m=>{var j=`Open match details for ${r.id}`,te=Z(p().routesRowContainer(r.id===l(),!!n())),ie=Z(p().matchIndicator(Qt(f(),r)));return j!==m.e&&s(O,"aria-label",m.e=j),te!==m.t&&d(O,m.t=te),ie!==m.a&&d(H,m.a=ie),m},{e:void 0,t:void 0,a:void 0}),$})()}var Br=function({...t}){const{isOpen:o=!0,setIsOpen:r,handleDragStart:g,router:l,routerState:c,shadowDOMTarget:p,...f}=t,{onCloseClick:n}=Ot(),i=Ee(),{className:x,style:$,...O}=f,[H,m]=We("tanstackRouterDevtoolsActiveTab","routes"),[j,te]=We("tanstackRouterDevtoolsActiveRouteId",""),[ie,de]=ne([]),[Se,W]=ne(!1);let R,X;if("subscribe"in l().stores.pendingMatches){const[z,Y]=ne([]);R=z;const[N,L]=ne([]);X=N,Ce(()=>{const y=l().stores.pendingMatches;Y(y.get());const T=y.subscribe(()=>{Y(y.get())});rt(()=>T.unsubscribe())}),Ce(()=>{const y=l().stores.cachedMatches;L(y.get());const T=y.subscribe(()=>{L(y.get())});rt(()=>T.unsubscribe())})}else R=()=>l().stores.pendingMatches.get(),X=()=>l().stores.cachedMatches.get();Ce(()=>{const z=c().matches,Y=z[z.length-1];if(!Y)return;const N=Bt(()=>ie()),L=N[0],y=L&&L.pathname===Y.pathname&&JSON.stringify(L.search??{})===JSON.stringify(Y.search??{});(!L||!y)&&(N.length>=kt&&W(!0),de(T=>{const Q=[Y,...T];return Q.splice(kt),Q}))});const a=q(()=>[...R(),...c().matches,...X()].find(z=>z.routeId===j()||z.id===j())),k=q(()=>Tt(c().location.search)),D=q(()=>({...l(),state:c()})),I=q(()=>Object.fromEntries(nr(Object.keys(D()),["state","routesById","routesByPath","options","manifest"].map(z=>Y=>Y!==z)).map(z=>[z,D()[z]]).filter(z=>typeof z[1]!="function"&&!["stores","basepath","injectedHtml","subscribers","latestLoadPromise","navigateTimeout","resetNextScroll","tempLocationKey","latestLocation","routeTree","history"].includes(z[0])))),G=q(()=>a()?.loaderData),P=q(()=>a()),oe=q(()=>c().location.search);return(()=>{var z=kr(),Y=z.firstChild,N=Y.firstChild,L=Y.nextSibling,y=L.firstChild,T=y.nextSibling,Q=T.firstChild,re=L.nextSibling,se=re.firstChild,ce=se.firstChild;ce.firstChild;var V=ce.nextSibling,pe=V.firstChild,fe=V.nextSibling,be=fe.firstChild,ae=be.firstChild,ue=ae.nextSibling,Me=ue.nextSibling,Ne=be.nextSibling,Oe=fe.nextSibling;return nt(z,He({get class(){return Z(i().devtoolsPanel,"TanStackRouterDevtoolsPanel",x?x():"")},get style(){return $?$():""}},O),!1,!0),h(z,g?(()=>{var u=qe();return Dt(u,"mousedown",g,!0),S(()=>d(u,i().dragHandle)),u})():null,Y),Y.$$click=u=>{r&&r(!1),n(u)},h(y,w(Or,{"aria-hidden":!0,onClick:u=>{r&&r(!1),n(u)}})),h(Q,w(ze,{label:"Router",value:I,defaultExpanded:{state:{},context:{},options:{}},filterSubEntries:u=>u.filter(b=>typeof b.value()!="function")})),h(ce,(()=>{var u=K(()=>!!c().location.maskedLocation);return()=>u()?(()=>{var b=Cr(),E=b.firstChild;return S(M=>{var _=i().maskedBadgeContainer,v=i().maskedBadge;return _!==M.e&&d(b,M.e=_),v!==M.t&&d(E,M.t=v),M},{e:void 0,t:void 0}),b})():null})(),null),h(pe,()=>c().location.pathname),h(V,(()=>{var u=K(()=>!!c().location.maskedLocation);return()=>u()?(()=>{var b=je();return h(b,()=>c().location.maskedLocation?.pathname),S(()=>d(b,i().maskedLocation)),b})():null})(),null),ae.$$click=()=>{m("routes")},ue.$$click=()=>{m("matches")},Me.$$click=()=>{m("history")},h(Oe,w(Gt,{get children(){return[w(Qe,{get when(){return H()==="routes"},get children(){return w(Ut,{routerState:c,pendingMatches:R,router:l,get route(){return l().routeTree},isRoot:!0,activeId:j,setActiveId:te})}}),w(Qe,{get when(){return H()==="matches"},get children(){var u=qe();return h(u,()=>(R().length?R():c().matches).map((b,E)=>(()=>{var M=yt(),_=M.firstChild;return M.$$click=()=>te(j()===b.id?"":b.id),h(M,w(Ke,{get left(){return w(Ye,{get to(){return b.pathname},get params(){return b.params},get search(){return b.search},router:l})},get right(){return w(Je,{match:b,router:l})},get children(){var v=je();return h(v,()=>`${b.routeId===Le?Le:b.pathname}`),S(()=>d(v,i().matchID)),v}}),null),S(v=>{var F=`Open match details for ${b.id}`,J=Z(i().matchRow(b===a())),B=Z(i().matchIndicator(it(b)));return F!==v.e&&s(M,"aria-label",v.e=F),J!==v.t&&d(M,v.t=J),B!==v.a&&d(_,v.a=B),v},{e:void 0,t:void 0,a:void 0}),M})())),u}}),w(Qe,{get when(){return H()==="history"},get children(){var u=yr(),b=u.firstChild;return h(b,w(It,{get each(){return ie()},children:(E,M)=>(()=>{var _=Sr(),v=_.firstChild;return h(_,w(Ke,{get left(){return w(Ye,{get to(){return E.pathname},get params(){return E.params},get search(){return E.search},router:l})},get right(){return w(Je,{match:E,router:l})},get children(){var F=je();return h(F,()=>`${E.routeId===Le?Le:E.pathname}`),S(()=>d(F,i().matchID)),F}}),null),S(F=>{var J=Z(i().matchRow(E===a())),B=Z(i().matchIndicator(M()===0?"green":"gray"));return J!==F.e&&d(_,F.e=J),B!==F.t&&d(v,F.t=B),F},{e:void 0,t:void 0}),_})()}),null),h(b,(()=>{var E=K(()=>!!Se());return()=>E()?(()=>{var M=wr();return S(()=>d(M,i().historyOverflowContainer)),M})():null})(),null),u}})]}})),h(re,(()=>{var u=K(()=>!!X().length);return()=>u()?(()=>{var b=_r(),E=b.firstChild,M=E.firstChild.nextSibling,_=E.nextSibling;return h(_,()=>X().map(v=>(()=>{var F=yt(),J=F.firstChild;return F.$$click=()=>te(j()===v.id?"":v.id),h(F,w(Ke,{get left(){return w(Ye,{get to(){return v.pathname},get params(){return v.params},get search(){return v.search},router:l})},get right(){return w(Je,{match:v,router:l})},get children(){var B=je();return h(B,()=>`${v.id}`),S(()=>d(B,i().matchID)),B}}),null),S(B=>{var he=`Open match details for ${v.id}`,le=Z(i().matchRow(v===a())),ge=Z(i().matchIndicator(it(v)));return he!==B.e&&s(F,"aria-label",B.e=he),le!==B.t&&d(F,B.t=le),ge!==B.a&&d(J,B.a=ge),B},{e:void 0,t:void 0,a:void 0}),F})())),S(v=>{var F=i().cachedMatchesContainer,J=i().detailsHeader,B=i().detailsHeaderInfo;return F!==v.e&&d(b,v.e=F),J!==v.t&&d(E,v.t=J),B!==v.a&&d(M,v.a=B),v},{e:void 0,t:void 0,a:void 0}),b})():null})(),null),h(z,(()=>{var u=K(()=>!!(a()&&a()?.status));return()=>u()?(()=>{var b=Fr(),E=b.firstChild,M=E.nextSibling,_=M.firstChild,v=_.firstChild,F=v.firstChild,J=v.nextSibling,B=J.firstChild.nextSibling,he=B.firstChild,le=J.nextSibling,ge=le.firstChild.nextSibling,ve=le.nextSibling,we=ve.firstChild.nextSibling,$e=M.nextSibling,me=$e.nextSibling;return h(F,(()=>{var C=K(()=>!!(a()?.status==="success"&&a()?.isFetching));return()=>C()?"fetching":a()?.status})()),h(he,()=>a()?.id),h(ge,(()=>{var C=K(()=>!!R().find(ee=>ee.id===a()?.id));return()=>C()?"Pending":c().matches.find(ee=>ee.id===a()?.id)?"Active":"Cached"})()),h(we,(()=>{var C=K(()=>!!a()?.updatedAt);return()=>C()?new Date(a()?.updatedAt).toLocaleTimeString():"N/A"})()),h(b,(()=>{var C=K(()=>!!G());return()=>C()?[(()=>{var ee=zr();return S(()=>d(ee,i().detailsHeader)),ee})(),(()=>{var ee=qe();return h(ee,w(ze,{label:"loaderData",value:G,defaultExpanded:{}})),S(()=>d(ee,i().detailsContent)),ee})()]:null})(),$e),h(me,w(ze,{label:"Match",value:P,defaultExpanded:{}})),S(C=>{var ee=i().thirdContainer,xe=i().detailsHeader,_e=i().matchDetails,ye=i().matchStatus(a()?.status,a()?.isFetching),Be=i().matchDetailsInfoLabel,Te=i().matchDetailsInfo,De=i().matchDetailsInfoLabel,Ie=i().matchDetailsInfo,Ge=i().matchDetailsInfoLabel,Ae=i().matchDetailsInfo,Re=i().detailsHeader,Pe=i().detailsContent;return ee!==C.e&&d(b,C.e=ee),xe!==C.t&&d(E,C.t=xe),_e!==C.a&&d(_,C.a=_e),ye!==C.o&&d(v,C.o=ye),Be!==C.i&&d(J,C.i=Be),Te!==C.n&&d(B,C.n=Te),De!==C.s&&d(le,C.s=De),Ie!==C.h&&d(ge,C.h=Ie),Ge!==C.r&&d(ve,C.r=Ge),Ae!==C.d&&d(we,C.d=Ae),Re!==C.l&&d($e,C.l=Re),Pe!==C.u&&d(me,C.u=Pe),C},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0,r:void 0,d:void 0,l:void 0,u:void 0}),b})():null})(),null),h(z,(()=>{var u=K(()=>!!k());return()=>u()?(()=>{var b=Mr(),E=b.firstChild;E.firstChild;var M=E.nextSibling;return h(E,typeof navigator<"u"?(()=>{var _=Ur();return h(_,w(Tr,{getValue:()=>{const v=c().location.search;return JSON.stringify(v)}})),_})():null,null),h(M,w(ze,{value:oe,get defaultExpanded(){return Object.keys(c().location.search).reduce((_,v)=>(_[v]={},_),{})}})),S(_=>{var v=i().fourthContainer,F=i().detailsHeader,J=i().detailsContent;return v!==_.e&&d(b,_.e=v),F!==_.t&&d(E,_.t=F),J!==_.a&&d(M,_.a=J),_},{e:void 0,t:void 0,a:void 0}),b})():null})(),null),S(u=>{var b=i().panelCloseBtn,E=i().panelCloseBtnIcon,M=i().firstContainer,_=i().row,v=i().routerExplorerContainer,F=i().routerExplorer,J=i().secondContainer,B=i().matchesContainer,he=i().detailsHeader,le=i().detailsContent,ge=i().detailsHeader,ve=i().routeMatchesToggle,we=H()==="routes",$e=Z(i().routeMatchesToggleBtn(H()==="routes",!0)),me=H()==="matches",C=Z(i().routeMatchesToggleBtn(H()==="matches",!0)),ee=H()==="history",xe=Z(i().routeMatchesToggleBtn(H()==="history",!1)),_e=i().detailsHeaderInfo,ye=Z(i().routesContainer);return b!==u.e&&d(Y,u.e=b),E!==u.t&&s(N,"class",u.t=E),M!==u.a&&d(L,u.a=M),_!==u.o&&d(y,u.o=_),v!==u.i&&d(T,u.i=v),F!==u.n&&d(Q,u.n=F),J!==u.s&&d(re,u.s=J),B!==u.h&&d(se,u.h=B),he!==u.r&&d(ce,u.r=he),le!==u.d&&d(V,u.d=le),ge!==u.l&&d(fe,u.l=ge),ve!==u.u&&d(be,u.u=ve),we!==u.c&&(ae.disabled=u.c=we),$e!==u.w&&d(ae,u.w=$e),me!==u.m&&(ue.disabled=u.m=me),C!==u.f&&d(ue,u.f=C),ee!==u.y&&(Me.disabled=u.y=ee),xe!==u.g&&d(Me,u.g=xe),_e!==u.p&&d(Ne,u.p=_e),ye!==u.b&&d(Oe,u.b=ye),u},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0,r:void 0,d:void 0,l:void 0,u:void 0,c:void 0,w:void 0,m:void 0,f:void 0,y:void 0,g:void 0,p:void 0,b:void 0}),z})()};function Tr({getValue:e}){const[t,o]=ne(!1);let r=null;const g=async()=>{if(typeof navigator>"u"||!navigator.clipboard?.writeText){console.warn("TanStack Router Devtools: Clipboard API unavailable");return}try{const l=e();await navigator.clipboard.writeText(l),o(!0),r&&clearTimeout(r),r=setTimeout(()=>o(!1),2500)}catch(l){console.error("TanStack Router Devtools: Failed to copy",l)}};return rt(()=>{r&&clearTimeout(r)}),(()=>{var l=Er();return l.$$click=g,h(l,()=>t()?"✅":"📋"),S(()=>s(l,"title",t()?"Copied!":"Copy")),l})()}ot(["click","mousedown"]);var Dr=U('<svg xmlns=http://www.w3.org/2000/svg enable-background="new 0 0 634 633"viewBox="0 0 634 633"><g transform=translate(1)><linearGradient x1=-641.486 x2=-641.486 y1=856.648 y2=855.931 gradientTransform="matrix(633 0 0 -633 406377 542258)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#6bdaff></stop><stop offset=0.319 stop-color=#f9ffb5></stop><stop offset=0.706 stop-color=#ffa770></stop><stop offset=1 stop-color=#ff7373></stop></linearGradient><circle cx=316.5 cy=316.5 r=316.5 fill-rule=evenodd clip-rule=evenodd></circle><defs><filter width=454 height=396.9 x=-137.5 y=412 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=-137.5 y=412 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=89.5 cy=610.5 fill=#015064 fill-rule=evenodd stroke=#00CFE2 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=454 height=396.9 x=316.5 y=412 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=316.5 y=412 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=543.5 cy=610.5 fill=#015064 fill-rule=evenodd stroke=#00CFE2 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=454 height=396.9 x=-137.5 y=450 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=-137.5 y=450 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=89.5 cy=648.5 fill=#015064 fill-rule=evenodd stroke=#00A8B8 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=454 height=396.9 x=316.5 y=450 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=316.5 y=450 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=543.5 cy=648.5 fill=#015064 fill-rule=evenodd stroke=#00A8B8 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=454 height=396.9 x=-137.5 y=486 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=-137.5 y=486 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=89.5 cy=684.5 fill=#015064 fill-rule=evenodd stroke=#007782 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=454 height=396.9 x=316.5 y=486 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=454 height=396.9 x=316.5 y=486 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><ellipse cx=543.5 cy=684.5 fill=#015064 fill-rule=evenodd stroke=#007782 stroke-width=25 clip-rule=evenodd rx=214.5 ry=186></ellipse><defs><filter width=176.9 height=129.3 x=272.2 y=308 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=176.9 height=129.3 x=272.2 y=308 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><g><path fill=none stroke=#000 stroke-linecap=round stroke-linejoin=bevel stroke-width=11 d="M436 403.2l-5 28.6m-140-90.3l-10.9 62m52.8-19.4l-4.3 27.1"></path><linearGradient x1=-645.656 x2=-646.499 y1=854.878 y2=854.788 gradientTransform="matrix(-184.159 -32.4722 11.4608 -64.9973 -128419.844 34938.836)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ee2700></stop><stop offset=1 stop-color=#ff008e></stop></linearGradient><path fill-rule=evenodd d="M344.1 363l97.7 17.2c5.8 2.1 8.2 6.2 7.1 12.1-1 5.9-4.7 9.2-11 9.9l-106-18.7-57.5-59.2c-3.2-4.8-2.9-9.1.8-12.8 3.7-3.7 8.3-4.4 13.7-2.1l55.2 53.6z"clip-rule=evenodd></path><path fill=#D8D8D8 fill-rule=evenodd stroke=#FFF stroke-linecap=round stroke-linejoin=bevel stroke-width=7 d="M428.3 384.5l.9-6.5m-33.9 1.5l.9-6.5m-34 .5l.9-6.1m-38.9-16.1l4.2-3.9m-25.2-16.1l4.2-3.9"clip-rule=evenodd></path></g><defs><filter width=280.6 height=317.4 x=73.2 y=113.9 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=280.6 height=317.4 x=73.2 y=113.9 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><g><linearGradient x1=-646.8 x2=-646.8 y1=854.844 y2=853.844 gradientTransform="matrix(-100.1751 48.8587 -97.9753 -200.879 19124.773 203538.61)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#a17500></stop><stop offset=1 stop-color=#5d2100></stop></linearGradient><path fill-rule=evenodd d="M192.3 203c8.1 37.3 14 73.6 17.8 109.1 3.8 35.4 2.8 75.2-2.9 119.2l61.2-16.7c-15.6-59-25.2-97.9-28.6-116.6-3.4-18.7-10.8-51.8-22.2-99.6l-25.3 4.6"clip-rule=evenodd></path><linearGradient x1=-635.467 x2=-635.467 y1=852.115 y2=851.115 gradientTransform="matrix(92.6873 4.8575 2.0257 -38.6535 57323.695 36176.047)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M195 183.9s-12.6-22.1-36.5-29.9c-15.9-5.2-34.4-1.5-55.5 11.1 15.9 14.3 29.5 22.6 40.7 24.9 16.8 3.6 51.3-6.1 51.3-6.1z"clip-rule=evenodd></path><linearGradient x1=-636.573 x2=-636.573 y1=855.444 y2=854.444 gradientTransform="matrix(109.9945 5.7646 6.3597 -121.3507 64719.133 107659.336)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M194.9 184.5s-47.5-8.5-83.2 15.7c-23.8 16.2-34.3 49.3-31.6 99.3 30.3-27.8 52.1-48.5 65.2-61.9 19.8-20 49.6-53.1 49.6-53.1z"clip-rule=evenodd></path><linearGradient x1=-632.145 x2=-632.145 y1=854.174 y2=853.174 gradientTransform="matrix(62.9558 3.2994 3.5021 -66.8246 37035.367 59284.227)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M195 183.9c-.8-21.9 6-38 20.6-48.2 14.6-10.2 29.8-15.3 45.5-15.3-6.1 21.4-14.5 35.8-25.2 43.4-10.7 7.5-24.4 14.2-40.9 20.1z"clip-rule=evenodd></path><linearGradient x1=-638.224 x2=-638.224 y1=853.801 y2=852.801 gradientTransform="matrix(152.4666 7.9904 3.0934 -59.0251 94939.86 55646.855)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M194.9 184.5c31.9-30 64.1-39.7 96.7-29 32.6 10.7 50.8 30.4 54.6 59.1-35.2-5.5-60.4-9.6-75.8-12.1-15.3-2.6-40.5-8.6-75.5-18z"clip-rule=evenodd></path><linearGradient x1=-637.723 x2=-637.723 y1=855.103 y2=854.103 gradientTransform="matrix(136.467 7.1519 5.2165 -99.5377 82830.875 89859.578)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M194.9 184.5c35.8-7.6 65.6-.2 89.2 22 23.6 22.2 37.7 49 42.3 80.3-39.8-9.7-68.3-23.8-85.5-42.4-17.2-18.5-32.5-38.5-46-59.9z"clip-rule=evenodd></path><linearGradient x1=-631.79 x2=-631.79 y1=855.872 y2=854.872 gradientTransform="matrix(60.8683 3.19 8.7771 -167.4773 31110.818 145537.61)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#2f8a00></stop><stop offset=1 stop-color=#90ff57></stop></linearGradient><path fill-rule=evenodd stroke=#2F8A00 stroke-width=13 d="M194.9 184.5c-33.6 13.8-53.6 35.7-60.1 65.6-6.5 29.9-3.6 63.1 8.7 99.6 27.4-40.3 43.2-69.6 47.4-88 4.2-18.3 5.5-44.1 4-77.2z"clip-rule=evenodd></path><path fill=none stroke=#2F8A00 stroke-linecap=round stroke-width=8 d="M196.5 182.3c-14.8 21.6-25.1 41.4-30.8 59.4-5.7 18-9.4 33-11.1 45.1"></path><path fill=none stroke=#2F8A00 stroke-linecap=round stroke-width=8 d="M194.8 185.7c-24.4 1.7-43.8 9-58.1 21.8-14.3 12.8-24.7 25.4-31.3 37.8m99.1-68.9c29.7-6.7 52-8.4 67-5 15 3.4 26.9 8.7 35.8 15.9m-110.8-5.9c20.3 9.9 38.2 20.5 53.9 31.9 15.7 11.4 27.4 22.1 35.1 32"></path></g><defs><filter width=532 height=633 x=50.5 y=399 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=532 height=633 x=50.5 y=399 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><linearGradient x1=-641.104 x2=-641.278 y1=856.577 y2=856.183 gradientTransform="matrix(532 0 0 -633 341484.5 542657)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#fff400></stop><stop offset=1 stop-color=#3c8700></stop></linearGradient><ellipse cx=316.5 cy=715.5 fill-rule=evenodd clip-rule=evenodd rx=266 ry=316.5></ellipse><defs><filter width=288 height=283 x=391 y=-24 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"></feColorMatrix></filter></defs><mask width=288 height=283 x=391 y=-24 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#FFF fill-rule=evenodd clip-rule=evenodd></circle></g></mask><g><g transform="translate(397 -24)"><linearGradient x1=-1036.672 x2=-1036.672 y1=880.018 y2=879.018 gradientTransform="matrix(227 0 0 -227 235493 199764)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffdf00></stop><stop offset=1 stop-color=#ff9d00></stop></linearGradient><circle cx=168.5 cy=113.5 r=113.5 fill-rule=evenodd clip-rule=evenodd></circle><linearGradient x1=-1017.329 x2=-1018.602 y1=658.003 y2=657.998 gradientTransform="matrix(30 0 0 -1 30558 771)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M30 113H0"></path><linearGradient x1=-1014.501 x2=-1015.774 y1=839.985 y2=839.935 gradientTransform="matrix(26.5 0 0 -5.5 26925 4696.5)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M33.5 79.5L7 74"></path><linearGradient x1=-1016.59 x2=-1017.862 y1=852.671 y2=852.595 gradientTransform="matrix(29 0 0 -8 29523 6971)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M34 146l-29 8"></path><linearGradient x1=-1011.984 x2=-1013.257 y1=863.523 y2=863.229 gradientTransform="matrix(24 0 0 -13 24339 11407)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M45 177l-24 13"></path><linearGradient x1=-1006.673 x2=-1007.946 y1=869.279 y2=868.376 gradientTransform="matrix(20 0 0 -19 20205 16720)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M67 204l-20 19"></path><linearGradient x1=-992.85 x2=-993.317 y1=871.258 y2=870.258 gradientTransform="matrix(13.8339 0 0 -22.8467 13825.796 20131.938)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M94.4 227l-13.8 22.8"></path><linearGradient x1=-953.835 x2=-953.965 y1=871.9 y2=870.9 gradientTransform="matrix(7.5 0 0 -24.5 7278 21605)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M127.5 243.5L120 268"></path><linearGradient x1=244.504 x2=244.496 y1=871.898 y2=870.898 gradientTransform="matrix(.5 0 0 -24.5 45.5 21614)"gradientUnits=userSpaceOnUse><stop offset=0 stop-color=#ffa400></stop><stop offset=1 stop-color=#ff5e00></stop></linearGradient><path fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12 d="M167.5 252.5l.5 24.5">');function Ct(){const e=jt();return(()=>{var t=Dr(),o=t.firstChild.firstChild,r=o.nextSibling,g=r.nextSibling,l=g.firstChild,c=g.nextSibling,p=c.firstChild,f=c.nextSibling,n=f.nextSibling,i=n.firstChild,x=n.nextSibling,$=x.firstChild,O=x.nextSibling,H=O.nextSibling,m=H.firstChild,j=H.nextSibling,te=j.firstChild,ie=j.nextSibling,de=ie.nextSibling,Se=de.firstChild,W=de.nextSibling,R=W.firstChild,X=W.nextSibling,a=X.nextSibling,k=a.firstChild,D=a.nextSibling,I=D.firstChild,G=D.nextSibling,P=G.nextSibling,oe=P.firstChild,z=P.nextSibling,Y=z.firstChild,N=z.nextSibling,L=N.nextSibling,y=L.firstChild,T=L.nextSibling,Q=T.firstChild,re=T.nextSibling,se=re.firstChild.nextSibling,ce=se.nextSibling,V=re.nextSibling,pe=V.firstChild,fe=V.nextSibling,be=fe.firstChild,ae=fe.nextSibling,ue=ae.firstChild,Me=ue.nextSibling,Ne=Me.nextSibling,Oe=Ne.nextSibling,u=Oe.nextSibling,b=u.nextSibling,E=b.nextSibling,M=E.nextSibling,_=M.nextSibling,v=_.nextSibling,F=v.nextSibling,J=F.nextSibling,B=J.nextSibling,he=B.nextSibling,le=ae.nextSibling,ge=le.firstChild,ve=le.nextSibling,we=ve.firstChild,$e=ve.nextSibling,me=$e.nextSibling,C=me.nextSibling,ee=C.firstChild,xe=C.nextSibling,_e=xe.firstChild,ye=xe.nextSibling,Be=ye.firstChild.firstChild,Te=Be.nextSibling,De=Te.nextSibling,Ie=De.nextSibling,Ge=Ie.nextSibling,Ae=Ge.nextSibling,Re=Ae.nextSibling,Pe=Re.nextSibling,st=Pe.nextSibling,at=st.nextSibling,dt=at.nextSibling,ct=dt.nextSibling,ft=ct.nextSibling,ut=ft.nextSibling,gt=ut.nextSibling,pt=gt.nextSibling,ht=pt.nextSibling,Et=ht.nextSibling;return s(o,"id",`a-${e}`),s(r,"fill",`url(#a-${e})`),s(l,"id",`b-${e}`),s(c,"id",`c-${e}`),s(p,"filter",`url(#b-${e})`),s(f,"mask",`url(#c-${e})`),s(i,"id",`d-${e}`),s(x,"id",`e-${e}`),s($,"filter",`url(#d-${e})`),s(O,"mask",`url(#e-${e})`),s(m,"id",`f-${e}`),s(j,"id",`g-${e}`),s(te,"filter",`url(#f-${e})`),s(ie,"mask",`url(#g-${e})`),s(Se,"id",`h-${e}`),s(W,"id",`i-${e}`),s(R,"filter",`url(#h-${e})`),s(X,"mask",`url(#i-${e})`),s(k,"id",`j-${e}`),s(D,"id",`k-${e}`),s(I,"filter",`url(#j-${e})`),s(G,"mask",`url(#k-${e})`),s(oe,"id",`l-${e}`),s(z,"id",`m-${e}`),s(Y,"filter",`url(#l-${e})`),s(N,"mask",`url(#m-${e})`),s(y,"id",`n-${e}`),s(T,"id",`o-${e}`),s(Q,"filter",`url(#n-${e})`),s(re,"mask",`url(#o-${e})`),s(se,"id",`p-${e}`),s(ce,"fill",`url(#p-${e})`),s(pe,"id",`q-${e}`),s(fe,"id",`r-${e}`),s(be,"filter",`url(#q-${e})`),s(ae,"mask",`url(#r-${e})`),s(ue,"id",`s-${e}`),s(Me,"fill",`url(#s-${e})`),s(Ne,"id",`t-${e}`),s(Oe,"fill",`url(#t-${e})`),s(u,"id",`u-${e}`),s(b,"fill",`url(#u-${e})`),s(E,"id",`v-${e}`),s(M,"fill",`url(#v-${e})`),s(_,"id",`w-${e}`),s(v,"fill",`url(#w-${e})`),s(F,"id",`x-${e}`),s(J,"fill",`url(#x-${e})`),s(B,"id",`y-${e}`),s(he,"fill",`url(#y-${e})`),s(ge,"id",`z-${e}`),s(ve,"id",`A-${e}`),s(we,"filter",`url(#z-${e})`),s($e,"id",`B-${e}`),s(me,"fill",`url(#B-${e})`),s(me,"mask",`url(#A-${e})`),s(ee,"id",`C-${e}`),s(xe,"id",`D-${e}`),s(_e,"filter",`url(#C-${e})`),s(ye,"mask",`url(#D-${e})`),s(Be,"id",`E-${e}`),s(Te,"fill",`url(#E-${e})`),s(De,"id",`F-${e}`),s(Ie,"stroke",`url(#F-${e})`),s(Ge,"id",`G-${e}`),s(Ae,"stroke",`url(#G-${e})`),s(Re,"id",`H-${e}`),s(Pe,"stroke",`url(#H-${e})`),s(st,"id",`I-${e}`),s(at,"stroke",`url(#I-${e})`),s(dt,"id",`J-${e}`),s(ct,"stroke",`url(#J-${e})`),s(ft,"id",`K-${e}`),s(ut,"stroke",`url(#K-${e})`),s(gt,"id",`L-${e}`),s(pt,"stroke",`url(#L-${e})`),s(ht,"id",`M-${e}`),s(Et,"stroke",`url(#M-${e})`),t})()}var Ir=U("<button type=button><div><div></div><div></div></div><div>-</div><div>TanStack Router");function Ar({initialIsOpen:e,panelProps:t={},closeButtonProps:o={},toggleButtonProps:r={},position:g="bottom-left",containerElement:l="footer",router:c,routerState:p,shadowDOMTarget:f}){const[n,i]=ne();let x;const[$,O]=We("tanstackRouterDevtoolsOpen",e),[H,m]=We("tanstackRouterDevtoolsHeight",null),[j,te]=ne(!1),[ie,de]=ne(!1),Se=Xt(),W=Ee(),R=(y,T)=>{if(T.button!==0)return;de(!0);const Q={originalHeight:y?.getBoundingClientRect().height??0,pageY:T.pageY},re=ce=>{const V=Q.pageY-ce.pageY,pe=Q.originalHeight+V;m(pe),pe<70?O(!1):O(!0)},se=()=>{de(!1),document.removeEventListener("mousemove",re),document.removeEventListener("mouseUp",se)};document.addEventListener("mousemove",re),document.addEventListener("mouseup",se)};$(),Ce(()=>{te($()??!1)}),Ce(()=>{if(j()){const y=n()?.parentElement?.style.paddingBottom,T=()=>{const Q=x.getBoundingClientRect().height;n()?.parentElement&&i(re=>(re?.parentElement&&(re.parentElement.style.paddingBottom=`${Q}px`),re))};if(T(),typeof window<"u")return window.addEventListener("resize",T),()=>{window.removeEventListener("resize",T),n()?.parentElement&&typeof y=="string"&&i(Q=>(Q.parentElement.style.paddingBottom=y,Q))}}else n()?.parentElement&&i(y=>(y?.parentElement&&y.parentElement.removeAttribute("style"),y))}),Ce(()=>{if(n()){const y=n(),T=getComputedStyle(y).fontSize;y?.style.setProperty("--tsrd-font-size",T)}});const{style:X={},...a}=t,{style:k={},onClick:D,...I}=o,{onClick:G,class:P,...oe}=r;if(!Se())return null;const z=q(()=>H()??500),Y=q(()=>Z(W().devtoolsPanelContainer,W().devtoolsPanelContainerVisibility(!!$()),W().devtoolsPanelContainerResizing(ie),W().devtoolsPanelContainerAnimation(j(),z()+16))),N=q(()=>({height:`${z()}px`,...X||{}})),L=q(()=>Z(W().mainCloseBtn,W().mainCloseBtnPosition(g),W().mainCloseBtnAnimation(!!$()),P));return w(Lt,{component:l,ref:i,class:"TanStackRouterDevtools",get children(){return[w(Pt.Provider,{value:{onCloseClick:D??(()=>{})},get children(){return w(Br,He({ref(y){var T=x;typeof T=="function"?T(y):x=y}},a,{router:c,routerState:p,className:Y,style:N,get isOpen(){return j()},setIsOpen:O,handleDragStart:y=>R(x,y),shadowDOMTarget:f}))}}),(()=>{var y=Ir(),T=y.firstChild,Q=T.firstChild,re=Q.nextSibling,se=T.nextSibling,ce=se.nextSibling;return nt(y,He(oe,{"aria-label":"Open TanStack Router Devtools",onClick:V=>{O(!0),G&&G(V)},get class(){return L()}}),!1,!0),h(Q,w(Ct,{})),h(re,w(Ct,{})),S(V=>{var pe=W().mainCloseBtnIconContainer,fe=W().mainCloseBtnIconOuter,be=W().mainCloseBtnIconInner,ae=W().mainCloseBtnDivider,ue=W().routerLogoCloseButton;return pe!==V.e&&d(T,V.e=pe),fe!==V.t&&d(Q,V.t=fe),be!==V.a&&d(re,V.a=be),ae!==V.o&&d(se,V.o=ae),ue!==V.i&&d(ce,V.i=ue),V},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0}),y})()]}})}export{Ar as FloatingTanStackRouterDevtools,Ar as default};
