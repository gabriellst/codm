import{aq as z,ar as B,as as q,at as m,au as we,av as $t,aw as jo,ax as ge,ay as R,az as S,aA as G,aB as O,aC as As,aD as fr,aE as xe,aF as U,aG as Xn,aH as Zn,aI as dt,aJ as A,aK as _,aL as Ts,aM as ln,aN as qt,aO as bt,aP as Pe,aQ as Fs,aR as _t,aS as Kt,aT as Os,aU as Is,aV as kn,aW as Ls,aX as Nt,aY as Wo,aZ as Ps,a_ as j,a$ as Wr,b0 as qs,b1 as _s,b2 as gr,b3 as Rs,b4 as zs,b5 as Ks,b6 as Gn,b7 as Bs,b8 as Ns,b9 as ee,ba as Hs,bb as Gs,bc as Us}from"./index-BO3g0mcg.js";var Vs=e=>e!=null,js=e=>e.filter(Vs);function Ws(e){return(...t)=>{for(const n of e)n&&n(...t)}}var M=e=>typeof e=="function"&&!e.length?e():e,Jn=e=>Array.isArray(e)?e:e?[e]:[];function Qs(e,...t){return typeof e=="function"?e(...t):e}var Ys=U;function Xs(e,t,n,r){const o=e.length,s=t.length;let a=0;if(!s){for(;a<o;a++)n(e[a]);return}if(!o){for(;a<s;a++)r(t[a]);return}for(;a<s&&t[a]===e[a];a++);let l,i;t=t.slice(a),e=e.slice(a);for(l of t)e.includes(l)||r(l);for(i of e)t.includes(i)||n(i)}function Zs(e){const[t,n]=z(),r=e?.throw?(d,f)=>{throw n(d instanceof Error?d:new Error(f)),d}:(d,f)=>{n(d instanceof Error?d:new Error(f))},o=e?.api?Array.isArray(e.api)?e.api:[e.api]:[globalThis.localStorage].filter(Boolean),s=e?.prefix?`${e.prefix}.`:"",a=new Map,l=new Proxy({},{get(d,f){let h=a.get(f);h||(h=z(void 0,{equals:!1}),a.set(f,h)),h[0]();const y=o.reduce((v,p)=>{if(v!==null||!p)return v;try{return p.getItem(`${s}${f}`)}catch(w){return r(w,`Error reading ${s}${f} from ${p.name}`),null}},null);return y!==null&&e?.deserializer?e.deserializer(y,f,e.options):y}}),i=(d,f,h)=>{const y=e?.serializer?e.serializer(f,d,h??e.options):f,v=`${s}${d}`;o.forEach(w=>{try{w.getItem(v)!==y&&w.setItem(v,y)}catch(b){r(b,`Error setting ${s}${d} to ${y} in ${w.name}`)}});const p=a.get(d);p&&p[1]()},u=d=>o.forEach(f=>{try{f.removeItem(`${s}${d}`)}catch(h){r(h,`Error removing ${s}${d} from ${f.name}`)}}),g=()=>o.forEach(d=>{try{d.clear()}catch(f){r(f,`Error clearing ${d.name}`)}}),c=()=>{const d={},f=(h,y)=>{if(!d.hasOwnProperty(h)){const v=y&&e?.deserializer?e.deserializer(y,h,e.options):y;v&&(d[h]=v)}};return o.forEach(h=>{if(typeof h.getAll=="function"){let y;try{y=h.getAll()}catch(v){r(v,`Error getting all values from in ${h.name}`)}for(const v of y)f(v,y[v])}else{let y=0,v;try{for(;v=h.key(y++);)d.hasOwnProperty(v)||f(v,h.getItem(v))}catch(p){r(p,`Error getting all values from ${h.name}`)}}}),d};return e?.sync!==!1&&$t(()=>{const d=f=>{let h=!1;o.forEach(y=>{try{y!==f.storageArea&&f.key&&f.newValue!==y.getItem(f.key)&&(f.newValue?y.setItem(f.key,f.newValue):y.removeItem(f.key),h=!0)}catch(v){r(v,`Error synching api ${y.name} from storage event (${f.key}=${f.newValue})`)}}),h&&f.key&&a.get(f.key)?.[1]()};"addEventListener"in globalThis?(globalThis.addEventListener("storage",d),U(()=>globalThis.removeEventListener("storage",d))):(o.forEach(f=>f.addEventListener?.("storage",d)),U(()=>o.forEach(f=>f.removeEventListener?.("storage",d))))}),[l,i,{clear:g,error:t,remove:u,toJSON:c}]}var Js=Zs,ea=e=>(typeof e.clear=="function"||(e.clear=()=>{let t;for(;t=e.key(0);)e.removeItem(t)}),e),Qr=e=>{if(!e)return"";let t="";for(const n in e){if(!e.hasOwnProperty(n))continue;const r=e[n];t+=r instanceof Date?`; ${n}=${r.toUTCString()}`:typeof r=="boolean"?`; ${n}`:`; ${n}=${r}`}return t},_e=ea({_cookies:[globalThis.document,"cookie"],getItem:e=>_e._cookies[0][_e._cookies[1]].match("(^|;)\\s*"+e+"\\s*=\\s*([^;]+)")?.pop()??null,setItem:(e,t,n)=>{const r=_e.getItem(e);_e._cookies[0][_e._cookies[1]]=`${e}=${t}${Qr(n)}`;const o=Object.assign(new Event("storage"),{key:e,oldValue:r,newValue:t,url:globalThis.document.URL,storageArea:_e});window.dispatchEvent(o)},removeItem:e=>{_e._cookies[0][_e._cookies[1]]=`${e}=deleted${Qr({expires:new Date(0)})}`},key:e=>{let t=null,n=0;return _e._cookies[0][_e._cookies[1]].replace(/(?:^|;)\s*(.+?)\s*=\s*[^;]+/g,(r,o)=>(!t&&o&&n++===e&&(t=o),"")),t},get length(){let e=0;return _e._cookies[0][_e._cookies[1]].replace(/(?:^|;)\s*.+?\s*=\s*[^;]+/g,t=>(e+=t?1:0,"")),e}}),ta=1024,Gt=796,Qo=700,na="bottom-right",er="bottom",ra="system",oa=!1,Cn=500,ia=500,Sn=500,sa=Object.keys(Xn)[0],Yr=1,aa=Object.keys(Zn)[0],Yo=we({client:void 0,onlineManager:void 0,queryFlavor:"",version:"",shadowDOMTarget:void 0});function K(){return xe(Yo)}var Xr=class extends Error{},Xo=we(void 0),la=e=>{const[t,n]=z(null),r=()=>{const a=t();a!=null&&(a.close(),e.setLocalStore("pip_open","false"),n(null))},o=(a,l)=>{if(t()!=null)return;const i=window.open("","TSQD-Devtools-Panel",`width=${a},height=${l},popup`);if(!i)throw new Xr("Failed to open popup. Please allow popups for this site to view the devtools in picture-in-picture mode.");i.document.head.innerHTML="",i.document.body.innerHTML="",As(i.document),i.document.title="TanStack Query Devtools",i.document.body.style.margin="0",i.addEventListener("pagehide",()=>{e.setLocalStore("pip_open","false"),n(null)}),[...(K().shadowDOMTarget||document).styleSheets].forEach(u=>{try{const g=[...u.cssRules].map(h=>h.cssText).join(""),c=document.createElement("style"),d=u.ownerNode;let f="";d&&"id"in d&&(f=d.id),f&&c.setAttribute("id",f),c.textContent=g,i.document.head.appendChild(c)}catch{const c=document.createElement("link");if(u.href==null)return;c.rel="stylesheet",c.type=u.type,c.media=u.media.toString(),c.href=u.href,i.document.head.appendChild(c)}}),fr(["focusin","focusout","pointermove","keydown","pointerdown","pointerup","click","mousedown","input"],i.document),e.setLocalStore("pip_open","true"),n(i)};B(()=>{if((e.localStore.pip_open??"false")==="true"&&!e.disabled)try{o(Number(window.innerWidth),Number(e.localStore.height||ia))}catch(l){if(l instanceof Xr){console.error(l.message),e.setLocalStore("pip_open","false"),e.setLocalStore("open","false");return}throw l}}),B(()=>{const a=(K().shadowDOMTarget||document).querySelector("#_goober"),l=t();if(a&&l){const i=new MutationObserver(()=>{const u=(K().shadowDOMTarget||l.document).querySelector("#_goober");u&&(u.textContent=a.textContent)});i.observe(a,{childList:!0,subtree:!0,characterDataOldValue:!0}),U(()=>{i.disconnect()})}});const s=q(()=>({pipWindow:t(),requestPipWindow:o,closePipWindow:r,disabled:e.disabled??!1}));return m(Xo.Provider,{value:s,get children(){return e.children}})},hr=()=>q(()=>{const t=xe(Xo);if(!t)throw new Error("usePiPWindow must be used within a PiPProvider");return t()}),Zo=we(()=>"dark");function $e(){return xe(Zo)}var Jo={À:"A",Á:"A",Â:"A",Ã:"A",Ä:"A",Å:"A",Ấ:"A",Ắ:"A",Ẳ:"A",Ẵ:"A",Ặ:"A",Æ:"AE",Ầ:"A",Ằ:"A",Ȃ:"A",Ç:"C",Ḉ:"C",È:"E",É:"E",Ê:"E",Ë:"E",Ế:"E",Ḗ:"E",Ề:"E",Ḕ:"E",Ḝ:"E",Ȇ:"E",Ì:"I",Í:"I",Î:"I",Ï:"I",Ḯ:"I",Ȋ:"I",Ð:"D",Ñ:"N",Ò:"O",Ó:"O",Ô:"O",Õ:"O",Ö:"O",Ø:"O",Ố:"O",Ṍ:"O",Ṓ:"O",Ȏ:"O",Ù:"U",Ú:"U",Û:"U",Ü:"U",Ý:"Y",à:"a",á:"a",â:"a",ã:"a",ä:"a",å:"a",ấ:"a",ắ:"a",ẳ:"a",ẵ:"a",ặ:"a",æ:"ae",ầ:"a",ằ:"a",ȃ:"a",ç:"c",ḉ:"c",è:"e",é:"e",ê:"e",ë:"e",ế:"e",ḗ:"e",ề:"e",ḕ:"e",ḝ:"e",ȇ:"e",ì:"i",í:"i",î:"i",ï:"i",ḯ:"i",ȋ:"i",ð:"d",ñ:"n",ò:"o",ó:"o",ô:"o",õ:"o",ö:"o",ø:"o",ố:"o",ṍ:"o",ṓ:"o",ȏ:"o",ù:"u",ú:"u",û:"u",ü:"u",ý:"y",ÿ:"y",Ā:"A",ā:"a",Ă:"A",ă:"a",Ą:"A",ą:"a",Ć:"C",ć:"c",Ĉ:"C",ĉ:"c",Ċ:"C",ċ:"c",Č:"C",č:"c",C̆:"C",c̆:"c",Ď:"D",ď:"d",Đ:"D",đ:"d",Ē:"E",ē:"e",Ĕ:"E",ĕ:"e",Ė:"E",ė:"e",Ę:"E",ę:"e",Ě:"E",ě:"e",Ĝ:"G",Ǵ:"G",ĝ:"g",ǵ:"g",Ğ:"G",ğ:"g",Ġ:"G",ġ:"g",Ģ:"G",ģ:"g",Ĥ:"H",ĥ:"h",Ħ:"H",ħ:"h",Ḫ:"H",ḫ:"h",Ĩ:"I",ĩ:"i",Ī:"I",ī:"i",Ĭ:"I",ĭ:"i",Į:"I",į:"i",İ:"I",ı:"i",Ĳ:"IJ",ĳ:"ij",Ĵ:"J",ĵ:"j",Ķ:"K",ķ:"k",Ḱ:"K",ḱ:"k",K̆:"K",k̆:"k",Ĺ:"L",ĺ:"l",Ļ:"L",ļ:"l",Ľ:"L",ľ:"l",Ŀ:"L",ŀ:"l",Ł:"l",ł:"l",Ḿ:"M",ḿ:"m",M̆:"M",m̆:"m",Ń:"N",ń:"n",Ņ:"N",ņ:"n",Ň:"N",ň:"n",ŉ:"n",N̆:"N",n̆:"n",Ō:"O",ō:"o",Ŏ:"O",ŏ:"o",Ő:"O",ő:"o",Œ:"OE",œ:"oe",P̆:"P",p̆:"p",Ŕ:"R",ŕ:"r",Ŗ:"R",ŗ:"r",Ř:"R",ř:"r",R̆:"R",r̆:"r",Ȓ:"R",ȓ:"r",Ś:"S",ś:"s",Ŝ:"S",ŝ:"s",Ş:"S",Ș:"S",ș:"s",ş:"s",Š:"S",š:"s",Ţ:"T",ţ:"t",ț:"t",Ț:"T",Ť:"T",ť:"t",Ŧ:"T",ŧ:"t",T̆:"T",t̆:"t",Ũ:"U",ũ:"u",Ū:"U",ū:"u",Ŭ:"U",ŭ:"u",Ů:"U",ů:"u",Ű:"U",ű:"u",Ų:"U",ų:"u",Ȗ:"U",ȗ:"u",V̆:"V",v̆:"v",Ŵ:"W",ŵ:"w",Ẃ:"W",ẃ:"w",X̆:"X",x̆:"x",Ŷ:"Y",ŷ:"y",Ÿ:"Y",Y̆:"Y",y̆:"y",Ź:"Z",ź:"z",Ż:"Z",ż:"z",Ž:"Z",ž:"z",ſ:"s",ƒ:"f",Ơ:"O",ơ:"o",Ư:"U",ư:"u",Ǎ:"A",ǎ:"a",Ǐ:"I",ǐ:"i",Ǒ:"O",ǒ:"o",Ǔ:"U",ǔ:"u",Ǖ:"U",ǖ:"u",Ǘ:"U",ǘ:"u",Ǚ:"U",ǚ:"u",Ǜ:"U",ǜ:"u",Ứ:"U",ứ:"u",Ṹ:"U",ṹ:"u",Ǻ:"A",ǻ:"a",Ǽ:"AE",ǽ:"ae",Ǿ:"O",ǿ:"o",Þ:"TH",þ:"th",Ṕ:"P",ṕ:"p",Ṥ:"S",ṥ:"s",X́:"X",x́:"x",Ѓ:"Г",ѓ:"г",Ќ:"К",ќ:"к",A̋:"A",a̋:"a",E̋:"E",e̋:"e",I̋:"I",i̋:"i",Ǹ:"N",ǹ:"n",Ồ:"O",ồ:"o",Ṑ:"O",ṑ:"o",Ừ:"U",ừ:"u",Ẁ:"W",ẁ:"w",Ỳ:"Y",ỳ:"y",Ȁ:"A",ȁ:"a",Ȅ:"E",ȅ:"e",Ȉ:"I",ȉ:"i",Ȍ:"O",ȍ:"o",Ȑ:"R",ȑ:"r",Ȕ:"U",ȕ:"u",B̌:"B",b̌:"b",Č̣:"C",č̣:"c",Ê̌:"E",ê̌:"e",F̌:"F",f̌:"f",Ǧ:"G",ǧ:"g",Ȟ:"H",ȟ:"h",J̌:"J",ǰ:"j",Ǩ:"K",ǩ:"k",M̌:"M",m̌:"m",P̌:"P",p̌:"p",Q̌:"Q",q̌:"q",Ř̩:"R",ř̩:"r",Ṧ:"S",ṧ:"s",V̌:"V",v̌:"v",W̌:"W",w̌:"w",X̌:"X",x̌:"x",Y̌:"Y",y̌:"y",A̧:"A",a̧:"a",B̧:"B",b̧:"b",Ḑ:"D",ḑ:"d",Ȩ:"E",ȩ:"e",Ɛ̧:"E",ɛ̧:"e",Ḩ:"H",ḩ:"h",I̧:"I",i̧:"i",Ɨ̧:"I",ɨ̧:"i",M̧:"M",m̧:"m",O̧:"O",o̧:"o",Q̧:"Q",q̧:"q",U̧:"U",u̧:"u",X̧:"X",x̧:"x",Z̧:"Z",z̧:"z"},ca=Object.keys(Jo).join("|"),ua=new RegExp(ca,"g");function da(e){return e.replace(ua,t=>Jo[t])}var Te={CASE_SENSITIVE_EQUAL:7,EQUAL:6,STARTS_WITH:5,WORD_STARTS_WITH:4,CONTAINS:3,ACRONYM:2,MATCHES:1,NO_MATCH:0};function Zr(e,t,n){var r;if(n=n||{},n.threshold=(r=n.threshold)!=null?r:Te.MATCHES,!n.accessors){const a=Jr(e,t,n);return{rankedValue:e,rank:a,accessorIndex:-1,accessorThreshold:n.threshold,passed:a>=n.threshold}}const o=va(e,n.accessors),s={rankedValue:e,rank:Te.NO_MATCH,accessorIndex:-1,accessorThreshold:n.threshold,passed:!1};for(let a=0;a<o.length;a++){const l=o[a];let i=Jr(l.itemValue,t,n);const{minRanking:u,maxRanking:g,threshold:c=n.threshold}=l.attributes;i<u&&i>=Te.MATCHES?i=u:i>g&&(i=g),i=Math.min(i,g),i>=c&&i>s.rank&&(s.rank=i,s.passed=!0,s.accessorIndex=a,s.accessorThreshold=c,s.rankedValue=l.itemValue)}return s}function Jr(e,t,n){return e=eo(e,n),t=eo(t,n),t.length>e.length?Te.NO_MATCH:e===t?Te.CASE_SENSITIVE_EQUAL:(e=e.toLowerCase(),t=t.toLowerCase(),e===t?Te.EQUAL:e.startsWith(t)?Te.STARTS_WITH:e.includes(` ${t}`)?Te.WORD_STARTS_WITH:e.includes(t)?Te.CONTAINS:t.length===1?Te.NO_MATCH:fa(e).includes(t)?Te.ACRONYM:ga(e,t))}function fa(e){let t="";return e.split(" ").forEach(r=>{r.split("-").forEach(s=>{t+=s.substr(0,1)})}),t}function ga(e,t){let n=0,r=0;function o(i,u,g){for(let c=g,d=u.length;c<d;c++)if(u[c]===i)return n+=1,c+1;return-1}function s(i){const u=1/i,g=n/t.length;return Te.MATCHES+g*u}const a=o(t[0],e,0);if(a<0)return Te.NO_MATCH;r=a;for(let i=1,u=t.length;i<u;i++){const g=t[i];if(r=o(g,e,r),!(r>-1))return Te.NO_MATCH}const l=r-a;return s(l)}function eo(e,t){let{keepDiacritics:n}=t;return e=`${e}`,n||(e=da(e)),e}function ha(e,t){let n=t;typeof t=="object"&&(n=t.accessor);const r=n(e);return r==null?[]:Array.isArray(r)?r:[String(r)]}function va(e,t){const n=[];for(let r=0,o=t.length;r<o;r++){const s=t[r],a=ma(s),l=ha(e,s);for(let i=0,u=l.length;i<u;i++)n.push({itemValue:l[i],attributes:a})}return n}var to={maxRanking:1/0,minRanking:-1/0};function ma(e){return typeof e=="function"?to:{...to,...e}}var pa={data:""},ya=e=>{if(typeof window=="object"){let t=(e?e.querySelector("#_goober"):window._goober)||Object.assign(document.createElement("style"),{innerHTML:" ",id:"_goober"});return t.nonce=window.__nonce__,t.parentNode||(e||document.head).appendChild(t),t.firstChild}return e||pa},ba=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,wa=/\/\*[^]*?\*\/|  +/g,no=/\n+/g,Ft=(e,t)=>{let n="",r="",o="";for(let s in e){let a=e[s];s[0]=="@"?s[1]=="i"?n=s+" "+a+";":r+=s[1]=="f"?Ft(a,s):s+"{"+Ft(a,s[1]=="k"?"":t)+"}":typeof a=="object"?r+=Ft(a,t?t.replace(/([^,])+/g,l=>s.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,i=>/&/.test(i)?i.replace(/&/g,l):l?l+" "+i:i)):s):a!=null&&(s=/^--/.test(s)?s:s.replace(/[A-Z]/g,"-$&").toLowerCase(),o+=Ft.p?Ft.p(s,a):s+":"+a+";")}return n+(t&&o?t+"{"+o+"}":o)+r},st={},ei=e=>{if(typeof e=="object"){let t="";for(let n in e)t+=n+ei(e[n]);return t}return e},xa=(e,t,n,r,o)=>{let s=ei(e),a=st[s]||(st[s]=(i=>{let u=0,g=11;for(;u<i.length;)g=101*g+i.charCodeAt(u++)>>>0;return"go"+g})(s));if(!st[a]){let i=s!==e?e:(u=>{let g,c,d=[{}];for(;g=ba.exec(u.replace(wa,""));)g[4]?d.shift():g[3]?(c=g[3].replace(no," ").trim(),d.unshift(d[0][c]=d[0][c]||{})):d[0][g[1]]=g[2].replace(no," ").trim();return d[0]})(e);st[a]=Ft(o?{["@keyframes "+a]:i}:i,n?"":"."+a)}let l=n&&st.g?st.g:null;return n&&(st.g=st[a]),((i,u,g,c)=>{c?u.data=u.data.replace(c,i):u.data.indexOf(i)===-1&&(u.data=g?i+u.data:u.data+i)})(st[a],t,r,l),a},$a=(e,t,n)=>e.reduce((r,o,s)=>{let a=t[s];if(a&&a.call){let l=a(n),i=l&&l.props&&l.props.className||/^go/.test(l)&&l;a=i?"."+i:l&&typeof l=="object"?l.props?"":Ft(l,""):l===!1?"":l}return r+o+(a??"")},"");function W(e){let t=this||{},n=e.call?e(t.p):e;return xa(n.unshift?n.raw?$a(n,[].slice.call(arguments,1),t.p):n.reduce((r,o)=>Object.assign(r,o&&o.call?o(t.p):o),{}):n,ya(t.target),t.g,t.o,t.k)}W.bind({g:1});W.bind({k:1});function ti(e){var t,n,r="";if(typeof e=="string"||typeof e=="number")r+=e;else if(typeof e=="object")if(Array.isArray(e)){var o=e.length;for(t=0;t<o;t++)e[t]&&(n=ti(e[t]))&&(r&&(r+=" "),r+=n)}else for(n in e)e[n]&&(r&&(r+=" "),r+=n);return r}function P(){for(var e,t,n=0,r="",o=arguments.length;n<o;n++)(e=arguments[n])&&(t=ti(e))&&(r&&(r+=" "),r+=t);return r}function Ca(e,t){const n=Nt(e),{onChange:r}=t;let o=new Set(t.appear?void 0:n);const s=new WeakSet,[a,l]=z([],{equals:!1}),[i]=Rs(),u=c=>{l(d=>(d.push.apply(d,c),d));for(const d of c)s.delete(d)},g=(c,d,f)=>c.splice(f,0,d);return q(c=>{const d=a(),f=e();if(f[Wo],Nt(i))return i(),c;if(d.length){const h=c.filter(y=>!d.includes(y));return d.length=0,r({list:h,added:[],removed:[],unchanged:h,finishRemoved:u}),h}return Nt(()=>{const h=new Set(f),y=f.slice(),v=[],p=[],w=[];for(const x of f)(o.has(x)?w:v).push(x);let b=!v.length;for(let x=0;x<c.length;x++){const $=c[x];h.has($)||(s.has($)||(p.push($),s.add($)),g(y,$,x)),b&&$!==y[x]&&(b=!1)}return!p.length&&b?c:(r({list:y,added:v,removed:p,unchanged:w,finishRemoved:u}),o=h,y)})},t.appear?[]:n.slice())}function De(...e){return Ws(e)}var ro=e=>e instanceof Element;function tr(e,t){if(t(e))return e;if(typeof e=="function"&&!e.length)return tr(e(),t);if(Array.isArray(e)){const n=[];for(const r of e){const o=tr(r,t);o&&(Array.isArray(o)?n.push.apply(n,o):n.push(o))}return n.length?n:null}return null}function Sa(e,t=ro,n=ro){const r=q(e),o=q(()=>tr(r(),t));return o.toArray=()=>{const s=o();return Array.isArray(s)?s:s?[s]:[]},o}function ka(e){return q(()=>{const t=e.name||"s";return{enterActive:(e.enterActiveClass||t+"-enter-active").split(" "),enter:(e.enterClass||t+"-enter").split(" "),enterTo:(e.enterToClass||t+"-enter-to").split(" "),exitActive:(e.exitActiveClass||t+"-exit-active").split(" "),exit:(e.exitClass||t+"-exit").split(" "),exitTo:(e.exitToClass||t+"-exit-to").split(" "),move:(e.moveClass||t+"-move").split(" ")}})}function ni(e){requestAnimationFrame(()=>requestAnimationFrame(e))}function Ea(e,t,n,r){const{onBeforeEnter:o,onEnter:s,onAfterEnter:a}=t;o?.(n),n.classList.add(...e.enter),n.classList.add(...e.enterActive),queueMicrotask(()=>{if(!n.parentNode)return r?.();s?.(n,()=>l())}),ni(()=>{n.classList.remove(...e.enter),n.classList.add(...e.enterTo),(!s||s.length<2)&&(n.addEventListener("transitionend",l),n.addEventListener("animationend",l))});function l(i){(!i||i.target===n)&&(n.removeEventListener("transitionend",l),n.removeEventListener("animationend",l),n.classList.remove(...e.enterActive),n.classList.remove(...e.enterTo),a?.(n))}}function Ma(e,t,n,r){const{onBeforeExit:o,onExit:s,onAfterExit:a}=t;if(!n.parentNode)return r?.();o?.(n),n.classList.add(...e.exit),n.classList.add(...e.exitActive),s?.(n,()=>l()),ni(()=>{n.classList.remove(...e.exit),n.classList.add(...e.exitTo),(!s||s.length<2)&&(n.addEventListener("transitionend",l),n.addEventListener("animationend",l))});function l(i){(!i||i.target===n)&&(r?.(),n.removeEventListener("transitionend",l),n.removeEventListener("animationend",l),n.classList.remove(...e.exitActive),n.classList.remove(...e.exitTo),a?.(n))}}var oo=e=>{const t=ka(e);return Ca(Sa(()=>e.children).toArray,{appear:e.appear,onChange({added:n,removed:r,finishRemoved:o,list:s}){const a=t();for(const i of n)Ea(a,e,i);const l=[];for(const i of s)i.isConnected&&(i instanceof HTMLElement||i instanceof SVGElement)&&l.push({el:i,rect:i.getBoundingClientRect()});queueMicrotask(()=>{const i=[];for(const{el:u,rect:g}of l)if(u.isConnected){const c=u.getBoundingClientRect(),d=g.left-c.left,f=g.top-c.top;(d||f)&&(u.style.transform=`translate(${d}px, ${f}px)`,u.style.transitionDuration="0s",i.push(u))}document.body.offsetHeight;for(const u of i){let g=function(c){(c.target===u||/transform$/.test(c.propertyName))&&(u.removeEventListener("transitionend",g),u.classList.remove(...a.move))};u.classList.add(...a.move),u.style.transform=u.style.transitionDuration="",u.addEventListener("transitionend",g)}});for(const i of r)Ma(a,e,i,()=>o([i]))}})},Un=Symbol("fallback");function io(e){for(const t of e)t.dispose()}function Da(e,t,n,r={}){const o=new Map;return U(()=>io(o.values())),()=>{const a=e()||[];return a[Wo],Nt(()=>{if(!a.length)return io(o.values()),o.clear(),r.fallback?[Wr(c=>(o.set(Un,{dispose:c}),r.fallback()))]:[];const l=new Array(a.length),i=o.get(Un);if(!o.size||i){i?.dispose(),o.delete(Un);for(let g=0;g<a.length;g++){const c=a[g],d=t(c,g);s(l,c,g,d)}return l}const u=new Set(o.keys());for(let g=0;g<a.length;g++){const c=a[g],d=t(c,g);u.delete(d);const f=o.get(d);f?(l[g]=f.mapped,f.setIndex?.(g),f.setItem(()=>c)):s(l,c,g,d)}for(const g of u)o.get(g)?.dispose(),o.delete(g);return l})};function s(a,l,i,u){Wr(g=>{const[c,d]=z(l),f={setItem:d,dispose:g};if(n.length>1){const[h,y]=z(i);f.setIndex=y,f.mapped=n(c,h)}else f.mapped=n(c);o.set(u,f),a[i]=f.mapped})}}function En(e){const{by:t}=e;return q(Da(()=>e.each,typeof t=="function"?t:n=>n[t],e.children,"fallback"in e?{fallback:()=>e.fallback}:void 0))}function Aa(e,t,n,r){return e.addEventListener(t,n,r),Ys(e.removeEventListener.bind(e,t,n,r))}function Ta(e,t,n,r){const o=()=>{Jn(M(e)).forEach(s=>{s&&Jn(M(t)).forEach(a=>Aa(s,a,n,r))})};typeof e=="function"?B(o):G(o)}function Fa(e,t){const n=new ResizeObserver(e);return U(n.disconnect.bind(n)),{observe:r=>n.observe(r,t),unobserve:n.unobserve.bind(n)}}function Oa(e,t,n){const r=new WeakMap,{observe:o,unobserve:s}=Fa(a=>{for(const l of a){const{contentRect:i,target:u}=l,g=Math.round(i.width),c=Math.round(i.height),d=r.get(u);(!d||d.width!==g||d.height!==c)&&(t(i,u,l),r.set(u,{width:g,height:c}))}},n);B(a=>{const l=js(Jn(M(e)));return Xs(l,a,o,s),l},[])}var Ia=/((?:--)?(?:\w+-?)+)\s*:\s*([^;]*)/g;function so(e){const t={};let n;for(;n=Ia.exec(e);)t[n[1]]=n[2];return t}function In(e,t){if(typeof e=="string"){if(typeof t=="string")return`${e};${t}`;e=so(e)}else typeof t=="string"&&(t=so(t));return{...e,...t}}function La(e,t,n=-1){return n in e?[...e.slice(0,n),t,...e.slice(n)]:[...e,t]}function nr(e,t){const n=[...e],r=n.indexOf(t);return r!==-1&&n.splice(r,1),n}function Pa(e){return typeof e=="number"}function Rt(e){return Object.prototype.toString.call(e)==="[object String]"}function qa(e){return typeof e=="function"}function fn(e){return t=>`${e()}-${t}`}function Ke(e,t){return e?e===t||e.contains(t):!1}function sn(e,t=!1){const{activeElement:n}=Ze(e);if(!n?.nodeName)return null;if(ri(n)&&n.contentDocument)return sn(n.contentDocument.body,t);if(t){const r=n.getAttribute("aria-activedescendant");if(r){const o=Ze(n).getElementById(r);if(o)return o}}return n}function _a(e){return Ze(e).defaultView||window}function Ze(e){return e?e.ownerDocument||e:document}function ri(e){return e.tagName==="IFRAME"}var vr=(e=>(e.Escape="Escape",e.Enter="Enter",e.Tab="Tab",e.Space=" ",e.ArrowDown="ArrowDown",e.ArrowLeft="ArrowLeft",e.ArrowRight="ArrowRight",e.ArrowUp="ArrowUp",e.End="End",e.Home="Home",e.PageDown="PageDown",e.PageUp="PageUp",e))(vr||{});function mr(e){return typeof window<"u"&&window.navigator!=null?e.test(window.navigator.userAgentData?.platform||window.navigator.platform):!1}function Ln(){return mr(/^Mac/i)}function Ra(){return mr(/^iPhone/i)}function za(){return mr(/^iPad/i)||Ln()&&navigator.maxTouchPoints>1}function Ka(){return Ra()||za()}function Ba(){return Ln()||Ka()}function de(e,t){return t&&(qa(t)?t(e):t[0](t[1],e)),e?.defaultPrevented}function be(e){return t=>{for(const n of e)de(t,n)}}function Na(e){return Ln()?e.metaKey&&!e.ctrlKey:e.ctrlKey&&!e.metaKey}function ke(e){if(e)if(Ha())e.focus({preventScroll:!0});else{const t=Ga(e);e.focus(),Ua(t)}}var wn=null;function Ha(){if(wn==null){wn=!1;try{document.createElement("div").focus({get preventScroll(){return wn=!0,!0}})}catch{}}return wn}function Ga(e){let t=e.parentNode;const n=[],r=document.scrollingElement||document.documentElement;for(;t instanceof HTMLElement&&t!==r;)(t.offsetHeight<t.scrollHeight||t.offsetWidth<t.scrollWidth)&&n.push({element:t,scrollTop:t.scrollTop,scrollLeft:t.scrollLeft}),t=t.parentNode;return r instanceof HTMLElement&&n.push({element:r,scrollTop:r.scrollTop,scrollLeft:r.scrollLeft}),n}function Ua(e){for(const{element:t,scrollTop:n,scrollLeft:r}of e)t.scrollTop=n,t.scrollLeft=r}var oi=["input:not([type='hidden']):not([disabled])","select:not([disabled])","textarea:not([disabled])","button:not([disabled])","a[href]","area[href]","[tabindex]","iframe","object","embed","audio[controls]","video[controls]","[contenteditable]:not([contenteditable='false'])"],Va=[...oi,'[tabindex]:not([tabindex="-1"]):not([disabled])'],pr=`${oi.join(":not([hidden]),")},[tabindex]:not([disabled]):not([hidden])`,ja=Va.join(':not([hidden]):not([tabindex="-1"]),');function ii(e,t){const r=Array.from(e.querySelectorAll(pr)).filter(ao);return t&&ao(e)&&r.unshift(e),r.forEach((o,s)=>{if(ri(o)&&o.contentDocument){const a=o.contentDocument.body,l=ii(a,!1);r.splice(s,1,...l)}}),r}function ao(e){return si(e)&&!Wa(e)}function si(e){return e.matches(pr)&&yr(e)}function Wa(e){return Number.parseInt(e.getAttribute("tabindex")||"0",10)<0}function yr(e,t){return e.nodeName!=="#comment"&&Qa(e)&&Ya(e,t)&&(!e.parentElement||yr(e.parentElement,e))}function Qa(e){if(!(e instanceof HTMLElement)&&!(e instanceof SVGElement))return!1;const{display:t,visibility:n}=e.style;let r=t!=="none"&&n!=="hidden"&&n!=="collapse";if(r){if(!e.ownerDocument.defaultView)return r;const{getComputedStyle:o}=e.ownerDocument.defaultView,{display:s,visibility:a}=o(e);r=s!=="none"&&a!=="hidden"&&a!=="collapse"}return r}function Ya(e,t){return!e.hasAttribute("hidden")&&(e.nodeName==="DETAILS"&&t&&t.nodeName!=="SUMMARY"?e.hasAttribute("open"):!0)}function Xa(e,t,n){const r=t?.tabbable?ja:pr,o=document.createTreeWalker(e,NodeFilter.SHOW_ELEMENT,{acceptNode(s){return t?.from?.contains(s)?NodeFilter.FILTER_REJECT:s.matches(r)&&yr(s)&&(!t?.accept||t.accept(s))?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP}});return t?.from&&(o.currentNode=t.from),o}function lo(e){let t=e;for(;t&&!Za(t);)t=t.parentElement;return t||document.scrollingElement||document.documentElement}function Za(e){const t=window.getComputedStyle(e);return/(auto|scroll)/.test(t.overflow+t.overflowX+t.overflowY)}function Ja(){}function el(e,t){const[n,r]=e;let o=!1;const s=t.length;for(let a=s,l=0,i=a-1;l<a;i=l++){const[u,g]=t[l],[c,d]=t[i],[,f]=t[i===0?a-1:i-1]||[0,0],h=(g-d)*(n-u)-(u-c)*(r-g);if(d<g){if(r>=d&&r<g){if(h===0)return!0;h>0&&(r===d?r>f&&(o=!o):o=!o)}}else if(g<d){if(r>g&&r<=d){if(h===0)return!0;h<0&&(r===d?r<f&&(o=!o):o=!o)}}else if(r===g&&(n>=c&&n<=u||n>=u&&n<=c))return!0}return o}function Q(e,t){return j(e,t)}var tn=new Map,co=new Set;function uo(){if(typeof window>"u")return;const e=n=>{if(!n.target)return;let r=tn.get(n.target);r||(r=new Set,tn.set(n.target,r),n.target.addEventListener("transitioncancel",t)),r.add(n.propertyName)},t=n=>{if(!n.target)return;const r=tn.get(n.target);if(r&&(r.delete(n.propertyName),r.size===0&&(n.target.removeEventListener("transitioncancel",t),tn.delete(n.target)),tn.size===0)){for(const o of co)o();co.clear()}};document.body.addEventListener("transitionrun",e),document.body.addEventListener("transitionend",t)}typeof document<"u"&&(document.readyState!=="loading"?uo():document.addEventListener("DOMContentLoaded",uo));function rr(e,t){const n=fo(e,t,"left"),r=fo(e,t,"top"),o=t.offsetWidth,s=t.offsetHeight;let a=e.scrollLeft,l=e.scrollTop;const i=a+e.offsetWidth,u=l+e.offsetHeight;n<=a?a=n:n+o>i&&(a+=n+o-i),r<=l?l=r:r+s>u&&(l+=r+s-u),e.scrollLeft=a,e.scrollTop=l}function fo(e,t,n){const r=n==="left"?"offsetLeft":"offsetTop";let o=0;for(;t.offsetParent&&(o+=t[r],t.offsetParent!==e);){if(t.offsetParent.contains(e)){o-=e[r];break}t=t.offsetParent}return o}function tl(e,t){if(document.contains(e)){const n=document.scrollingElement||document.documentElement;if(window.getComputedStyle(n).overflow==="hidden"){let o=lo(e);for(;e&&o&&e!==n&&o!==n;)rr(o,e),e=o,o=lo(e)}else{const{left:o,top:s}=e.getBoundingClientRect();e?.scrollIntoView?.({block:"nearest"});const{left:a,top:l}=e.getBoundingClientRect();(Math.abs(o-a)>1||Math.abs(s-l)>1)&&e.scrollIntoView?.({block:"nearest"})}}}var ai={border:"0",clip:"rect(0 0 0 0)","clip-path":"inset(50%)",height:"1px",margin:"0 -1px -1px 0",overflow:"hidden",padding:"0",position:"absolute",width:"1px","white-space":"nowrap"};function Pn(e,t){const[n,r]=z(go(t?.()));return B(()=>{r(e()?.tagName.toLowerCase()||go(t?.()))}),n}function go(e){return Rt(e)?e:void 0}function fe(e){const[t,n]=ee(e,["as"]);if(!t.as)throw new Error("[kobalte]: Polymorphic is missing the required `as` prop.");return m(Hs,j(n,{get component(){return t.as}}))}var nl=Object.defineProperty,qn=(e,t)=>{for(var n in t)nl(e,n,{get:t[n],enumerable:!0})},rl={};qn(rl,{Button:()=>sl,Root:()=>br});var ol=["button","color","file","image","reset","submit"];function il(e){const t=e.tagName.toLowerCase();return t==="button"?!0:t==="input"&&e.type?ol.indexOf(e.type)!==-1:!1}function br(e){let t;const n=Q({type:"button"},e),[r,o]=ee(n,["ref","type","disabled"]),s=Pn(()=>t,()=>"button"),a=q(()=>{const u=s();return u==null?!1:il({tagName:u,type:r.type})}),l=q(()=>s()==="input"),i=q(()=>s()==="a"&&t?.getAttribute("href")!=null);return m(fe,j({as:"button",ref(u){const g=De(c=>t=c,r.ref);typeof g=="function"&&g(u)},get type(){return a()||l()?r.type:void 0},get role(){return!a()&&!i()?"button":void 0},get tabIndex(){return!a()&&!i()&&!r.disabled?0:void 0},get disabled(){return a()||l()?r.disabled:void 0},get"aria-disabled"(){return!a()&&!l()&&r.disabled?!0:void 0},get"data-disabled"(){return r.disabled?"":void 0}},o))}var sl=br;function gn(e){const[t,n]=z(e.defaultValue?.()),r=q(()=>e.value?.()!==void 0),o=q(()=>r()?e.value?.():t());return[o,a=>{Nt(()=>{const l=Qs(a,o());return Object.is(l,o())||(r()||n(l),e.onChange?.(l)),l})}]}function li(e){const[t,n]=gn(e);return[()=>t()??!1,n]}function al(e){const[t,n]=gn(e);return[()=>t()??[],n]}function ll(e={}){const[t,n]=li({value:()=>M(e.isSelected),defaultValue:()=>!!M(e.defaultIsSelected),onChange:s=>e.onSelectedChange?.(s)});return{isSelected:t,setIsSelected:s=>{!M(e.isReadOnly)&&!M(e.isDisabled)&&n(s)},toggle:()=>{!M(e.isReadOnly)&&!M(e.isDisabled)&&n(!t())}}}function ci(e){let t=e.startIndex??0;const n=e.startLevel??0,r=[],o=i=>{if(i==null)return"";const u=e.getKey??"key",g=Rt(u)?i[u]:u(i);return g!=null?String(g):""},s=i=>{if(i==null)return"";const u=e.getTextValue??"textValue",g=Rt(u)?i[u]:u(i);return g!=null?String(g):""},a=i=>{if(i==null)return!1;const u=e.getDisabled??"disabled";return(Rt(u)?i[u]:u(i))??!1},l=i=>{if(i!=null)return Rt(e.getSectionChildren)?i[e.getSectionChildren]:e.getSectionChildren?.(i)};for(const i of e.dataSource){if(Rt(i)||Pa(i)){r.push({type:"item",rawValue:i,key:String(i),textValue:String(i),disabled:a(i),level:n,index:t}),t++;continue}if(l(i)!=null){r.push({type:"section",rawValue:i,key:"",textValue:"",disabled:!1,level:n,index:t}),t++;const u=l(i)??[];if(u.length>0){const g=ci({dataSource:u,getKey:e.getKey,getTextValue:e.getTextValue,getDisabled:e.getDisabled,getSectionChildren:e.getSectionChildren,startIndex:t,startLevel:n+1});r.push(...g),t+=g.length}}else r.push({type:"item",rawValue:i,key:o(i),textValue:s(i),disabled:a(i),level:n,index:t}),t++}return r}function cl(e,t=[]){return q(()=>{const n=ci({dataSource:M(e.dataSource),getKey:M(e.getKey),getTextValue:M(e.getTextValue),getDisabled:M(e.getDisabled),getSectionChildren:M(e.getSectionChildren)});for(let r=0;r<t.length;r++)t[r]();return e.factory(n)})}var ul=new Set(["Avst","Arab","Armi","Syrc","Samr","Mand","Thaa","Mend","Nkoo","Adlm","Rohg","Hebr"]),dl=new Set(["ae","ar","arc","bcc","bqi","ckb","dv","fa","glk","he","ku","mzn","nqo","pnb","ps","sd","ug","ur","yi"]);function fl(e){if(Intl.Locale){const n=new Intl.Locale(e).maximize().script??"";return ul.has(n)}const t=e.split("-")[0];return dl.has(t)}function gl(e){return fl(e)?"rtl":"ltr"}function ui(){let e=typeof navigator<"u"&&(navigator.language||navigator.userLanguage)||"en-US";return{locale:e,direction:gl(e)}}var or=ui(),an=new Set;function ho(){or=ui();for(const e of an)e(or)}function hl(){const[e,t]=z(or),n=q(()=>e());return $t(()=>{an.size===0&&window.addEventListener("languagechange",ho),an.add(t),U(()=>{an.delete(t),an.size===0&&window.removeEventListener("languagechange",ho)})}),{locale:()=>n().locale,direction:()=>n().direction}}var vl=we();function Et(){const e=hl();return xe(vl)||e}var Vn=new Map;function ml(e){const{locale:t}=Et(),n=q(()=>t()+(e?Object.entries(e).sort((r,o)=>r[0]<o[0]?-1:1).join():""));return q(()=>{const r=n();let o;return Vn.has(r)&&(o=Vn.get(r)),o||(o=new Intl.Collator(t(),e),Vn.set(r,o)),o})}var at=class di extends Set{anchorKey;currentKey;constructor(t,n,r){super(t),t instanceof di?(this.anchorKey=n||t.anchorKey,this.currentKey=r||t.currentKey):(this.anchorKey=n,this.currentKey=r)}};function pl(e){const[t,n]=gn(e);return[()=>t()??new at,n]}function fi(e){return Ba()?e.altKey:e.ctrlKey}function zt(e){return Ln()?e.metaKey:e.ctrlKey}function vo(e){return new at(e)}function yl(e,t){if(e.size!==t.size)return!1;for(const n of e)if(!t.has(n))return!1;return!0}function bl(e){const t=Q({selectionMode:"none",selectionBehavior:"toggle"},e),[n,r]=z(!1),[o,s]=z(),a=q(()=>{const y=M(t.selectedKeys);return y!=null?vo(y):y}),l=q(()=>{const y=M(t.defaultSelectedKeys);return y!=null?vo(y):new at}),[i,u]=pl({value:a,defaultValue:l,onChange:y=>t.onSelectionChange?.(y)}),[g,c]=z(M(t.selectionBehavior)),d=()=>M(t.selectionMode),f=()=>M(t.disallowEmptySelection)??!1,h=y=>{(M(t.allowDuplicateSelectionEvents)||!yl(y,i()))&&u(y)};return B(()=>{const y=i();M(t.selectionBehavior)==="replace"&&g()==="toggle"&&typeof y=="object"&&y.size===0&&c("replace")}),B(()=>{c(M(t.selectionBehavior)??"toggle")}),{selectionMode:d,disallowEmptySelection:f,selectionBehavior:g,setSelectionBehavior:c,isFocused:n,setFocused:r,focusedKey:o,setFocusedKey:s,selectedKeys:i,setSelectedKeys:h}}function wl(e){const[t,n]=z(""),[r,o]=z(-1);return{typeSelectHandlers:{onKeyDown:a=>{if(M(e.isDisabled))return;const l=M(e.keyboardDelegate),i=M(e.selectionManager);if(!l.getKeyForSearch)return;const u=xl(a.key);if(!u||a.ctrlKey||a.metaKey)return;u===" "&&t().trim().length>0&&(a.preventDefault(),a.stopPropagation());let g=n(d=>d+u),c=l.getKeyForSearch(g,i.focusedKey())??l.getKeyForSearch(g);c==null&&$l(g)&&(g=g[0],c=l.getKeyForSearch(g,i.focusedKey())??l.getKeyForSearch(g)),c!=null&&(i.setFocusedKey(c),e.onTypeSelect?.(c)),clearTimeout(r()),o(window.setTimeout(()=>n(""),500))}}}}function xl(e){return e.length===1||!/^[A-Z]/i.test(e)?e:""}function $l(e){return e.split("").every(t=>t===e[0])}function Cl(e,t,n){const o=j({selectOnFocus:()=>M(e.selectionManager).selectionBehavior()==="replace"},e),s=()=>t(),{direction:a}=Et();let l={top:0,left:0};Ta(()=>M(o.isVirtualized)?void 0:s(),"scroll",()=>{const v=s();v&&(l={top:v.scrollTop,left:v.scrollLeft})});const{typeSelectHandlers:i}=wl({isDisabled:()=>M(o.disallowTypeAhead),keyboardDelegate:()=>M(o.keyboardDelegate),selectionManager:()=>M(o.selectionManager)}),u=()=>M(o.orientation)??"vertical",g=v=>{de(v,i.onKeyDown),v.altKey&&v.key==="Tab"&&v.preventDefault();const p=t();if(!p?.contains(v.target))return;const w=M(o.selectionManager),b=M(o.selectOnFocus),x=T=>{T!=null&&(w.setFocusedKey(T),v.shiftKey&&w.selectionMode()==="multiple"?w.extendSelection(T):b&&!fi(v)&&w.replaceSelection(T))},$=M(o.keyboardDelegate),I=M(o.shouldFocusWrap),k=w.focusedKey();switch(v.key){case(u()==="vertical"?"ArrowDown":"ArrowRight"):{if($.getKeyBelow){v.preventDefault();let T;k!=null?T=$.getKeyBelow(k):T=$.getFirstKey?.(),T==null&&I&&(T=$.getFirstKey?.(k)),x(T)}break}case(u()==="vertical"?"ArrowUp":"ArrowLeft"):{if($.getKeyAbove){v.preventDefault();let T;k!=null?T=$.getKeyAbove(k):T=$.getLastKey?.(),T==null&&I&&(T=$.getLastKey?.(k)),x(T)}break}case(u()==="vertical"?"ArrowLeft":"ArrowUp"):{if($.getKeyLeftOf){v.preventDefault();const T=a()==="rtl";let E;k!=null?E=$.getKeyLeftOf(k):E=T?$.getFirstKey?.():$.getLastKey?.(),x(E)}break}case(u()==="vertical"?"ArrowRight":"ArrowDown"):{if($.getKeyRightOf){v.preventDefault();const T=a()==="rtl";let E;k!=null?E=$.getKeyRightOf(k):E=T?$.getLastKey?.():$.getFirstKey?.(),x(E)}break}case"Home":if($.getFirstKey){v.preventDefault();const T=$.getFirstKey(k,zt(v));T!=null&&(w.setFocusedKey(T),zt(v)&&v.shiftKey&&w.selectionMode()==="multiple"?w.extendSelection(T):b&&w.replaceSelection(T))}break;case"End":if($.getLastKey){v.preventDefault();const T=$.getLastKey(k,zt(v));T!=null&&(w.setFocusedKey(T),zt(v)&&v.shiftKey&&w.selectionMode()==="multiple"?w.extendSelection(T):b&&w.replaceSelection(T))}break;case"PageDown":if($.getKeyPageBelow&&k!=null){v.preventDefault();const T=$.getKeyPageBelow(k);x(T)}break;case"PageUp":if($.getKeyPageAbove&&k!=null){v.preventDefault();const T=$.getKeyPageAbove(k);x(T)}break;case"a":zt(v)&&w.selectionMode()==="multiple"&&M(o.disallowSelectAll)!==!0&&(v.preventDefault(),w.selectAll());break;case"Escape":v.defaultPrevented||(v.preventDefault(),M(o.disallowEmptySelection)||w.clearSelection());break;case"Tab":if(!M(o.allowsTabNavigation)){if(v.shiftKey)p.focus();else{const T=Xa(p,{tabbable:!0});let E,F;do F=T.lastChild(),F&&(E=F);while(F);E&&!E.contains(document.activeElement)&&ke(E)}break}}},c=v=>{const p=M(o.selectionManager),w=M(o.keyboardDelegate),b=M(o.selectOnFocus);if(p.isFocused()){v.currentTarget.contains(v.target)||p.setFocused(!1);return}if(v.currentTarget.contains(v.target)){if(p.setFocused(!0),p.focusedKey()==null){const x=I=>{I!=null&&(p.setFocusedKey(I),b&&p.replaceSelection(I))},$=v.relatedTarget;$&&v.currentTarget.compareDocumentPosition($)&Node.DOCUMENT_POSITION_FOLLOWING?x(p.lastSelectedKey()??w.getLastKey?.()):x(p.firstSelectedKey()??w.getFirstKey?.())}else if(!M(o.isVirtualized)){const x=s();if(x){x.scrollTop=l.top,x.scrollLeft=l.left;const $=x.querySelector(`[data-key="${p.focusedKey()}"]`);$&&(ke($),rr(x,$))}}}},d=v=>{const p=M(o.selectionManager);v.currentTarget.contains(v.relatedTarget)||p.setFocused(!1)},f=v=>{s()===v.target&&v.preventDefault()},h=()=>{const v=M(o.autoFocus);if(!v)return;const p=M(o.selectionManager),w=M(o.keyboardDelegate);let b;v==="first"&&(b=w.getFirstKey?.()),v==="last"&&(b=w.getLastKey?.());const x=p.selectedKeys();x.size&&(b=x.values().next().value),p.setFocused(!0),p.setFocusedKey(b);const $=t();$&&b==null&&!M(o.shouldUseVirtualFocus)&&ke($)};return $t(()=>{o.deferAutoFocus?setTimeout(h,0):h()}),B(dt([s,()=>M(o.isVirtualized),()=>M(o.selectionManager).focusedKey()],v=>{const[p,w,b]=v;if(w)b&&o.scrollToKey?.(b);else if(b&&p){const x=p.querySelector(`[data-key="${b}"]`);x&&rr(p,x)}})),{tabIndex:q(()=>{if(!M(o.shouldUseVirtualFocus))return M(o.selectionManager).focusedKey()==null?0:-1}),onKeyDown:g,onMouseDown:f,onFocusIn:c,onFocusOut:d}}function gi(e,t){const n=()=>M(e.selectionManager),r=()=>M(e.key),o=()=>M(e.shouldUseVirtualFocus),s=w=>{n().selectionMode()!=="none"&&(n().selectionMode()==="single"?n().isSelected(r())&&!n().disallowEmptySelection()?n().toggleSelection(r()):n().replaceSelection(r()):w?.shiftKey?n().extendSelection(r()):n().selectionBehavior()==="toggle"||zt(w)||"pointerType"in w&&w.pointerType==="touch"?n().toggleSelection(r()):n().replaceSelection(r()))},a=()=>n().isSelected(r()),l=()=>M(e.disabled)||n().isDisabled(r()),i=()=>!l()&&n().canSelectItem(r());let u=null;const g=w=>{i()&&(u=w.pointerType,w.pointerType==="mouse"&&w.button===0&&!M(e.shouldSelectOnPressUp)&&s(w))},c=w=>{i()&&w.pointerType==="mouse"&&w.button===0&&M(e.shouldSelectOnPressUp)&&M(e.allowsDifferentPressOrigin)&&s(w)},d=w=>{i()&&(M(e.shouldSelectOnPressUp)&&!M(e.allowsDifferentPressOrigin)||u!=="mouse")&&s(w)},f=w=>{!i()||!["Enter"," "].includes(w.key)||(fi(w)?n().toggleSelection(r()):s(w))},h=w=>{l()&&w.preventDefault()},y=w=>{const b=t();o()||l()||!b||w.target===b&&n().setFocusedKey(r())},v=q(()=>{if(!(o()||l()))return r()===n().focusedKey()?0:-1}),p=q(()=>M(e.virtualized)?void 0:r());return B(dt([t,r,o,()=>n().focusedKey(),()=>n().isFocused()],([w,b,x,$,I])=>{w&&b===$&&I&&!x&&document.activeElement!==w&&(e.focus?e.focus():ke(w))})),{isSelected:a,isDisabled:l,allowsSelection:i,tabIndex:v,dataKey:p,onPointerDown:g,onPointerUp:c,onClick:d,onKeyDown:f,onMouseDown:h,onFocus:y}}var Sl=class{collection;state;constructor(e,t){this.collection=e,this.state=t}selectionMode(){return this.state.selectionMode()}disallowEmptySelection(){return this.state.disallowEmptySelection()}selectionBehavior(){return this.state.selectionBehavior()}setSelectionBehavior(e){this.state.setSelectionBehavior(e)}isFocused(){return this.state.isFocused()}setFocused(e){this.state.setFocused(e)}focusedKey(){return this.state.focusedKey()}setFocusedKey(e){(e==null||this.collection().getItem(e))&&this.state.setFocusedKey(e)}selectedKeys(){return this.state.selectedKeys()}isSelected(e){if(this.state.selectionMode()==="none")return!1;const t=this.getKey(e);return t==null?!1:this.state.selectedKeys().has(t)}isEmpty(){return this.state.selectedKeys().size===0}isSelectAll(){if(this.isEmpty())return!1;const e=this.state.selectedKeys();return this.getAllSelectableKeys().every(t=>e.has(t))}firstSelectedKey(){let e;for(const t of this.state.selectedKeys()){const n=this.collection().getItem(t),r=n?.index!=null&&e?.index!=null&&n.index<e.index;(!e||r)&&(e=n)}return e?.key}lastSelectedKey(){let e;for(const t of this.state.selectedKeys()){const n=this.collection().getItem(t),r=n?.index!=null&&e?.index!=null&&n.index>e.index;(!e||r)&&(e=n)}return e?.key}extendSelection(e){if(this.selectionMode()==="none")return;if(this.selectionMode()==="single"){this.replaceSelection(e);return}const t=this.getKey(e);if(t==null)return;const n=this.state.selectedKeys(),r=n.anchorKey||t,o=new at(n,r,t);for(const s of this.getKeyRange(r,n.currentKey||t))o.delete(s);for(const s of this.getKeyRange(t,r))this.canSelectItem(s)&&o.add(s);this.state.setSelectedKeys(o)}getKeyRange(e,t){const n=this.collection().getItem(e),r=this.collection().getItem(t);return n&&r?n.index!=null&&r.index!=null&&n.index<=r.index?this.getKeyRangeInternal(e,t):this.getKeyRangeInternal(t,e):[]}getKeyRangeInternal(e,t){const n=[];let r=e;for(;r!=null;){const o=this.collection().getItem(r);if(o&&o.type==="item"&&n.push(r),r===t)return n;r=this.collection().getKeyAfter(r)}return[]}getKey(e){const t=this.collection().getItem(e);return t?!t||t.type!=="item"?null:t.key:e}toggleSelection(e){if(this.selectionMode()==="none")return;if(this.selectionMode()==="single"&&!this.isSelected(e)){this.replaceSelection(e);return}const t=this.getKey(e);if(t==null)return;const n=new at(this.state.selectedKeys());n.has(t)?n.delete(t):this.canSelectItem(t)&&(n.add(t),n.anchorKey=t,n.currentKey=t),!(this.disallowEmptySelection()&&n.size===0)&&this.state.setSelectedKeys(n)}replaceSelection(e){if(this.selectionMode()==="none")return;const t=this.getKey(e);if(t==null)return;const n=this.canSelectItem(t)?new at([t],t,t):new at;this.state.setSelectedKeys(n)}setSelectedKeys(e){if(this.selectionMode()==="none")return;const t=new at;for(const n of e){const r=this.getKey(n);if(r!=null&&(t.add(r),this.selectionMode()==="single"))break}this.state.setSelectedKeys(t)}selectAll(){this.selectionMode()==="multiple"&&this.state.setSelectedKeys(new Set(this.getAllSelectableKeys()))}clearSelection(){const e=this.state.selectedKeys();!this.disallowEmptySelection()&&e.size>0&&this.state.setSelectedKeys(new at)}toggleSelectAll(){this.isSelectAll()?this.clearSelection():this.selectAll()}select(e,t){this.selectionMode()!=="none"&&(this.selectionMode()==="single"?this.isSelected(e)&&!this.disallowEmptySelection()?this.toggleSelection(e):this.replaceSelection(e):this.selectionBehavior()==="toggle"||t&&t.pointerType==="touch"?this.toggleSelection(e):this.replaceSelection(e))}isSelectionEqual(e){if(e===this.state.selectedKeys())return!0;const t=this.selectedKeys();if(e.size!==t.size)return!1;for(const n of e)if(!t.has(n))return!1;for(const n of t)if(!e.has(n))return!1;return!0}canSelectItem(e){if(this.state.selectionMode()==="none")return!1;const t=this.collection().getItem(e);return t!=null&&!t.disabled}isDisabled(e){const t=this.collection().getItem(e);return!t||t.disabled}getAllSelectableKeys(){const e=[];return(n=>{for(;n!=null;){if(this.canSelectItem(n)){const r=this.collection().getItem(n);if(!r)continue;r.type==="item"&&e.push(n)}n=this.collection().getKeyAfter(n)}})(this.collection().getFirstKey()),e}},mo=class{keyMap=new Map;iterable;firstKey;lastKey;constructor(e){this.iterable=e;for(const r of e)this.keyMap.set(r.key,r);if(this.keyMap.size===0)return;let t,n=0;for(const[r,o]of this.keyMap)t?(t.nextKey=r,o.prevKey=t.key):(this.firstKey=r,o.prevKey=void 0),o.type==="item"&&(o.index=n++),t=o,t.nextKey=void 0;this.lastKey=t.key}*[Symbol.iterator](){yield*this.iterable}getSize(){return this.keyMap.size}getKeys(){return this.keyMap.keys()}getKeyBefore(e){return this.keyMap.get(e)?.prevKey}getKeyAfter(e){return this.keyMap.get(e)?.nextKey}getFirstKey(){return this.firstKey}getLastKey(){return this.lastKey}getItem(e){return this.keyMap.get(e)}at(e){const t=[...this.getKeys()];return this.getItem(t[e])}};function kl(e){const t=bl(e),r=cl({dataSource:()=>M(e.dataSource),getKey:()=>M(e.getKey),getTextValue:()=>M(e.getTextValue),getDisabled:()=>M(e.getDisabled),getSectionChildren:()=>M(e.getSectionChildren),factory:s=>e.filter?new mo(e.filter(s)):new mo(s)},[()=>e.filter]),o=new Sl(r,t);return Gs(()=>{const s=t.focusedKey();s!=null&&!r().getItem(s)&&t.setFocusedKey(void 0)}),{collection:r,selectionManager:()=>o}}var hi=we();function vi(){return xe(hi)}function El(){const e=vi();if(e===void 0)throw new Error("[kobalte]: `useDomCollectionContext` must be used within a `DomCollectionProvider` component");return e}function mi(e,t){return!!(t.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_PRECEDING)}function Ml(e,t){const n=t.ref();if(!n)return-1;let r=e.length;if(!r)return-1;for(;r--;){const o=e[r]?.ref();if(o&&mi(o,n))return r+1}return 0}function Dl(e){const t=e.map((r,o)=>[o,r]);let n=!1;return t.sort(([r,o],[s,a])=>{const l=o.ref(),i=a.ref();return l===i||!l||!i?0:mi(l,i)?(r>s&&(n=!0),-1):(r<s&&(n=!0),1)}),n?t.map(([r,o])=>o):e}function pi(e,t){const n=Dl(e);e!==n&&t(n)}function Al(e){const t=e[0],n=e[e.length-1]?.ref();let r=t?.ref()?.parentElement;for(;r;){if(n&&r.contains(n))return r;r=r.parentElement}return Ze(r).body}function Tl(e,t){B(()=>{const n=setTimeout(()=>{pi(e(),t)});U(()=>clearTimeout(n))})}function Fl(e,t){if(typeof IntersectionObserver!="function"){Tl(e,t);return}let n=[];B(()=>{const r=()=>{const a=!!n.length;n=e(),a&&pi(e(),t)},o=Al(e()),s=new IntersectionObserver(r,{root:o});for(const a of e()){const l=a.ref();l&&s.observe(l)}U(()=>s.disconnect())})}function Ol(e={}){const[t,n]=al({value:()=>M(e.items),onChange:s=>e.onItemsChange?.(s)});Fl(t,n);const r=s=>(n(a=>{const l=Ml(a,s);return La(a,s,l)}),()=>{n(a=>{const l=a.filter(i=>i.ref()!==s.ref());return a.length===l.length?a:l})});return{DomCollectionProvider:s=>m(hi.Provider,{value:{registerItem:r},get children(){return s.children}})}}function Il(e){const t=El(),n=Q({shouldRegisterItem:!0},e);B(()=>{if(!n.shouldRegisterItem)return;const r=t.registerItem(n.getItem());U(r)})}var Ll=["top","right","bottom","left"],Ct=Math.min,Ie=Math.max,Mn=Math.round,xn=Math.floor,Xe=e=>({x:e,y:e}),Pl={left:"right",right:"left",bottom:"top",top:"bottom"};function ir(e,t,n){return Ie(e,Ct(t,n))}function It(e,t){return typeof e=="function"?e(t):e}function St(e){return e.split("-")[0]}function Vt(e){return e.split("-")[1]}function yi(e){return e==="x"?"y":"x"}function wr(e){return e==="y"?"height":"width"}function ct(e){const t=e[0];return t==="t"||t==="b"?"y":"x"}function xr(e){return yi(ct(e))}function ql(e,t,n){n===void 0&&(n=!1);const r=Vt(e),o=xr(e),s=wr(o);let a=o==="x"?r===(n?"end":"start")?"right":"left":r==="start"?"bottom":"top";return t.reference[s]>t.floating[s]&&(a=Dn(a)),[a,Dn(a)]}function _l(e){const t=Dn(e);return[sr(e),t,sr(t)]}function sr(e){return e.includes("start")?e.replace("start","end"):e.replace("end","start")}var po=["left","right"],yo=["right","left"],Rl=["top","bottom"],zl=["bottom","top"];function Kl(e,t,n){switch(e){case"top":case"bottom":return n?t?yo:po:t?po:yo;case"left":case"right":return t?Rl:zl;default:return[]}}function Bl(e,t,n,r){const o=Vt(e);let s=Kl(St(e),n==="start",r);return o&&(s=s.map(a=>a+"-"+o),t&&(s=s.concat(s.map(sr)))),s}function Dn(e){const t=St(e);return Pl[t]+e.slice(t.length)}function Nl(e){return{top:0,right:0,bottom:0,left:0,...e}}function bi(e){return typeof e!="number"?Nl(e):{top:e,right:e,bottom:e,left:e}}function An(e){const{x:t,y:n,width:r,height:o}=e;return{width:r,height:o,top:n,left:t,right:t+r,bottom:n+o,x:t,y:n}}function bo(e,t,n){let{reference:r,floating:o}=e;const s=ct(t),a=xr(t),l=wr(a),i=St(t),u=s==="y",g=r.x+r.width/2-o.width/2,c=r.y+r.height/2-o.height/2,d=r[l]/2-o[l]/2;let f;switch(i){case"top":f={x:g,y:r.y-o.height};break;case"bottom":f={x:g,y:r.y+r.height};break;case"right":f={x:r.x+r.width,y:c};break;case"left":f={x:r.x-o.width,y:c};break;default:f={x:r.x,y:r.y}}switch(Vt(t)){case"start":f[a]-=d*(n&&u?-1:1);break;case"end":f[a]+=d*(n&&u?-1:1);break}return f}async function Hl(e,t){var n;t===void 0&&(t={});const{x:r,y:o,platform:s,rects:a,elements:l,strategy:i}=e,{boundary:u="clippingAncestors",rootBoundary:g="viewport",elementContext:c="floating",altBoundary:d=!1,padding:f=0}=It(t,e),h=bi(f),v=l[d?c==="floating"?"reference":"floating":c],p=An(await s.getClippingRect({element:(n=await(s.isElement==null?void 0:s.isElement(v)))==null||n?v:v.contextElement||await(s.getDocumentElement==null?void 0:s.getDocumentElement(l.floating)),boundary:u,rootBoundary:g,strategy:i})),w=c==="floating"?{x:r,y:o,width:a.floating.width,height:a.floating.height}:a.reference,b=await(s.getOffsetParent==null?void 0:s.getOffsetParent(l.floating)),x=await(s.isElement==null?void 0:s.isElement(b))?await(s.getScale==null?void 0:s.getScale(b))||{x:1,y:1}:{x:1,y:1},$=An(s.convertOffsetParentRelativeRectToViewportRelativeRect?await s.convertOffsetParentRelativeRectToViewportRelativeRect({elements:l,rect:w,offsetParent:b,strategy:i}):w);return{top:(p.top-$.top+h.top)/x.y,bottom:($.bottom-p.bottom+h.bottom)/x.y,left:(p.left-$.left+h.left)/x.x,right:($.right-p.right+h.right)/x.x}}var Gl=50,Ul=async(e,t,n)=>{const{placement:r="bottom",strategy:o="absolute",middleware:s=[],platform:a}=n,l=a.detectOverflow?a:{...a,detectOverflow:Hl},i=await(a.isRTL==null?void 0:a.isRTL(t));let u=await a.getElementRects({reference:e,floating:t,strategy:o}),{x:g,y:c}=bo(u,r,i),d=r,f=0;const h={};for(let y=0;y<s.length;y++){const v=s[y];if(!v)continue;const{name:p,fn:w}=v,{x:b,y:x,data:$,reset:I}=await w({x:g,y:c,initialPlacement:r,placement:d,strategy:o,middlewareData:h,rects:u,platform:l,elements:{reference:e,floating:t}});g=b??g,c=x??c,h[p]={...h[p],...$},I&&f<Gl&&(f++,typeof I=="object"&&(I.placement&&(d=I.placement),I.rects&&(u=I.rects===!0?await a.getElementRects({reference:e,floating:t,strategy:o}):I.rects),{x:g,y:c}=bo(u,d,i)),y=-1)}return{x:g,y:c,placement:d,strategy:o,middlewareData:h}},Vl=e=>({name:"arrow",options:e,async fn(t){const{x:n,y:r,placement:o,rects:s,platform:a,elements:l,middlewareData:i}=t,{element:u,padding:g=0}=It(e,t)||{};if(u==null)return{};const c=bi(g),d={x:n,y:r},f=xr(o),h=wr(f),y=await a.getDimensions(u),v=f==="y",p=v?"top":"left",w=v?"bottom":"right",b=v?"clientHeight":"clientWidth",x=s.reference[h]+s.reference[f]-d[f]-s.floating[h],$=d[f]-s.reference[f],I=await(a.getOffsetParent==null?void 0:a.getOffsetParent(u));let k=I?I[b]:0;(!k||!await(a.isElement==null?void 0:a.isElement(I)))&&(k=l.floating[b]||s.floating[h]);const T=x/2-$/2,E=k/2-y[h]/2-1,F=Ct(c[p],E),H=Ct(c[w],E),N=F,X=k-y[h]-H,te=k/2-y[h]/2+T,ie=ir(N,te,X),se=!i.arrow&&Vt(o)!=null&&te!==ie&&s.reference[h]/2-(te<N?F:H)-y[h]/2<0,ne=se?te<N?te-N:te-X:0;return{[f]:d[f]+ne,data:{[f]:ie,centerOffset:te-ie-ne,...se&&{alignmentOffset:ne}},reset:se}}}),jl=function(e){return e===void 0&&(e={}),{name:"flip",options:e,async fn(t){var n,r;const{placement:o,middlewareData:s,rects:a,initialPlacement:l,platform:i,elements:u}=t,{mainAxis:g=!0,crossAxis:c=!0,fallbackPlacements:d,fallbackStrategy:f="bestFit",fallbackAxisSideDirection:h="none",flipAlignment:y=!0,...v}=It(e,t);if((n=s.arrow)!=null&&n.alignmentOffset)return{};const p=St(o),w=ct(l),b=St(l)===l,x=await(i.isRTL==null?void 0:i.isRTL(u.floating)),$=d||(b||!y?[Dn(l)]:_l(l)),I=h!=="none";!d&&I&&$.push(...Bl(l,y,h,x));const k=[l,...$],T=await i.detectOverflow(t,v),E=[];let F=((r=s.flip)==null?void 0:r.overflows)||[];if(g&&E.push(T[p]),c){const te=ql(o,a,x);E.push(T[te[0]],T[te[1]])}if(F=[...F,{placement:o,overflows:E}],!E.every(te=>te<=0)){var H,N;const te=(((H=s.flip)==null?void 0:H.index)||0)+1,ie=k[te];if(ie&&(!(c==="alignment"?w!==ct(ie):!1)||F.every(re=>ct(re.placement)===w?re.overflows[0]>0:!0)))return{data:{index:te,overflows:F},reset:{placement:ie}};let se=(N=F.filter(ne=>ne.overflows[0]<=0).sort((ne,re)=>ne.overflows[1]-re.overflows[1])[0])==null?void 0:N.placement;if(!se)switch(f){case"bestFit":{var X;const ne=(X=F.filter(re=>{if(I){const le=ct(re.placement);return le===w||le==="y"}return!0}).map(re=>[re.placement,re.overflows.filter(le=>le>0).reduce((le,me)=>le+me,0)]).sort((re,le)=>re[1]-le[1])[0])==null?void 0:X[0];ne&&(se=ne);break}case"initialPlacement":se=l;break}if(o!==se)return{reset:{placement:se}}}return{}}}};function wo(e,t){return{top:e.top-t.height,right:e.right-t.width,bottom:e.bottom-t.height,left:e.left-t.width}}function xo(e){return Ll.some(t=>e[t]>=0)}var Wl=function(e){return e===void 0&&(e={}),{name:"hide",options:e,async fn(t){const{rects:n,platform:r}=t,{strategy:o="referenceHidden",...s}=It(e,t);switch(o){case"referenceHidden":{const a=await r.detectOverflow(t,{...s,elementContext:"reference"}),l=wo(a,n.reference);return{data:{referenceHiddenOffsets:l,referenceHidden:xo(l)}}}case"escaped":{const a=await r.detectOverflow(t,{...s,altBoundary:!0}),l=wo(a,n.floating);return{data:{escapedOffsets:l,escaped:xo(l)}}}default:return{}}}}},Ql=new Set(["left","top"]);async function Yl(e,t){const{placement:n,platform:r,elements:o}=e,s=await(r.isRTL==null?void 0:r.isRTL(o.floating)),a=St(n),l=Vt(n),i=ct(n)==="y",u=Ql.has(a)?-1:1,g=s&&i?-1:1,c=It(t,e);let{mainAxis:d,crossAxis:f,alignmentAxis:h}=typeof c=="number"?{mainAxis:c,crossAxis:0,alignmentAxis:null}:{mainAxis:c.mainAxis||0,crossAxis:c.crossAxis||0,alignmentAxis:c.alignmentAxis};return l&&typeof h=="number"&&(f=l==="end"?h*-1:h),i?{x:f*g,y:d*u}:{x:d*u,y:f*g}}var Xl=function(e){return e===void 0&&(e=0),{name:"offset",options:e,async fn(t){var n,r;const{x:o,y:s,placement:a,middlewareData:l}=t,i=await Yl(t,e);return a===((n=l.offset)==null?void 0:n.placement)&&(r=l.arrow)!=null&&r.alignmentOffset?{}:{x:o+i.x,y:s+i.y,data:{...i,placement:a}}}}},Zl=function(e){return e===void 0&&(e={}),{name:"shift",options:e,async fn(t){const{x:n,y:r,placement:o,platform:s}=t,{mainAxis:a=!0,crossAxis:l=!1,limiter:i={fn:p=>{let{x:w,y:b}=p;return{x:w,y:b}}},...u}=It(e,t),g={x:n,y:r},c=await s.detectOverflow(t,u),d=ct(St(o)),f=yi(d);let h=g[f],y=g[d];if(a){const p=f==="y"?"top":"left",w=f==="y"?"bottom":"right",b=h+c[p],x=h-c[w];h=ir(b,h,x)}if(l){const p=d==="y"?"top":"left",w=d==="y"?"bottom":"right",b=y+c[p],x=y-c[w];y=ir(b,y,x)}const v=i.fn({...t,[f]:h,[d]:y});return{...v,data:{x:v.x-n,y:v.y-r,enabled:{[f]:a,[d]:l}}}}}},Jl=function(e){return e===void 0&&(e={}),{name:"size",options:e,async fn(t){var n,r;const{placement:o,rects:s,platform:a,elements:l}=t,{apply:i=()=>{},...u}=It(e,t),g=await a.detectOverflow(t,u),c=St(o),d=Vt(o),f=ct(o)==="y",{width:h,height:y}=s.floating;let v,p;c==="top"||c==="bottom"?(v=c,p=d===(await(a.isRTL==null?void 0:a.isRTL(l.floating))?"start":"end")?"left":"right"):(p=c,v=d==="end"?"top":"bottom");const w=y-g.top-g.bottom,b=h-g.left-g.right,x=Ct(y-g[v],w),$=Ct(h-g[p],b),I=!t.middlewareData.shift;let k=x,T=$;if((n=t.middlewareData.shift)!=null&&n.enabled.x&&(T=b),(r=t.middlewareData.shift)!=null&&r.enabled.y&&(k=w),I&&!d){const F=Ie(g.left,0),H=Ie(g.right,0),N=Ie(g.top,0),X=Ie(g.bottom,0);f?T=h-2*(F!==0||H!==0?F+H:Ie(g.left,g.right)):k=y-2*(N!==0||X!==0?N+X:Ie(g.top,g.bottom))}await i({...t,availableWidth:T,availableHeight:k});const E=await a.getDimensions(l.floating);return h!==E.width||y!==E.height?{reset:{rects:!0}}:{}}}};function _n(){return typeof window<"u"}function jt(e){return wi(e)?(e.nodeName||"").toLowerCase():"#document"}function Le(e){var t;return(e==null||(t=e.ownerDocument)==null?void 0:t.defaultView)||window}function Je(e){var t;return(t=(wi(e)?e.ownerDocument:e.document)||window.document)==null?void 0:t.documentElement}function wi(e){return _n()?e instanceof Node||e instanceof Le(e).Node:!1}function Ue(e){return _n()?e instanceof Element||e instanceof Le(e).Element:!1}function gt(e){return _n()?e instanceof HTMLElement||e instanceof Le(e).HTMLElement:!1}function $o(e){return!_n()||typeof ShadowRoot>"u"?!1:e instanceof ShadowRoot||e instanceof Le(e).ShadowRoot}function hn(e){const{overflow:t,overflowX:n,overflowY:r,display:o}=Ve(e);return/auto|scroll|overlay|hidden|clip/.test(t+r+n)&&o!=="inline"&&o!=="contents"}function ec(e){return/^(table|td|th)$/.test(jt(e))}function Rn(e){try{if(e.matches(":popover-open"))return!0}catch{}try{return e.matches(":modal")}catch{return!1}}var tc=/transform|translate|scale|rotate|perspective|filter/,nc=/paint|layout|strict|content/,Tt=e=>!!e&&e!=="none",jn;function $r(e){const t=Ue(e)?Ve(e):e;return Tt(t.transform)||Tt(t.translate)||Tt(t.scale)||Tt(t.rotate)||Tt(t.perspective)||!Cr()&&(Tt(t.backdropFilter)||Tt(t.filter))||tc.test(t.willChange||"")||nc.test(t.contain||"")}function rc(e){let t=kt(e);for(;gt(t)&&!Ut(t);){if($r(t))return t;if(Rn(t))return null;t=kt(t)}return null}function Cr(){return jn==null&&(jn=typeof CSS<"u"&&CSS.supports&&CSS.supports("-webkit-backdrop-filter","none")),jn}function Ut(e){return/^(html|body|#document)$/.test(jt(e))}function Ve(e){return Le(e).getComputedStyle(e)}function zn(e){return Ue(e)?{scrollLeft:e.scrollLeft,scrollTop:e.scrollTop}:{scrollLeft:e.scrollX,scrollTop:e.scrollY}}function kt(e){if(jt(e)==="html")return e;const t=e.assignedSlot||e.parentNode||$o(e)&&e.host||Je(e);return $o(t)?t.host:t}function xi(e){const t=kt(e);return Ut(t)?e.ownerDocument?e.ownerDocument.body:e.body:gt(t)&&hn(t)?t:xi(t)}function cn(e,t,n){var r;t===void 0&&(t=[]),n===void 0&&(n=!0);const o=xi(e),s=o===((r=e.ownerDocument)==null?void 0:r.body),a=Le(o);if(s){const l=ar(a);return t.concat(a,a.visualViewport||[],hn(o)?o:[],l&&n?cn(l):[])}else return t.concat(o,cn(o,[],n))}function ar(e){return e.parent&&Object.getPrototypeOf(e.parent)?e.frameElement:null}function $i(e){const t=Ve(e);let n=parseFloat(t.width)||0,r=parseFloat(t.height)||0;const o=gt(e),s=o?e.offsetWidth:n,a=o?e.offsetHeight:r,l=Mn(n)!==s||Mn(r)!==a;return l&&(n=s,r=a),{width:n,height:r,$:l}}function Sr(e){return Ue(e)?e:e.contextElement}function Ht(e){const t=Sr(e);if(!gt(t))return Xe(1);const n=t.getBoundingClientRect(),{width:r,height:o,$:s}=$i(t);let a=(s?Mn(n.width):n.width)/r,l=(s?Mn(n.height):n.height)/o;return(!a||!Number.isFinite(a))&&(a=1),(!l||!Number.isFinite(l))&&(l=1),{x:a,y:l}}var oc=Xe(0);function Ci(e){const t=Le(e);return!Cr()||!t.visualViewport?oc:{x:t.visualViewport.offsetLeft,y:t.visualViewport.offsetTop}}function ic(e,t,n){return t===void 0&&(t=!1),!n||t&&n!==Le(e)?!1:t}function Ot(e,t,n,r){t===void 0&&(t=!1),n===void 0&&(n=!1);const o=e.getBoundingClientRect(),s=Sr(e);let a=Xe(1);t&&(r?Ue(r)&&(a=Ht(r)):a=Ht(e));const l=ic(s,n,r)?Ci(s):Xe(0);let i=(o.left+l.x)/a.x,u=(o.top+l.y)/a.y,g=o.width/a.x,c=o.height/a.y;if(s){const d=Le(s),f=r&&Ue(r)?Le(r):r;let h=d,y=ar(h);for(;y&&r&&f!==h;){const v=Ht(y),p=y.getBoundingClientRect(),w=Ve(y),b=p.left+(y.clientLeft+parseFloat(w.paddingLeft))*v.x,x=p.top+(y.clientTop+parseFloat(w.paddingTop))*v.y;i*=v.x,u*=v.y,g*=v.x,c*=v.y,i+=b,u+=x,h=Le(y),y=ar(h)}}return An({width:g,height:c,x:i,y:u})}function Kn(e,t){const n=zn(e).scrollLeft;return t?t.left+n:Ot(Je(e)).left+n}function Si(e,t){const n=e.getBoundingClientRect(),r=n.left+t.scrollLeft-Kn(e,n),o=n.top+t.scrollTop;return{x:r,y:o}}function sc(e){let{elements:t,rect:n,offsetParent:r,strategy:o}=e;const s=o==="fixed",a=Je(r),l=t?Rn(t.floating):!1;if(r===a||l&&s)return n;let i={scrollLeft:0,scrollTop:0},u=Xe(1);const g=Xe(0),c=gt(r);if((c||!c&&!s)&&((jt(r)!=="body"||hn(a))&&(i=zn(r)),c)){const f=Ot(r);u=Ht(r),g.x=f.x+r.clientLeft,g.y=f.y+r.clientTop}const d=a&&!c&&!s?Si(a,i):Xe(0);return{width:n.width*u.x,height:n.height*u.y,x:n.x*u.x-i.scrollLeft*u.x+g.x+d.x,y:n.y*u.y-i.scrollTop*u.y+g.y+d.y}}function ac(e){return Array.from(e.getClientRects())}function lc(e){const t=Je(e),n=zn(e),r=e.ownerDocument.body,o=Ie(t.scrollWidth,t.clientWidth,r.scrollWidth,r.clientWidth),s=Ie(t.scrollHeight,t.clientHeight,r.scrollHeight,r.clientHeight);let a=-n.scrollLeft+Kn(e);const l=-n.scrollTop;return Ve(r).direction==="rtl"&&(a+=Ie(t.clientWidth,r.clientWidth)-o),{width:o,height:s,x:a,y:l}}var Co=25;function cc(e,t){const n=Le(e),r=Je(e),o=n.visualViewport;let s=r.clientWidth,a=r.clientHeight,l=0,i=0;if(o){s=o.width,a=o.height;const g=Cr();(!g||g&&t==="fixed")&&(l=o.offsetLeft,i=o.offsetTop)}const u=Kn(r);if(u<=0){const g=r.ownerDocument,c=g.body,d=getComputedStyle(c),f=g.compatMode==="CSS1Compat"&&parseFloat(d.marginLeft)+parseFloat(d.marginRight)||0,h=Math.abs(r.clientWidth-c.clientWidth-f);h<=Co&&(s-=h)}else u<=Co&&(s+=u);return{width:s,height:a,x:l,y:i}}function uc(e,t){const n=Ot(e,!0,t==="fixed"),r=n.top+e.clientTop,o=n.left+e.clientLeft,s=gt(e)?Ht(e):Xe(1),a=e.clientWidth*s.x,l=e.clientHeight*s.y,i=o*s.x,u=r*s.y;return{width:a,height:l,x:i,y:u}}function So(e,t,n){let r;if(t==="viewport")r=cc(e,n);else if(t==="document")r=lc(Je(e));else if(Ue(t))r=uc(t,n);else{const o=Ci(e);r={x:t.x-o.x,y:t.y-o.y,width:t.width,height:t.height}}return An(r)}function ki(e,t){const n=kt(e);return n===t||!Ue(n)||Ut(n)?!1:Ve(n).position==="fixed"||ki(n,t)}function dc(e,t){const n=t.get(e);if(n)return n;let r=cn(e,[],!1).filter(l=>Ue(l)&&jt(l)!=="body"),o=null;const s=Ve(e).position==="fixed";let a=s?kt(e):e;for(;Ue(a)&&!Ut(a);){const l=Ve(a),i=$r(a);!i&&l.position==="fixed"&&(o=null),(s?!i&&!o:!i&&l.position==="static"&&!!o&&(o.position==="absolute"||o.position==="fixed")||hn(a)&&!i&&ki(e,a))?r=r.filter(g=>g!==a):o=l,a=kt(a)}return t.set(e,r),r}function fc(e){let{element:t,boundary:n,rootBoundary:r,strategy:o}=e;const a=[...n==="clippingAncestors"?Rn(t)?[]:dc(t,this._c):[].concat(n),r],l=So(t,a[0],o);let i=l.top,u=l.right,g=l.bottom,c=l.left;for(let d=1;d<a.length;d++){const f=So(t,a[d],o);i=Ie(f.top,i),u=Ct(f.right,u),g=Ct(f.bottom,g),c=Ie(f.left,c)}return{width:u-c,height:g-i,x:c,y:i}}function gc(e){const{width:t,height:n}=$i(e);return{width:t,height:n}}function hc(e,t,n){const r=gt(t),o=Je(t),s=n==="fixed",a=Ot(e,!0,s,t);let l={scrollLeft:0,scrollTop:0};const i=Xe(0);function u(){i.x=Kn(o)}if(r||!r&&!s)if((jt(t)!=="body"||hn(o))&&(l=zn(t)),r){const f=Ot(t,!0,s,t);i.x=f.x+t.clientLeft,i.y=f.y+t.clientTop}else o&&u();s&&!r&&o&&u();const g=o&&!r&&!s?Si(o,l):Xe(0),c=a.left+l.scrollLeft-i.x-g.x,d=a.top+l.scrollTop-i.y-g.y;return{x:c,y:d,width:a.width,height:a.height}}function Wn(e){return Ve(e).position==="static"}function ko(e,t){if(!gt(e)||Ve(e).position==="fixed")return null;if(t)return t(e);let n=e.offsetParent;return Je(e)===n&&(n=n.ownerDocument.body),n}function Ei(e,t){const n=Le(e);if(Rn(e))return n;if(!gt(e)){let o=kt(e);for(;o&&!Ut(o);){if(Ue(o)&&!Wn(o))return o;o=kt(o)}return n}let r=ko(e,t);for(;r&&ec(r)&&Wn(r);)r=ko(r,t);return r&&Ut(r)&&Wn(r)&&!$r(r)?n:r||rc(e)||n}var vc=async function(e){const t=this.getOffsetParent||Ei,n=this.getDimensions,r=await n(e.floating);return{reference:hc(e.reference,await t(e.floating),e.strategy),floating:{x:0,y:0,width:r.width,height:r.height}}};function mc(e){return Ve(e).direction==="rtl"}var Mi={convertOffsetParentRelativeRectToViewportRelativeRect:sc,getDocumentElement:Je,getClippingRect:fc,getOffsetParent:Ei,getElementRects:vc,getClientRects:ac,getDimensions:gc,getScale:Ht,isElement:Ue,isRTL:mc};function Di(e,t){return e.x===t.x&&e.y===t.y&&e.width===t.width&&e.height===t.height}function pc(e,t){let n=null,r;const o=Je(e);function s(){var l;clearTimeout(r),(l=n)==null||l.disconnect(),n=null}function a(l,i){l===void 0&&(l=!1),i===void 0&&(i=1),s();const u=e.getBoundingClientRect(),{left:g,top:c,width:d,height:f}=u;if(l||t(),!d||!f)return;const h=xn(c),y=xn(o.clientWidth-(g+d)),v=xn(o.clientHeight-(c+f)),p=xn(g),b={rootMargin:-h+"px "+-y+"px "+-v+"px "+-p+"px",threshold:Ie(0,Ct(1,i))||1};let x=!0;function $(I){const k=I[0].intersectionRatio;if(k!==i){if(!x)return a();k?a(!1,k):r=setTimeout(()=>{a(!1,1e-7)},1e3)}k===1&&!Di(u,e.getBoundingClientRect())&&a(),x=!1}try{n=new IntersectionObserver($,{...b,root:o.ownerDocument})}catch{n=new IntersectionObserver($,b)}n.observe(e)}return a(!0),s}function yc(e,t,n,r){r===void 0&&(r={});const{ancestorScroll:o=!0,ancestorResize:s=!0,elementResize:a=typeof ResizeObserver=="function",layoutShift:l=typeof IntersectionObserver=="function",animationFrame:i=!1}=r,u=Sr(e),g=o||s?[...u?cn(u):[],...t?cn(t):[]]:[];g.forEach(p=>{o&&p.addEventListener("scroll",n,{passive:!0}),s&&p.addEventListener("resize",n)});const c=u&&l?pc(u,n):null;let d=-1,f=null;a&&(f=new ResizeObserver(p=>{let[w]=p;w&&w.target===u&&f&&t&&(f.unobserve(t),cancelAnimationFrame(d),d=requestAnimationFrame(()=>{var b;(b=f)==null||b.observe(t)})),n()}),u&&!i&&f.observe(u),t&&f.observe(t));let h,y=i?Ot(e):null;i&&v();function v(){const p=Ot(e);y&&!Di(y,p)&&n(),y=p,h=requestAnimationFrame(v)}return n(),()=>{var p;g.forEach(w=>{o&&w.removeEventListener("scroll",n),s&&w.removeEventListener("resize",n)}),c?.(),(p=f)==null||p.disconnect(),f=null,i&&cancelAnimationFrame(h)}}var bc=Xl,wc=Zl,xc=jl,$c=Jl,Cc=Wl,Sc=Vl,kc=(e,t,n)=>{const r=new Map,o={platform:Mi,...n},s={...o.platform,_c:r};return Ul(e,t,{...o,platform:s})},kr=we();function Er(){const e=xe(kr);if(e===void 0)throw new Error("[kobalte]: `usePopperContext` must be used within a `Popper` component");return e}var Ec=_('<svg display="block" viewBox="0 0 30 30" style="transform:scale(1.02)"><g><path fill="none" d="M23,27.8c1.1,1.2,3.4,2.2,5,2.2h2H0h2c1.7,0,3.9-1,5-2.2l6.6-7.2c0.7-0.8,2-0.8,2.7,0L23,27.8L23,27.8z"></path><path stroke="none" d="M23,27.8c1.1,1.2,3.4,2.2,5,2.2h2H0h2c1.7,0,3.9-1,5-2.2l6.6-7.2c0.7-0.8,2-0.8,2.7,0L23,27.8L23,27.8z">'),lr=30,Eo=lr/2,Mc={top:180,right:-90,bottom:0,left:90};function Mr(e){const t=Er(),n=Q({size:lr},e),[r,o]=ee(n,["ref","style","size"]),s=()=>t.currentPlacement().split("-")[0],a=Dc(t.contentRef),l=()=>a()?.getPropertyValue("background-color")||"none",i=()=>a()?.getPropertyValue(`border-${s()}-color`)||"none",u=()=>a()?.getPropertyValue(`border-${s()}-width`)||"0px",g=()=>Number.parseInt(u())*2*(lr/r.size),c=()=>`rotate(${Mc[s()]} ${Eo} ${Eo}) translate(0 2)`;return m(fe,j({as:"div",ref(d){const f=De(t.setArrowRef,r.ref);typeof f=="function"&&f(d)},"aria-hidden":"true",get style(){return In({position:"absolute","font-size":`${r.size}px`,width:"1em",height:"1em","pointer-events":"none",fill:l(),stroke:i(),"stroke-width":g()},r.style)}},o,{get children(){const d=Ec(),f=d.firstChild;return G(()=>A(f,"transform",c())),d}}))}function Dc(e){const[t,n]=z();return B(()=>{const r=e();r&&n(_a(r).getComputedStyle(r))}),t}function Ac(e){const t=Er(),[n,r]=ee(e,["ref","style"]);return m(fe,j({as:"div",ref(o){const s=De(t.setPositionerRef,n.ref);typeof s=="function"&&s(o)},"data-popper-positioner":"",get style(){return In({position:"absolute",top:0,left:0,"min-width":"max-content"},n.style)}},r))}function Mo(e){const{x:t=0,y:n=0,width:r=0,height:o=0}=e??{};if(typeof DOMRect=="function")return new DOMRect(t,n,r,o);const s={x:t,y:n,width:r,height:o,top:n,right:t+r,bottom:n+o,left:t};return{...s,toJSON:()=>s}}function Tc(e,t){return{contextElement:e,getBoundingClientRect:()=>{const r=t(e);return r?Mo(r):e?e.getBoundingClientRect():Mo()}}}function Fc(e){return/^(?:top|bottom|left|right)(?:-(?:start|end))?$/.test(e)}var Oc={top:"bottom",right:"left",bottom:"top",left:"right"};function Ic(e,t){const[n,r]=e.split("-"),o=Oc[n];return r?n==="left"||n==="right"?`${o} ${r==="start"?"top":"bottom"}`:r==="start"?`${o} ${t==="rtl"?"right":"left"}`:`${o} ${t==="rtl"?"left":"right"}`:`${o} center`}function Lc(e){const t=Q({getAnchorRect:d=>d?.getBoundingClientRect(),placement:"bottom",gutter:0,shift:0,flip:!0,slide:!0,overlap:!1,sameWidth:!1,fitViewport:!1,hideWhenDetached:!1,detachedPadding:0,arrowPadding:4,overflowPadding:8},e),[n,r]=z(),[o,s]=z(),[a,l]=z(t.placement),i=()=>Tc(t.anchorRef?.(),t.getAnchorRect),{direction:u}=Et();async function g(){const d=i(),f=n(),h=o();if(!d||!f)return;const y=(h?.clientHeight||0)/2,v=typeof t.gutter=="number"?t.gutter+y:t.gutter??y;f.style.setProperty("--kb-popper-content-overflow-padding",`${t.overflowPadding}px`),d.getBoundingClientRect();const p=[bc(({placement:I})=>{const k=!!I.split("-")[1];return{mainAxis:v,crossAxis:k?void 0:t.shift,alignmentAxis:t.shift}})];if(t.flip!==!1){const I=typeof t.flip=="string"?t.flip.split(" "):void 0;if(I!==void 0&&!I.every(Fc))throw new Error("`flip` expects a spaced-delimited list of placements");p.push(xc({padding:t.overflowPadding,fallbackPlacements:I}))}(t.slide||t.overlap)&&p.push(wc({mainAxis:t.slide,crossAxis:t.overlap,padding:t.overflowPadding})),p.push($c({padding:t.overflowPadding,apply({availableWidth:I,availableHeight:k,rects:T}){const E=Math.round(T.reference.width);I=Math.floor(I),k=Math.floor(k),f.style.setProperty("--kb-popper-anchor-width",`${E}px`),f.style.setProperty("--kb-popper-content-available-width",`${I}px`),f.style.setProperty("--kb-popper-content-available-height",`${k}px`),t.sameWidth&&(f.style.width=`${E}px`),t.fitViewport&&(f.style.maxWidth=`${I}px`,f.style.maxHeight=`${k}px`)}})),t.hideWhenDetached&&p.push(Cc({padding:t.detachedPadding})),h&&p.push(Sc({element:h,padding:t.arrowPadding}));const w=await kc(d,f,{placement:t.placement,strategy:"absolute",middleware:p,platform:{...Mi,isRTL:()=>u()==="rtl"}});if(l(w.placement),t.onCurrentPlacementChange?.(w.placement),!f)return;f.style.setProperty("--kb-popper-content-transform-origin",Ic(w.placement,u()));const b=Math.round(w.x),x=Math.round(w.y);let $;if(t.hideWhenDetached&&($=w.middlewareData.hide?.referenceHidden?"hidden":"visible"),Object.assign(f.style,{top:"0",left:"0",transform:`translate3d(${b}px, ${x}px, 0)`,visibility:$}),h&&w.middlewareData.arrow){const{x:I,y:k}=w.middlewareData.arrow,T=w.placement.split("-")[0];Object.assign(h.style,{left:I!=null?`${I}px`:"",top:k!=null?`${k}px`:"",[T]:"100%"})}}B(()=>{const d=i(),f=n();if(!d||!f)return;const h=yc(d,f,g,{elementResize:typeof ResizeObserver=="function"});U(h)}),B(()=>{const d=n(),f=t.contentRef?.();!d||!f||queueMicrotask(()=>{d.style.zIndex=getComputedStyle(f).zIndex})});const c={currentPlacement:a,contentRef:()=>t.contentRef?.(),setPositionerRef:r,setArrowRef:s};return m(kr.Provider,{value:c,get children(){return t.children}})}var Ai=Object.assign(Lc,{Arrow:Mr,Context:kr,usePopperContext:Er,Positioner:Ac}),Tn="data-kb-top-layer",Ti,cr=!1,ft=[];function un(e){return ft.findIndex(t=>t.node===e)}function Pc(e){return ft[un(e)]}function qc(e){return ft[ft.length-1].node===e}function Fi(){return ft.filter(e=>e.isPointerBlocking)}function _c(){return[...Fi()].slice(-1)[0]}function Dr(){return Fi().length>0}function Oi(e){const t=un(_c()?.node);return un(e)<t}function Rc(e){ft.push(e)}function zc(e){const t=un(e);t<0||ft.splice(t,1)}function Kc(){for(const{node:e}of ft)e.style.pointerEvents=Oi(e)?"none":"auto"}function Bc(e){if(Dr()&&!cr){const t=Ze(e);Ti=document.body.style.pointerEvents,t.body.style.pointerEvents="none",cr=!0}}function Nc(e){if(Dr())return;const t=Ze(e);t.body.style.pointerEvents=Ti,t.body.style.length===0&&t.body.removeAttribute("style"),cr=!1}var Fe={layers:ft,isTopMostLayer:qc,hasPointerBlockingLayer:Dr,isBelowPointerBlockingLayer:Oi,addLayer:Rc,removeLayer:zc,indexOf:un,find:Pc,assignPointerEventToLayers:Kc,disableBodyPointerEvents:Bc,restoreBodyPointerEvents:Nc},Do="interactOutside.pointerDownOutside",Ao="interactOutside.focusOutside";function Hc(e,t){let n,r=Ja;const o=()=>Ze(t()),s=c=>e.onPointerDownOutside?.(c),a=c=>e.onFocusOutside?.(c),l=c=>e.onInteractOutside?.(c),i=c=>{const d=c.target;return!(d instanceof Element)||d.closest(`[${Tn}]`)||!Ke(o(),d)||Ke(t(),d)?!1:!e.shouldExcludeElement?.(d)},u=c=>{function d(){const f=t(),h=c.target;if(!f||!h||!i(c))return;const y=be([s,l]);h.addEventListener(Do,y,{once:!0});const v=new CustomEvent(Do,{bubbles:!1,cancelable:!0,detail:{originalEvent:c,isContextMenu:c.button===2||Na(c)&&c.button===0}});h.dispatchEvent(v)}c.pointerType==="touch"?(o().removeEventListener("click",d),r=d,o().addEventListener("click",d,{once:!0})):d()},g=c=>{const d=t(),f=c.target;if(!d||!f||!i(c))return;const h=be([a,l]);f.addEventListener(Ao,h,{once:!0});const y=new CustomEvent(Ao,{bubbles:!1,cancelable:!0,detail:{originalEvent:c,isContextMenu:!1}});f.dispatchEvent(y)};B(()=>{M(e.isDisabled)||(n=window.setTimeout(()=>{o().addEventListener("pointerdown",u,!0)},0),o().addEventListener("focusin",g,!0),U(()=>{window.clearTimeout(n),o().removeEventListener("click",r),o().removeEventListener("pointerdown",u,!0),o().removeEventListener("focusin",g,!0)}))})}function Gc(e){const t=n=>{n.key===vr.Escape&&e.onEscapeKeyDown?.(n)};B(()=>{if(M(e.isDisabled))return;const n=e.ownerDocument?.()??Ze();n.addEventListener("keydown",t),U(()=>{n.removeEventListener("keydown",t)})})}var Ii=we();function Uc(){return xe(Ii)}function Vc(e){let t;const n=Uc(),[r,o]=ee(e,["ref","disableOutsidePointerEvents","excludedElements","onEscapeKeyDown","onPointerDownOutside","onFocusOutside","onInteractOutside","onDismiss","bypassTopMostLayerCheck"]),s=new Set([]),a=c=>{s.add(c);const d=n?.registerNestedLayer(c);return()=>{s.delete(c),d?.()}};Hc({shouldExcludeElement:c=>t?r.excludedElements?.some(d=>Ke(d(),c))||[...s].some(d=>Ke(d,c)):!1,onPointerDownOutside:c=>{!t||Fe.isBelowPointerBlockingLayer(t)||!r.bypassTopMostLayerCheck&&!Fe.isTopMostLayer(t)||(r.onPointerDownOutside?.(c),r.onInteractOutside?.(c),c.defaultPrevented||r.onDismiss?.())},onFocusOutside:c=>{r.onFocusOutside?.(c),r.onInteractOutside?.(c),c.defaultPrevented||r.onDismiss?.()}},()=>t),Gc({ownerDocument:()=>Ze(t),onEscapeKeyDown:c=>{!t||!Fe.isTopMostLayer(t)||(r.onEscapeKeyDown?.(c),!c.defaultPrevented&&r.onDismiss&&(c.preventDefault(),r.onDismiss()))}}),$t(()=>{if(!t)return;Fe.addLayer({node:t,isPointerBlocking:r.disableOutsidePointerEvents,dismiss:r.onDismiss});const c=n?.registerNestedLayer(t);Fe.assignPointerEventToLayers(),Fe.disableBodyPointerEvents(t),U(()=>{t&&(Fe.removeLayer(t),c?.(),Fe.assignPointerEventToLayers(),Fe.restoreBodyPointerEvents(t))})}),B(dt([()=>t,()=>r.disableOutsidePointerEvents],([c,d])=>{if(!c)return;const f=Fe.find(c);f&&f.isPointerBlocking!==d&&(f.isPointerBlocking=d,Fe.assignPointerEventToLayers()),d&&Fe.disableBodyPointerEvents(c),U(()=>{Fe.restoreBodyPointerEvents(c)})},{defer:!0}));const g={registerNestedLayer:a};return m(Ii.Provider,{value:g,get children(){return m(fe,j({as:"div",ref(c){const d=De(f=>t=f,r.ref);typeof d=="function"&&d(c)}},o))}})}function Li(e={}){const[t,n]=li({value:()=>M(e.open),defaultValue:()=>!!M(e.defaultOpen),onChange:a=>e.onOpenChange?.(a)}),r=()=>{n(!0)},o=()=>{n(!1)};return{isOpen:t,setIsOpen:n,open:r,close:o,toggle:()=>{t()?o():r()}}}function Be(e){return t=>(e(t),()=>e(void 0))}var Se=e=>typeof e=="function"?e():e,jc=e=>{const t=q(()=>{const a=Se(e.element);if(a)return getComputedStyle(a)}),n=()=>t()?.animationName??"none",[r,o]=z(Se(e.show)?"present":"hidden");let s="none";return B(a=>{const l=Se(e.show);return Nt(()=>{if(a===l)return l;const i=s,u=n();l?o("present"):u==="none"||t()?.display==="none"?o("hidden"):o(a===!0&&i!==u?"hiding":"hidden")}),l}),B(()=>{const a=Se(e.element);if(!a)return;const l=u=>{u.target===a&&(s=n())},i=u=>{const c=n().includes(u.animationName);u.target===a&&c&&r()==="hiding"&&o("hidden")};a.addEventListener("animationstart",l),a.addEventListener("animationcancel",i),a.addEventListener("animationend",i),U(()=>{a.removeEventListener("animationstart",l),a.removeEventListener("animationcancel",i),a.removeEventListener("animationend",i)})}),{present:()=>r()==="present"||r()==="hiding",state:r,setState:o}},Wc=jc,Pi=Wc,Qc=["id","name","validationState","required","disabled","readOnly"];function Yc(e){const t=`form-control-${Pe()}`,n=Q({id:t},e),[r,o]=z(),[s,a]=z(),[l,i]=z(),[u,g]=z(),c=(y,v,p)=>{const w=p!=null||r()!=null;return[p,r(),w&&v!=null?y:void 0].filter(Boolean).join(" ")||void 0},d=y=>[l(),u(),y].filter(Boolean).join(" ")||void 0,f=q(()=>({"data-valid":M(n.validationState)==="valid"?"":void 0,"data-invalid":M(n.validationState)==="invalid"?"":void 0,"data-required":M(n.required)?"":void 0,"data-disabled":M(n.disabled)?"":void 0,"data-readonly":M(n.readOnly)?"":void 0}));return{formControlContext:{name:()=>M(n.name)??M(n.id),dataset:f,validationState:()=>M(n.validationState),isRequired:()=>M(n.required),isDisabled:()=>M(n.disabled),isReadOnly:()=>M(n.readOnly),labelId:r,fieldId:s,descriptionId:l,errorMessageId:u,getAriaLabelledBy:c,getAriaDescribedBy:d,generateId:fn(()=>M(n.id)),registerLabel:Be(o),registerField:Be(a),registerDescription:Be(i),registerErrorMessage:Be(g)}}}var qi=we();function vn(){const e=xe(qi);if(e===void 0)throw new Error("[kobalte]: `useFormControlContext` must be used within a `FormControlContext.Provider` component");return e}function _i(e){const t=vn(),n=Q({id:t.generateId("description")},e);return B(()=>U(t.registerDescription(n.id))),m(fe,j({as:"div"},()=>t.dataset(),n))}function Xc(e){let t;const n=vn(),r=Q({id:n.generateId("label")},e),[o,s]=ee(r,["ref"]),a=Pn(()=>t,()=>"label");return B(()=>U(n.registerLabel(s.id))),m(fe,j({as:"label",ref(l){const i=De(u=>t=u,o.ref);typeof i=="function"&&i(l)},get for(){return ge(()=>a()==="label")()?n.fieldId():void 0}},()=>n.dataset(),s))}function Zc(e,t){B(dt(e,n=>{if(n==null)return;const r=Jc(n);r!=null&&(r.addEventListener("reset",t,{passive:!0}),U(()=>{r.removeEventListener("reset",t)}))}))}function Jc(e){return eu(e)?e.form:e.closest("form")}function eu(e){return e.matches("textarea, input, select, button")}function Ri(e){const t=vn(),n=Q({id:t.generateId("error-message")},e),[r,o]=ee(n,["forceMount"]),s=()=>t.validationState()==="invalid";return B(()=>{s()&&U(t.registerErrorMessage(o.id))}),m(R,{get when(){return r.forceMount||s()},get children(){return m(fe,j({as:"div"},()=>t.dataset(),o))}})}var Qn="focusScope.autoFocusOnMount",Yn="focusScope.autoFocusOnUnmount",To={bubbles:!1,cancelable:!0},Fo={stack:[],active(){return this.stack[0]},add(e){e!==this.active()&&this.active()?.pause(),this.stack=nr(this.stack,e),this.stack.unshift(e)},remove(e){this.stack=nr(this.stack,e),this.active()?.resume()}};function tu(e,t){const[n,r]=z(!1),o={pause(){r(!0)},resume(){r(!1)}};let s=null;const a=h=>e.onMountAutoFocus?.(h),l=h=>e.onUnmountAutoFocus?.(h),i=()=>Ze(t()),u=()=>{const h=i().createElement("span");return h.setAttribute("data-focus-trap",""),h.tabIndex=0,Object.assign(h.style,ai),h},g=()=>{const h=t();return h?ii(h,!0).filter(y=>!y.hasAttribute("data-focus-trap")):[]},c=()=>{const h=g();return h.length>0?h[0]:null},d=()=>{const h=g();return h.length>0?h[h.length-1]:null},f=()=>{const h=t();if(!h)return!1;const y=sn(h);return!y||Ke(h,y)?!1:si(y)};B(()=>{const h=t();if(!h)return;Fo.add(o);const y=sn(h);if(!Ke(h,y)){const p=new CustomEvent(Qn,To);h.addEventListener(Qn,a),h.dispatchEvent(p),p.defaultPrevented||setTimeout(()=>{ke(c()),sn(h)===y&&ke(h)},0)}U(()=>{h.removeEventListener(Qn,a),setTimeout(()=>{const p=new CustomEvent(Yn,To);f()&&p.preventDefault(),h.addEventListener(Yn,l),h.dispatchEvent(p),p.defaultPrevented||ke(y??i().body),h.removeEventListener(Yn,l),Fo.remove(o)},0)})}),B(()=>{const h=t();if(!h||!M(e.trapFocus)||n())return;const y=p=>{const w=p.target;w?.closest(`[${Tn}]`)||(Ke(h,w)?s=w:ke(s))},v=p=>{const b=p.relatedTarget??sn(h);b?.closest(`[${Tn}]`)||Ke(h,b)||ke(s)};i().addEventListener("focusin",y),i().addEventListener("focusout",v),U(()=>{i().removeEventListener("focusin",y),i().removeEventListener("focusout",v)})}),B(()=>{const h=t();if(!h||!M(e.trapFocus)||n())return;const y=u();h.insertAdjacentElement("afterbegin",y);const v=u();h.insertAdjacentElement("beforeend",v);function p(b){const x=c(),$=d();b.relatedTarget===x?ke($):ke(x)}y.addEventListener("focusin",p),v.addEventListener("focusin",p);const w=new MutationObserver(b=>{for(const x of b)x.previousSibling===v&&(v.remove(),h.insertAdjacentElement("beforeend",v)),x.nextSibling===y&&(y.remove(),h.insertAdjacentElement("afterbegin",y))});w.observe(h,{childList:!0,subtree:!1}),U(()=>{y.removeEventListener("focusin",p),v.removeEventListener("focusin",p),y.remove(),v.remove(),w.disconnect()})})}var nu="data-live-announcer";function ru(e){B(()=>{M(e.isDisabled)||U(ou(M(e.targets),M(e.root)))})}var nn=new WeakMap,Re=[];function ou(e,t=document.body){const n=new Set(e),r=new Set,o=i=>{for(const d of i.querySelectorAll(`[${nu}], [${Tn}]`))n.add(d);const u=d=>{if(n.has(d)||d.parentElement&&r.has(d.parentElement)&&d.parentElement.getAttribute("role")!=="row")return NodeFilter.FILTER_REJECT;for(const f of n)if(d.contains(f))return NodeFilter.FILTER_SKIP;return NodeFilter.FILTER_ACCEPT},g=document.createTreeWalker(i,NodeFilter.SHOW_ELEMENT,{acceptNode:u}),c=u(i);if(c===NodeFilter.FILTER_ACCEPT&&s(i),c!==NodeFilter.FILTER_REJECT){let d=g.nextNode();for(;d!=null;)s(d),d=g.nextNode()}},s=i=>{const u=nn.get(i)??0;i.getAttribute("aria-hidden")==="true"&&u===0||(u===0&&i.setAttribute("aria-hidden","true"),r.add(i),nn.set(i,u+1))};Re.length&&Re[Re.length-1].disconnect(),o(t);const a=new MutationObserver(i=>{for(const u of i)if(!(u.type!=="childList"||u.addedNodes.length===0)&&![...n,...r].some(g=>g.contains(u.target))){for(const g of u.removedNodes)g instanceof Element&&(n.delete(g),r.delete(g));for(const g of u.addedNodes)(g instanceof HTMLElement||g instanceof SVGElement)&&(g.dataset.liveAnnouncer==="true"||g.dataset.reactAriaTopLayer==="true")?n.add(g):g instanceof Element&&o(g)}});a.observe(t,{childList:!0,subtree:!0});const l={observe(){a.observe(t,{childList:!0,subtree:!0})},disconnect(){a.disconnect()}};return Re.push(l),()=>{a.disconnect();for(const i of r){const u=nn.get(i);if(u==null)return;u===1?(i.removeAttribute("aria-hidden"),nn.delete(i)):nn.set(i,u-1)}l===Re[Re.length-1]?(Re.pop(),Re.length&&Re[Re.length-1].observe()):Re.splice(Re.indexOf(l),1)}}var ur=(e,t)=>{if(e.contains(t))return!0;let n=t;for(;n;){if(n===e)return!0;n=n._$host??n.parentElement}return!1},$n=new Map,iu=e=>{B(()=>{const t=Se(e.style)??{},n=Se(e.properties)??[],r={};for(const s in t)r[s]=e.element.style[s];const o=$n.get(e.key);o?o.activeCount++:$n.set(e.key,{activeCount:1,originalStyles:r,properties:n.map(s=>s.key)}),Object.assign(e.element.style,e.style);for(const s of n)e.element.style.setProperty(s.key,s.value);U(()=>{const s=$n.get(e.key);if(s){if(s.activeCount!==1){s.activeCount--;return}$n.delete(e.key);for(const[a,l]of Object.entries(s.originalStyles))e.element.style[a]=l;for(const a of s.properties)e.element.style.removeProperty(a);e.element.style.length===0&&e.element.removeAttribute("style"),e.cleanup?.()}})})},Oo=iu,su=(e,t)=>{switch(t){case"x":return[e.clientWidth,e.scrollLeft,e.scrollWidth];case"y":return[e.clientHeight,e.scrollTop,e.scrollHeight]}},au=(e,t)=>{const n=getComputedStyle(e),r=t==="x"?n.overflowX:n.overflowY;return r==="auto"||r==="scroll"||e.tagName==="HTML"&&r==="visible"},lu=(e,t,n)=>{const r=t==="x"&&window.getComputedStyle(e).direction==="rtl"?-1:1;let o=e,s=0,a=0,l=!1;do{const[i,u,g]=su(o,t),c=g-i-r*u;(u!==0||c!==0)&&au(o,t)&&(s+=c,a+=u),o===(n??document.documentElement)?l=!0:o=o._$host??o.parentElement}while(o&&!l);return[s,a]},[Io,Lo]=z([]),cu=e=>Io().indexOf(e)===Io().length-1,uu=e=>{const t=j({element:null,enabled:!0,hideScrollbar:!0,preventScrollbarShift:!0,preventScrollbarShiftMode:"padding",restoreScrollPosition:!0,allowPinchZoom:!1},e),n=Pe();let r=[0,0],o=null,s=null;B(()=>{Se(t.enabled)&&(Lo(u=>[...u,n]),U(()=>{Lo(u=>u.filter(g=>g!==n))}))}),B(()=>{if(!Se(t.enabled)||!Se(t.hideScrollbar))return;const{body:u}=document,g=window.innerWidth-u.offsetWidth;if(Se(t.preventScrollbarShift)){const c={overflow:"hidden"},d=[];g>0&&(Se(t.preventScrollbarShiftMode)==="padding"?c.paddingRight=`calc(${window.getComputedStyle(u).paddingRight} + ${g}px)`:c.marginRight=`calc(${window.getComputedStyle(u).marginRight} + ${g}px)`,d.push({key:"--scrollbar-width",value:`${g}px`}));const f=window.scrollY,h=window.scrollX;Oo({key:"prevent-scroll",element:u,style:c,properties:d,cleanup:()=>{Se(t.restoreScrollPosition)&&g>0&&window.scrollTo(h,f)}})}else Oo({key:"prevent-scroll",element:u,style:{overflow:"hidden"}})}),B(()=>{!cu(n)||!Se(t.enabled)||(document.addEventListener("wheel",l,{passive:!1}),document.addEventListener("touchstart",a,{passive:!1}),document.addEventListener("touchmove",i,{passive:!1}),U(()=>{document.removeEventListener("wheel",l),document.removeEventListener("touchstart",a),document.removeEventListener("touchmove",i)}))});const a=u=>{r=Po(u),o=null,s=null},l=u=>{const g=u.target,c=Se(t.element),d=du(u),f=Math.abs(d[0])>Math.abs(d[1])?"x":"y",h=f==="x"?d[0]:d[1],y=qo(g,f,h,c);let v;c&&ur(c,g)?v=!y:v=!0,v&&u.cancelable&&u.preventDefault()},i=u=>{const g=Se(t.element),c=u.target;let d;if(u.touches.length===2)d=!Se(t.allowPinchZoom);else{if(o==null||s===null){const f=Po(u).map((y,v)=>r[v]-y),h=Math.abs(f[0])>Math.abs(f[1])?"x":"y";o=h,s=h==="x"?f[0]:f[1]}if(c.type==="range")d=!1;else{const f=qo(c,o,s,g);g&&ur(g,c)?d=!f:d=!0}}d&&u.cancelable&&u.preventDefault()}},du=e=>[e.deltaX,e.deltaY],Po=e=>e.changedTouches[0]?[e.changedTouches[0].clientX,e.changedTouches[0].clientY]:[0,0],qo=(e,t,n,r)=>{const o=r!==null&&ur(r,e),[s,a]=lu(e,t,o?r:void 0);return!(n>0&&Math.abs(s)<=1||n<0&&Math.abs(a)<1)},fu=uu,gu=fu,ze={};qn(ze,{Description:()=>_i,ErrorMessage:()=>Ri,Item:()=>Bi,ItemControl:()=>Ni,ItemDescription:()=>Hi,ItemIndicator:()=>Gi,ItemInput:()=>Ui,ItemLabel:()=>Vi,Label:()=>ji,RadioGroup:()=>hu,Root:()=>Wi,useRadioGroupContext:()=>Ar});var zi=we();function Ar(){const e=xe(zi);if(e===void 0)throw new Error("[kobalte]: `useRadioGroupContext` must be used within a `RadioGroup` component");return e}var Ki=we();function mn(){const e=xe(Ki);if(e===void 0)throw new Error("[kobalte]: `useRadioGroupItemContext` must be used within a `RadioGroup.Item` component");return e}function Bi(e){const t=vn(),n=Ar(),r=`${t.generateId("item")}-${Pe()}`,o=Q({id:r},e),[s,a]=ee(o,["value","disabled","onPointerDown"]),[l,i]=z(),[u,g]=z(),[c,d]=z(),[f,h]=z(),[y,v]=z(!1),p=q(()=>n.isDefaultValue(s.value)),w=q(()=>n.isSelectedValue(s.value)),b=q(()=>s.disabled||t.isDisabled()||!1),x=k=>{de(k,s.onPointerDown),y()&&k.preventDefault()},$=q(()=>({...t.dataset(),"data-disabled":b()?"":void 0,"data-checked":w()?"":void 0})),I={value:()=>s.value,dataset:$,isDefault:p,isSelected:w,isDisabled:b,inputId:l,labelId:u,descriptionId:c,inputRef:f,select:()=>n.setSelectedValue(s.value),generateId:fn(()=>a.id),registerInput:Be(i),registerLabel:Be(g),registerDescription:Be(d),setIsFocused:v,setInputRef:h};return m(Ki.Provider,{value:I,get children(){return m(fe,j({as:"div",role:"group",onPointerDown:x},$,a))}})}function Ni(e){const t=mn(),n=Q({id:t.generateId("control")},e),[r,o]=ee(n,["onClick","onKeyDown"]);return m(fe,j({as:"div",onClick:l=>{de(l,r.onClick),t.select(),t.inputRef()?.focus()},onKeyDown:l=>{de(l,r.onKeyDown),l.key===vr.Space&&(t.select(),t.inputRef()?.focus())}},()=>t.dataset(),o))}function Hi(e){const t=mn(),n=Q({id:t.generateId("description")},e);return B(()=>U(t.registerDescription(n.id))),m(fe,j({as:"div"},()=>t.dataset(),n))}function Gi(e){const t=mn(),n=Q({id:t.generateId("indicator")},e),[r,o]=ee(n,["ref","forceMount"]),[s,a]=z(),{present:l}=Pi({show:()=>r.forceMount||t.isSelected(),element:()=>s()??null});return m(R,{get when(){return l()},get children(){return m(fe,j({as:"div",ref(i){const u=De(a,r.ref);typeof u=="function"&&u(i)}},()=>t.dataset(),o))}})}function Ui(e){const t=vn(),n=Ar(),r=mn(),o=Q({id:r.generateId("input")},e),[s,a]=ee(o,["ref","style","aria-labelledby","aria-describedby","onChange","onFocus","onBlur"]),l=()=>[s["aria-labelledby"],r.labelId(),s["aria-labelledby"]!=null&&a["aria-label"]!=null?a.id:void 0].filter(Boolean).join(" ")||void 0,i=()=>[s["aria-describedby"],r.descriptionId(),n.ariaDescribedBy()].filter(Boolean).join(" ")||void 0,[u,g]=z(!1),c=h=>{if(de(h,s.onChange),h.stopPropagation(),!u()){n.setSelectedValue(r.value());const y=h.target;y.checked=r.isSelected()}g(!1)},d=h=>{de(h,s.onFocus),r.setIsFocused(!0)},f=h=>{de(h,s.onBlur),r.setIsFocused(!1)};return B(dt([()=>r.isSelected(),()=>r.value()],h=>{if(!h[0]&&h[1]===r.value())return;g(!0);const y=r.inputRef();y?.dispatchEvent(new Event("input",{bubbles:!0,cancelable:!0})),y?.dispatchEvent(new Event("change",{bubbles:!0,cancelable:!0}))},{defer:!0})),B(()=>U(r.registerInput(a.id))),m(fe,j({as:"input",ref(h){const y=De(r.setInputRef,s.ref);typeof y=="function"&&y(h)},type:"radio",get name(){return t.name()},get value(){return r.value()},get checked(){return r.isSelected()},get required(){return t.isRequired()},get disabled(){return r.isDisabled()},get readonly(){return t.isReadOnly()},get style(){return In({...ai},s.style)},get"aria-labelledby"(){return l()},get"aria-describedby"(){return i()},onChange:c,onFocus:d,onBlur:f},()=>r.dataset(),a))}function Vi(e){const t=mn(),n=Q({id:t.generateId("label")},e);return B(()=>U(t.registerLabel(n.id))),m(fe,j({as:"label",get for(){return t.inputId()}},()=>t.dataset(),n))}function ji(e){return m(Xc,j({as:"span"},e))}function Wi(e){let t;const n=`radiogroup-${Pe()}`,r=Q({id:n,orientation:"vertical"},e),[o,s,a]=ee(r,["ref","value","defaultValue","onChange","orientation","aria-labelledby","aria-describedby"],Qc),[l,i]=gn({value:()=>o.value,defaultValue:()=>o.defaultValue,onChange:v=>o.onChange?.(v)}),{formControlContext:u}=Yc(s);Zc(()=>t,()=>i(o.defaultValue??""));const g=()=>u.getAriaLabelledBy(M(s.id),a["aria-label"],o["aria-labelledby"]),c=()=>u.getAriaDescribedBy(o["aria-describedby"]),d=v=>v===e.defaultValue,f=v=>v===l(),y={ariaDescribedBy:c,isDefaultValue:d,isSelectedValue:f,setSelectedValue:v=>{if(!(u.isReadOnly()||u.isDisabled())&&(i(v),t))for(const p of t.querySelectorAll("[type='radio']")){const w=p;w.checked=f(w.value)}}};return m(qi.Provider,{value:u,get children(){return m(zi.Provider,{value:y,get children(){return m(fe,j({as:"div",ref(v){const p=De(w=>t=w,o.ref);typeof p=="function"&&p(v)},role:"radiogroup",get id(){return M(s.id)},get"aria-invalid"(){return u.validationState()==="invalid"||void 0},get"aria-required"(){return u.isRequired()||void 0},get"aria-disabled"(){return u.isDisabled()||void 0},get"aria-readonly"(){return u.isReadOnly()||void 0},get"aria-orientation"(){return o.orientation},get"aria-labelledby"(){return g()},get"aria-describedby"(){return c()}},()=>u.dataset(),a))}})}})}var hu=Object.assign(Wi,{Description:_i,ErrorMessage:Ri,Item:Bi,ItemControl:Ni,ItemDescription:Hi,ItemIndicator:Gi,ItemInput:Ui,ItemLabel:Vi,Label:ji}),vu=class{collection;ref;collator;constructor(e,t,n){this.collection=e,this.ref=t,this.collator=n}getKeyBelow(e){let t=this.collection().getKeyAfter(e);for(;t!=null;){const n=this.collection().getItem(t);if(n&&n.type==="item"&&!n.disabled)return t;t=this.collection().getKeyAfter(t)}}getKeyAbove(e){let t=this.collection().getKeyBefore(e);for(;t!=null;){const n=this.collection().getItem(t);if(n&&n.type==="item"&&!n.disabled)return t;t=this.collection().getKeyBefore(t)}}getFirstKey(){let e=this.collection().getFirstKey();for(;e!=null;){const t=this.collection().getItem(e);if(t&&t.type==="item"&&!t.disabled)return e;e=this.collection().getKeyAfter(e)}}getLastKey(){let e=this.collection().getLastKey();for(;e!=null;){const t=this.collection().getItem(e);if(t&&t.type==="item"&&!t.disabled)return e;e=this.collection().getKeyBefore(e)}}getItem(e){return this.ref?.()?.querySelector(`[data-key="${e}"]`)??null}getKeyPageAbove(e){const t=this.ref?.();let n=this.getItem(e);if(!t||!n)return;const r=Math.max(0,n.offsetTop+n.offsetHeight-t.offsetHeight);let o=e;for(;o&&n&&n.offsetTop>r;)o=this.getKeyAbove(o),n=o!=null?this.getItem(o):null;return o}getKeyPageBelow(e){const t=this.ref?.();let n=this.getItem(e);if(!t||!n)return;const r=Math.min(t.scrollHeight,n.offsetTop-n.offsetHeight+t.offsetHeight);let o=e;for(;o&&n&&n.offsetTop<r;)o=this.getKeyBelow(o),n=o!=null?this.getItem(o):null;return o}getKeyForSearch(e,t){const n=this.collator?.();if(!n)return;let r=t!=null?this.getKeyBelow(t):this.getFirstKey();for(;r!=null;){const o=this.collection().getItem(r);if(o){const s=o.textValue.slice(0,e.length);if(o.textValue&&n.compare(s,e)===0)return r}r=this.getKeyBelow(r)}}};function mu(e,t,n){const r=ml({usage:"search",sensitivity:"base"}),o=q(()=>{const s=M(e.keyboardDelegate);return s||new vu(e.collection,t,r)});return Cl({selectionManager:()=>M(e.selectionManager),keyboardDelegate:o,autoFocus:()=>M(e.autoFocus),deferAutoFocus:()=>M(e.deferAutoFocus),shouldFocusWrap:()=>M(e.shouldFocusWrap),disallowEmptySelection:()=>M(e.disallowEmptySelection),selectOnFocus:()=>M(e.selectOnFocus),disallowTypeAhead:()=>M(e.disallowTypeAhead),shouldUseVirtualFocus:()=>M(e.shouldUseVirtualFocus),allowsTabNavigation:()=>M(e.allowsTabNavigation),isVirtualized:()=>M(e.isVirtualized),scrollToKey:s=>M(e.scrollToKey)?.(s),orientation:()=>M(e.orientation)},t)}var pu=we();function Bn(){return xe(pu)}var yu=we();function Qi(){return xe(yu)}var Yi=we();function Xi(){return xe(Yi)}function ht(){const e=Xi();if(e===void 0)throw new Error("[kobalte]: `useMenuContext` must be used within a `Menu` component");return e}var Zi=we();function Tr(){const e=xe(Zi);if(e===void 0)throw new Error("[kobalte]: `useMenuItemContext` must be used within a `Menu.Item` component");return e}var Ji=we();function et(){const e=xe(Ji);if(e===void 0)throw new Error("[kobalte]: `useMenuRootContext` must be used within a `MenuRoot` component");return e}function Fr(e){let t;const n=et(),r=ht(),o=Q({id:n.generateId(`item-${Pe()}`)},e),[s,a]=ee(o,["ref","textValue","disabled","closeOnSelect","checked","indeterminate","onSelect","onPointerMove","onPointerLeave","onPointerDown","onPointerUp","onClick","onKeyDown","onMouseDown","onFocus"]),[l,i]=z(),[u,g]=z(),[c,d]=z(),f=()=>r.listState().selectionManager(),h=()=>a.id,y=()=>f().focusedKey()===h(),v=()=>{s.onSelect?.(),s.closeOnSelect&&setTimeout(()=>{r.close(!0)})};Il({getItem:()=>({ref:()=>t,type:"item",key:h(),textValue:s.textValue??c()?.textContent??t?.textContent??"",disabled:s.disabled??!1})});const p=gi({key:h,selectionManager:f,shouldSelectOnPressUp:!0,allowsDifferentPressOrigin:!0,disabled:()=>s.disabled},()=>t),w=E=>{de(E,s.onPointerMove),E.pointerType==="mouse"&&(s.disabled?r.onItemLeave(E):(r.onItemEnter(E),E.defaultPrevented||(ke(E.currentTarget),r.listState().selectionManager().setFocused(!0),r.listState().selectionManager().setFocusedKey(h()))))},b=E=>{de(E,s.onPointerLeave),E.pointerType==="mouse"&&r.onItemLeave(E)},x=E=>{de(E,s.onPointerUp),!s.disabled&&E.button===0&&v()},$=E=>{if(de(E,s.onKeyDown),!E.repeat&&!s.disabled)switch(E.key){case"Enter":case" ":v();break}},I=q(()=>{if(s.indeterminate)return"mixed";if(s.checked!=null)return s.checked}),k=q(()=>({"data-indeterminate":s.indeterminate?"":void 0,"data-checked":s.checked&&!s.indeterminate?"":void 0,"data-disabled":s.disabled?"":void 0,"data-highlighted":y()?"":void 0})),T={isChecked:()=>s.checked,dataset:k,setLabelRef:d,generateId:fn(()=>a.id),registerLabel:Be(i),registerDescription:Be(g)};return m(Zi.Provider,{value:T,get children(){return m(fe,j({as:"div",ref(E){const F=De(H=>t=H,s.ref);typeof F=="function"&&F(E)},get tabIndex(){return p.tabIndex()},get"aria-checked"(){return I()},get"aria-disabled"(){return s.disabled},get"aria-labelledby"(){return l()},get"aria-describedby"(){return u()},get"data-key"(){return p.dataKey()},get onPointerDown(){return be([s.onPointerDown,p.onPointerDown])},get onPointerUp(){return be([x,p.onPointerUp])},get onClick(){return be([s.onClick,p.onClick])},get onKeyDown(){return be([$,p.onKeyDown])},get onMouseDown(){return be([s.onMouseDown,p.onMouseDown])},get onFocus(){return be([s.onFocus,p.onFocus])},onPointerMove:w,onPointerLeave:b},k,a))}})}function es(e){const t=Q({closeOnSelect:!1},e),[n,r]=ee(t,["checked","defaultChecked","onChange","onSelect"]),o=ll({isSelected:()=>n.checked,defaultIsSelected:()=>n.defaultChecked,onSelectedChange:a=>n.onChange?.(a),isDisabled:()=>r.disabled});return m(Fr,j({role:"menuitemcheckbox",get checked(){return o.isSelected()},onSelect:()=>{n.onSelect?.(),o.toggle()}},r))}var dn={next:(e,t)=>e==="ltr"?t==="horizontal"?"ArrowRight":"ArrowDown":t==="horizontal"?"ArrowLeft":"ArrowUp",previous:(e,t)=>dn.next(e==="ltr"?"rtl":"ltr",t)},_o={first:e=>e==="horizontal"?"ArrowDown":"ArrowRight",last:e=>e==="horizontal"?"ArrowUp":"ArrowLeft"};function ts(e){const t=et(),n=ht(),r=Bn(),{direction:o}=Et(),s=Q({id:t.generateId("trigger")},e),[a,l]=ee(s,["ref","id","disabled","onPointerDown","onClick","onKeyDown","onMouseOver","onFocus"]);let i=()=>t.value();r!==void 0&&(i=()=>t.value()??a.id,r.lastValue()===void 0&&r.setLastValue(i));const u=Pn(()=>n.triggerRef(),()=>"button"),g=q(()=>u()==="a"&&n.triggerRef()?.getAttribute("href")!=null);B(dt(()=>r?.value(),p=>{g()&&p===i()&&n.triggerRef()?.focus()}));const c=()=>{r!==void 0?n.isOpen()?r.value()===i()&&r.closeMenu():(r.autoFocusMenu()||r.setAutoFocusMenu(!0),n.open(!1)):n.toggle(!0)},d=p=>{de(p,a.onPointerDown),p.currentTarget.dataset.pointerType=p.pointerType,!a.disabled&&p.pointerType!=="touch"&&p.button===0&&c()},f=p=>{de(p,a.onClick),a.disabled||p.currentTarget.dataset.pointerType==="touch"&&c()},h=p=>{if(de(p,a.onKeyDown),!a.disabled){if(g())switch(p.key){case"Enter":case" ":return}switch(p.key){case"Enter":case" ":case _o.first(t.orientation()):p.stopPropagation(),p.preventDefault(),tl(p.currentTarget),n.open("first"),r?.setAutoFocusMenu(!0),r?.setValue(i);break;case _o.last(t.orientation()):p.stopPropagation(),p.preventDefault(),n.open("last");break;case dn.next(o(),t.orientation()):if(r===void 0)break;p.stopPropagation(),p.preventDefault(),r.nextMenu();break;case dn.previous(o(),t.orientation()):if(r===void 0)break;p.stopPropagation(),p.preventDefault(),r.previousMenu();break}}},y=p=>{de(p,a.onMouseOver),n.triggerRef()?.dataset.pointerType!=="touch"&&!a.disabled&&r!==void 0&&r.value()!==void 0&&r.setValue(i)},v=p=>{de(p,a.onFocus),r!==void 0&&p.currentTarget.dataset.pointerType!=="touch"&&r.setValue(i)};return B(()=>U(n.registerTriggerId(a.id))),m(br,j({ref(p){const w=De(n.setTriggerRef,a.ref);typeof w=="function"&&w(p)},get"data-kb-menu-value-trigger"(){return t.value()},get id(){return a.id},get disabled(){return a.disabled},"aria-haspopup":"true",get"aria-expanded"(){return n.isOpen()},get"aria-controls"(){return ge(()=>!!n.isOpen())()?n.contentId():void 0},get"data-highlighted"(){return i()!==void 0&&r?.value()===i()?!0:void 0},get tabIndex(){return r!==void 0?r.value()===i()||r.lastValue()===i()?0:-1:void 0},onPointerDown:d,onMouseOver:y,onClick:f,onKeyDown:h,onFocus:v,role:r!==void 0?"menuitem":void 0},()=>n.dataset(),l))}function ns(e){let t;const n=et(),r=ht(),o=Bn(),s=Qi(),{direction:a}=Et(),l=Q({id:n.generateId(`content-${Pe()}`)},e),[i,u]=ee(l,["ref","id","style","onOpenAutoFocus","onCloseAutoFocus","onEscapeKeyDown","onFocusOutside","onPointerEnter","onPointerMove","onKeyDown","onMouseDown","onFocusIn","onFocusOut"]);let g=0;const c=()=>r.parentMenuContext()==null&&o===void 0&&n.isModal(),d=mu({selectionManager:r.listState().selectionManager,collection:r.listState().collection,autoFocus:r.autoFocus,deferAutoFocus:!0,shouldFocusWrap:!0,disallowTypeAhead:()=>!r.listState().selectionManager().isFocused(),orientation:()=>n.orientation()==="horizontal"?"vertical":"horizontal"},()=>t);tu({trapFocus:()=>c()&&r.isOpen(),onMountAutoFocus:b=>{o===void 0&&i.onOpenAutoFocus?.(b)},onUnmountAutoFocus:i.onCloseAutoFocus},()=>t);const f=b=>{if(Ke(b.currentTarget,b.target)&&(b.key==="Tab"&&r.isOpen()&&b.preventDefault(),o!==void 0&&b.currentTarget.getAttribute("aria-haspopup")!=="true"))switch(b.key){case dn.next(a(),n.orientation()):b.stopPropagation(),b.preventDefault(),r.close(!0),o.setAutoFocusMenu(!0),o.nextMenu();break;case dn.previous(a(),n.orientation()):if(b.currentTarget.hasAttribute("data-closed"))break;b.stopPropagation(),b.preventDefault(),r.close(!0),o.setAutoFocusMenu(!0),o.previousMenu();break}},h=b=>{i.onEscapeKeyDown?.(b),o?.setAutoFocusMenu(!1),r.close(!0)},y=b=>{i.onFocusOutside?.(b),n.isModal()&&b.preventDefault()},v=b=>{de(b,i.onPointerEnter),r.isOpen()&&(r.parentMenuContext()?.listState().selectionManager().setFocused(!1),r.parentMenuContext()?.listState().selectionManager().setFocusedKey(void 0))},p=b=>{if(de(b,i.onPointerMove),b.pointerType!=="mouse")return;const x=b.target,$=g!==b.clientX;Ke(b.currentTarget,x)&&$&&(r.setPointerDir(b.clientX>g?"right":"left"),g=b.clientX)};B(()=>U(r.registerContentId(i.id))),U(()=>r.setContentRef(void 0));const w={ref:De(b=>{r.setContentRef(b),t=b},i.ref),role:"menu",get id(){return i.id},get tabIndex(){return d.tabIndex()},get"aria-labelledby"(){return r.triggerId()},onKeyDown:be([i.onKeyDown,d.onKeyDown,f]),onMouseDown:be([i.onMouseDown,d.onMouseDown]),onFocusIn:be([i.onFocusIn,d.onFocusIn]),onFocusOut:be([i.onFocusOut,d.onFocusOut]),onPointerEnter:v,onPointerMove:p,get"data-orientation"(){return n.orientation()}};return m(R,{get when(){return r.contentPresent()},get children(){return m(R,{get when(){return s===void 0||r.parentMenuContext()!=null},get fallback(){return m(fe,j({as:"div"},()=>r.dataset(),w,u))},get children(){return m(Ai.Positioner,{get children(){return m(Vc,j({get disableOutsidePointerEvents(){return ge(()=>!!c())()&&r.isOpen()},get excludedElements(){return[r.triggerRef]},bypassTopMostLayerCheck:!0,get style(){return In({"--kb-menu-content-transform-origin":"var(--kb-popper-content-transform-origin)",position:"relative"},i.style)},onEscapeKeyDown:h,onFocusOutside:y,get onDismiss(){return r.close}},()=>r.dataset(),w,u))}})}})}})}function bu(e){let t;const n=et(),r=ht(),[o,s]=ee(e,["ref"]);return gu({element:()=>t??null,enabled:()=>r.contentPresent()&&n.preventScroll()}),m(ns,j({ref(a){const l=De(i=>{t=i},o.ref);typeof l=="function"&&l(a)}},s))}var rs=we();function wu(){const e=xe(rs);if(e===void 0)throw new Error("[kobalte]: `useMenuGroupContext` must be used within a `Menu.Group` component");return e}function Or(e){const t=et(),n=Q({id:t.generateId(`group-${Pe()}`)},e),[r,o]=z(),s={generateId:fn(()=>n.id),registerLabelId:Be(o)};return m(rs.Provider,{value:s,get children(){return m(fe,j({as:"div",role:"group",get"aria-labelledby"(){return r()}},n))}})}function os(e){const t=wu(),n=Q({id:t.generateId("label")},e),[r,o]=ee(n,["id"]);return B(()=>U(t.registerLabelId(r.id))),m(fe,j({as:"span",get id(){return r.id},"aria-hidden":"true"},o))}function is(e){const t=ht(),n=Q({children:"▼"},e);return m(fe,j({as:"span","aria-hidden":"true"},()=>t.dataset(),n))}function ss(e){return m(Fr,j({role:"menuitem",closeOnSelect:!0},e))}function as(e){const t=Tr(),n=Q({id:t.generateId("description")},e),[r,o]=ee(n,["id"]);return B(()=>U(t.registerDescription(r.id))),m(fe,j({as:"div",get id(){return r.id}},()=>t.dataset(),o))}function ls(e){const t=Tr(),n=Q({id:t.generateId("indicator")},e),[r,o]=ee(n,["forceMount"]);return m(R,{get when(){return r.forceMount||t.isChecked()},get children(){return m(fe,j({as:"div"},()=>t.dataset(),o))}})}function cs(e){const t=Tr(),n=Q({id:t.generateId("label")},e),[r,o]=ee(n,["ref","id"]);return B(()=>U(t.registerLabel(r.id))),m(fe,j({as:"div",ref(s){const a=De(t.setLabelRef,r.ref);typeof a=="function"&&a(s)},get id(){return r.id}},()=>t.dataset(),o))}function us(e){const t=ht();return m(R,{get when(){return t.contentPresent()},get children(){return m(jo,e)}})}var ds=we();function xu(){const e=xe(ds);if(e===void 0)throw new Error("[kobalte]: `useMenuRadioGroupContext` must be used within a `Menu.RadioGroup` component");return e}function fs(e){const n=et().generateId(`radiogroup-${Pe()}`),r=Q({id:n},e),[o,s]=ee(r,["value","defaultValue","onChange","disabled"]),[a,l]=gn({value:()=>o.value,defaultValue:()=>o.defaultValue,onChange:u=>o.onChange?.(u)}),i={isDisabled:()=>o.disabled,isSelectedValue:u=>u===a(),setSelectedValue:u=>l(u)};return m(ds.Provider,{value:i,get children(){return m(Or,s)}})}function gs(e){const t=xu(),n=Q({closeOnSelect:!1},e),[r,o]=ee(n,["value","onSelect"]);return m(Fr,j({role:"menuitemradio",get checked(){return t.isSelectedValue(r.value)},onSelect:()=>{r.onSelect?.(),t.setSelectedValue(r.value)}},o))}function $u(e,t,n){const r=e.split("-")[0],o=n.getBoundingClientRect(),s=[],a=t.clientX,l=t.clientY;switch(r){case"top":s.push([a,l+5]),s.push([o.left,o.bottom]),s.push([o.left,o.top]),s.push([o.right,o.top]),s.push([o.right,o.bottom]);break;case"right":s.push([a-5,l]),s.push([o.left,o.top]),s.push([o.right,o.top]),s.push([o.right,o.bottom]),s.push([o.left,o.bottom]);break;case"bottom":s.push([a,l-5]),s.push([o.right,o.top]),s.push([o.right,o.bottom]),s.push([o.left,o.bottom]),s.push([o.left,o.top]);break;case"left":s.push([a+5,l]),s.push([o.right,o.bottom]),s.push([o.left,o.bottom]),s.push([o.left,o.top]),s.push([o.right,o.top]);break}return s}function Cu(e,t){return t?el([e.clientX,e.clientY],t):!1}function hs(e){const t=et(),n=vi(),r=Xi(),o=Bn(),s=Qi(),a=Q({placement:t.orientation()==="horizontal"?"bottom-start":"right-start"},e),[l,i]=ee(a,["open","defaultOpen","onOpenChange"]);let u=0,g=null,c="right";const[d,f]=z(),[h,y]=z(),[v,p]=z(),[w,b]=z(),[x,$]=z(!0),[I,k]=z(i.placement),[T,E]=z([]),[F,H]=z([]),{DomCollectionProvider:N}=Ol({items:F,onItemsChange:H}),X=Li({open:()=>l.open,defaultOpen:()=>l.defaultOpen,onOpenChange:V=>l.onOpenChange?.(V)}),{present:te}=Pi({show:()=>t.forceMount()||X.isOpen(),element:()=>w()??null}),ie=kl({selectionMode:"none",dataSource:F}),se=V=>{$(V),X.open()},ne=(V=!1)=>{X.close(),V&&r&&r.close(!0)},re=V=>{$(V),X.toggle()},le=()=>{const V=w();V&&(ke(V),ie.selectionManager().setFocused(!0),ie.selectionManager().setFocusedKey(void 0))},me=()=>{s!=null?setTimeout(()=>le()):le()},Ae=V=>{E(Ce=>[...Ce,V]);const Ne=r?.registerNestedMenu(V);return()=>{E(Ce=>nr(Ce,V)),Ne?.()}},ve=V=>c===g?.side&&Cu(V,g?.area),Ee=V=>{ve(V)&&V.preventDefault()},D=V=>{ve(V)||me()},he=V=>{ve(V)&&V.preventDefault()};ru({isDisabled:()=>!(r==null&&X.isOpen()&&t.isModal()),targets:()=>[w(),...T()].filter(Boolean)}),B(()=>{const V=w();if(!V||!r)return;const Ne=r.registerNestedMenu(V);U(()=>{Ne()})}),B(()=>{r===void 0&&o?.registerMenu(t.value(),[w(),...T()])}),B(()=>{r!==void 0||o===void 0||(o.value()===t.value()?(v()?.focus(),o.autoFocusMenu()&&se(!0)):ne())}),B(()=>{r!==void 0||o===void 0||X.isOpen()&&o.setValue(t.value())}),U(()=>{r===void 0&&o?.unregisterMenu(t.value())});const vt={dataset:q(()=>({"data-expanded":X.isOpen()?"":void 0,"data-closed":X.isOpen()?void 0:""})),isOpen:X.isOpen,contentPresent:te,nestedMenus:T,currentPlacement:I,pointerGraceTimeoutId:()=>u,autoFocus:x,listState:()=>ie,parentMenuContext:()=>r,triggerRef:v,contentRef:w,triggerId:d,contentId:h,setTriggerRef:p,setContentRef:b,open:se,close:ne,toggle:re,focusContent:me,onItemEnter:Ee,onItemLeave:D,onTriggerLeave:he,setPointerDir:V=>c=V,setPointerGraceTimeoutId:V=>u=V,setPointerGraceIntent:V=>g=V,registerNestedMenu:Ae,registerItemToParentDomCollection:n?.registerItem,registerTriggerId:Be(f),registerContentId:Be(y)};return m(N,{get children(){return m(Yi.Provider,{value:vt,get children(){return m(R,{when:s===void 0,get fallback(){return i.children},get children(){return m(Ai,j({anchorRef:v,contentRef:w,onCurrentPlacementChange:k},i))}})}})}})}function vs(e){const{direction:t}=Et();return m(hs,j({get placement(){return t()==="rtl"?"left-start":"right-start"},flip:!0},e))}var Su={close:(e,t)=>e==="ltr"?[t==="horizontal"?"ArrowLeft":"ArrowUp"]:[t==="horizontal"?"ArrowRight":"ArrowDown"]};function ms(e){const t=ht(),n=et(),[r,o]=ee(e,["onFocusOutside","onKeyDown"]),{direction:s}=Et();return m(ns,j({onOpenAutoFocus:g=>{g.preventDefault()},onCloseAutoFocus:g=>{g.preventDefault()},onFocusOutside:g=>{r.onFocusOutside?.(g);const c=g.target;Ke(t.triggerRef(),c)||t.close()},onKeyDown:g=>{de(g,r.onKeyDown);const c=Ke(g.currentTarget,g.target),d=Su.close(s(),n.orientation()).includes(g.key),f=t.parentMenuContext()!=null;c&&d&&f&&(t.close(),ke(t.triggerRef()))}},o))}var Ro=["Enter"," "],ku={open:(e,t)=>e==="ltr"?[...Ro,t==="horizontal"?"ArrowRight":"ArrowDown"]:[...Ro,t==="horizontal"?"ArrowLeft":"ArrowUp"]};function ps(e){let t;const n=et(),r=ht(),o=Q({id:n.generateId(`sub-trigger-${Pe()}`)},e),[s,a]=ee(o,["ref","id","textValue","disabled","onPointerMove","onPointerLeave","onPointerDown","onPointerUp","onClick","onKeyDown","onMouseDown","onFocus"]);let l=null;const i=()=>{l&&window.clearTimeout(l),l=null},{direction:u}=Et(),g=()=>s.id,c=()=>{const b=r.parentMenuContext();if(b==null)throw new Error("[kobalte]: `Menu.SubTrigger` must be used within a `Menu.Sub` component");return b.listState().selectionManager()},d=()=>r.listState().collection(),f=()=>c().focusedKey()===g(),h=gi({key:g,selectionManager:c,shouldSelectOnPressUp:!0,allowsDifferentPressOrigin:!0,disabled:()=>s.disabled},()=>t),y=b=>{de(b,s.onClick),!r.isOpen()&&!s.disabled&&r.open(!0)},v=b=>{if(de(b,s.onPointerMove),b.pointerType!=="mouse")return;const x=r.parentMenuContext();if(x?.onItemEnter(b),!b.defaultPrevented){if(s.disabled){x?.onItemLeave(b);return}!r.isOpen()&&!l&&(r.parentMenuContext()?.setPointerGraceIntent(null),l=window.setTimeout(()=>{r.open(!1),i()},100)),x?.onItemEnter(b),b.defaultPrevented||(r.listState().selectionManager().isFocused()&&(r.listState().selectionManager().setFocused(!1),r.listState().selectionManager().setFocusedKey(void 0)),ke(b.currentTarget),x?.listState().selectionManager().setFocused(!0),x?.listState().selectionManager().setFocusedKey(g()))}},p=b=>{if(de(b,s.onPointerLeave),b.pointerType!=="mouse")return;i();const x=r.parentMenuContext(),$=r.contentRef();if($){x?.setPointerGraceIntent({area:$u(r.currentPlacement(),b,$),side:r.currentPlacement().split("-")[0]}),window.clearTimeout(x?.pointerGraceTimeoutId());const I=window.setTimeout(()=>{x?.setPointerGraceIntent(null)},300);x?.setPointerGraceTimeoutId(I)}else{if(x?.onTriggerLeave(b),b.defaultPrevented)return;x?.setPointerGraceIntent(null)}x?.onItemLeave(b)},w=b=>{de(b,s.onKeyDown),!b.repeat&&(s.disabled||ku.open(u(),n.orientation()).includes(b.key)&&(b.stopPropagation(),b.preventDefault(),c().setFocused(!1),c().setFocusedKey(void 0),r.isOpen()||r.open("first"),r.focusContent(),r.listState().selectionManager().setFocused(!0),r.listState().selectionManager().setFocusedKey(d().getFirstKey())))};return B(()=>{if(r.registerItemToParentDomCollection==null)throw new Error("[kobalte]: `Menu.SubTrigger` must be used within a `Menu.Sub` component");const b=r.registerItemToParentDomCollection({ref:()=>t,type:"item",key:g(),textValue:s.textValue??t?.textContent??"",disabled:s.disabled??!1});U(b)}),B(dt(()=>r.parentMenuContext()?.pointerGraceTimeoutId(),b=>{U(()=>{window.clearTimeout(b),r.parentMenuContext()?.setPointerGraceIntent(null)})})),B(()=>U(r.registerTriggerId(s.id))),U(()=>{i()}),m(fe,j({as:"div",ref(b){const x=De($=>{r.setTriggerRef($),t=$},s.ref);typeof x=="function"&&x(b)},get id(){return s.id},role:"menuitem",get tabIndex(){return h.tabIndex()},"aria-haspopup":"true",get"aria-expanded"(){return r.isOpen()},get"aria-controls"(){return ge(()=>!!r.isOpen())()?r.contentId():void 0},get"aria-disabled"(){return s.disabled},get"data-key"(){return h.dataKey()},get"data-highlighted"(){return f()?"":void 0},get"data-disabled"(){return s.disabled?"":void 0},get onPointerDown(){return be([s.onPointerDown,h.onPointerDown])},get onPointerUp(){return be([s.onPointerUp,h.onPointerUp])},get onClick(){return be([y,h.onClick])},get onKeyDown(){return be([w,h.onKeyDown])},get onMouseDown(){return be([s.onMouseDown,h.onMouseDown])},get onFocus(){return be([s.onFocus,h.onFocus])},onPointerMove:v,onPointerLeave:p},()=>r.dataset(),a))}function Eu(e){const t=Bn(),n=`menu-${Pe()}`,r=Q({id:n,modal:!0},e),[o,s]=ee(r,["id","modal","preventScroll","forceMount","open","defaultOpen","onOpenChange","value","orientation"]),a=Li({open:()=>o.open,defaultOpen:()=>o.defaultOpen,onOpenChange:i=>o.onOpenChange?.(i)}),l={isModal:()=>o.modal??!0,preventScroll:()=>o.preventScroll??l.isModal(),forceMount:()=>o.forceMount??!1,generateId:fn(()=>o.id),value:()=>o.value,orientation:()=>o.orientation??t?.orientation()??"horizontal"};return m(Ji.Provider,{value:l,get children(){return m(hs,j({get open(){return a.isOpen()},get onOpenChange(){return a.setIsOpen}},s))}})}var Mu={};qn(Mu,{Root:()=>Nn,Separator:()=>Du});function Nn(e){let t;const n=Q({orientation:"horizontal"},e),[r,o]=ee(n,["ref","orientation"]),s=Pn(()=>t,()=>"hr");return m(fe,j({as:"hr",ref(a){const l=De(i=>t=i,r.ref);typeof l=="function"&&l(a)},get role(){return s()!=="hr"?"separator":void 0},get"aria-orientation"(){return r.orientation==="vertical"?"vertical":void 0},get"data-orientation"(){return r.orientation}},o))}var Du=Nn,J={};qn(J,{Arrow:()=>Mr,CheckboxItem:()=>es,Content:()=>ys,DropdownMenu:()=>Au,Group:()=>Or,GroupLabel:()=>os,Icon:()=>is,Item:()=>ss,ItemDescription:()=>as,ItemIndicator:()=>ls,ItemLabel:()=>cs,Portal:()=>us,RadioGroup:()=>fs,RadioItem:()=>gs,Root:()=>bs,Separator:()=>Nn,Sub:()=>vs,SubContent:()=>ms,SubTrigger:()=>ps,Trigger:()=>ts});function ys(e){const t=et(),n=ht(),[r,o]=ee(e,["onCloseAutoFocus","onInteractOutside"]);let s=!1;return m(bu,j({onCloseAutoFocus:i=>{r.onCloseAutoFocus?.(i),s||ke(n.triggerRef()),s=!1,i.preventDefault()},onInteractOutside:i=>{r.onInteractOutside?.(i),(!t.isModal()||i.detail.isContextMenu)&&(s=!0)}},o))}function bs(e){const t=`dropdownmenu-${Pe()}`,n=Q({id:t},e);return m(Eu,n)}var Au=Object.assign(bs,{Arrow:Mr,CheckboxItem:es,Content:ys,Group:Or,GroupLabel:os,Icon:is,Item:ss,ItemDescription:as,ItemIndicator:ls,ItemLabel:cs,Portal:us,RadioGroup:fs,RadioItem:gs,Separator:Nn,Sub:vs,SubContent:ms,SubTrigger:ps,Trigger:ts}),C={colors:{inherit:"inherit",current:"currentColor",transparent:"transparent",black:"#000000",white:"#ffffff",neutral:{50:"#f9fafb",100:"#f2f4f7",200:"#eaecf0",300:"#d0d5dd",400:"#98a2b3",500:"#667085",600:"#475467",700:"#344054",800:"#1d2939",900:"#101828"},darkGray:{50:"#525c7a",100:"#49536e",200:"#414962",300:"#394056",400:"#313749",500:"#292e3d",600:"#212530",700:"#191c24",800:"#111318",900:"#0b0d10"},gray:{50:"#f9fafb",100:"#f2f4f7",200:"#eaecf0",300:"#d0d5dd",400:"#98a2b3",500:"#667085",600:"#475467",700:"#344054",800:"#1d2939",900:"#101828"},blue:{25:"#F5FAFF",50:"#EFF8FF",100:"#D1E9FF",200:"#B2DDFF",300:"#84CAFF",400:"#53B1FD",500:"#2E90FA",600:"#1570EF",700:"#175CD3",800:"#1849A9",900:"#194185"},green:{25:"#F6FEF9",50:"#ECFDF3",100:"#D1FADF",200:"#A6F4C5",300:"#6CE9A6",400:"#32D583",500:"#12B76A",600:"#039855",700:"#027A48",800:"#05603A",900:"#054F31"},red:{50:"#fef2f2",100:"#fee2e2",200:"#fecaca",300:"#fca5a5",400:"#f87171",500:"#ef4444",600:"#dc2626",700:"#b91c1c",800:"#991b1b",900:"#7f1d1d",950:"#450a0a"},yellow:{25:"#FFFCF5",50:"#FFFAEB",100:"#FEF0C7",200:"#FEDF89",300:"#FEC84B",400:"#FDB022",500:"#F79009",600:"#DC6803",700:"#B54708",800:"#93370D",900:"#7A2E0E"},purple:{25:"#FAFAFF",50:"#F4F3FF",100:"#EBE9FE",200:"#D9D6FE",300:"#BDB4FE",400:"#9B8AFB",500:"#7A5AF8",600:"#6938EF",700:"#5925DC",800:"#4A1FB8",900:"#3E1C96"},teal:{25:"#F6FEFC",50:"#F0FDF9",100:"#CCFBEF",200:"#99F6E0",300:"#5FE9D0",400:"#2ED3B7",500:"#15B79E",600:"#0E9384",700:"#107569",800:"#125D56",900:"#134E48"},pink:{25:"#fdf2f8",50:"#fce7f3",100:"#fbcfe8",200:"#f9a8d4",300:"#f472b6",400:"#ec4899",500:"#db2777",600:"#be185d",700:"#9d174d",800:"#831843",900:"#500724"},cyan:{25:"#ecfeff",50:"#cffafe",100:"#a5f3fc",200:"#67e8f9",300:"#22d3ee",400:"#06b6d4",500:"#0891b2",600:"#0e7490",700:"#155e75",800:"#164e63",900:"#083344"}},alpha:{90:"e5",80:"cc"},font:{size:{xs:"calc(var(--tsqd-font-size) * 0.75)",sm:"calc(var(--tsqd-font-size) * 0.875)",md:"var(--tsqd-font-size)"},lineHeight:{xs:"calc(var(--tsqd-font-size) * 1)",sm:"calc(var(--tsqd-font-size) * 1.25)",md:"calc(var(--tsqd-font-size) * 1.5)"},weight:{medium:"500",semibold:"600",bold:"700"}},border:{radius:{xs:"calc(var(--tsqd-font-size) * 0.125)",sm:"calc(var(--tsqd-font-size) * 0.25)",full:"9999px"}},size:{.25:"calc(var(--tsqd-font-size) * 0.0625)",.5:"calc(var(--tsqd-font-size) * 0.125)",1:"calc(var(--tsqd-font-size) * 0.25)",1.5:"calc(var(--tsqd-font-size) * 0.375)",2:"calc(var(--tsqd-font-size) * 0.5)",2.5:"calc(var(--tsqd-font-size) * 0.625)",3:"calc(var(--tsqd-font-size) * 0.75)",3.5:"calc(var(--tsqd-font-size) * 0.875)",4:"calc(var(--tsqd-font-size) * 1)",4.5:"calc(var(--tsqd-font-size) * 1.125)",5:"calc(var(--tsqd-font-size) * 1.25)",6:"calc(var(--tsqd-font-size) * 1.5)",6.5:"calc(var(--tsqd-font-size) * 1.625)",14:"calc(var(--tsqd-font-size) * 3.5)"},shadow:{xs:(e="rgb(0 0 0 / 0.1)")=>"0 1px 2px 0 rgb(0 0 0 / 0.05)",sm:(e="rgb(0 0 0 / 0.1)")=>`0 1px 3px 0 ${e}, 0 1px 2px -1px ${e}`,md:(e="rgb(0 0 0 / 0.1)")=>`0 4px 6px -1px ${e}, 0 2px 4px -2px ${e}`,lg:(e="rgb(0 0 0 / 0.1)")=>`0 10px 15px -3px ${e}, 0 4px 6px -4px ${e}`,xl:(e="rgb(0 0 0 / 0.1)")=>`0 20px 25px -5px ${e}, 0 8px 10px -6px ${e}`,"2xl":(e="rgb(0 0 0 / 0.25)")=>`0 25px 50px -12px ${e}`,inner:(e="rgb(0 0 0 / 0.05)")=>`inset 0 2px 4px 0 ${e}`,none:()=>"none"}},Tu=_('<svg width=14 height=14 viewBox="0 0 14 14"fill=none xmlns=http://www.w3.org/2000/svg><path d="M13 13L9.00007 9M10.3333 5.66667C10.3333 8.244 8.244 10.3333 5.66667 10.3333C3.08934 10.3333 1 8.244 1 5.66667C1 3.08934 3.08934 1 5.66667 1C8.244 1 10.3333 3.08934 10.3333 5.66667Z"stroke=currentColor stroke-width=1.66667 stroke-linecap=round stroke-linejoin=round>'),Fu=_('<svg width=24 height=24 viewBox="0 0 24 24"fill=none xmlns=http://www.w3.org/2000/svg><path d="M9 3H15M3 6H21M19 6L18.2987 16.5193C18.1935 18.0975 18.1409 18.8867 17.8 19.485C17.4999 20.0118 17.0472 20.4353 16.5017 20.6997C15.882 21 15.0911 21 13.5093 21H10.4907C8.90891 21 8.11803 21 7.49834 20.6997C6.95276 20.4353 6.50009 20.0118 6.19998 19.485C5.85911 18.8867 5.8065 18.0975 5.70129 16.5193L5 6M10 10.5V15.5M14 10.5V15.5"stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round>'),Ou=_('<svg width=10 height=6 viewBox="0 0 10 6"fill=none xmlns=http://www.w3.org/2000/svg><path d="M1 1L5 5L9 1"stroke=currentColor stroke-width=1.66667 stroke-linecap=round stroke-linejoin=round>'),Iu=_('<svg width=12 height=12 viewBox="0 0 16 16"fill=none xmlns=http://www.w3.org/2000/svg><path d="M8 13.3333V2.66667M8 2.66667L4 6.66667M8 2.66667L12 6.66667"stroke=currentColor stroke-width=1.66667 stroke-linecap=round stroke-linejoin=round>'),Lu=_('<svg width=12 height=12 viewBox="0 0 16 16"fill=none xmlns=http://www.w3.org/2000/svg><path d="M8 2.66667V13.3333M8 13.3333L4 9.33333M8 13.3333L12 9.33333"stroke=currentColor stroke-width=1.66667 stroke-linecap=round stroke-linejoin=round>'),Pu=_('<svg width=12 height=12 viewBox="0 0 16 16"fill=none xmlns=http://www.w3.org/2000/svg style=transform:rotate(90deg)><path d="M8 2.66667V13.3333M8 13.3333L4 9.33333M8 13.3333L12 9.33333"stroke=currentColor stroke-width=1.66667 stroke-linecap=round stroke-linejoin=round>'),qu=_('<svg width=12 height=12 viewBox="0 0 16 16"fill=none xmlns=http://www.w3.org/2000/svg style=transform:rotate(-90deg)><path d="M8 2.66667V13.3333M8 13.3333L4 9.33333M8 13.3333L12 9.33333"stroke=currentColor stroke-width=1.66667 stroke-linecap=round stroke-linejoin=round>'),_u=_('<svg viewBox="0 0 24 24"height=12 width=12 fill=none xmlns=http://www.w3.org/2000/svg><path d="M12 2v2m0 16v2M4 12H2m4.314-5.686L4.9 4.9m12.786 1.414L19.1 4.9M6.314 17.69 4.9 19.104m12.786-1.414 1.414 1.414M22 12h-2m-3 0a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z"stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round>'),Ru=_('<svg viewBox="0 0 24 24"height=12 width=12 fill=none xmlns=http://www.w3.org/2000/svg><path d="M22 15.844a10.424 10.424 0 0 1-4.306.925c-5.779 0-10.463-4.684-10.463-10.462 0-1.536.33-2.994.925-4.307A10.464 10.464 0 0 0 2 11.538C2 17.316 6.684 22 12.462 22c4.243 0 7.896-2.526 9.538-6.156Z"stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round>'),zu=_('<svg viewBox="0 0 24 24"height=12 width=12 fill=none xmlns=http://www.w3.org/2000/svg><path d="M8 21h8m-4-4v4m-5.2-4h10.4c1.68 0 2.52 0 3.162-.327a3 3 0 0 0 1.311-1.311C22 14.72 22 13.88 22 12.2V7.8c0-1.68 0-2.52-.327-3.162a3 3 0 0 0-1.311-1.311C19.72 3 18.88 3 17.2 3H6.8c-1.68 0-2.52 0-3.162.327a3 3 0 0 0-1.311 1.311C2 5.28 2 6.12 2 7.8v4.4c0 1.68 0 2.52.327 3.162a3 3 0 0 0 1.311 1.311C4.28 17 5.12 17 6.8 17Z"stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round>'),Ku=_('<svg stroke=currentColor fill=currentColor stroke-width=0 viewBox="0 0 24 24"height=1em width=1em xmlns=http://www.w3.org/2000/svg><path fill=none d="M0 0h24v24H0z"></path><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3a4.237 4.237 0 00-6 0zm-4-4l2 2a7.074 7.074 0 0110 0l2-2C15.14 9.14 8.87 9.14 5 13z">'),Bu=_('<svg stroke-width=0 viewBox="0 0 24 24"height=1em width=1em xmlns=http://www.w3.org/2000/svg><path fill=none d="M24 .01c0-.01 0-.01 0 0L0 0v24h24V.01zM0 0h24v24H0V0zm0 0h24v24H0V0z"></path><path d="M22.99 9C19.15 5.16 13.8 3.76 8.84 4.78l2.52 2.52c3.47-.17 6.99 1.05 9.63 3.7l2-2zm-4 4a9.793 9.793 0 00-4.49-2.56l3.53 3.53.96-.97zM2 3.05L5.07 6.1C3.6 6.82 2.22 7.78 1 9l1.99 2c1.24-1.24 2.67-2.16 4.2-2.77l2.24 2.24A9.684 9.684 0 005 13v.01L6.99 15a7.042 7.042 0 014.92-2.06L18.98 20l1.27-1.26L3.29 1.79 2 3.05zM9 17l3 3 3-3a4.237 4.237 0 00-6 0z">'),Nu=_('<svg width=24 height=24 viewBox="0 0 24 24"fill=none xmlns=http://www.w3.org/2000/svg><path d="M9.3951 19.3711L9.97955 20.6856C10.1533 21.0768 10.4368 21.4093 10.7958 21.6426C11.1547 21.8759 11.5737 22.0001 12.0018 22C12.4299 22.0001 12.8488 21.8759 13.2078 21.6426C13.5667 21.4093 13.8503 21.0768 14.024 20.6856L14.6084 19.3711C14.8165 18.9047 15.1664 18.5159 15.6084 18.26C16.0532 18.0034 16.5678 17.8941 17.0784 17.9478L18.5084 18.1C18.9341 18.145 19.3637 18.0656 19.7451 17.8713C20.1265 17.6771 20.4434 17.3763 20.6573 17.0056C20.8715 16.635 20.9735 16.2103 20.9511 15.7829C20.9286 15.3555 20.7825 14.9438 20.5307 14.5978L19.684 13.4344C19.3825 13.0171 19.2214 12.5148 19.224 12C19.2239 11.4866 19.3865 10.9864 19.6884 10.5711L20.5351 9.40778C20.787 9.06175 20.933 8.65007 20.9555 8.22267C20.978 7.79528 20.8759 7.37054 20.6618 7C20.4479 6.62923 20.131 6.32849 19.7496 6.13423C19.3681 5.93997 18.9386 5.86053 18.5129 5.90556L17.0829 6.05778C16.5722 6.11141 16.0577 6.00212 15.6129 5.74556C15.17 5.48825 14.82 5.09736 14.6129 4.62889L14.024 3.31444C13.8503 2.92317 13.5667 2.59072 13.2078 2.3574C12.8488 2.12408 12.4299 1.99993 12.0018 2C11.5737 1.99993 11.1547 2.12408 10.7958 2.3574C10.4368 2.59072 10.1533 2.92317 9.97955 3.31444L9.3951 4.62889C9.18803 5.09736 8.83798 5.48825 8.3951 5.74556C7.95032 6.00212 7.43577 6.11141 6.9251 6.05778L5.49066 5.90556C5.06499 5.86053 4.6354 5.93997 4.25397 6.13423C3.87255 6.32849 3.55567 6.62923 3.34177 7C3.12759 7.37054 3.02555 7.79528 3.04804 8.22267C3.07052 8.65007 3.21656 9.06175 3.46844 9.40778L4.3151 10.5711C4.61704 10.9864 4.77964 11.4866 4.77955 12C4.77964 12.5134 4.61704 13.0137 4.3151 13.4289L3.46844 14.5922C3.21656 14.9382 3.07052 15.3499 3.04804 15.7773C3.02555 16.2047 3.12759 16.6295 3.34177 17C3.55589 17.3706 3.8728 17.6712 4.25417 17.8654C4.63554 18.0596 5.06502 18.1392 5.49066 18.0944L6.92066 17.9422C7.43133 17.8886 7.94587 17.9979 8.39066 18.2544C8.83519 18.511 9.18687 18.902 9.3951 19.3711Z"stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round></path><path d="M12 15C13.6568 15 15 13.6569 15 12C15 10.3431 13.6568 9 12 9C10.3431 9 8.99998 10.3431 8.99998 12C8.99998 13.6569 10.3431 15 12 15Z"stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round>'),Hu=_('<svg width=24 height=24 viewBox="0 0 24 24"fill=none xmlns=http://www.w3.org/2000/svg><path d="M16 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V8M11.5 12.5L17 7M17 7H12M17 7V12M6.2 21H8.8C9.9201 21 10.4802 21 10.908 20.782C11.2843 20.5903 11.5903 20.2843 11.782 19.908C12 19.4802 12 18.9201 12 17.8V15.2C12 14.0799 12 13.5198 11.782 13.092C11.5903 12.7157 11.2843 12.4097 10.908 12.218C10.4802 12 9.92011 12 8.8 12H6.2C5.0799 12 4.51984 12 4.09202 12.218C3.71569 12.4097 3.40973 12.7157 3.21799 13.092C3 13.5198 3 14.0799 3 15.2V17.8C3 18.9201 3 19.4802 3.21799 19.908C3.40973 20.2843 3.71569 20.5903 4.09202 20.782C4.51984 21 5.07989 21 6.2 21Z"stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round>'),Gu=_('<svg width=24 height=24 viewBox="0 0 24 24"fill=none xmlns=http://www.w3.org/2000/svg><path class=copier d="M8 8V5.2C8 4.0799 8 3.51984 8.21799 3.09202C8.40973 2.71569 8.71569 2.40973 9.09202 2.21799C9.51984 2 10.0799 2 11.2 2H18.8C19.9201 2 20.4802 2 20.908 2.21799C21.2843 2.40973 21.5903 2.71569 21.782 3.09202C22 3.51984 22 4.0799 22 5.2V12.8C22 13.9201 22 14.4802 21.782 14.908C21.5903 15.2843 21.2843 15.5903 20.908 15.782C20.4802 16 19.9201 16 18.8 16H16M5.2 22H12.8C13.9201 22 14.4802 22 14.908 21.782C15.2843 21.5903 15.5903 21.2843 15.782 20.908C16 20.4802 16 19.9201 16 18.8V11.2C16 10.0799 16 9.51984 15.782 9.09202C15.5903 8.71569 15.2843 8.40973 14.908 8.21799C14.4802 8 13.9201 8 12.8 8H5.2C4.0799 8 3.51984 8 3.09202 8.21799C2.71569 8.40973 2.40973 8.71569 2.21799 9.09202C2 9.51984 2 10.0799 2 11.2V18.8C2 19.9201 2 20.4802 2.21799 20.908C2.40973 21.2843 2.71569 21.5903 3.09202 21.782C3.51984 22 4.07989 22 5.2 22Z"stroke-width=2 stroke-linecap=round stroke-linejoin=round stroke=currentColor>'),Uu=_('<svg width=24 height=24 viewBox="0 0 24 24"fill=none xmlns=http://www.w3.org/2000/svg><path d="M2.5 21.4998L8.04927 19.3655C8.40421 19.229 8.58168 19.1607 8.74772 19.0716C8.8952 18.9924 9.0358 18.901 9.16804 18.7984C9.31692 18.6829 9.45137 18.5484 9.72028 18.2795L21 6.99982C22.1046 5.89525 22.1046 4.10438 21 2.99981C19.8955 1.89525 18.1046 1.89524 17 2.99981L5.72028 14.2795C5.45138 14.5484 5.31692 14.6829 5.20139 14.8318C5.09877 14.964 5.0074 15.1046 4.92823 15.2521C4.83911 15.4181 4.77085 15.5956 4.63433 15.9506L2.5 21.4998ZM2.5 21.4998L4.55812 16.1488C4.7054 15.7659 4.77903 15.5744 4.90534 15.4867C5.01572 15.4101 5.1523 15.3811 5.2843 15.4063C5.43533 15.4351 5.58038 15.5802 5.87048 15.8703L8.12957 18.1294C8.41967 18.4195 8.56472 18.5645 8.59356 18.7155C8.61877 18.8475 8.58979 18.9841 8.51314 19.0945C8.42545 19.2208 8.23399 19.2944 7.85107 19.4417L2.5 21.4998Z"stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round>'),ws=_('<svg width=24 height=24 viewBox="0 0 24 24"fill=none xmlns=http://www.w3.org/2000/svg><path d="M7.5 12L10.5 15L16.5 9M7.8 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21Z"stroke-width=2 stroke-linecap=round stroke-linejoin=round>'),Vu=_('<svg width=24 height=24 viewBox="0 0 24 24"fill=none xmlns=http://www.w3.org/2000/svg><path d="M9 9L15 15M15 9L9 15M7.8 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21Z"stroke=#F04438 stroke-width=2 stroke-linecap=round stroke-linejoin=round>'),ju=_('<svg width=24 height=24 viewBox="0 0 24 24"fill=none stroke=currentColor stroke-width=2 xmlns=http://www.w3.org/2000/svg><rect class=list width=20 height=20 y=2 x=2 rx=2></rect><line class=list-item y1=7 y2=7 x1=6 x2=18></line><line class=list-item y2=12 y1=12 x1=6 x2=18></line><line class=list-item y1=17 y2=17 x1=6 x2=18>'),Wu=_('<svg viewBox="0 0 24 24"height=20 width=20 fill=none xmlns=http://www.w3.org/2000/svg><path d="M3 7.8c0-1.68 0-2.52.327-3.162a3 3 0 0 1 1.311-1.311C5.28 3 6.12 3 7.8 3h8.4c1.68 0 2.52 0 3.162.327a3 3 0 0 1 1.311 1.311C21 5.28 21 6.12 21 7.8v8.4c0 1.68 0 2.52-.327 3.162a3 3 0 0 1-1.311 1.311C18.72 21 17.88 21 16.2 21H7.8c-1.68 0-2.52 0-3.162-.327a3 3 0 0 1-1.311-1.311C3 18.72 3 17.88 3 16.2V7.8Z"stroke-width=2 stroke-linecap=round stroke-linejoin=round>'),Qu=_('<svg width=14 height=14 viewBox="0 0 24 24"fill=none xmlns=http://www.w3.org/2000/svg><path d="M7.5 12L10.5 15L16.5 9M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round>'),Yu=_('<svg width=14 height=14 viewBox="0 0 24 24"fill=none xmlns=http://www.w3.org/2000/svg><path d="M12 2V6M12 18V22M6 12H2M22 12H18M19.0784 19.0784L16.25 16.25M19.0784 4.99994L16.25 7.82837M4.92157 19.0784L7.75 16.25M4.92157 4.99994L7.75 7.82837"stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round></path><animateTransform attributeName=transform attributeType=XML type=rotate from=0 to=360 dur=2s repeatCount=indefinite>'),Xu=_('<svg width=14 height=14 viewBox="0 0 24 24"fill=none xmlns=http://www.w3.org/2000/svg><path d="M15 9L9 15M9 9L15 15M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round>'),Zu=_('<svg width=14 height=14 viewBox="0 0 24 24"fill=none xmlns=http://www.w3.org/2000/svg><path d="M9.5 15V9M14.5 15V9M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round>'),Ju=_('<svg version=1.0 viewBox="0 0 633 633"><linearGradient x1=-666.45 x2=-666.45 y1=163.28 y2=163.99 gradientTransform="matrix(633 0 0 633 422177 -103358)"gradientUnits=userSpaceOnUse><stop stop-color=#6BDAFF offset=0></stop><stop stop-color=#F9FFB5 offset=.32></stop><stop stop-color=#FFA770 offset=.71></stop><stop stop-color=#FF7373 offset=1></stop></linearGradient><circle cx=316.5 cy=316.5 r=316.5></circle><defs><filter x=-137.5 y=412 width=454 height=396.9 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"></feColorMatrix></filter></defs><mask x=-137.5 y=412 width=454 height=396.9 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#fff></circle></g></mask><g><ellipse cx=89.5 cy=610.5 rx=214.5 ry=186 fill=#015064 stroke=#00CFE2 stroke-width=25></ellipse></g><defs><filter x=316.5 y=412 width=454 height=396.9 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"></feColorMatrix></filter></defs><mask x=316.5 y=412 width=454 height=396.9 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#fff></circle></g></mask><g><ellipse cx=543.5 cy=610.5 rx=214.5 ry=186 fill=#015064 stroke=#00CFE2 stroke-width=25></ellipse></g><defs><filter x=-137.5 y=450 width=454 height=396.9 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"></feColorMatrix></filter></defs><mask x=-137.5 y=450 width=454 height=396.9 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#fff></circle></g></mask><g><ellipse cx=89.5 cy=648.5 rx=214.5 ry=186 fill=#015064 stroke=#00A8B8 stroke-width=25></ellipse></g><defs><filter x=316.5 y=450 width=454 height=396.9 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"></feColorMatrix></filter></defs><mask x=316.5 y=450 width=454 height=396.9 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#fff></circle></g></mask><g><ellipse cx=543.5 cy=648.5 rx=214.5 ry=186 fill=#015064 stroke=#00A8B8 stroke-width=25></ellipse></g><defs><filter x=-137.5 y=486 width=454 height=396.9 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"></feColorMatrix></filter></defs><mask x=-137.5 y=486 width=454 height=396.9 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#fff></circle></g></mask><g><ellipse cx=89.5 cy=684.5 rx=214.5 ry=186 fill=#015064 stroke=#007782 stroke-width=25></ellipse></g><defs><filter x=316.5 y=486 width=454 height=396.9 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"></feColorMatrix></filter></defs><mask x=316.5 y=486 width=454 height=396.9 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#fff></circle></g></mask><g><ellipse cx=543.5 cy=684.5 rx=214.5 ry=186 fill=#015064 stroke=#007782 stroke-width=25></ellipse></g><defs><filter x=272.2 y=308 width=176.9 height=129.3 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"></feColorMatrix></filter></defs><mask x=272.2 y=308 width=176.9 height=129.3 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#fff></circle></g></mask><g><line x1=436 x2=431 y1=403.2 y2=431.8 fill=none stroke=#000 stroke-linecap=round stroke-linejoin=bevel stroke-width=11></line><line x1=291 x2=280 y1=341.5 y2=403.5 fill=none stroke=#000 stroke-linecap=round stroke-linejoin=bevel stroke-width=11></line><line x1=332.9 x2=328.6 y1=384.1 y2=411.2 fill=none stroke=#000 stroke-linecap=round stroke-linejoin=bevel stroke-width=11></line><linearGradient x1=-670.75 x2=-671.59 y1=164.4 y2=164.49 gradientTransform="matrix(-184.16 -32.472 -11.461 64.997 -121359 -32126)"gradientUnits=userSpaceOnUse><stop stop-color=#EE2700 offset=0></stop><stop stop-color=#FF008E offset=1></stop></linearGradient><path d="m344.1 363 97.7 17.2c5.8 2.1 8.2 6.1 7.1 12.1s-4.7 9.2-11 9.9l-106-18.7-57.5-59.2c-3.2-4.8-2.9-9.1 0.8-12.8s8.3-4.4 13.7-2.1l55.2 53.6z"clip-rule=evenodd fill-rule=evenodd></path><line x1=428.2 x2=429.1 y1=384.5 y2=378 fill=none stroke=#fff stroke-linecap=round stroke-linejoin=bevel stroke-width=7></line><line x1=395.2 x2=396.1 y1=379.5 y2=373 fill=none stroke=#fff stroke-linecap=round stroke-linejoin=bevel stroke-width=7></line><line x1=362.2 x2=363.1 y1=373.5 y2=367.4 fill=none stroke=#fff stroke-linecap=round stroke-linejoin=bevel stroke-width=7></line><line x1=324.2 x2=328.4 y1=351.3 y2=347.4 fill=none stroke=#fff stroke-linecap=round stroke-linejoin=bevel stroke-width=7></line><line x1=303.2 x2=307.4 y1=331.3 y2=327.4 fill=none stroke=#fff stroke-linecap=round stroke-linejoin=bevel stroke-width=7></line></g><defs><filter x=73.2 y=113.8 width=280.6 height=317.4 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"></feColorMatrix></filter></defs><mask x=73.2 y=113.8 width=280.6 height=317.4 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#fff></circle></g></mask><g><linearGradient x1=-672.16 x2=-672.16 y1=165.03 y2=166.03 gradientTransform="matrix(-100.18 48.861 97.976 200.88 -83342 -93.059)"gradientUnits=userSpaceOnUse><stop stop-color=#A17500 offset=0></stop><stop stop-color=#5D2100 offset=1></stop></linearGradient><path d="m192.3 203c8.1 37.3 14 73.6 17.8 109.1 3.8 35.4 2.8 75.1-3 119.2l61.2-16.7c-15.6-59-25.2-97.9-28.6-116.6s-10.8-51.9-22.1-99.6l-25.3 4.6"clip-rule=evenodd fill-rule=evenodd></path><g stroke=#2F8A00><linearGradient x1=-660.23 x2=-660.23 y1=166.72 y2=167.72 gradientTransform="matrix(92.683 4.8573 -2.0259 38.657 61680 -3088.6)"gradientUnits=userSpaceOnUse><stop stop-color=#2F8A00 offset=0></stop><stop stop-color=#90FF57 offset=1></stop></linearGradient><path d="m195 183.9s-12.6-22.1-36.5-29.9c-15.9-5.2-34.4-1.5-55.5 11.1 15.9 14.3 29.5 22.6 40.7 24.9 16.8 3.6 51.3-6.1 51.3-6.1z"clip-rule=evenodd fill-rule=evenodd stroke-width=13></path><linearGradient x1=-661.36 x2=-661.36 y1=164.18 y2=165.18 gradientTransform="matrix(110 5.7648 -6.3599 121.35 73933 -15933)"gradientUnits=userSpaceOnUse><stop stop-color=#2F8A00 offset=0></stop><stop stop-color=#90FF57 offset=1></stop></linearGradient><path d="m194.9 184.5s-47.5-8.5-83.2 15.7c-23.8 16.2-34.3 49.3-31.6 99.4 30.3-27.8 52.1-48.5 65.2-61.9 19.8-20.2 49.6-53.2 49.6-53.2z"clip-rule=evenodd fill-rule=evenodd stroke-width=13></path><linearGradient x1=-656.79 x2=-656.79 y1=165.15 y2=166.15 gradientTransform="matrix(62.954 3.2993 -3.5023 66.828 42156 -8754.1)"gradientUnits=userSpaceOnUse><stop stop-color=#2F8A00 offset=0></stop><stop stop-color=#90FF57 offset=1></stop></linearGradient><path d="m195 183.9c-0.8-21.9 6-38 20.6-48.2s29.8-15.4 45.5-15.3c-6.1 21.4-14.5 35.8-25.2 43.4s-24.4 14.2-40.9 20.1z"clip-rule=evenodd fill-rule=evenodd stroke-width=13></path><linearGradient x1=-663.07 x2=-663.07 y1=165.44 y2=166.44 gradientTransform="matrix(152.47 7.9907 -3.0936 59.029 101884 -4318.7)"gradientUnits=userSpaceOnUse><stop stop-color=#2F8A00 offset=0></stop><stop stop-color=#90FF57 offset=1></stop></linearGradient><path d="m194.9 184.5c31.9-30 64.1-39.7 96.7-29s50.8 30.4 54.6 59.1c-35.2-5.5-60.4-9.6-75.8-12.1-15.3-2.6-40.5-8.6-75.5-18z"clip-rule=evenodd fill-rule=evenodd stroke-width=13></path><linearGradient x1=-662.57 x2=-662.57 y1=164.44 y2=165.44 gradientTransform="matrix(136.46 7.1517 -5.2163 99.533 91536 -11442)"gradientUnits=userSpaceOnUse><stop stop-color=#2F8A00 offset=0></stop><stop stop-color=#90FF57 offset=1></stop></linearGradient><path d="m194.9 184.5c35.8-7.6 65.6-0.2 89.2 22s37.7 49 42.3 80.3c-39.8-9.7-68.3-23.8-85.5-42.4s-32.5-38.5-46-59.9z"clip-rule=evenodd fill-rule=evenodd stroke-width=13></path><linearGradient x1=-656.43 x2=-656.43 y1=163.86 y2=164.86 gradientTransform="matrix(60.866 3.1899 -8.7773 167.48 41560 -25168)"gradientUnits=userSpaceOnUse><stop stop-color=#2F8A00 offset=0></stop><stop stop-color=#90FF57 offset=1></stop></linearGradient><path d="m194.9 184.5c-33.6 13.8-53.6 35.7-60.1 65.6s-3.6 63.1 8.7 99.6c27.4-40.3 43.2-69.6 47.4-88s5.6-44.1 4-77.2z"clip-rule=evenodd fill-rule=evenodd stroke-width=13></path><path d="m196.5 182.3c-14.8 21.6-25.1 41.4-30.8 59.4s-9.5 33-11.1 45.1"fill=none stroke-linecap=round stroke-width=8></path><path d="m194.9 185.7c-24.4 1.7-43.8 9-58.1 21.8s-24.7 25.4-31.3 37.8"fill=none stroke-linecap=round stroke-width=8></path><path d="m204.5 176.4c29.7-6.7 52-8.4 67-5.1s26.9 8.6 35.8 15.9"fill=none stroke-linecap=round stroke-width=8></path><path d="m196.5 181.4c20.3 9.9 38.2 20.5 53.9 31.9s27.4 22.1 35.1 32"fill=none stroke-linecap=round stroke-width=8></path></g></g><defs><filter x=50.5 y=399 width=532 height=633 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"></feColorMatrix></filter></defs><mask x=50.5 y=399 width=532 height=633 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#fff></circle></g></mask><g><linearGradient x1=-666.06 x2=-666.23 y1=163.36 y2=163.75 gradientTransform="matrix(532 0 0 633 354760 -102959)"gradientUnits=userSpaceOnUse><stop stop-color=#FFF400 offset=0></stop><stop stop-color=#3C8700 offset=1></stop></linearGradient><ellipse cx=316.5 cy=715.5 rx=266 ry=316.5></ellipse></g><defs><filter x=391 y=-24 width=288 height=283 filterUnits=userSpaceOnUse><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"></feColorMatrix></filter></defs><mask x=391 y=-24 width=288 height=283 maskUnits=userSpaceOnUse><g><circle cx=316.5 cy=316.5 r=316.5 fill=#fff></circle></g></mask><g><linearGradient x1=-664.56 x2=-664.56 y1=163.79 y2=164.79 gradientTransform="matrix(227 0 0 227 151421 -37204)"gradientUnits=userSpaceOnUse><stop stop-color=#FFDF00 offset=0></stop><stop stop-color=#FF9D00 offset=1></stop></linearGradient><circle cx=565.5 cy=89.5 r=113.5></circle><linearGradient x1=-644.5 x2=-645.77 y1=342 y2=342 gradientTransform="matrix(30 0 0 1 19770 -253)"gradientUnits=userSpaceOnUse><stop stop-color=#FFA400 offset=0></stop><stop stop-color=#FF5E00 offset=1></stop></linearGradient><line x1=427 x2=397 y1=89 y2=89 fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12></line><linearGradient x1=-641.56 x2=-642.83 y1=196.02 y2=196.07 gradientTransform="matrix(26.5 0 0 5.5 17439 -1025.5)"gradientUnits=userSpaceOnUse><stop stop-color=#FFA400 offset=0></stop><stop stop-color=#FF5E00 offset=1></stop></linearGradient><line x1=430.5 x2=404 y1=55.5 y2=50 fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12></line><linearGradient x1=-643.73 x2=-645 y1=185.83 y2=185.9 gradientTransform="matrix(29 0 0 8 19107 -1361)"gradientUnits=userSpaceOnUse><stop stop-color=#FFA400 offset=0></stop><stop stop-color=#FF5E00 offset=1></stop></linearGradient><line x1=431 x2=402 y1=122 y2=130 fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12></line><linearGradient x1=-638.94 x2=-640.22 y1=177.09 y2=177.39 gradientTransform="matrix(24 0 0 13 15783 -2145)"gradientUnits=userSpaceOnUse><stop stop-color=#FFA400 offset=0></stop><stop stop-color=#FF5E00 offset=1></stop></linearGradient><line x1=442 x2=418 y1=153 y2=166 fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12></line><linearGradient x1=-633.42 x2=-634.7 y1=172.41 y2=173.31 gradientTransform="matrix(20 0 0 19 13137 -3096)"gradientUnits=userSpaceOnUse><stop stop-color=#FFA400 offset=0></stop><stop stop-color=#FF5E00 offset=1></stop></linearGradient><line x1=464 x2=444 y1=180 y2=199 fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12></line><linearGradient x1=-619.05 x2=-619.52 y1=170.82 y2=171.82 gradientTransform="matrix(13.83 0 0 22.85 9050 -3703.4)"gradientUnits=userSpaceOnUse><stop stop-color=#FFA400 offset=0></stop><stop stop-color=#FF5E00 offset=1></stop></linearGradient><line x1=491.4 x2=477.5 y1=203 y2=225.9 fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12></line><linearGradient x1=-578.5 x2=-578.63 y1=170.31 y2=171.31 gradientTransform="matrix(7.5 0 0 24.5 4860 -3953)"gradientUnits=userSpaceOnUse><stop stop-color=#FFA400 offset=0></stop><stop stop-color=#FF5E00 offset=1></stop></linearGradient><line x1=524.5 x2=517 y1=219.5 y2=244 fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12></line><linearGradient x1=666.5 x2=666.5 y1=170.31 y2=171.31 gradientTransform="matrix(.5 0 0 24.5 231.5 -3944)"gradientUnits=userSpaceOnUse><stop stop-color=#FFA400 offset=0></stop><stop stop-color=#FF5E00 offset=1></stop></linearGradient><line x1=564.5 x2=565 y1=228.5 y2=253 fill=none stroke-linecap=round stroke-linejoin=bevel stroke-width=12>');function ed(){return Tu()}function xs(){return Fu()}function Bt(){return Ou()}function zo(){return Iu()}function Ko(){return Lu()}function td(){return Pu()}function nd(){return qu()}function rd(){return _u()}function od(){return Ru()}function id(){return zu()}function sd(){return Ku()}function ad(){return Bu()}function ld(){return Nu()}function cd(){return Hu()}function ud(){return Gu()}function dd(){return Uu()}function fd(e){return(()=>{var t=ws(),n=t.firstChild;return G(()=>A(n,"stroke",e.theme==="dark"?"#12B76A":"#027A48")),t})()}function gd(){return Vu()}function hd(){return ju()}function vd(e){return[m(R,{get when(){return e.checked},get children(){var t=ws(),n=t.firstChild;return G(()=>A(n,"stroke",e.theme==="dark"?"#9B8AFB":"#6938EF")),t}}),m(R,{get when(){return!e.checked},get children(){var t=Wu(),n=t.firstChild;return G(()=>A(n,"stroke",e.theme==="dark"?"#9B8AFB":"#6938EF")),t}})]}function dr(){return Qu()}function md(){return Yu()}function pd(){return Xu()}function yd(){return Zu()}function Bo(){const e=Pe();return(()=>{var t=Ju(),n=t.firstChild,r=n.nextSibling,o=r.nextSibling,s=o.firstChild,a=o.nextSibling,l=a.firstChild,i=a.nextSibling,u=i.nextSibling,g=u.firstChild,c=u.nextSibling,d=c.firstChild,f=c.nextSibling,h=f.nextSibling,y=h.firstChild,v=h.nextSibling,p=v.firstChild,w=v.nextSibling,b=w.nextSibling,x=b.firstChild,$=b.nextSibling,I=$.firstChild,k=$.nextSibling,T=k.nextSibling,E=T.firstChild,F=T.nextSibling,H=F.firstChild,N=F.nextSibling,X=N.nextSibling,te=X.firstChild,ie=X.nextSibling,se=ie.firstChild,ne=ie.nextSibling,re=ne.nextSibling,le=re.firstChild,me=re.nextSibling,Ae=me.firstChild,ve=me.nextSibling,Ee=ve.firstChild,D=Ee.nextSibling,he=D.nextSibling,Y=he.nextSibling,vt=Y.nextSibling,V=ve.nextSibling,Ne=V.firstChild,Ce=V.nextSibling,Lt=Ce.firstChild,qe=Ce.nextSibling,mt=qe.firstChild,Mt=mt.nextSibling,tt=Mt.nextSibling,Qe=tt.firstChild,pt=Qe.nextSibling,L=pt.nextSibling,ce=L.nextSibling,Me=ce.nextSibling,ae=Me.nextSibling,oe=ae.nextSibling,ue=oe.nextSibling,pe=ue.nextSibling,Z=pe.nextSibling,nt=Z.nextSibling,rt=nt.nextSibling,He=qe.nextSibling,Dt=He.firstChild,ot=He.nextSibling,At=ot.firstChild,it=ot.nextSibling,yt=it.firstChild,pn=yt.nextSibling,Yt=it.nextSibling,yn=Yt.firstChild,Pt=Yt.nextSibling,bn=Pt.firstChild,Xt=Pt.nextSibling,Zt=Xt.firstChild,Jt=Zt.nextSibling,en=Jt.nextSibling,Lr=en.nextSibling,Pr=Lr.nextSibling,qr=Pr.nextSibling,_r=qr.nextSibling,Rr=_r.nextSibling,zr=Rr.nextSibling,Kr=zr.nextSibling,Br=Kr.nextSibling,Nr=Br.nextSibling,Hr=Nr.nextSibling,Gr=Hr.nextSibling,Ur=Gr.nextSibling,Vr=Ur.nextSibling,jr=Vr.nextSibling,Ds=jr.nextSibling;return A(n,"id",`a-${e}`),A(r,"fill",`url(#a-${e})`),A(s,"id",`am-${e}`),A(a,"id",`b-${e}`),A(l,"filter",`url(#am-${e})`),A(i,"mask",`url(#b-${e})`),A(g,"id",`ah-${e}`),A(c,"id",`k-${e}`),A(d,"filter",`url(#ah-${e})`),A(f,"mask",`url(#k-${e})`),A(y,"id",`ae-${e}`),A(v,"id",`j-${e}`),A(p,"filter",`url(#ae-${e})`),A(w,"mask",`url(#j-${e})`),A(x,"id",`ai-${e}`),A($,"id",`i-${e}`),A(I,"filter",`url(#ai-${e})`),A(k,"mask",`url(#i-${e})`),A(E,"id",`aj-${e}`),A(F,"id",`h-${e}`),A(H,"filter",`url(#aj-${e})`),A(N,"mask",`url(#h-${e})`),A(te,"id",`ag-${e}`),A(ie,"id",`g-${e}`),A(se,"filter",`url(#ag-${e})`),A(ne,"mask",`url(#g-${e})`),A(le,"id",`af-${e}`),A(me,"id",`f-${e}`),A(Ae,"filter",`url(#af-${e})`),A(ve,"mask",`url(#f-${e})`),A(Y,"id",`m-${e}`),A(vt,"fill",`url(#m-${e})`),A(Ne,"id",`ak-${e}`),A(Ce,"id",`e-${e}`),A(Lt,"filter",`url(#ak-${e})`),A(qe,"mask",`url(#e-${e})`),A(mt,"id",`n-${e}`),A(Mt,"fill",`url(#n-${e})`),A(Qe,"id",`r-${e}`),A(pt,"fill",`url(#r-${e})`),A(L,"id",`s-${e}`),A(ce,"fill",`url(#s-${e})`),A(Me,"id",`q-${e}`),A(ae,"fill",`url(#q-${e})`),A(oe,"id",`p-${e}`),A(ue,"fill",`url(#p-${e})`),A(pe,"id",`o-${e}`),A(Z,"fill",`url(#o-${e})`),A(nt,"id",`l-${e}`),A(rt,"fill",`url(#l-${e})`),A(Dt,"id",`al-${e}`),A(ot,"id",`d-${e}`),A(At,"filter",`url(#al-${e})`),A(it,"mask",`url(#d-${e})`),A(yt,"id",`u-${e}`),A(pn,"fill",`url(#u-${e})`),A(yn,"id",`ad-${e}`),A(Pt,"id",`c-${e}`),A(bn,"filter",`url(#ad-${e})`),A(Xt,"mask",`url(#c-${e})`),A(Zt,"id",`t-${e}`),A(Jt,"fill",`url(#t-${e})`),A(en,"id",`v-${e}`),A(Lr,"stroke",`url(#v-${e})`),A(Pr,"id",`aa-${e}`),A(qr,"stroke",`url(#aa-${e})`),A(_r,"id",`w-${e}`),A(Rr,"stroke",`url(#w-${e})`),A(zr,"id",`ac-${e}`),A(Kr,"stroke",`url(#ac-${e})`),A(Br,"id",`ab-${e}`),A(Nr,"stroke",`url(#ab-${e})`),A(Hr,"id",`y-${e}`),A(Gr,"stroke",`url(#y-${e})`),A(Ur,"id",`x-${e}`),A(Vr,"stroke",`url(#x-${e})`),A(jr,"id",`z-${e}`),A(Ds,"stroke",`url(#z-${e})`),t})()}var bd=_('<span><svg width=16 height=16 viewBox="0 0 16 16"fill=none xmlns=http://www.w3.org/2000/svg><path d="M6 12L10 8L6 4"stroke-width=2 stroke-linecap=round stroke-linejoin=round>'),wd=_('<button title="Copy object to clipboard">'),xd=_('<button title="Remove all items"aria-label="Remove all items">'),$d=_('<button title="Delete item"aria-label="Delete item">'),Cd=_('<button title="Toggle value"aria-label="Toggle value">'),Sd=_('<button title="Bulk Edit Data"aria-label="Bulk Edit Data">'),rn=_("<div>"),kd=_("<div><button> <span></span> <span> "),Ed=_("<input>"),No=_("<span>"),Md=_("<div><label>:"),Dd=_("<div><div><button> [<!>...<!>]");function Ad(e,t){let n=0;const r=[];for(;n<e.length;)r.push(e.slice(n,n+t)),n=n+t;return r}var Ho=e=>{const t=$e(),n=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,r=q(()=>t()==="dark"?Qt(n):Wt(n));return(()=>{var o=bd();return G(()=>O(o,P(r().expander,n`
          transform: rotate(${e.expanded?90:0}deg);
        `,e.expanded&&n`
            & svg {
              top: -1px;
            }
          `))),o})()},Td=e=>{const t=$e(),n=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,r=q(()=>t()==="dark"?Qt(n):Wt(n)),[o,s]=z("NoCopy");return(()=>{var a=wd();return zs(a,"click",o()==="NoCopy"?()=>{navigator.clipboard.writeText(Ks(e.value)).then(()=>{s("SuccessCopy"),setTimeout(()=>{s("NoCopy")},1500)},l=>{console.error("Failed to copy: ",l),s("ErrorCopy"),setTimeout(()=>{s("NoCopy")},1500)})}:void 0,!0),S(a,m(Bs,{get children(){return[m(Gn,{get when(){return o()==="NoCopy"},get children(){return m(ud,{})}}),m(Gn,{get when(){return o()==="SuccessCopy"},get children(){return m(fd,{get theme(){return t()}})}}),m(Gn,{get when(){return o()==="ErrorCopy"},get children(){return m(gd,{})}})]}})),G(l=>{var i=r().actionButton,u=`${o()==="NoCopy"?"Copy object to clipboard":o()==="SuccessCopy"?"Object copied to clipboard":"Error copying object to clipboard"}`;return i!==l.e&&O(a,l.e=i),u!==l.t&&A(a,"aria-label",l.t=u),l},{e:void 0,t:void 0}),a})()},Fd=e=>{const t=$e(),n=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,r=q(()=>t()==="dark"?Qt(n):Wt(n)),o=K().client;return(()=>{var s=xd();return s.$$click=()=>{const a=e.activeQuery.state.data,l=gr(a,e.dataPath,[]);o.setQueryData(e.activeQuery.queryKey,l)},S(s,m(hd,{})),G(()=>O(s,r().actionButton)),s})()},Go=e=>{const t=$e(),n=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,r=q(()=>t()==="dark"?Qt(n):Wt(n)),o=K().client;return(()=>{var s=$d();return s.$$click=()=>{const a=e.activeQuery.state.data,l=Ns(a,e.dataPath);o.setQueryData(e.activeQuery.queryKey,l)},S(s,m(xs,{})),G(()=>O(s,P(r().actionButton))),s})()},Od=e=>{const t=$e(),n=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,r=q(()=>t()==="dark"?Qt(n):Wt(n)),o=K().client;return(()=>{var s=Cd();return s.$$click=()=>{const a=e.activeQuery.state.data,l=gr(a,e.dataPath,!e.value);o.setQueryData(e.activeQuery.queryKey,l)},S(s,m(vd,{get theme(){return t()},get checked(){return e.value}})),G(()=>O(s,P(r().actionButton,n`
          width: ${C.size[3.5]};
          height: ${C.size[3.5]};
        `))),s})()};function Uo(e){return Symbol.iterator in e}function wt(e){const t=$e(),n=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,r=q(()=>t()==="dark"?Qt(n):Wt(n)),o=K().client,[s,a]=z((e.defaultExpanded||[]).includes(e.label)),l=()=>a(y=>!y),[i,u]=z([]),g=q(()=>Array.isArray(e.value)?e.value.map((y,v)=>({label:v.toString(),value:y})):e.value!==null&&typeof e.value=="object"&&Uo(e.value)&&typeof e.value[Symbol.iterator]=="function"?e.value instanceof Map?Array.from(e.value,([y,v])=>({label:y,value:v})):Array.from(e.value,(y,v)=>({label:v.toString(),value:y})):typeof e.value=="object"&&e.value!==null?Object.entries(e.value).map(([y,v])=>({label:y,value:v})):[]),c=q(()=>Array.isArray(e.value)?"array":e.value!==null&&typeof e.value=="object"&&Uo(e.value)&&typeof e.value[Symbol.iterator]=="function"?"Iterable":typeof e.value=="object"&&e.value!==null?"object":typeof e.value),d=q(()=>Ad(g(),100)),f=e.dataPath??[],h=Pe();return(()=>{var y=rn();return S(y,m(R,{get when(){return d().length},get children(){return[(()=>{var v=kd(),p=v.firstChild,w=p.firstChild,b=w.nextSibling,x=b.nextSibling,$=x.nextSibling,I=$.firstChild;return p.$$click=()=>l(),S(p,m(Ho,{get expanded(){return s()}}),w),S(b,()=>e.label),S($,()=>String(c()).toLowerCase()==="iterable"?"(Iterable) ":"",I),S($,()=>g().length,I),S($,()=>g().length>1?"items":"item",null),S(v,m(R,{get when(){return e.editable},get children(){var k=rn();return S(k,m(Td,{get value(){return e.value}}),null),S(k,m(R,{get when(){return ge(()=>!!e.itemsDeletable)()&&e.activeQuery!==void 0},get children(){return m(Go,{get activeQuery(){return e.activeQuery},dataPath:f})}}),null),S(k,m(R,{get when(){return ge(()=>c()==="array")()&&e.activeQuery!==void 0},get children(){return m(Fd,{get activeQuery(){return e.activeQuery},dataPath:f})}}),null),S(k,m(R,{get when(){return ge(()=>!!e.onEdit)()&&!qs(e.value).meta},get children(){var T=Sd();return T.$$click=()=>{e.onEdit?.()},S(T,m(dd,{})),G(()=>O(T,r().actionButton)),T}}),null),G(()=>O(k,r().actions)),k}}),null),G(k=>{var T=r().expanderButtonContainer,E=r().expanderButton,F=s()?"true":"false",H=r().info;return T!==k.e&&O(v,k.e=T),E!==k.t&&O(p,k.t=E),F!==k.a&&A(p,"aria-expanded",k.a=F),H!==k.o&&O($,k.o=H),k},{e:void 0,t:void 0,a:void 0,o:void 0}),v})(),m(R,{get when(){return s()},get children(){return[m(R,{get when(){return d().length===1},get children(){var v=rn();return S(v,m(En,{get each(){return g()},by:p=>p.label,children:p=>m(wt,{get defaultExpanded(){return e.defaultExpanded},get label(){return p().label},get value(){return p().value},get editable(){return e.editable},get dataPath(){return[...f,p().label]},get activeQuery(){return e.activeQuery},get itemsDeletable(){return c()==="array"||c()==="Iterable"||c()==="object"}})})),G(()=>O(v,r().subEntry)),v}}),m(R,{get when(){return d().length>1},get children(){var v=rn();return S(v,m(_s,{get each(){return d()},children:(p,w)=>(()=>{var b=Dd(),x=b.firstChild,$=x.firstChild,I=$.firstChild,k=I.nextSibling,T=k.nextSibling,E=T.nextSibling;return E.nextSibling,$.$$click=()=>u(F=>F.includes(w)?F.filter(H=>H!==w):[...F,w]),S($,m(Ho,{get expanded(){return i().includes(w)}}),I),S($,w*100,k),S($,w*100+100-1,E),S(x,m(R,{get when(){return i().includes(w)},get children(){var F=rn();return S(F,m(En,{get each(){return p()},by:H=>H.label,children:H=>m(wt,{get defaultExpanded(){return e.defaultExpanded},get label(){return H().label},get value(){return H().value},get editable(){return e.editable},get dataPath(){return[...f,H().label]},get activeQuery(){return e.activeQuery}})})),G(()=>O(F,r().subEntry)),F}}),null),G(F=>{var H=r().entry,N=r().expanderButton;return H!==F.e&&O(x,F.e=H),N!==F.t&&O($,F.t=N),F},{e:void 0,t:void 0}),b})()})),G(()=>O(v,r().subEntry)),v}})]}})]}}),null),S(y,m(R,{get when(){return d().length===0},get children(){var v=Md(),p=v.firstChild,w=p.firstChild;return A(p,"for",h),S(p,()=>e.label,w),S(v,m(R,{get when(){return ge(()=>!!(e.editable&&e.activeQuery!==void 0))()&&(c()==="string"||c()==="number"||c()==="boolean")},get fallback(){return(()=>{var b=No();return S(b,()=>kn(e.value)),G(()=>O(b,r().value)),b})()},get children(){return[m(R,{get when(){return ge(()=>!!(e.editable&&e.activeQuery!==void 0))()&&(c()==="string"||c()==="number")},get children(){var b=Ed();return b.addEventListener("change",x=>{const $=e.activeQuery.state.data,I=gr($,f,c()==="number"?x.target.valueAsNumber:x.target.value);o.setQueryData(e.activeQuery.queryKey,I)}),A(b,"id",h),G(x=>{var $=c()==="number"?"number":"text",I=P(r().value,r().editableInput);return $!==x.e&&A(b,"type",x.e=$),I!==x.t&&O(b,x.t=I),x},{e:void 0,t:void 0}),G(()=>b.value=e.value),b}}),m(R,{get when(){return c()==="boolean"},get children(){var b=No();return S(b,m(Od,{get activeQuery(){return e.activeQuery},dataPath:f,get value(){return e.value}}),null),S(b,()=>kn(e.value),null),G(()=>O(b,P(r().value,r().actions,r().editableInput))),b}})]}}),null),S(v,m(R,{get when(){return ge(()=>!!(e.editable&&e.itemsDeletable))()&&e.activeQuery!==void 0},get children(){return m(Go,{get activeQuery(){return e.activeQuery},dataPath:f})}}),null),G(b=>{var x=r().row,$=r().label;return x!==b.e&&O(v,b.e=x),$!==b.t&&O(p,b.t=$),b},{e:void 0,t:void 0}),v}}),null),G(()=>O(y,r().entry)),y})()}var $s=(e,t)=>{const{colors:n,font:r,size:o,border:s}=C,a=(l,i)=>e==="light"?l:i;return{entry:t`
      & * {
        font-size: ${r.size.xs};
        font-family:
          ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          'Liberation Mono', 'Courier New', monospace;
      }
      position: relative;
      outline: none;
      word-break: break-word;
    `,subEntry:t`
      margin: 0 0 0 0.5em;
      padding-left: 0.75em;
      border-left: 2px solid ${a(n.gray[300],n.darkGray[400])};
      /* outline: 1px solid ${n.teal[400]}; */
    `,expander:t`
      & path {
        stroke: ${n.gray[400]};
      }
      & svg {
        width: ${o[3]};
        height: ${o[3]};
      }
      display: inline-flex;
      align-items: center;
      transition: all 0.1s ease;
      /* outline: 1px solid ${n.blue[400]}; */
    `,expanderButtonContainer:t`
      display: flex;
      align-items: center;
      line-height: ${o[4]};
      min-height: ${o[4]};
      gap: ${o[2]};
    `,expanderButton:t`
      cursor: pointer;
      color: inherit;
      font: inherit;
      outline: inherit;
      height: ${o[5]};
      background: transparent;
      border: none;
      padding: 0;
      display: inline-flex;
      align-items: center;
      gap: ${o[1]};
      position: relative;
      /* outline: 1px solid ${n.green[400]}; */

      &:focus-visible {
        border-radius: ${s.radius.xs};
        outline: 2px solid ${n.blue[800]};
      }

      & svg {
        position: relative;
        left: 1px;
      }
    `,info:t`
      color: ${a(n.gray[500],n.gray[500])};
      font-size: ${r.size.xs};
      margin-left: ${o[1]};
      /* outline: 1px solid ${n.yellow[400]}; */
    `,label:t`
      color: ${a(n.gray[700],n.gray[300])};
      white-space: nowrap;
    `,value:t`
      color: ${a(n.purple[600],n.purple[400])};
      flex-grow: 1;
    `,actions:t`
      display: inline-flex;
      gap: ${o[2]};
      align-items: center;
    `,row:t`
      display: inline-flex;
      gap: ${o[2]};
      width: 100%;
      margin: ${o[.25]} 0px;
      line-height: ${o[4.5]};
      align-items: center;
    `,editableInput:t`
      border: none;
      padding: ${o[.5]} ${o[1]} ${o[.5]} ${o[1.5]};
      flex-grow: 1;
      border-radius: ${s.radius.xs};
      background-color: ${a(n.gray[200],n.darkGray[500])};

      &:hover {
        background-color: ${a(n.gray[300],n.darkGray[600])};
      }
    `,actionButton:t`
      background-color: transparent;
      color: ${a(n.gray[500],n.gray[500])};
      border: none;
      display: inline-flex;
      padding: 0px;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      width: ${o[3]};
      height: ${o[3]};
      position: relative;
      z-index: 1;

      &:hover svg {
        color: ${a(n.gray[600],n.gray[400])};
      }

      &:focus-visible {
        border-radius: ${s.radius.xs};
        outline: 2px solid ${n.blue[800]};
        outline-offset: 2px;
      }
    `}},Wt=e=>$s("light",e),Qt=e=>$s("dark",e);fr(["click"]);var Id=_('<div><div aria-hidden=true></div><button type=button aria-label="Open Tanstack query devtools"class=tsqd-open-btn>'),Ir=_("<div>"),Ld=_("<div style=--tsqd-font-size:16px;max-height:100vh;height:100vh;width:100vw>"),Pd=_('<aside aria-label="Tanstack query devtools"><div role=separator aria-label="Resize devtools panel"tabindex=0></div><button aria-label="Close tanstack query devtools">'),qd=_('<select name=tsqd-queries-filter-sort aria-label="Sort queries by">'),_d=_('<select name=tsqd-mutations-filter-sort aria-label="Sort mutations by">'),Rd=_("<span>Asc"),zd=_("<span>Desc"),Kd=_('<button aria-label="Open in picture-in-picture mode"title="Open in picture-in-picture mode">'),Bd=_("<div>Settings"),Nd=_("<span>Position"),Hd=_("<span>Top"),Gd=_("<span>Bottom"),Ud=_("<span>Left"),Vd=_("<span>Right"),jd=_("<span>Theme"),Wd=_("<span>Light"),Qd=_("<span>Dark"),Yd=_("<span>System"),Xd=_("<span>Disabled Queries"),Zd=_("<span>Show"),Jd=_("<span>Hide"),e0=_("<div><div class=tsqd-queries-container>"),t0=_("<div><div class=tsqd-mutations-container>"),n0=_('<div><div><div><button aria-label="Close Tanstack query devtools"><span>TANSTACK</span><span> v</span></button></div></div><div><div><div><input aria-label="Filter queries by query key"type=text placeholder=Filter name=tsqd-query-filter-input></div><div></div><button class=tsqd-query-filter-sort-order-btn></button></div><div><button aria-label="Clear query cache"></button><button>'),Vo=_("<option>Sort by "),r0=_("<div class=tsqd-query-disabled-indicator aria-hidden=true>disabled"),o0=_("<div class=tsqd-query-static-indicator aria-hidden=true>static"),Cs=_("<button><div></div><code class=tsqd-query-hash>"),i0=_("<div role=tooltip id=tsqd-status-tooltip>"),s0=_("<span>"),a0=_("<button><span aria-hidden=true></span><span>"),l0=_("<button><span aria-hidden=true></span> Error"),c0=_('<div><span aria-hidden=true></span>Trigger Error<select aria-label="Select error type to trigger"><option value disabled selected>'),u0=_('<div class="tsqd-query-details-explorer-container tsqd-query-details-data-explorer">'),d0=_('<form><textarea name=data aria-label="Edit query data as JSON"></textarea><div><span></span><div><button type=button>Cancel</button><button>Save'),f0=_('<div><div role=heading aria-level=2>Query Details</div><div><div class=tsqd-query-details-summary><pre><code></code></pre><span role=status aria-live=polite></span></div><div class=tsqd-query-details-observers-count><span>Observers:</span><span></span></div><div class=tsqd-query-details-last-updated><span>Last Updated:</span><span></span></div></div><div role=heading aria-level=2>Actions</div><div><button><span aria-hidden=true></span>Refetch</button><button><span aria-hidden=true></span>Invalidate</button><button><span aria-hidden=true></span>Reset</button><button><span aria-hidden=true></span>Remove</button><button><span aria-hidden=true></span> Loading</button></div><div role=heading aria-level=2>Data </div><div role=heading aria-level=2>Query Explorer</div><div class="tsqd-query-details-explorer-container tsqd-query-details-query-explorer">'),g0=_("<option>"),h0=_('<div><div role=heading aria-level=2>Mutation Details</div><div><div class=tsqd-query-details-summary><pre><code></code></pre><span role=status aria-live=polite></span></div><div class=tsqd-query-details-last-updated><span>Submitted At:</span><span></span></div></div><div role=heading aria-level=2>Variables Details</div><div class="tsqd-query-details-explorer-container tsqd-query-details-query-explorer"></div><div role=heading aria-level=2>Context Details</div><div class="tsqd-query-details-explorer-container tsqd-query-details-query-explorer"></div><div role=heading aria-level=2>Data Explorer</div><div class="tsqd-query-details-explorer-container tsqd-query-details-query-explorer"></div><div role=heading aria-level=2>Mutations Explorer</div><div class="tsqd-query-details-explorer-container tsqd-query-details-query-explorer">'),[Oe,Hn]=z(null),[xt,Ss]=z(null),[ut,ks]=z(0),[on,v0]=z(!1),m0=e=>{const t=$e(),n=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,r=q(()=>t()==="dark"?We(n):je(n)),o=q(()=>K().onlineManager);$t(()=>{const c=o().subscribe(d=>{v0(!d)});U(()=>{c()})});const s=hr(),a=q(()=>K().buttonPosition||na),l=q(()=>e.localStore.open==="true"?!0:e.localStore.open==="false"?!1:K().initialIsOpen||oa),i=q(()=>e.localStore.position||K().position||er);let u;B(()=>{const c=u.parentElement,d=e.localStore.height||Cn,f=e.localStore.width||Sn,h=i();c.style.setProperty("--tsqd-panel-height",`${h==="top"?"-":""}${d}px`),c.style.setProperty("--tsqd-panel-width",`${h==="left"?"-":""}${f}px`)}),$t(()=>{const c=()=>{const d=u.parentElement,f=getComputedStyle(d).fontSize;d.style.setProperty("--tsqd-font-size",f)};c(),window.addEventListener("focus",c),U(()=>{window.removeEventListener("focus",c)})});const g=q(()=>e.localStore.pip_open??"false");return[m(R,{get when(){return ge(()=>!!s().pipWindow)()&&g()=="true"},get children(){return m(jo,{get mount(){return s().pipWindow?.document.body},get children(){return m(p0,{get children(){return m(Es,e)}})}})}}),(()=>{var c=Ir(),d=u;return typeof d=="function"?ln(d,c):u=c,S(c,m(oo,{name:"tsqd-panel-transition",get children(){return m(R,{get when(){return ge(()=>!!(l()&&!s().pipWindow))()&&g()=="false"},get children(){return m(y0,{get localStore(){return e.localStore},get setLocalStore(){return e.setLocalStore}})}})}}),null),S(c,m(oo,{name:"tsqd-button-transition",get children(){return m(R,{get when(){return!l()},get children(){var f=Id(),h=f.firstChild,y=h.nextSibling;return S(h,m(Bo,{})),y.$$click=()=>e.setLocalStore("open","true"),S(y,m(Bo,{})),G(()=>O(f,P(r().devtoolsBtn,r()[`devtoolsBtn-position-${a()}`],"tsqd-open-btn-container"))),f}})}}),null),G(()=>O(c,P(n`
            & .tsqd-panel-transition-exit-active,
            & .tsqd-panel-transition-enter-active {
              transition:
                opacity 0.3s,
                transform 0.3s;
            }

            & .tsqd-panel-transition-exit-to,
            & .tsqd-panel-transition-enter {
              ${i()==="top"||i()==="bottom"?"transform: translateY(var(--tsqd-panel-height));":"transform: translateX(var(--tsqd-panel-width));"}
            }

            & .tsqd-button-transition-exit-active,
            & .tsqd-button-transition-enter-active {
              transition:
                opacity 0.3s,
                transform 0.3s;
              opacity: 1;
            }

            & .tsqd-button-transition-exit-to,
            & .tsqd-button-transition-enter {
              transform: ${a()==="relative"?"none;":a()==="top-left"?"translateX(-72px);":a()==="top-right"?"translateX(72px);":"translateY(72px);"};
              opacity: 0;
            }
          `,"tsqd-transitions-container"))),c})()]},p0=e=>{const t=hr(),n=$e(),r=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,o=q(()=>n()==="dark"?We(r):je(r)),s=()=>{const{colors:a}=C,l=(i,u)=>n()==="dark"?u:i;return ut()<Gt?r`
        flex-direction: column;
        background-color: ${l(a.gray[300],a.gray[600])};
      `:r`
      flex-direction: row;
      background-color: ${l(a.gray[200],a.darkGray[900])};
    `};return B(()=>{const a=t().pipWindow,l=()=>{a&&ks(a.innerWidth)};a&&(a.addEventListener("resize",l),l()),U(()=>{a&&a.removeEventListener("resize",l)})}),(()=>{var a=Ld();return S(a,()=>e.children),G(()=>O(a,P(o().panel,s(),{[r`
            min-width: min-content;
          `]:ut()<Qo},"tsqd-main-panel"))),a})()},y0=e=>{const t=$e(),n=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,r=q(()=>t()==="dark"?We(n):je(n));let o;$t(()=>{o.focus()});const[s,a]=z(!1),l=q(()=>e.localStore.position||K().position||er),i=c=>{const d=c.currentTarget.parentElement;if(!d)return;a(!0);const{height:f,width:h}=d.getBoundingClientRect(),y=c.clientX,v=c.clientY;let p=0;const w=qt(3.5),b=qt(12),x=I=>{if(I.preventDefault(),l()==="left"||l()==="right"){const k=l()==="right"?y-I.clientX:I.clientX-y;p=Math.round(h+k),p<b&&(p=b),e.setLocalStore("width",String(Math.round(p)));const T=d.getBoundingClientRect().width;Number(e.localStore.width)<T&&e.setLocalStore("width",String(T))}else{const k=l()==="bottom"?v-I.clientY:I.clientY-v;p=Math.round(f+k),p<w&&(p=w,Hn(null)),e.setLocalStore("height",String(Math.round(p)))}},$=()=>{s()&&a(!1),document.removeEventListener("mousemove",x,!1),document.removeEventListener("mouseup",$,!1)};document.addEventListener("mousemove",x,!1),document.addEventListener("mouseup",$,!1)};let u;$t(()=>{Oa(u,({width:c},d)=>{d===u&&ks(c)})}),B(()=>{const c=u.parentElement?.parentElement?.parentElement;if(!c)return;const d=e.localStore.position||er,f=Ts("padding",d),h=e.localStore.position==="left"||e.localStore.position==="right",y=(({padding:v,paddingTop:p,paddingBottom:w,paddingLeft:b,paddingRight:x})=>({padding:v,paddingTop:p,paddingBottom:w,paddingLeft:b,paddingRight:x}))(c.style);c.style[f]=`${h?e.localStore.width:e.localStore.height}px`,U(()=>{Object.entries(y).forEach(([v,p])=>{c.style[v]=p})})});const g=()=>{const{colors:c}=C,d=(f,h)=>t()==="dark"?h:f;return ut()<Gt?n`
        flex-direction: column;
        background-color: ${d(c.gray[300],c.gray[600])};
      `:n`
      flex-direction: row;
      background-color: ${d(c.gray[200],c.darkGray[900])};
    `};return(()=>{var c=Pd(),d=c.firstChild,f=d.nextSibling,h=u;typeof h=="function"?ln(h,c):u=c,d.$$keydown=v=>{const w=qt(3.5),b=qt(12);if(l()==="top"||l()==="bottom"){if(v.key==="ArrowUp"||v.key==="ArrowDown"){v.preventDefault();const x=Number(e.localStore.height||Cn),$=l()==="bottom"?v.key==="ArrowUp"?10:-10:v.key==="ArrowDown"?10:-10,I=Math.max(w,x+$);e.setLocalStore("height",String(I))}}else if(v.key==="ArrowLeft"||v.key==="ArrowRight"){v.preventDefault();const x=Number(e.localStore.width||Sn),$=l()==="right"?v.key==="ArrowLeft"?10:-10:v.key==="ArrowRight"?10:-10,I=Math.max(b,x+$);e.setLocalStore("width",String(I))}},d.$$mousedown=i,f.$$click=()=>e.setLocalStore("open","false");var y=o;return typeof y=="function"?ln(y,f):o=f,S(f,m(Bt,{})),S(c,m(Es,e),null),G(v=>{var p=P(r().panel,r()[`panel-position-${l()}`],g(),{[n`
            min-width: min-content;
          `]:ut()<Qo&&(l()==="right"||l()==="left")},"tsqd-main-panel"),w=l()==="bottom"||l()==="top"?`${e.localStore.height||Cn}px`:"auto",b=l()==="right"||l()==="left"?`${e.localStore.width||Sn}px`:"auto",x=l()==="top"||l()==="bottom"?"horizontal":"vertical",$=l()==="top"||l()==="bottom"?qt(3.5):qt(12),I=l()==="top"||l()==="bottom"?Number(e.localStore.height||Cn):Number(e.localStore.width||Sn),k=P(r().dragHandle,r()[`dragHandle-position-${l()}`],"tsqd-drag-handle"),T=P(r().closeBtn,r()[`closeBtn-position-${l()}`],"tsqd-minimize-btn");return p!==v.e&&O(c,v.e=p),w!==v.t&&bt(c,"height",v.t=w),b!==v.a&&bt(c,"width",v.a=b),x!==v.o&&A(d,"aria-orientation",v.o=x),$!==v.i&&A(d,"aria-valuemin",v.i=$),I!==v.n&&A(d,"aria-valuenow",v.n=I),k!==v.s&&O(d,v.s=k),T!==v.h&&O(f,v.h=T),v},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0}),c})()},Es=e=>{k0(),E0();let t;const n=$e(),r=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,o=q(()=>n()==="dark"?We(r):je(r)),s=hr(),[a,l]=z("queries"),i=q(()=>e.localStore.sort||sa),u=q(()=>Number(e.localStore.sortOrder)||Yr),g=q(()=>e.localStore.mutationSort||aa),c=q(()=>Number(e.localStore.mutationSortOrder)||Yr),d=q(()=>Xn[i()]),f=q(()=>Zn[g()]),h=q(()=>K().onlineManager),y=q(()=>K().client.getQueryCache()),v=q(()=>K().client.getMutationCache()),p=ye(k=>k().getAll().length,!1),w=q(dt(()=>[p(),e.localStore.filter,i(),u(),e.localStore.hideDisabledQueries],()=>{const k=y().getAll();let T=e.localStore.filter?k.filter(F=>Zr(F.queryHash,e.localStore.filter||"").passed):[...k];return e.localStore.hideDisabledQueries==="true"&&(T=T.filter(F=>!F.isDisabled())),d()?T.sort((F,H)=>d()(F,H)*u()):T})),b=Ge(k=>k().getAll().length,!1),x=q(dt(()=>[b(),e.localStore.mutationFilter,g(),c()],()=>{const k=v().getAll(),T=e.localStore.mutationFilter?k.filter(F=>{const H=`${F.options.mutationKey?JSON.stringify(F.options.mutationKey)+" - ":""}${new Date(F.state.submittedAt).toLocaleString()}`;return Zr(H,e.localStore.mutationFilter||"").passed}):[...k];return f()?T.sort((F,H)=>f()(F,H)*c()):T})),$=k=>{e.setLocalStore("position",k)},I=k=>{const E=getComputedStyle(t).getPropertyValue("--tsqd-font-size");k.style.setProperty("--tsqd-font-size",E)};return[(()=>{var k=n0(),T=k.firstChild,E=T.firstChild,F=E.firstChild,H=F.firstChild,N=H.nextSibling,X=N.firstChild,te=T.nextSibling,ie=te.firstChild,se=ie.firstChild,ne=se.firstChild,re=se.nextSibling,le=re.nextSibling,me=ie.nextSibling,Ae=me.firstChild,ve=Ae.nextSibling,Ee=t;return typeof Ee=="function"?ln(Ee,k):t=k,F.$$click=()=>{if(!s().pipWindow&&!e.showPanelViewOnly){e.setLocalStore("open","false");return}e.onClose&&e.onClose()},S(N,()=>K().queryFlavor,X),S(N,()=>K().version,null),S(E,m(ze.Root,{get class(){return P(o().viewToggle)},get value(){return a()},"aria-label":"Toggle between queries and mutations view",onChange:D=>{l(D),Hn(null),Ss(null)},get children(){return[m(ze.Item,{value:"queries",class:"tsqd-radio-toggle",get children(){return[m(ze.ItemInput,{}),m(ze.ItemControl,{get children(){return m(ze.ItemIndicator,{})}}),m(ze.ItemLabel,{title:"Toggle Queries View",children:"Queries"})]}}),m(ze.Item,{value:"mutations",class:"tsqd-radio-toggle",get children(){return[m(ze.ItemInput,{}),m(ze.ItemControl,{get children(){return m(ze.ItemIndicator,{})}}),m(ze.ItemLabel,{title:"Toggle Mutations View",children:"Mutations"})]}})]}}),null),S(T,m(R,{get when(){return a()==="queries"},get children(){return m(x0,{})}}),null),S(T,m(R,{get when(){return a()==="mutations"},get children(){return m($0,{})}}),null),S(se,m(ed,{}),ne),ne.$$input=D=>{a()==="queries"?e.setLocalStore("filter",D.currentTarget.value):e.setLocalStore("mutationFilter",D.currentTarget.value)},S(re,m(R,{get when(){return a()==="queries"},get children(){var D=qd();return D.addEventListener("change",he=>{e.setLocalStore("sort",he.currentTarget.value)}),S(D,()=>Object.keys(Xn).map(he=>(()=>{var Y=Vo();return Y.firstChild,Y.value=he,S(Y,he,null),Y})())),G(()=>D.value=i()),D}}),null),S(re,m(R,{get when(){return a()==="mutations"},get children(){var D=_d();return D.addEventListener("change",he=>{e.setLocalStore("mutationSort",he.currentTarget.value)}),S(D,()=>Object.keys(Zn).map(he=>(()=>{var Y=Vo();return Y.firstChild,Y.value=he,S(Y,he,null),Y})())),G(()=>D.value=g()),D}}),null),S(re,m(Bt,{}),null),le.$$click=()=>{a()==="queries"?e.setLocalStore("sortOrder",String(u()*-1)):e.setLocalStore("mutationSortOrder",String(c()*-1))},S(le,m(R,{get when(){return(a()==="queries"?u():c())===1},get children(){return[Rd(),m(zo,{})]}}),null),S(le,m(R,{get when(){return(a()==="queries"?u():c())===-1},get children(){return[zd(),m(Ko,{})]}}),null),Ae.$$click=()=>{a()==="queries"?(Ye({type:"CLEAR_QUERY_CACHE"}),y().clear()):(Ye({type:"CLEAR_MUTATION_CACHE"}),v().clear())},S(Ae,m(xs,{})),ve.$$click=()=>{h().setOnline(!h().isOnline())},S(ve,(()=>{var D=ge(()=>!!on());return()=>D()?m(ad,{}):m(sd,{})})()),S(me,m(R,{get when(){return ge(()=>!s().pipWindow)()&&!s().disabled},get children(){var D=Kd();return D.$$click=()=>{s().requestPipWindow(Number(window.innerWidth),Number(e.localStore.height??500))},S(D,m(cd,{})),G(()=>O(D,P(o().actionsBtn,"tsqd-actions-btn","tsqd-action-open-pip"))),D}}),null),S(me,m(J.Root,{gutter:4,get children(){return[m(J.Trigger,{get class(){return P(o().actionsBtn,"tsqd-actions-btn","tsqd-action-settings")},"aria-label":"Open settings menu",title:"Open settings menu",get children(){return m(ld,{})}}),m(J.Portal,{ref:D=>I(D),get mount(){return ge(()=>!!s().pipWindow)()?s().pipWindow.document.body:document.body},get children(){return m(J.Content,{get class(){return P(o().settingsMenu,"tsqd-settings-menu")},get children(){return[(()=>{var D=Bd();return G(()=>O(D,P(o().settingsMenuHeader,"tsqd-settings-menu-header"))),D})(),m(R,{get when(){return!e.showPanelViewOnly},get children(){return m(J.Sub,{overlap:!0,gutter:8,shift:-4,get children(){return[m(J.SubTrigger,{get class(){return P(o().settingsSubTrigger,"tsqd-settings-menu-sub-trigger","tsqd-settings-menu-sub-trigger-position")},get children(){return[Nd(),m(Bt,{})]}}),m(J.Portal,{ref:D=>I(D),get mount(){return ge(()=>!!s().pipWindow)()?s().pipWindow.document.body:document.body},get children(){return m(J.SubContent,{get class(){return P(o().settingsMenu,"tsqd-settings-submenu")},get children(){return m(J.RadioGroup,{"aria-label":"Position settings",get value(){return e.localStore.position},onChange:D=>$(D),get children(){return[m(J.RadioItem,{value:"top",get class(){return P(o().settingsSubButton,"tsqd-settings-menu-position-btn","tsqd-settings-menu-position-btn-top")},get children(){return[Hd(),m(zo,{})]}}),m(J.RadioItem,{value:"bottom",get class(){return P(o().settingsSubButton,"tsqd-settings-menu-position-btn","tsqd-settings-menu-position-btn-bottom")},get children(){return[Gd(),m(Ko,{})]}}),m(J.RadioItem,{value:"left",get class(){return P(o().settingsSubButton,"tsqd-settings-menu-position-btn","tsqd-settings-menu-position-btn-left")},get children(){return[Ud(),m(td,{})]}}),m(J.RadioItem,{value:"right",get class(){return P(o().settingsSubButton,"tsqd-settings-menu-position-btn","tsqd-settings-menu-position-btn-right")},get children(){return[Vd(),m(nd,{})]}})]}})}})}})]}})}}),m(J.Sub,{overlap:!0,gutter:8,shift:-4,get children(){return[m(J.SubTrigger,{get class(){return P(o().settingsSubTrigger,"tsqd-settings-menu-sub-trigger","tsqd-settings-menu-sub-trigger-theme")},get children(){return[jd(),m(Bt,{})]}}),m(J.Portal,{ref:D=>I(D),get mount(){return ge(()=>!!s().pipWindow)()?s().pipWindow.document.body:document.body},get children(){return m(J.SubContent,{get class(){return P(o().settingsMenu,"tsqd-settings-submenu")},get children(){return m(J.RadioGroup,{get value(){return e.localStore.theme_preference},onChange:D=>{e.setLocalStore("theme_preference",D)},"aria-label":"Theme preference",get children(){return[m(J.RadioItem,{value:"light",get class(){return P(o().settingsSubButton,"tsqd-settings-menu-position-btn","tsqd-settings-menu-position-btn-top")},get children(){return[Wd(),m(rd,{})]}}),m(J.RadioItem,{value:"dark",get class(){return P(o().settingsSubButton,"tsqd-settings-menu-position-btn","tsqd-settings-menu-position-btn-bottom")},get children(){return[Qd(),m(od,{})]}}),m(J.RadioItem,{value:"system",get class(){return P(o().settingsSubButton,"tsqd-settings-menu-position-btn","tsqd-settings-menu-position-btn-left")},get children(){return[Yd(),m(id,{})]}})]}})}})}})]}}),m(J.Sub,{overlap:!0,gutter:8,shift:-4,get children(){return[m(J.SubTrigger,{get class(){return P(o().settingsSubTrigger,"tsqd-settings-menu-sub-trigger","tsqd-settings-menu-sub-trigger-disabled-queries")},get children(){return[Xd(),m(Bt,{})]}}),m(J.Portal,{ref:D=>I(D),get mount(){return ge(()=>!!s().pipWindow)()?s().pipWindow.document.body:document.body},get children(){return m(J.SubContent,{get class(){return P(o().settingsMenu,"tsqd-settings-submenu")},get children(){return m(J.RadioGroup,{get value(){return e.localStore.hideDisabledQueries},"aria-label":"Hide disabled queries setting",onChange:D=>e.setLocalStore("hideDisabledQueries",D),get children(){return[m(J.RadioItem,{value:"false",get class(){return P(o().settingsSubButton,"tsqd-settings-menu-position-btn","tsqd-settings-menu-position-btn-show")},get children(){return[Zd(),m(R,{get when(){return e.localStore.hideDisabledQueries!=="true"},get children(){return m(dr,{})}})]}}),m(J.RadioItem,{value:"true",get class(){return P(o().settingsSubButton,"tsqd-settings-menu-position-btn","tsqd-settings-menu-position-btn-hide")},get children(){return[Jd(),m(R,{get when(){return e.localStore.hideDisabledQueries==="true"},get children(){return m(dr,{})}})]}})]}})}})}})]}})]}})}})]}}),null),S(k,m(R,{get when(){return a()==="queries"},get children(){var D=e0(),he=D.firstChild;return S(he,m(En,{by:Y=>Y.queryHash,get each(){return w()},children:Y=>m(b0,{get query(){return Y()}})})),G(()=>O(D,P(o().overflowQueryContainer,"tsqd-queries-overflow-container"))),D}}),null),S(k,m(R,{get when(){return a()==="mutations"},get children(){var D=t0(),he=D.firstChild;return S(he,m(En,{by:Y=>Y.mutationId,get each(){return x()},children:Y=>m(w0,{get mutation(){return Y()}})})),G(()=>O(D,P(o().overflowQueryContainer,"tsqd-mutations-overflow-container"))),D}}),null),G(D=>{var he=P(o().queriesContainer,ut()<Gt&&(Oe()||xt())&&r`
              height: 50%;
              max-height: 50%;
            `,ut()<Gt&&!(Oe()||xt())&&r`
              height: 100%;
              max-height: 100%;
            `,"tsqd-queries-container"),Y=P(o().row,"tsqd-header"),vt=o().logoAndToggleContainer,V=P(o().logo,"tsqd-text-logo-container"),Ne=P(o().tanstackLogo,"tsqd-text-logo-tanstack"),Ce=P(o().queryFlavorLogo,"tsqd-text-logo-query-flavor"),Lt=P(o().row,"tsqd-filters-actions-container"),qe=P(o().filtersContainer,"tsqd-filters-container"),mt=P(o().filterInput,"tsqd-query-filter-textfield-container"),Mt=P("tsqd-query-filter-textfield"),tt=P(o().filterSelect,"tsqd-query-filter-sort-container"),Qe=`Sort order ${(a()==="queries"?u():c())===-1?"descending":"ascending"}`,pt=(a()==="queries"?u():c())===-1,L=P(o().actionsContainer,"tsqd-actions-container"),ce=P(o().actionsBtn,"tsqd-actions-btn","tsqd-action-clear-cache"),Me=`Clear ${a()} cache`,ae=P(o().actionsBtn,on()&&o().actionsBtnOffline,"tsqd-actions-btn","tsqd-action-mock-offline-behavior"),oe=`${on()?"Unset offline mocking behavior":"Mock offline behavior"}`,ue=on(),pe=`${on()?"Unset offline mocking behavior":"Mock offline behavior"}`;return he!==D.e&&O(k,D.e=he),Y!==D.t&&O(T,D.t=Y),vt!==D.a&&O(E,D.a=vt),V!==D.o&&O(F,D.o=V),Ne!==D.i&&O(H,D.i=Ne),Ce!==D.n&&O(N,D.n=Ce),Lt!==D.s&&O(te,D.s=Lt),qe!==D.h&&O(ie,D.h=qe),mt!==D.r&&O(se,D.r=mt),Mt!==D.d&&O(ne,D.d=Mt),tt!==D.l&&O(re,D.l=tt),Qe!==D.u&&A(le,"aria-label",D.u=Qe),pt!==D.c&&A(le,"aria-pressed",D.c=pt),L!==D.w&&O(me,D.w=L),ce!==D.m&&O(Ae,D.m=ce),Me!==D.f&&A(Ae,"title",D.f=Me),ae!==D.y&&O(ve,D.y=ae),oe!==D.g&&A(ve,"aria-label",D.g=oe),ue!==D.p&&A(ve,"aria-pressed",D.p=ue),pe!==D.b&&A(ve,"title",D.b=pe),D},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0,r:void 0,d:void 0,l:void 0,u:void 0,c:void 0,w:void 0,m:void 0,f:void 0,y:void 0,g:void 0,p:void 0,b:void 0}),G(()=>ne.value=a()==="queries"?e.localStore.filter||"":e.localStore.mutationFilter||""),k})(),m(R,{get when(){return ge(()=>a()==="queries")()&&Oe()},get children(){return m(C0,{})}}),m(R,{get when(){return ge(()=>a()==="mutations")()&&xt()},get children(){return m(S0,{})}})]},b0=e=>{const t=$e(),n=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,r=q(()=>t()==="dark"?We(n):je(n)),{colors:o,alpha:s}=C,a=(h,y)=>t()==="dark"?y:h,l=ye(h=>h().get(e.query.queryHash)?.state,!0,h=>h.query.queryHash===e.query.queryHash),i=ye(h=>h().get(e.query.queryHash)?.isDisabled()??!1,!0,h=>h.query.queryHash===e.query.queryHash),u=ye(h=>h().get(e.query.queryHash)?.isStatic()??!1,!0,h=>h.query.queryHash===e.query.queryHash),g=ye(h=>h().get(e.query.queryHash)?.isStale()??!1,!0,h=>h.query.queryHash===e.query.queryHash),c=ye(h=>h().get(e.query.queryHash)?.getObserversCount()??0,!0,h=>h.query.queryHash===e.query.queryHash),d=q(()=>Os({queryState:l(),observerCount:c(),isStale:g()})),f=()=>d()==="gray"?n`
        background-color: ${a(o[d()][200],o[d()][700])};
        color: ${a(o[d()][700],o[d()][300])};
      `:n`
      background-color: ${a(o[d()][200]+s[80],o[d()][900])};
      color: ${a(o[d()][800],o[d()][300])};
    `;return m(R,{get when(){return l()},get children(){var h=Cs(),y=h.firstChild,v=y.nextSibling;return h.$$click=()=>Hn(e.query.queryHash===Oe()?null:e.query.queryHash),S(y,c),S(v,()=>e.query.queryHash),S(h,m(R,{get when(){return i()},get children(){return r0()}}),null),S(h,m(R,{get when(){return u()},get children(){return o0()}}),null),G(p=>{var w=P(r().queryRow,Oe()===e.query.queryHash&&r().selectedQueryRow,"tsqd-query-row"),b=`Query key ${e.query.queryHash}${i()?", disabled":""}${u()?", static":""}`,x=P(f(),"tsqd-query-observer-count");return w!==p.e&&O(h,p.e=w),b!==p.t&&A(h,"aria-label",p.t=b),x!==p.a&&O(y,p.a=x),p},{e:void 0,t:void 0,a:void 0}),h}})},w0=e=>{const t=$e(),n=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,r=q(()=>t()==="dark"?We(n):je(n)),{colors:o,alpha:s}=C,a=(d,f)=>t()==="dark"?f:d,l=Ge(d=>d().getAll().find(y=>y.mutationId===e.mutation.mutationId)?.state),i=Ge(d=>{const h=d().getAll().find(y=>y.mutationId===e.mutation.mutationId);return h?h.state.isPaused:!1}),u=Ge(d=>{const h=d().getAll().find(y=>y.mutationId===e.mutation.mutationId);return h?h.state.status:"idle"}),g=q(()=>Kt({isPaused:i(),status:u()})),c=()=>g()==="gray"?n`
        background-color: ${a(o[g()][200],o[g()][700])};
        color: ${a(o[g()][700],o[g()][300])};
      `:n`
      background-color: ${a(o[g()][200]+s[80],o[g()][900])};
      color: ${a(o[g()][800],o[g()][300])};
    `;return m(R,{get when(){return l()},get children(){var d=Cs(),f=d.firstChild,h=f.nextSibling;return d.$$click=()=>{Ss(e.mutation.mutationId===xt()?null:e.mutation.mutationId)},S(f,m(R,{get when(){return g()==="purple"},get children(){return m(yd,{})}}),null),S(f,m(R,{get when(){return g()==="green"},get children(){return m(dr,{})}}),null),S(f,m(R,{get when(){return g()==="red"},get children(){return m(pd,{})}}),null),S(f,m(R,{get when(){return g()==="yellow"},get children(){return m(md,{})}}),null),S(h,m(R,{get when(){return e.mutation.options.mutationKey},get children(){return[ge(()=>JSON.stringify(e.mutation.options.mutationKey))," -"," "]}}),null),S(h,()=>new Date(e.mutation.state.submittedAt).toLocaleString(),null),G(y=>{var v=P(r().queryRow,xt()===e.mutation.mutationId&&r().selectedQueryRow,"tsqd-query-row"),p=`Mutation submitted at ${new Date(e.mutation.state.submittedAt).toLocaleString()}`,w=P(c(),"tsqd-query-observer-count");return v!==y.e&&O(d,y.e=v),p!==y.t&&A(d,"aria-label",y.t=p),w!==y.a&&O(f,y.a=w),y},{e:void 0,t:void 0,a:void 0}),d}})},x0=()=>{const e=ye(i=>i().getAll().filter(u=>_t(u)==="stale").length),t=ye(i=>i().getAll().filter(u=>_t(u)==="fresh").length),n=ye(i=>i().getAll().filter(u=>_t(u)==="fetching").length),r=ye(i=>i().getAll().filter(u=>_t(u)==="paused").length),o=ye(i=>i().getAll().filter(u=>_t(u)==="inactive").length),s=$e(),a=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,l=q(()=>s()==="dark"?We(a):je(a));return(()=>{var i=Ir();return S(i,m(lt,{label:"Fresh",color:"green",get count(){return t()}}),null),S(i,m(lt,{label:"Fetching",color:"blue",get count(){return n()}}),null),S(i,m(lt,{label:"Paused",color:"purple",get count(){return r()}}),null),S(i,m(lt,{label:"Stale",color:"yellow",get count(){return e()}}),null),S(i,m(lt,{label:"Inactive",color:"gray",get count(){return o()}}),null),G(()=>O(i,P(l().queryStatusContainer,"tsqd-query-status-container"))),i})()},$0=()=>{const e=Ge(l=>l().getAll().filter(i=>Kt({isPaused:i.state.isPaused,status:i.state.status})==="green").length),t=Ge(l=>l().getAll().filter(i=>Kt({isPaused:i.state.isPaused,status:i.state.status})==="yellow").length),n=Ge(l=>l().getAll().filter(i=>Kt({isPaused:i.state.isPaused,status:i.state.status})==="purple").length),r=Ge(l=>l().getAll().filter(i=>Kt({isPaused:i.state.isPaused,status:i.state.status})==="red").length),o=$e(),s=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,a=q(()=>o()==="dark"?We(s):je(s));return(()=>{var l=Ir();return S(l,m(lt,{label:"Paused",color:"purple",get count(){return n()}}),null),S(l,m(lt,{label:"Pending",color:"yellow",get count(){return t()}}),null),S(l,m(lt,{label:"Success",color:"green",get count(){return e()}}),null),S(l,m(lt,{label:"Error",color:"red",get count(){return r()}}),null),G(()=>O(l,P(a().queryStatusContainer,"tsqd-query-status-container"))),l})()},lt=e=>{const t=$e(),n=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,r=q(()=>t()==="dark"?We(n):je(n)),{colors:o,alpha:s}=C,a=(f,h)=>t()==="dark"?h:f;let l;const[i,u]=z(!1),[g,c]=z(!1),d=q(()=>!(Oe()&&ut()<ta&&ut()>Gt||ut()<Gt));return(()=>{var f=a0(),h=f.firstChild,y=h.nextSibling,v=l;return typeof v=="function"?ln(v,f):l=f,f.addEventListener("mouseleave",()=>{u(!1),c(!1)}),f.addEventListener("mouseenter",()=>u(!0)),f.addEventListener("blur",()=>c(!1)),f.addEventListener("focus",()=>c(!0)),Ps(f,j({get disabled(){return d()},get"aria-label"(){return`${e.label}: ${e.count}`},get class(){return P(r().queryStatusTag,!d()&&n`
            cursor: pointer;
            &:hover {
              background: ${a(o.gray[200],o.darkGray[400])}${s[80]};
            }
          `,"tsqd-query-status-tag",`tsqd-query-status-tag-${e.label.toLowerCase()}`)}},()=>i()||g()?{"aria-describedby":"tsqd-status-tooltip"}:{}),!1,!0),S(f,m(R,{get when(){return ge(()=>!d())()&&(i()||g())},get children(){var p=i0();return S(p,()=>e.label),G(()=>O(p,P(r().statusTooltip,"tsqd-query-status-tooltip"))),p}}),h),S(f,m(R,{get when(){return d()},get children(){var p=s0();return S(p,()=>e.label),G(()=>O(p,P(r().queryStatusTagLabel,"tsqd-query-status-tag-label"))),p}}),y),S(y,()=>e.count),G(p=>{var w=P(n`
            width: ${C.size[1.5]};
            height: ${C.size[1.5]};
            border-radius: ${C.border.radius.full};
            background-color: ${C.colors[e.color][500]};
          `,"tsqd-query-status-tag-dot"),b=P(r().queryStatusCount,e.count>0&&e.color!=="gray"&&n`
              background-color: ${a(o[e.color][100],o[e.color][900])};
              color: ${a(o[e.color][700],o[e.color][300])};
            `,"tsqd-query-status-tag-count");return w!==p.e&&O(h,p.e=w),b!==p.t&&O(y,p.t=b),p},{e:void 0,t:void 0}),f})()},C0=()=>{const e=$e(),t=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,n=q(()=>e()==="dark"?We(t):je(t)),{colors:r}=C,o=(E,F)=>e()==="dark"?F:E,s=K().client,[a,l]=z(!1),[i,u]=z("view"),[g,c]=z(!1),d=q(()=>K().errorTypes||[]),f=ye(E=>E().getAll().find(F=>F.queryHash===Oe()),!1),h=ye(E=>E().getAll().find(F=>F.queryHash===Oe()),!1),y=ye(E=>E().getAll().find(F=>F.queryHash===Oe())?.state,!1),v=ye(E=>E().getAll().find(F=>F.queryHash===Oe())?.state.data,!1),p=ye(E=>{const F=E().getAll().find(H=>H.queryHash===Oe());return F?_t(F):"inactive"}),w=ye(E=>{const F=E().getAll().find(H=>H.queryHash===Oe());return F?F.state.status:"pending"}),b=ye(E=>E().getAll().find(F=>F.queryHash===Oe())?.getObserversCount()??0),x=q(()=>Is(p())),$=()=>{Ye({type:"REFETCH",queryHash:f()?.queryHash}),f()?.fetch()?.catch(()=>{})},I=E=>{const F=f();if(!F)return;Ye({type:"TRIGGER_ERROR",queryHash:F.queryHash,metadata:{error:E?.name}});const H=E?.initializer(F)??new Error("Unknown error from devtools"),N=F.options;F.setState({data:void 0,status:"error",error:H,fetchMeta:{...F.state.fetchMeta,__previousQueryOptions:N}})},k=()=>{const E=f();if(!E)return;Ye({type:"RESTORE_LOADING",queryHash:E.queryHash});const F=E.state,H=E.state.fetchMeta?E.state.fetchMeta.__previousQueryOptions:null;E.cancel({silent:!0}),E.setState({...F,fetchStatus:"idle",fetchMeta:null}),H&&E.fetch(H)};B(()=>{p()!=="fetching"&&l(!1)});const T=()=>x()==="gray"?t`
        background-color: ${o(r[x()][200],r[x()][700])};
        color: ${o(r[x()][700],r[x()][300])};
        border-color: ${o(r[x()][400],r[x()][600])};
      `:t`
      background-color: ${o(r[x()][100],r[x()][900])};
      color: ${o(r[x()][700],r[x()][300])};
      border-color: ${o(r[x()][400],r[x()][600])};
    `;return m(R,{get when(){return ge(()=>!!f())()&&y()},get children(){var E=f0(),F=E.firstChild,H=F.nextSibling,N=H.firstChild,X=N.firstChild,te=X.firstChild,ie=X.nextSibling,se=N.nextSibling,ne=se.firstChild,re=ne.nextSibling,le=se.nextSibling,me=le.firstChild,Ae=me.nextSibling,ve=H.nextSibling,Ee=ve.nextSibling,D=Ee.firstChild,he=D.firstChild,Y=D.nextSibling,vt=Y.firstChild,V=Y.nextSibling,Ne=V.firstChild,Ce=V.nextSibling,Lt=Ce.firstChild,qe=Ce.nextSibling,mt=qe.firstChild,Mt=mt.nextSibling,tt=Ee.nextSibling;tt.firstChild;var Qe=tt.nextSibling,pt=Qe.nextSibling;return S(te,()=>kn(f().queryKey,!0)),S(ie,p),S(re,b),S(Ae,()=>new Date(y().dataUpdatedAt).toLocaleTimeString()),D.$$click=$,Y.$$click=()=>{Ye({type:"INVALIDATE",queryHash:f()?.queryHash}),s.invalidateQueries({queryKey:f()?.queryKey,exact:!0})},V.$$click=()=>{Ye({type:"RESET",queryHash:f()?.queryHash}),s.resetQueries({queryKey:f()?.queryKey,exact:!0})},Ce.$$click=()=>{Ye({type:"REMOVE",queryHash:f()?.queryHash}),s.removeQueries({queryKey:f()?.queryKey,exact:!0}),Hn(null)},qe.$$click=()=>{if(f()?.state.data===void 0)l(!0),k();else{const L=f();if(!L)return;Ye({type:"TRIGGER_LOADING",queryHash:L.queryHash});const ce=L.options;L.fetch({...ce,queryFn:()=>new Promise(()=>{}),gcTime:-1}),L.setState({data:void 0,status:"pending",fetchMeta:{...L.state.fetchMeta,__previousQueryOptions:ce}})}},S(qe,()=>w()==="pending"?"Restore":"Trigger",Mt),S(Ee,m(R,{get when(){return d().length===0||w()==="error"},get children(){var L=l0(),ce=L.firstChild,Me=ce.nextSibling;return L.$$click=()=>{f().state.error?(Ye({type:"RESTORE_ERROR",queryHash:f()?.queryHash}),s.resetQueries({queryKey:f()?.queryKey})):I()},S(L,()=>w()==="error"?"Restore":"Trigger",Me),G(ae=>{var oe=P(t`
                  color: ${o(r.red[500],r.red[400])};
                `,"tsqd-query-details-actions-btn","tsqd-query-details-action-error"),ue=w()==="pending",pe=t`
                  background-color: ${o(r.red[500],r.red[400])};
                `;return oe!==ae.e&&O(L,ae.e=oe),ue!==ae.t&&(L.disabled=ae.t=ue),pe!==ae.a&&O(ce,ae.a=pe),ae},{e:void 0,t:void 0,a:void 0}),L}}),null),S(Ee,m(R,{get when(){return!(d().length===0||w()==="error")},get children(){var L=c0(),ce=L.firstChild,Me=ce.nextSibling,ae=Me.nextSibling;return ae.firstChild,ae.addEventListener("change",oe=>{const ue=d().find(pe=>pe.name===oe.currentTarget.value);I(ue)}),S(ae,m(Ls,{get each(){return d()},children:oe=>(()=>{var ue=g0();return S(ue,()=>oe.name),G(()=>ue.value=oe.name),ue})()}),null),S(L,m(Bt,{}),null),G(oe=>{var ue=P(n().actionsSelect,"tsqd-query-details-actions-btn","tsqd-query-details-action-error-multiple"),pe=t`
                  background-color: ${C.colors.red[400]};
                `,Z=w()==="pending";return ue!==oe.e&&O(L,oe.e=ue),pe!==oe.t&&O(ce,oe.t=pe),Z!==oe.a&&(ae.disabled=oe.a=Z),oe},{e:void 0,t:void 0,a:void 0}),L}}),null),S(tt,()=>i()==="view"?"Explorer":"Editor",null),S(E,m(R,{get when(){return i()==="view"},get children(){var L=u0();return S(L,m(wt,{label:"Data",defaultExpanded:["Data"],get value(){return v()},editable:!0,onEdit:()=>u("edit"),get activeQuery(){return f()}})),G(ce=>bt(L,"padding",C.size[2])),L}}),Qe),S(E,m(R,{get when(){return i()==="edit"},get children(){var L=d0(),ce=L.firstChild,Me=ce.nextSibling,ae=Me.firstChild,oe=ae.nextSibling,ue=oe.firstChild,pe=ue.nextSibling;return L.addEventListener("submit",Z=>{Z.preventDefault();const rt=new FormData(Z.currentTarget).get("data");try{const He=JSON.parse(rt);f().setState({...f().state,data:He}),u("view")}catch{c(!0)}}),ce.addEventListener("focus",()=>c(!1)),S(ae,()=>g()?"Invalid Value":""),ue.$$click=()=>u("view"),G(Z=>{var nt=P(n().devtoolsEditForm,"tsqd-query-details-data-editor"),rt=n().devtoolsEditTextarea,He=g(),Dt=n().devtoolsEditFormActions,ot=n().devtoolsEditFormError,At=n().devtoolsEditFormActionContainer,it=P(n().devtoolsEditFormAction,t`
                      color: ${o(r.gray[600],r.gray[300])};
                    `),yt=P(n().devtoolsEditFormAction,t`
                      color: ${o(r.blue[600],r.blue[400])};
                    `);return nt!==Z.e&&O(L,Z.e=nt),rt!==Z.t&&O(ce,Z.t=rt),He!==Z.a&&A(ce,"data-error",Z.a=He),Dt!==Z.o&&O(Me,Z.o=Dt),ot!==Z.i&&O(ae,Z.i=ot),At!==Z.n&&O(oe,Z.n=At),it!==Z.s&&O(ue,Z.s=it),yt!==Z.h&&O(pe,Z.h=yt),Z},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0}),G(()=>ce.value=JSON.stringify(v(),null,2)),L}}),Qe),S(pt,m(wt,{label:"Query",defaultExpanded:["Query","queryKey"],get value(){return h()}})),G(L=>{var ce=P(n().detailsContainer,"tsqd-query-details-container"),Me=P(n().detailsHeader,"tsqd-query-details-header"),ae=P(n().detailsBody,"tsqd-query-details-summary-container"),oe=P(n().queryDetailsStatus,T()),ue=P(n().detailsHeader,"tsqd-query-details-header"),pe=P(n().actionsBody,"tsqd-query-details-actions-container"),Z=P(t`
                color: ${o(r.blue[600],r.blue[400])};
              `,"tsqd-query-details-actions-btn","tsqd-query-details-action-refetch"),nt=p()==="fetching",rt=t`
                background-color: ${o(r.blue[600],r.blue[400])};
              `,He=P(t`
                color: ${o(r.yellow[600],r.yellow[400])};
              `,"tsqd-query-details-actions-btn","tsqd-query-details-action-invalidate"),Dt=w()==="pending",ot=t`
                background-color: ${o(r.yellow[600],r.yellow[400])};
              `,At=P(t`
                color: ${o(r.gray[600],r.gray[300])};
              `,"tsqd-query-details-actions-btn","tsqd-query-details-action-reset"),it=w()==="pending",yt=t`
                background-color: ${o(r.gray[600],r.gray[400])};
              `,pn=P(t`
                color: ${o(r.pink[500],r.pink[400])};
              `,"tsqd-query-details-actions-btn","tsqd-query-details-action-remove"),Yt=p()==="fetching",yn=t`
                background-color: ${o(r.pink[500],r.pink[400])};
              `,Pt=P(t`
                color: ${o(r.cyan[500],r.cyan[400])};
              `,"tsqd-query-details-actions-btn","tsqd-query-details-action-loading"),bn=a(),Xt=t`
                background-color: ${o(r.cyan[500],r.cyan[400])};
              `,Zt=P(n().detailsHeader,"tsqd-query-details-header"),Jt=P(n().detailsHeader,"tsqd-query-details-header"),en=C.size[2];return ce!==L.e&&O(E,L.e=ce),Me!==L.t&&O(F,L.t=Me),ae!==L.a&&O(H,L.a=ae),oe!==L.o&&O(ie,L.o=oe),ue!==L.i&&O(ve,L.i=ue),pe!==L.n&&O(Ee,L.n=pe),Z!==L.s&&O(D,L.s=Z),nt!==L.h&&(D.disabled=L.h=nt),rt!==L.r&&O(he,L.r=rt),He!==L.d&&O(Y,L.d=He),Dt!==L.l&&(Y.disabled=L.l=Dt),ot!==L.u&&O(vt,L.u=ot),At!==L.c&&O(V,L.c=At),it!==L.w&&(V.disabled=L.w=it),yt!==L.m&&O(Ne,L.m=yt),pn!==L.f&&O(Ce,L.f=pn),Yt!==L.y&&(Ce.disabled=L.y=Yt),yn!==L.g&&O(Lt,L.g=yn),Pt!==L.p&&O(qe,L.p=Pt),bn!==L.b&&(qe.disabled=L.b=bn),Xt!==L.T&&O(mt,L.T=Xt),Zt!==L.A&&O(tt,L.A=Zt),Jt!==L.O&&O(Qe,L.O=Jt),en!==L.I&&bt(pt,"padding",L.I=en),L},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0,r:void 0,d:void 0,l:void 0,u:void 0,c:void 0,w:void 0,m:void 0,f:void 0,y:void 0,g:void 0,p:void 0,b:void 0,T:void 0,A:void 0,O:void 0,I:void 0}),E}})},S0=()=>{const e=$e(),t=K().shadowDOMTarget?W.bind({target:K().shadowDOMTarget}):W,n=q(()=>e()==="dark"?We(t):je(t)),{colors:r}=C,o=(g,c)=>e()==="dark"?c:g,s=Ge(g=>{const d=g().getAll().find(f=>f.mutationId===xt());return d?d.state.isPaused:!1}),a=Ge(g=>{const d=g().getAll().find(f=>f.mutationId===xt());return d?d.state.status:"idle"}),l=q(()=>Kt({isPaused:s(),status:a()})),i=Ge(g=>g().getAll().find(c=>c.mutationId===xt()),!1),u=()=>l()==="gray"?t`
        background-color: ${o(r[l()][200],r[l()][700])};
        color: ${o(r[l()][700],r[l()][300])};
        border-color: ${o(r[l()][400],r[l()][600])};
      `:t`
      background-color: ${o(r[l()][100],r[l()][900])};
      color: ${o(r[l()][700],r[l()][300])};
      border-color: ${o(r[l()][400],r[l()][600])};
    `;return m(R,{get when(){return i()},get children(){var g=h0(),c=g.firstChild,d=c.nextSibling,f=d.firstChild,h=f.firstChild,y=h.firstChild,v=h.nextSibling,p=f.nextSibling,w=p.firstChild,b=w.nextSibling,x=d.nextSibling,$=x.nextSibling,I=$.nextSibling,k=I.nextSibling,T=k.nextSibling,E=T.nextSibling,F=E.nextSibling,H=F.nextSibling;return S(y,m(R,{get when(){return i().options.mutationKey},fallback:"No mutationKey found",get children(){return kn(i().options.mutationKey,!0)}})),S(v,m(R,{get when(){return l()==="purple"},children:"pending"}),null),S(v,m(R,{get when(){return l()!=="purple"},get children(){return a()}}),null),S(b,()=>new Date(i().state.submittedAt).toLocaleTimeString()),S($,m(wt,{label:"Variables",defaultExpanded:["Variables"],get value(){return i().state.variables}})),S(k,m(wt,{label:"Context",defaultExpanded:["Context"],get value(){return i().state.context}})),S(E,m(wt,{label:"Data",defaultExpanded:["Data"],get value(){return i().state.data}})),S(H,m(wt,{label:"Mutation",defaultExpanded:["Mutation"],get value(){return i()}})),G(N=>{var X=P(n().detailsContainer,"tsqd-query-details-container"),te=P(n().detailsHeader,"tsqd-query-details-header"),ie=P(n().detailsBody,"tsqd-query-details-summary-container"),se=P(n().queryDetailsStatus,u()),ne=P(n().detailsHeader,"tsqd-query-details-header"),re=C.size[2],le=P(n().detailsHeader,"tsqd-query-details-header"),me=C.size[2],Ae=P(n().detailsHeader,"tsqd-query-details-header"),ve=C.size[2],Ee=P(n().detailsHeader,"tsqd-query-details-header"),D=C.size[2];return X!==N.e&&O(g,N.e=X),te!==N.t&&O(c,N.t=te),ie!==N.a&&O(d,N.a=ie),se!==N.o&&O(v,N.o=se),ne!==N.i&&O(x,N.i=ne),re!==N.n&&bt($,"padding",N.n=re),le!==N.s&&O(I,N.s=le),me!==N.h&&bt(k,"padding",N.h=me),Ae!==N.r&&O(T,N.r=Ae),ve!==N.d&&bt(E,"padding",N.d=ve),Ee!==N.l&&O(F,N.l=Ee),D!==N.u&&bt(H,"padding",N.u=D),N},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0,r:void 0,d:void 0,l:void 0,u:void 0}),g}})},Fn=new Map,k0=()=>{const e=q(()=>K().client.getQueryCache()),t=e().subscribe(n=>{Fs(()=>{for(const[r,o]of Fn.entries())o.shouldUpdate(n)&&o.setter(r(e))})});return U(()=>{Fn.clear(),t()}),t},ye=(e,t=!0,n=()=>!0)=>{const r=q(()=>K().client.getQueryCache()),[o,s]=z(e(r),t?void 0:{equals:!1});return B(()=>{s(e(r))}),Fn.set(e,{setter:s,shouldUpdate:n}),U(()=>{Fn.delete(e)}),o},On=new Map,E0=()=>{const e=q(()=>K().client.getMutationCache()),t=e().subscribe(()=>{for(const[n,r]of On.entries())queueMicrotask(()=>{r(n(e))})});return U(()=>{On.clear(),t()}),t},Ge=(e,t=!0)=>{const n=q(()=>K().client.getMutationCache()),[r,o]=z(e(n),t?void 0:{equals:!1});return B(()=>{o(e(n))}),On.set(e,o),U(()=>{On.delete(e)}),r},M0="@tanstack/query-devtools-event",Ye=({type:e,queryHash:t,metadata:n})=>{const r=new CustomEvent(M0,{detail:{type:e,queryHash:t,metadata:n},bubbles:!0,cancelable:!0});window.dispatchEvent(r)},Ms=(e,t)=>{const{colors:n,font:r,size:o,alpha:s,shadow:a,border:l}=C,i=(u,g)=>e==="light"?u:g;return{devtoolsBtn:t`
      z-index: 100000;
      position: fixed;
      padding: 4px;
      text-align: left;

      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 9999px;
      box-shadow: ${a.md()};
      overflow: hidden;

      & div {
        position: absolute;
        top: -8px;
        left: -8px;
        right: -8px;
        bottom: -8px;
        border-radius: 9999px;
        -webkit-transform: translateZ(0);
        transform: translateZ(0);

        & svg {
          position: absolute;
          width: 100%;
          height: 100%;
        }
        filter: blur(6px) saturate(1.2) contrast(1.1);
      }

      &:focus-within {
        outline-offset: 2px;
        outline: 3px solid ${n.green[600]};
      }

      & button {
        position: relative;
        z-index: 1;
        padding: 0;
        border-radius: 9999px;
        background-color: transparent;
        border: none;
        height: 40px;
        display: flex;
        width: 40px;
        overflow: hidden;
        cursor: pointer;
        outline: none;
        & svg {
          position: absolute;
          width: 100%;
          height: 100%;
        }
      }
    `,panel:t`
      position: fixed;
      z-index: 9999;
      display: flex;
      gap: ${C.size[.5]};
      & * {
        box-sizing: border-box;
        text-transform: none;
      }

      & *::-webkit-scrollbar {
        width: 7px;
      }

      & *::-webkit-scrollbar-track {
        background: transparent;
      }

      & *::-webkit-scrollbar-thumb {
        background: ${i(n.gray[300],n.darkGray[200])};
      }

      & *::-webkit-scrollbar-thumb:hover {
        background: ${i(n.gray[400],n.darkGray[300])};
      }
    `,parentPanel:t`
      z-index: 9999;
      display: flex;
      height: 100%;
      gap: ${C.size[.5]};
      & * {
        box-sizing: border-box;
        text-transform: none;
      }

      & *::-webkit-scrollbar {
        width: 7px;
      }

      & *::-webkit-scrollbar-track {
        background: transparent;
      }

      & *::-webkit-scrollbar-thumb {
        background: ${i(n.gray[300],n.darkGray[200])};
      }

      & *::-webkit-scrollbar-thumb:hover {
        background: ${i(n.gray[400],n.darkGray[300])};
      }
    `,"devtoolsBtn-position-bottom-right":t`
      bottom: 12px;
      right: 12px;
    `,"devtoolsBtn-position-bottom-left":t`
      bottom: 12px;
      left: 12px;
    `,"devtoolsBtn-position-top-left":t`
      top: 12px;
      left: 12px;
    `,"devtoolsBtn-position-top-right":t`
      top: 12px;
      right: 12px;
    `,"devtoolsBtn-position-relative":t`
      position: relative;
    `,"panel-position-top":t`
      top: 0;
      right: 0;
      left: 0;
      max-height: 90%;
      min-height: ${o[14]};
      border-bottom: ${i(n.gray[400],n.darkGray[300])} 1px solid;
    `,"panel-position-bottom":t`
      bottom: 0;
      right: 0;
      left: 0;
      max-height: 90%;
      min-height: ${o[14]};
      border-top: ${i(n.gray[400],n.darkGray[300])} 1px solid;
    `,"panel-position-right":t`
      bottom: 0;
      right: 0;
      top: 0;
      border-left: ${i(n.gray[400],n.darkGray[300])} 1px solid;
      max-width: 90%;
    `,"panel-position-left":t`
      bottom: 0;
      left: 0;
      top: 0;
      border-right: ${i(n.gray[400],n.darkGray[300])} 1px solid;
      max-width: 90%;
    `,closeBtn:t`
      position: absolute;
      cursor: pointer;
      z-index: 5;
      display: flex;
      align-items: center;
      justify-content: center;
      outline: none;
      background-color: ${i(n.gray[50],n.darkGray[700])};
      &:hover {
        background-color: ${i(n.gray[200],n.darkGray[500])};
      }
      &:focus-visible {
        outline: 2px solid ${n.blue[600]};
      }
      & svg {
        color: ${i(n.gray[600],n.gray[400])};
        width: ${o[2]};
        height: ${o[2]};
      }
    `,"closeBtn-position-top":t`
      bottom: 0;
      right: ${o[2]};
      transform: translate(0, 100%);
      border-right: ${i(n.gray[400],n.darkGray[300])} 1px solid;
      border-left: ${i(n.gray[400],n.darkGray[300])} 1px solid;
      border-top: none;
      border-bottom: ${i(n.gray[400],n.darkGray[300])} 1px solid;
      border-radius: 0px 0px ${l.radius.sm} ${l.radius.sm};
      padding: ${o[.5]} ${o[1.5]} ${o[1]} ${o[1.5]};

      &::after {
        content: ' ';
        position: absolute;
        bottom: 100%;
        left: -${o[2.5]};
        height: ${o[1.5]};
        width: calc(100% + ${o[5]});
      }

      & svg {
        transform: rotate(180deg);
      }
    `,"closeBtn-position-bottom":t`
      top: 0;
      right: ${o[2]};
      transform: translate(0, -100%);
      border-right: ${i(n.gray[400],n.darkGray[300])} 1px solid;
      border-left: ${i(n.gray[400],n.darkGray[300])} 1px solid;
      border-top: ${i(n.gray[400],n.darkGray[300])} 1px solid;
      border-bottom: none;
      border-radius: ${l.radius.sm} ${l.radius.sm} 0px 0px;
      padding: ${o[1]} ${o[1.5]} ${o[.5]} ${o[1.5]};

      &::after {
        content: ' ';
        position: absolute;
        top: 100%;
        left: -${o[2.5]};
        height: ${o[1.5]};
        width: calc(100% + ${o[5]});
      }
    `,"closeBtn-position-right":t`
      bottom: ${o[2]};
      left: 0;
      transform: translate(-100%, 0);
      border-right: none;
      border-left: ${i(n.gray[400],n.darkGray[300])} 1px solid;
      border-top: ${i(n.gray[400],n.darkGray[300])} 1px solid;
      border-bottom: ${i(n.gray[400],n.darkGray[300])} 1px solid;
      border-radius: ${l.radius.sm} 0px 0px ${l.radius.sm};
      padding: ${o[1.5]} ${o[.5]} ${o[1.5]} ${o[1]};

      &::after {
        content: ' ';
        position: absolute;
        left: 100%;
        height: calc(100% + ${o[5]});
        width: ${o[1.5]};
      }

      & svg {
        transform: rotate(-90deg);
      }
    `,"closeBtn-position-left":t`
      bottom: ${o[2]};
      right: 0;
      transform: translate(100%, 0);
      border-left: none;
      border-right: ${i(n.gray[400],n.darkGray[300])} 1px solid;
      border-top: ${i(n.gray[400],n.darkGray[300])} 1px solid;
      border-bottom: ${i(n.gray[400],n.darkGray[300])} 1px solid;
      border-radius: 0px ${l.radius.sm} ${l.radius.sm} 0px;
      padding: ${o[1.5]} ${o[1]} ${o[1.5]} ${o[.5]};

      &::after {
        content: ' ';
        position: absolute;
        right: 100%;
        height: calc(100% + ${o[5]});
        width: ${o[1.5]};
      }

      & svg {
        transform: rotate(90deg);
      }
    `,queriesContainer:t`
      flex: 1 1 700px;
      background-color: ${i(n.gray[50],n.darkGray[700])};
      display: flex;
      flex-direction: column;
      & * {
        font-family: ui-sans-serif, Inter, system-ui, sans-serif, sans-serif;
      }
    `,dragHandle:t`
      position: absolute;
      transition: background-color 0.125s ease;
      &:hover {
        background-color: ${n.purple[400]}${i("",s[90])};
      }
      &:focus {
        outline: none;
        background-color: ${n.purple[400]}${i("",s[90])};
      }
      &:focus-visible {
        outline: 2px solid ${n.blue[800]};
        outline-offset: -2px;
        background-color: ${n.purple[400]}${i("",s[90])};
      }
      z-index: 4;
    `,"dragHandle-position-top":t`
      bottom: 0;
      width: 100%;
      height: 3px;
      cursor: ns-resize;
    `,"dragHandle-position-bottom":t`
      top: 0;
      width: 100%;
      height: 3px;
      cursor: ns-resize;
    `,"dragHandle-position-right":t`
      left: 0;
      width: 3px;
      height: 100%;
      cursor: ew-resize;
    `,"dragHandle-position-left":t`
      right: 0;
      width: 3px;
      height: 100%;
      cursor: ew-resize;
    `,row:t`
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: ${C.size[2]} ${C.size[2.5]};
      gap: ${C.size[2.5]};
      border-bottom: ${i(n.gray[300],n.darkGray[500])} 1px solid;
      align-items: center;
      & > button {
        padding: 0;
        background: transparent;
        border: none;
        display: flex;
        gap: ${o[.5]};
        flex-direction: column;
      }
    `,logoAndToggleContainer:t`
      display: flex;
      gap: ${C.size[3]};
      align-items: center;
    `,logo:t`
      cursor: pointer;
      display: flex;
      flex-direction: column;
      background-color: transparent;
      border: none;
      gap: ${C.size[.5]};
      padding: 0px;
      &:hover {
        opacity: 0.7;
      }
      &:focus-visible {
        outline-offset: 4px;
        border-radius: ${l.radius.xs};
        outline: 2px solid ${n.blue[800]};
      }
    `,tanstackLogo:t`
      font-size: ${r.size.md};
      font-weight: ${r.weight.bold};
      line-height: ${r.lineHeight.xs};
      white-space: nowrap;
      color: ${i(n.gray[600],n.gray[300])};
    `,queryFlavorLogo:t`
      font-weight: ${r.weight.semibold};
      font-size: ${r.size.xs};
      background: linear-gradient(
        to right,
        ${i("#ea4037, #ff9b11","#dd524b, #e9a03b")}
      );
      background-clip: text;
      -webkit-background-clip: text;
      line-height: 1;
      -webkit-text-fill-color: transparent;
      white-space: nowrap;
    `,queryStatusContainer:t`
      display: flex;
      gap: ${C.size[2]};
      height: min-content;
    `,queryStatusTag:t`
      display: flex;
      gap: ${C.size[1.5]};
      box-sizing: border-box;
      height: ${C.size[6.5]};
      background: ${i(n.gray[50],n.darkGray[500])};
      color: ${i(n.gray[700],n.gray[300])};
      border-radius: ${C.border.radius.sm};
      font-size: ${r.size.sm};
      padding: ${C.size[1]};
      padding-left: ${C.size[1.5]};
      align-items: center;
      font-weight: ${r.weight.medium};
      border: ${i("1px solid "+n.gray[300],"1px solid transparent")};
      user-select: none;
      position: relative;
      &:focus-visible {
        outline-offset: 2px;
        outline: 2px solid ${n.blue[800]};
      }
    `,queryStatusTagLabel:t`
      font-size: ${r.size.xs};
    `,queryStatusCount:t`
      font-size: ${r.size.xs};
      padding: 0 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${i(n.gray[500],n.gray[400])};
      background-color: ${i(n.gray[200],n.darkGray[300])};
      border-radius: 2px;
      font-variant-numeric: tabular-nums;
      height: ${C.size[4.5]};
    `,statusTooltip:t`
      position: absolute;
      z-index: 1;
      background-color: ${i(n.gray[50],n.darkGray[500])};
      top: 100%;
      left: 50%;
      transform: translate(-50%, calc(${C.size[2]}));
      padding: ${C.size[.5]} ${C.size[2]};
      border-radius: ${C.border.radius.sm};
      font-size: ${r.size.xs};
      border: 1px solid ${i(n.gray[400],n.gray[600])};
      color: ${i(n.gray[600],n.gray[300])};

      &::before {
        top: 0px;
        content: ' ';
        display: block;
        left: 50%;
        transform: translate(-50%, -100%);
        position: absolute;
        border-color: transparent transparent
          ${i(n.gray[400],n.gray[600])} transparent;
        border-style: solid;
        border-width: 7px;
        /* transform: rotate(180deg); */
      }

      &::after {
        top: 0px;
        content: ' ';
        display: block;
        left: 50%;
        transform: translate(-50%, calc(-100% + 2px));
        position: absolute;
        border-color: transparent transparent
          ${i(n.gray[100],n.darkGray[500])} transparent;
        border-style: solid;
        border-width: 7px;
      }
    `,filtersContainer:t`
      display: flex;
      gap: ${C.size[2]};
      & > button {
        cursor: pointer;
        padding: ${C.size[.5]} ${C.size[1.5]} ${C.size[.5]}
          ${C.size[2]};
        border-radius: ${C.border.radius.sm};
        background-color: ${i(n.gray[100],n.darkGray[400])};
        border: 1px solid ${i(n.gray[300],n.darkGray[200])};
        color: ${i(n.gray[700],n.gray[300])};
        font-size: ${r.size.xs};
        display: flex;
        align-items: center;
        line-height: ${r.lineHeight.sm};
        gap: ${C.size[1.5]};
        max-width: 160px;
        &:focus-visible {
          outline-offset: 2px;
          border-radius: ${l.radius.xs};
          outline: 2px solid ${n.blue[800]};
        }
        & svg {
          width: ${C.size[3]};
          height: ${C.size[3]};
          color: ${i(n.gray[500],n.gray[400])};
        }
      }
    `,filterInput:t`
      padding: ${o[.5]} ${o[2]};
      border-radius: ${C.border.radius.sm};
      background-color: ${i(n.gray[100],n.darkGray[400])};
      display: flex;
      box-sizing: content-box;
      align-items: center;
      gap: ${C.size[1.5]};
      max-width: 160px;
      min-width: 100px;
      border: 1px solid ${i(n.gray[300],n.darkGray[200])};
      height: min-content;
      color: ${i(n.gray[600],n.gray[400])};
      & > svg {
        width: ${o[3]};
        height: ${o[3]};
      }
      & input {
        font-size: ${r.size.xs};
        width: 100%;
        background-color: ${i(n.gray[100],n.darkGray[400])};
        border: none;
        padding: 0;
        line-height: ${r.lineHeight.sm};
        color: ${i(n.gray[700],n.gray[300])};
        &::placeholder {
          color: ${i(n.gray[700],n.gray[300])};
        }
        &:focus {
          outline: none;
        }
      }

      &:focus-within {
        outline-offset: 2px;
        border-radius: ${l.radius.xs};
        outline: 2px solid ${n.blue[800]};
      }
    `,filterSelect:t`
      padding: ${C.size[.5]} ${C.size[2]};
      border-radius: ${C.border.radius.sm};
      background-color: ${i(n.gray[100],n.darkGray[400])};
      display: flex;
      align-items: center;
      gap: ${C.size[1.5]};
      box-sizing: content-box;
      max-width: 160px;
      border: 1px solid ${i(n.gray[300],n.darkGray[200])};
      height: min-content;
      & > svg {
        color: ${i(n.gray[600],n.gray[400])};
        width: ${C.size[2]};
        height: ${C.size[2]};
      }
      & > select {
        appearance: none;
        color: ${i(n.gray[700],n.gray[300])};
        min-width: 100px;
        line-height: ${r.lineHeight.sm};
        font-size: ${r.size.xs};
        background-color: ${i(n.gray[100],n.darkGray[400])};
        border: none;
        &:focus {
          outline: none;
        }
      }
      &:focus-within {
        outline-offset: 2px;
        border-radius: ${l.radius.xs};
        outline: 2px solid ${n.blue[800]};
      }
    `,actionsContainer:t`
      display: flex;
      gap: ${C.size[2]};
    `,actionsBtn:t`
      border-radius: ${C.border.radius.sm};
      background-color: ${i(n.gray[100],n.darkGray[400])};
      border: 1px solid ${i(n.gray[300],n.darkGray[200])};
      width: ${C.size[6.5]};
      height: ${C.size[6.5]};
      justify-content: center;
      display: flex;
      align-items: center;
      gap: ${C.size[1.5]};
      max-width: 160px;
      cursor: pointer;
      padding: 0;
      &:hover {
        background-color: ${i(n.gray[200],n.darkGray[500])};
      }
      & svg {
        color: ${i(n.gray[700],n.gray[300])};
        width: ${C.size[3]};
        height: ${C.size[3]};
      }
      &:focus-visible {
        outline-offset: 2px;
        border-radius: ${l.radius.xs};
        outline: 2px solid ${n.blue[800]};
      }
    `,actionsBtnOffline:t`
      & svg {
        stroke: ${i(n.yellow[700],n.yellow[500])};
        fill: ${i(n.yellow[700],n.yellow[500])};
      }
    `,overflowQueryContainer:t`
      flex: 1;
      overflow-y: auto;
      & > div {
        display: flex;
        flex-direction: column;
      }
    `,queryRow:t`
      display: flex;
      align-items: center;
      padding: 0;
      border: none;
      cursor: pointer;
      color: ${i(n.gray[700],n.gray[300])};
      background-color: ${i(n.gray[50],n.darkGray[700])};
      line-height: 1;
      &:focus {
        outline: none;
      }
      &:focus-visible {
        outline-offset: -2px;
        border-radius: ${l.radius.xs};
        outline: 2px solid ${n.blue[800]};
      }
      &:hover .tsqd-query-hash {
        background-color: ${i(n.gray[200],n.darkGray[600])};
      }

      & .tsqd-query-observer-count {
        padding: 0 ${C.size[1]};
        user-select: none;
        min-width: ${C.size[6.5]};
        align-self: stretch;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${r.size.xs};
        font-weight: ${r.weight.medium};
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom: 1px solid ${i(n.gray[300],n.darkGray[700])};
      }
      & .tsqd-query-hash {
        user-select: text;
        font-size: ${r.size.xs};
        display: flex;
        align-items: center;
        min-height: ${C.size[6]};
        flex: 1;
        padding: ${C.size[1]} ${C.size[2]};
        font-family:
          ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          'Liberation Mono', 'Courier New', monospace;
        border-bottom: 1px solid ${i(n.gray[300],n.darkGray[400])};
        text-align: left;
        text-overflow: clip;
        word-break: break-word;
      }

      & .tsqd-query-disabled-indicator {
        align-self: stretch;
        display: flex;
        align-items: center;
        padding: 0 ${C.size[2]};
        color: ${i(n.gray[800],n.gray[300])};
        background-color: ${i(n.gray[300],n.darkGray[600])};
        border-bottom: 1px solid ${i(n.gray[300],n.darkGray[400])};
        font-size: ${r.size.xs};
      }

      & .tsqd-query-static-indicator {
        align-self: stretch;
        display: flex;
        align-items: center;
        padding: 0 ${C.size[2]};
        color: ${i(n.teal[800],n.teal[300])};
        background-color: ${i(n.teal[100],n.teal[900])};
        border-bottom: 1px solid ${i(n.teal[300],n.teal[700])};
        font-size: ${r.size.xs};
      }
    `,selectedQueryRow:t`
      background-color: ${i(n.gray[200],n.darkGray[500])};
    `,detailsContainer:t`
      flex: 1 1 700px;
      background-color: ${i(n.gray[50],n.darkGray[700])};
      color: ${i(n.gray[700],n.gray[300])};
      font-family: ui-sans-serif, Inter, system-ui, sans-serif, sans-serif;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      display: flex;
      text-align: left;
    `,detailsHeader:t`
      font-family: ui-sans-serif, Inter, system-ui, sans-serif, sans-serif;
      position: sticky;
      top: 0;
      z-index: 2;
      background-color: ${i(n.gray[200],n.darkGray[600])};
      padding: ${C.size[1.5]} ${C.size[2]};
      font-weight: ${r.weight.medium};
      font-size: ${r.size.xs};
      line-height: ${r.lineHeight.xs};
      text-align: left;
    `,detailsBody:t`
      margin: ${C.size[1.5]} 0px ${C.size[2]} 0px;
      & > div {
        display: flex;
        align-items: stretch;
        padding: 0 ${C.size[2]};
        line-height: ${r.lineHeight.sm};
        justify-content: space-between;
        & > span {
          font-size: ${r.size.xs};
        }
        & > span:nth-child(2) {
          font-variant-numeric: tabular-nums;
        }
      }

      & > div:first-child {
        margin-bottom: ${C.size[1.5]};
      }

      & code {
        font-family:
          ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          'Liberation Mono', 'Courier New', monospace;
        margin: 0;
        font-size: ${r.size.xs};
        line-height: ${r.lineHeight.xs};
        max-width: 100%;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      & pre {
        margin: 0;
        display: flex;
        align-items: center;
      }
    `,queryDetailsStatus:t`
      border: 1px solid ${n.darkGray[200]};
      border-radius: ${C.border.radius.sm};
      font-weight: ${r.weight.medium};
      padding: ${C.size[1]} ${C.size[2.5]};
    `,actionsBody:t`
      flex-wrap: wrap;
      margin: ${C.size[2]} 0px ${C.size[2]} 0px;
      display: flex;
      gap: ${C.size[2]};
      padding: 0px ${C.size[2]};
      & > button {
        font-family: ui-sans-serif, Inter, system-ui, sans-serif, sans-serif;
        font-size: ${r.size.xs};
        padding: ${C.size[1]} ${C.size[2]};
        display: flex;
        border-radius: ${C.border.radius.sm};
        background-color: ${i(n.gray[100],n.darkGray[600])};
        border: 1px solid ${i(n.gray[300],n.darkGray[400])};
        align-items: center;
        gap: ${C.size[2]};
        font-weight: ${r.weight.medium};
        line-height: ${r.lineHeight.xs};
        cursor: pointer;
        &:focus-visible {
          outline-offset: 2px;
          border-radius: ${l.radius.xs};
          outline: 2px solid ${n.blue[800]};
        }
        &:hover {
          background-color: ${i(n.gray[200],n.darkGray[500])};
        }

        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        & > span {
          width: ${o[1.5]};
          height: ${o[1.5]};
          border-radius: ${C.border.radius.full};
        }
      }
    `,actionsSelect:t`
      font-size: ${r.size.xs};
      padding: ${C.size[.5]} ${C.size[2]};
      display: flex;
      border-radius: ${C.border.radius.sm};
      overflow: hidden;
      background-color: ${i(n.gray[100],n.darkGray[600])};
      border: 1px solid ${i(n.gray[300],n.darkGray[400])};
      align-items: center;
      gap: ${C.size[2]};
      font-weight: ${r.weight.medium};
      line-height: ${r.lineHeight.sm};
      color: ${i(n.red[500],n.red[400])};
      cursor: pointer;
      position: relative;
      &:hover {
        background-color: ${i(n.gray[200],n.darkGray[500])};
      }
      & > span {
        width: ${o[1.5]};
        height: ${o[1.5]};
        border-radius: ${C.border.radius.full};
      }
      &:focus-within {
        outline-offset: 2px;
        border-radius: ${l.radius.xs};
        outline: 2px solid ${n.blue[800]};
      }
      & select {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        appearance: none;
        background-color: transparent;
        border: none;
        color: transparent;
        outline: none;
      }

      & svg path {
        stroke: ${C.colors.red[400]};
      }
      & svg {
        width: ${C.size[2]};
        height: ${C.size[2]};
      }
    `,settingsMenu:t`
      display: flex;
      & * {
        font-family: ui-sans-serif, Inter, system-ui, sans-serif, sans-serif;
      }
      flex-direction: column;
      gap: ${o[.5]};
      border-radius: ${C.border.radius.sm};
      border: 1px solid ${i(n.gray[300],n.gray[700])};
      background-color: ${i(n.gray[50],n.darkGray[600])};
      font-size: ${r.size.xs};
      color: ${i(n.gray[700],n.gray[300])};
      z-index: 99999;
      min-width: 120px;
      padding: ${o[.5]};
    `,settingsSubTrigger:t`
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-radius: ${C.border.radius.xs};
      padding: ${C.size[1]} ${C.size[1]};
      cursor: pointer;
      background-color: transparent;
      border: none;
      color: ${i(n.gray[700],n.gray[300])};
      & svg {
        color: ${i(n.gray[600],n.gray[400])};
        transform: rotate(-90deg);
        width: ${C.size[2]};
        height: ${C.size[2]};
      }
      &:hover {
        background-color: ${i(n.gray[200],n.darkGray[500])};
      }
      &:focus-visible {
        outline-offset: 2px;
        outline: 2px solid ${n.blue[800]};
      }
      &.data-disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `,settingsMenuHeader:t`
      padding: ${C.size[1]} ${C.size[1]};
      font-weight: ${r.weight.medium};
      border-bottom: 1px solid ${i(n.gray[300],n.darkGray[400])};
      color: ${i(n.gray[500],n.gray[400])};
      font-size: ${r.size.xs};
    `,settingsSubButton:t`
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: ${i(n.gray[700],n.gray[300])};
      font-size: ${r.size.xs};
      border-radius: ${C.border.radius.xs};
      padding: ${C.size[1]} ${C.size[1]};
      cursor: pointer;
      background-color: transparent;
      border: none;
      & svg {
        color: ${i(n.gray[600],n.gray[400])};
      }
      &:hover {
        background-color: ${i(n.gray[200],n.darkGray[500])};
      }
      &:focus-visible {
        outline-offset: 2px;
        outline: 2px solid ${n.blue[800]};
      }
      &[data-checked] {
        background-color: ${i(n.purple[100],n.purple[900])};
        color: ${i(n.purple[700],n.purple[300])};
        & svg {
          color: ${i(n.purple[700],n.purple[300])};
        }
        &:hover {
          background-color: ${i(n.purple[100],n.purple[900])};
        }
      }
    `,viewToggle:t`
      border-radius: ${C.border.radius.sm};
      background-color: ${i(n.gray[200],n.darkGray[600])};
      border: 1px solid ${i(n.gray[300],n.darkGray[200])};
      display: flex;
      padding: 0;
      font-size: ${r.size.xs};
      color: ${i(n.gray[700],n.gray[300])};
      overflow: hidden;

      &:has(:focus-visible) {
        outline: 2px solid ${n.blue[800]};
      }

      & .tsqd-radio-toggle {
        opacity: 0.5;
        display: flex;
        & label {
          display: flex;
          align-items: center;
          cursor: pointer;
          line-height: ${r.lineHeight.md};
        }

        & label:hover {
          background-color: ${i(n.gray[100],n.darkGray[500])};
        }
      }

      & > [data-checked] {
        opacity: 1;
        background-color: ${i(n.gray[100],n.darkGray[400])};
        & label:hover {
          background-color: ${i(n.gray[100],n.darkGray[400])};
        }
      }

      & .tsqd-radio-toggle:first-child {
        & label {
          padding: 0 ${C.size[1.5]} 0 ${C.size[2]};
        }
        border-right: 1px solid ${i(n.gray[300],n.darkGray[200])};
      }

      & .tsqd-radio-toggle:nth-child(2) {
        & label {
          padding: 0 ${C.size[2]} 0 ${C.size[1.5]};
        }
      }
    `,devtoolsEditForm:t`
      padding: ${o[2]};
      & > [data-error='true'] {
        outline: 2px solid ${i(n.red[200],n.red[800])};
        outline-offset: 2px;
        border-radius: ${l.radius.xs};
      }
    `,devtoolsEditTextarea:t`
      width: 100%;
      max-height: 500px;
      font-family: 'Fira Code', monospace;
      font-size: ${r.size.xs};
      border-radius: ${l.radius.sm};
      field-sizing: content;
      padding: ${o[2]};
      background-color: ${i(n.gray[100],n.darkGray[800])};
      color: ${i(n.gray[900],n.gray[100])};
      border: 1px solid ${i(n.gray[200],n.gray[700])};
      resize: none;
      &:focus {
        outline-offset: 2px;
        border-radius: ${l.radius.xs};
        outline: 2px solid ${i(n.blue[200],n.blue[800])};
      }
    `,devtoolsEditFormActions:t`
      display: flex;
      justify-content: space-between;
      gap: ${o[2]};
      align-items: center;
      padding-top: ${o[1]};
      font-size: ${r.size.xs};
    `,devtoolsEditFormError:t`
      color: ${i(n.red[700],n.red[500])};
    `,devtoolsEditFormActionContainer:t`
      display: flex;
      gap: ${o[2]};
    `,devtoolsEditFormAction:t`
      font-family: ui-sans-serif, Inter, system-ui, sans-serif, sans-serif;
      font-size: ${r.size.xs};
      padding: ${o[1]} ${C.size[2]};
      display: flex;
      border-radius: ${l.radius.sm};
      background-color: ${i(n.gray[100],n.darkGray[600])};
      border: 1px solid ${i(n.gray[300],n.darkGray[400])};
      align-items: center;
      gap: ${o[2]};
      font-weight: ${r.weight.medium};
      line-height: ${r.lineHeight.xs};
      cursor: pointer;
      &:focus-visible {
        outline-offset: 2px;
        border-radius: ${l.radius.xs};
        outline: 2px solid ${n.blue[800]};
      }
      &:hover {
        background-color: ${i(n.gray[200],n.darkGray[500])};
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `}},je=e=>Ms("light",e),We=e=>Ms("dark",e);fr(["click","mousedown","keydown","input"]);var D0=e=>{const[t,n]=Js({prefix:"TanstackQueryDevtools"}),r=Us(),o=q(()=>{const s=e.theme||t.theme_preference||ra;return s!=="system"?s:r()});return m(Yo.Provider,{value:e,get children(){return m(la,{localStore:t,setLocalStore:n,get children(){return m(Zo.Provider,{value:o,get children(){return m(m0,{localStore:t,setLocalStore:n})}})}})}})},T0=D0;export{T0 as default};
