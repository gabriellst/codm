import { k as ky, H as HTTPError } from "../_libs/ky.mjs";
import { b as QueryClient, M as MutationCache, c as QueryCache } from "../_libs/tanstack__query-core.mjs";
import { Q as QueryClientProvider } from "../_libs/tanstack__react-query.mjs";
import { c as createRouter, b as createRootRouteWithContext, H as HeadContent, S as Scripts, O as Outlet, d as createFileRoute, l as lazyRouteComponent, e as useRouter } from "../_libs/tanstack__react-router.mjs";
import { X as redirect } from "../_libs/tanstack__router-core.mjs";
import { i as instance } from "../_libs/i18next.mjs";
import { t as toast, T as Toaster$1 } from "../_libs/sonner.mjs";
import { c as clsx } from "../_libs/clsx.mjs";
import { r as reactExports, c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { c as cva } from "../_libs/class-variance-authority.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { R as ReactQueryDevtools2 } from "../_libs/tanstack__react-query-devtools.mjs";
import { T as TanStackRouterDevtools } from "../_libs/@tanstack/react-router-devtools+[...].mjs";
import { i as initReactI18next, u as useTranslation } from "../_libs/react-i18next.mjs";
import { B as Button$1 } from "../_libs/base-ui__react.mjs";
import { e as IconAlertTriangle, f as IconLoader, g as IconAlertOctagon, h as IconInfoCircle, i as IconCircleCheck } from "../_libs/tabler__icons-react.mjs";
import { _ as _enum, o as object, s as string, l as lazy, u as uuid, a as union, b as literal, c as optional, d as array, e as boolean, n as number, i as int, f as nullable, g as datetime, h as email, j as any, k as url, m as config } from "../_libs/zod.mjs";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "node:stream";
import "../_libs/isbot.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "../_libs/tanstack__history.mjs";
import "node:stream/web";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
const SYMBOL = /* @__PURE__ */ Symbol.for("@codedm/client-typescript:baseUrls");
const globalRegistry = globalThis;
function registry() {
  if (!globalRegistry[SYMBOL]) globalRegistry[SYMBOL] = {};
  return globalRegistry[SYMBOL];
}
function configureClient(baseUrls) {
  Object.assign(registry(), baseUrls);
}
function getBaseUrl(service) {
  return registry()[service];
}
function resolveURL(service, url2, baseUrlOverride) {
  const base = baseUrlOverride ?? getBaseUrl(service);
  if (!base) return url2;
  let path;
  try {
    const parsed = new URL(url2);
    path = parsed.pathname + parsed.search + parsed.hash;
  } catch {
    path = url2;
  }
  if (!path.startsWith("/")) path = `/${path}`;
  return `${base.replace(/\/$/, "")}${path}`;
}
const DEFAULT_RETRY = {
  limit: 2,
  methods: ["get", "put", "head", "delete", "options", "trace"],
  statusCodes: [408, 413, 429, 500, 502, 503, 504],
  backoffLimit: 1e4,
  retryOnTimeout: true,
  jitter: true
};
function isBodyInit(data) {
  return data != null && (data instanceof Blob || data instanceof FormData || data instanceof URLSearchParams || typeof ReadableStream !== "undefined" && data instanceof ReadableStream || data instanceof ArrayBuffer || ArrayBuffer.isView(data) || typeof data === "string");
}
function buildRetryOptions(retry) {
  if (retry === false) return 0;
  if (typeof retry === "number") return retry;
  if (!retry) return DEFAULT_RETRY;
  return {
    limit: retry.limit ?? DEFAULT_RETRY.limit,
    methods: retry.methods ?? DEFAULT_RETRY.methods,
    statusCodes: retry.statusCodes ?? DEFAULT_RETRY.statusCodes,
    backoffLimit: retry.backoffLimit ?? DEFAULT_RETRY.backoffLimit,
    retryOnTimeout: retry.retryOnTimeout ?? DEFAULT_RETRY.retryOnTimeout,
    jitter: retry.jitter ?? DEFAULT_RETRY.jitter,
    ...retry.delay && { delay: retry.delay }
  };
}
function serializeValue(value) {
  if (value === null || value === void 0) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === "object") {
    const result = {};
    for (const [key, val] of Object.entries(value)) result[key] = serializeValue(val);
    return result;
  }
  return value;
}
function buildBody(data) {
  if (data == null) return void 0;
  if (!isBodyInit(data) && typeof data === "object") return serializeValue(data);
  return data;
}
function serializeParams(params) {
  const result = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === void 0 || value === null) continue;
    if (value instanceof Date) result[key] = value.toISOString();
    else if (typeof value === "object") result[key] = JSON.stringify(serializeValue(value));
    else result[key] = String(value);
  }
  return result;
}
const responseHandlers = {
  arraybuffer: (r) => r.arrayBuffer(),
  blob: (r) => r.blob(),
  stream: (r) => r.body,
  text: (r) => r.text(),
  formData: (r) => r.formData(),
  document: async (r) => {
    const txt = await r.text();
    if (typeof DOMParser !== "undefined") {
      const ct = r.headers.get("content-type") || "";
      const type = ct.includes("xml") ? "text/xml" : "text/html";
      return new DOMParser().parseFromString(txt, type);
    }
    return txt;
  },
  json: (r) => r.json()
};
async function parseResponse(response, responseType) {
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return void 0;
  }
  const handler = responseHandlers[responseType] ?? responseHandlers.json;
  return await handler(response);
}
const kyInstance = ky.create({
  credentials: "include",
  timeout: 3e4,
  retry: DEFAULT_RETRY,
  hooks: {
    beforeError: [
      async (error) => {
        try {
          const body = await error.response.clone().json();
          if (body.message || body.error) error.message = body.message || body.error || error.message;
        } catch {
        }
        return error;
      }
    ]
  }
});
function createClient(service) {
  return async function client(config2) {
    const { url: url2, params, method, data, responseType = "json", signal, headers, retry, timeout, baseURL } = config2;
    const resolvedUrl = resolveURL(service, url2, baseURL);
    const searchParams = params ? new URLSearchParams(serializeParams(params)) : void 0;
    const body = buildBody(data);
    const isJsonBody = body != null && !isBodyInit(data);
    const kyOptions = {
      method: method.toLowerCase(),
      searchParams,
      signal,
      headers,
      retry: buildRetryOptions(retry),
      ...timeout !== void 0 && { timeout },
      ...isJsonBody ? { json: body } : { body }
    };
    try {
      const response = await kyInstance(resolvedUrl, kyOptions);
      const responseData = await parseResponse(response, responseType);
      return { data: responseData, status: response.status, statusText: response.statusText };
    } catch (err) {
      if (err instanceof HTTPError) {
        const errorData = await parseResponse(
          err.response.clone(),
          "json"
        ).catch(() => null);
        const error = new Error(errorData?.message || errorData?.error || err.message || "UNKNOWN_ERROR");
        error.code = errorData?.code || "UNKNOWN_ERROR";
        error.status = err.response.status;
        throw error;
      }
      if (err instanceof Error) throw err;
      throw new Error("UNKNOWN_ERROR");
    }
  };
}
const Config = {
  baseUrl: "http://localhost:3030"
};
const account$1 = { "header": { "title": "Minha Conta" }, "preferences": { "currency": "Moeda (somente leitura)", "language": "Idioma", "languagePlaceholder": "Selecione um idioma", "loadError": "Erro ao carregar as preferências", "save": "Salvar preferências", "saveSuccess": "Preferências atualizadas com sucesso", "sectionDescription": "Configure idioma, fuso horário e notificações", "sectionTitle": "Preferências", "timezone": "Fuso horário" }, "profile": { "avatar": { "remove": "Remover foto", "upload": "Enviar foto", "uploadAriaLabel": "Escolher imagem de perfil", "uploadStub": "Upload de avatar ainda não disponível" }, "company": "Empresa", "email": "E-mail", "loadError": "Erro ao carregar os dados do perfil", "name": "Nome", "save": "Salvar alterações", "saveSuccess": "Perfil atualizado com sucesso", "sectionDescription": "Atualize suas informações pessoais", "sectionTitle": "Perfil" }, "security": { "changePassword": { "button": "Alterar senha", "cancel": "Cancelar", "confirmPassword": "Confirmar nova senha", "currentPassword": "Senha atual", "description": "Atualize sua senha de acesso", "dialogDescription": "Insira sua senha atual e escolha uma nova senha", "dialogTitle": "Alterar senha", "label": "Alterar senha", "newPassword": "Nova senha", "stub": "Alteração de senha ainda não disponível (SDK pendente)", "submit": "Alterar senha" }, "deleteAccount": { "button": "Excluir conta", "confirmAction": "Excluir", "confirmCancel": "Cancelar", "confirmDescription": "Tem certeza que deseja excluir sua conta? Esta ação não pode ser desfeita.", "confirmTitle": "Excluir conta", "description": "Esta ação é irreversível e apagará todos os seus dados", "label": "Excluir conta", "stub": "Exclusão de conta ainda não disponível (SDK pendente)" }, "lastPasswordChange": "Última alteração de senha em {{date}}", "loadError": "Erro ao carregar as configurações de segurança", "sectionDescription": "Gerencie sua senha e acesso à conta", "sectionTitle": "Segurança", "twoFactor": { "disabled": "Autenticação de dois fatores desativada", "enabled": "Autenticação de dois fatores ativada" } } };
const auth$1 = { "resetPassword": { "breadcrumb": "Recuperar senha", "confirmNewPassword": "Confirme a nova senha", "email": "E-mail", "newPassword": "Nova senha", "rememberPassword": "Lembrou a senha?", "requestSubmit": "Enviar e-mail", "requestSubtitle": "Enviaremos um e-mail com instruções", "requestSuccess": "E-mail enviado", "requestSuccessDescription": "Verifique sua caixa de entrada", "requestTitle": "Recuperar senha", "resetSubmit": "Salvar nova senha", "resetSubtitle": "Escolha uma senha nova e segura", "resetSuccess": "Senha alterada", "resetSuccessDescription": "Você já pode entrar com a nova senha", "resetTitle": "Definir nova senha" } };
const calendar$1 = { "presets": { "lastMonth": "Último mês", "lastWeek": "Última semana", "thisMonth": "Esse mês", "thisWeek": "Essa semana", "thisYear": "Este ano", "today": "Hoje", "yesterday": "Ontem" } };
const common$1 = { "back": "Voltar", "errorTitle": "Ocorreu um erro", "help": "Ajuda", "logout": "Sair", "privacy": "Privacidade", "retry": "Tentar novamente", "terms": "Termos" };
const dataTable$1 = { "emptyDescription": "Tente ajustar os filtros de busca.", "emptyTitle": "Nenhum resultado", "itemsPerPage": "itens por página" };
const enums$1 = { "CurrencyCode": { "AED": "Dirham (AED)", "ALL": "Lek albanês (ALL)", "ARS": "Peso Argentino (ARS)", "AUD": "Dólar Australiano (AUD)", "BDT": "Taka (BDT)", "BGN": "Lev búlgaro (BGN)", "BHD": "Dinar barenita (BHD)", "BIF": "Franco burundês (BIF)", "BOB": "Boliviano (BOB)", "BRL": "Real (BRL)", "BWP": "Pula (BWP)", "CAD": "Dólar Canadense (CAD)", "CHF": "Franco Suíço (CHF)", "CLP": "Peso Chileno (CLP)", "CNY": "Yuan (CNY)", "COP": "Peso Colombiano (COP)", "CVE": "Escudo cabo-verdiano (CVE)", "CZK": "Coroa tcheca (CZK)", "DKK": "Coroa dinamarquesa (DKK)", "DOP": "Peso dominicano (DOP)", "EGP": "Libra egípcia (EGP)", "ETB": "Birr etíope (ETB)", "EUR": "Euro (EUR)", "FJD": "Dólar de Fiji (FJD)", "GBP": "Libra (GBP)", "GHS": "Cedi ganês (GHS)", "GIP": "Libra gibraltarina (GIP)", "GMD": "Dalasi gambiano (GMD)", "GNF": "Franco guineense (GNF)", "GTQ": "Quetzal guatemalteco (GTQ)", "HKD": "Dólar de Hong Kong (HKD)", "HUF": "Forint húngaro (HUF)", "IDR": "Rupia indonésia (IDR)", "INR": "Rupia indiana (INR)", "ISK": "Coroa islandesa (ISK)", "JOD": "Dinar jordaniano (JOD)", "JPY": "Iene (JPY)", "KES": "Xelim queniano (KES)", "KRW": "Won sul-coreano (KRW)", "KWD": "Dinar kuwaitiano (KWD)", "LAK": "Kip laosiano (LAK)", "LKR": "Rupia do Sri Lanka (LKR)", "MAD": "Dirham marroquino (MAD)", "MGA": "Ariary malgaxe (MGA)", "MWK": "Kwacha malauiano (MWK)", "MXN": "Peso Mexicano (MXN)", "MYR": "Ringgit malaio (MYR)", "MZN": "Metical moçambicano (MZN)", "NGN": "Naira nigeriana (NGN)", "NOK": "Coroa norueguesa (NOK)", "NPR": "Rupia nepalesa (NPR)", "NZD": "Dólar neozelandês (NZD)", "OMR": "Rial omanense (OMR)", "PEN": "Sol Peruano (PEN)", "PHP": "Peso filipino (PHP)", "PKR": "Rupia paquistanesa (PKR)", "PLN": "Zloti polonês (PLN)", "PYG": "Guarani paraguaio (PYG)", "QAR": "Riyal catariano (QAR)", "RON": "Leu romeno (RON)", "RUB": "Rublo russo (RUB)", "RWF": "Franco ruandês (RWF)", "SAR": "Riyal saudita (SAR)", "SEK": "Coroa sueca (SEK)", "SGD": "Dólar de Cingapura (SGD)", "SLE": "Leone da Serra Leoa (SLE)", "SRD": "Dólar do Suriname (SRD)", "THB": "Baht tailandês (THB)", "TND": "Dinar tunisiano (TND)", "TRY": "Lira turca (TRY)", "TWD": "Dólar taiwanês (TWD)", "TZS": "Xelim tanzaniano (TZS)", "UGX": "Xelim ugandense (UGX)", "USD": "Dólar (USD)", "VND": "Dong vietnamita (VND)", "XAF": "Franco CFA Central (XAF)", "XCD": "Dólar do Caribe Oriental (XCD)", "XOF": "Franco CFA Ocidental (XOF)", "ZAR": "Rand sul-africano (ZAR)", "ZMW": "Kwacha zambiano (ZMW)" }, "Language": { "en-US": "English (US)", "pt-BR": "Português (Brasil)" }, "NotificationCategory": { "DAILY_DIGEST": "Resumo diário", "FEATURE_ANNOUNCEMENT": "Anúncio de novidade", "INTEGRATION_DISCONNECTED": "Integração desconectada", "INVITATION": "Convite", "ORDER_RECEIVED": "Pedido recebido", "OTHER": "Outro", "SYNC_ERROR": "Erro de sincronização" } };
const errors$1 = { "CANNOT_CONVERT_INPUT": "Não foi possível processar a requisição. Revise os dados enviados.", "CHECKOUT_SESSION_REF_REQUIRED": "A referência da sessão de checkout é obrigatória.", "CLASSIFICATION_FAILED": "Não foi possível classificar a mensagem.", "COMMAND_HANDLER_NOT_FOUND": "Erro interno ao processar a operação. Tente novamente em instantes.", "COMMAND_QUEUE_NOT_FOUND": "Erro interno ao enfileirar a operação. Tente novamente em instantes.", "CREDENTIAL_DECRYPT_FAILED": "Não foi possível ler as credenciais armazenadas. Contate o suporte.", "DELIVERY_NOT_OWNED_BY_USER": "Esta notificação não pertence à sua conta.", "DISPUTE_REF_REQUIRED": "A referência da disputa é obrigatória.", "DOWNGRADE_SELECTION_INVALID": "A seleção para o downgrade é inválida. Revise os itens mantidos.", "EMAIL_ALREADY_REGISTERED": "Este email já está cadastrado.", "EMPTY_RECIPIENTS": "Nenhum destinatário para esta notificação.", "ENTITY_NOT_FOUND_WHILE_SAVING": "O registro não existe mais e não pôde ser salvo.", "FORBIDDEN": "Você não tem permissão para executar esta ação.", "FREE_PLAN_NOT_SUBSCRIBABLE": "O plano gratuito não pode ser assinado diretamente.", "HANDLER_NOT_BOUND": "Erro interno ao despachar a operação. Tente novamente em instantes.", "INVALIDATED_AUTH_TOKEN": "Sua sessão foi invalidada. Entre novamente.", "INVALID_AUTH_TOKEN": "Token de autenticação inválido. Entre novamente.", "INVALID_CHARGE_TRANSITION": "Esta cobrança não pode mudar para o status solicitado.", "INVALID_CHECKOUT_SESSION_TRANSITION": "Esta sessão de checkout não pode mudar para o status solicitado.", "INVALID_CONTROLLER_EXAMPLES": "Erro interno na documentação da API. Contate o suporte.", "INVALID_DISPUTE_TRANSITION": "Esta disputa não pode mudar para o status solicitado.", "INVALID_EMAIL": "E-mail inválido.", "INVALID_EMAIL_FORMAT": "Formato de email inválido.", "INVALID_EMAIL_OR_PASSWORD": "E-mail ou senha inválidos", "INVALID_ENTITY": "Os dados enviados são inválidos.", "INVALID_ID": "Identificador inválido.", "INVALID_ID_VALUES_LENGTH": "Valores de identificador inválidos.", "INVALID_LANGUAGE": 'Idioma inválido. Use uma tag BCP-47 como "pt-BR".', "INVALID_MANDATE": "O mandato de pagamento é inválido ou expirou.", "INVALID_NAME": "Nome inválido.", "INVALID_OUTBOX_PAYLOAD": "Erro interno no processamento de eventos. Tente novamente em instantes.", "INVALID_PAYMENT_METHOD_TRANSITION": "Este método de pagamento não pode mudar para o status solicitado.", "INVALID_PHONE": "Número de telefone inválido.", "INVALID_PICTURE_URL": "URL de imagem inválida.", "INVALID_RANGE": "Intervalo inválido.", "INVALID_REQUEST": "Requisição inválida.", "INVALID_TIMEZONE": 'Fuso horário inválido. Use um nome IANA como "America/Sao_Paulo".', "INVOICE_ALREADY_PAID": "Esta fatura já foi paga.", "INVOICE_LINES_MISMATCH": "As linhas da fatura não conferem com o total esperado.", "MISSING_ENVIRONMENT_VARIABLE": "Erro de configuração do servidor. Contate o suporte.", "MISSING_LOG_CONTENT": "Erro interno de logging.", "NETWORK_ERROR": "Erro de rede", "NOTIFICATION_DELIVERY_NOT_FOUND": "Notificação não encontrada.", "NOT_FOUND": "Recurso não encontrado.", "NOT_IMPLEMENTED": "Este recurso ainda não está disponível.", "NO_CHANNEL_ENABLED": "Nenhum canal de notificação habilitado para esta entrega.", "ONBOARDING_ALREADY_COMPLETED": "Onboarding já concluído", "ONBOARDING_NOT_COMPLETED": "Onboarding não concluído", "OPTIMISTIC_LOCK_CONFLICT": "O registro foi alterado por outra operação. Recarregue e tente novamente.", "OWNER_ALREADY_DISABLED": "Esta conta já está desativada.", "OWNER_NOT_DISABLED": "Esta conta não está desativada.", "OWNER_NOT_FOUND": "Conta não encontrada.", "PASSWORDS_DONT_MATCH": "As senhas não coincidem.", "PASSWORD_TOO_LONG": "Senha muito longa.", "PASSWORD_TOO_SHORT": "Senha muito curta (mínimo 8 caracteres).", "PASSWORD_TOO_WEAK": "Senha muito fraca. Use letras, números e símbolos.", "PAYMENT_METHOD_IS_DEFAULT": "O método de pagamento padrão não pode ser removido. Defina outro como padrão antes.", "PAYMENT_METHOD_LAST_ACTIVE": "O último método de pagamento ativo não pode ser removido com uma assinatura ativa.", "PAYMENT_METHOD_NOT_FOUND": "Método de pagamento não encontrado.", "PAYMENT_METHOD_OWNER_ID_REQUIRED": "O identificador da conta é obrigatório para este método de pagamento.", "PAYMENT_METHOD_REQUIRED": "Adicione um método de pagamento para continuar.", "PAYMENT_METHOD_UNSUPPORTED": "Este método de pagamento não é suportado.", "PROVIDER_CAPABILITY_UNSUPPORTED": "O provedor de pagamento não suporta esta operação.", "PROVIDER_ERROR": "O provedor de pagamento retornou um erro. Tente novamente em instantes.", "PROVIDER_NOT_DETECTED": "Provedor de agente não detectado.", "RATE_LIMITED": "Muitas tentativas. Aguarde um momento e tente novamente.", "RESOURCE_LOCKED_BY_PLAN": "Este recurso está bloqueado pelo seu plano atual.", "SESSION_ALREADY_STREAMING": "Esta sessão já está sendo transmitida.", "SESSION_EXPIRED": "Sessão expirada", "SUBSCRIPTION_ALREADY_EXISTS": "Já existe uma assinatura ativa.", "SUBSCRIPTION_ALREADY_FINALIZED": "Esta assinatura já foi finalizada.", "SUBSCRIPTION_NOT_FOUND": "Assinatura não encontrada.", "SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION": "Esta assinatura não está agendada para cancelamento.", "SUBSCRIPTION_PENDING_CANCELLATION": "Esta assinatura está com cancelamento pendente.", "TERMINAL_ALREADY_RUNNING": "Já existe uma sessão de terminal ativa para esta issue.", "TERMINAL_SPAWN_FAILED": "Falha ao iniciar a sessão de terminal.", "TERMS_REQUIRED": "Aceite os termos para continuar.", "TOO_MANY_TERMINAL_STREAMS": "Muitas sessões de terminal simultâneas.", "UNAUTHORIZED": "Não autorizado", "UNKNOWN_ERROR": "Erro desconhecido", "USER_ALREADY_EXISTS": "Usuário já existe", "USER_NOT_FOUND": "Usuário não encontrado.", "VALIDATION_ERROR": "Alguns campos são inválidos.", "WEAK_PASSWORD": "Senha muito fraca. Use letras, números e símbolos.", "WEBHOOK_SIGNATURE_INVALID": "Assinatura de webhook inválida.", "WEBHOOK_SOURCE_UNKNOWN": "Origem de webhook desconhecida.", "PATH_NOT_FOUND": "O caminho selecionado não existe.", "PATH_NOT_A_DIRECTORY": "O caminho selecionado não é um diretório.", "WORKSPACE_ALREADY_REGISTERED": "Este workspace já está registrado.", "WORKSPACE_NOT_FOUND": "Workspace não encontrado.", "WORKSPACE_IN_USE": "Há uma issue trabalhando neste workspace.", "NO_PROVIDER_SELECTED": "Selecione ao menos um provider.", "LAST_INVOKER": "Ao menos um participante deve manter permissão de invocação.", "PARTICIPANT_NOT_FOUND": "Participante não encontrado.", "THREAD_NOT_FOUND": "Thread não encontrada.", "THREAD_ALREADY_ATTACHED": "Já existe uma thread para este contato.", "THREAD_PAUSED": "Esta thread está pausada — use o modo direto.", "THREAD_NOT_PAUSED": "Pause a thread para falar diretamente.", "NO_CHANNEL_CONNECTED": "Conecte um canal primeiro.", "CHANNEL_NOT_CONNECTED": "O canal não está conectado.", "ENTRY_NOT_FOUND": "Mensagem não encontrada.", "ENTRY_NOT_INVOCABLE": "Esta mensagem não pode invocar um agente.", "CLARIFICATION_ALREADY_PENDING": "Já há uma clarificação pendente para este remetente.", "ISSUE_NOT_FOUND": "Issue não encontrada.", "ISSUE_ARCHIVED": "Esta issue está arquivada.", "ISSUE_NOT_ARCHIVED": "Esta issue não está arquivada.", "ISSUE_ALREADY_ARCHIVED": "Esta issue já está arquivada.", "ISSUE_ALREADY_COMPLETED": "Esta issue já foi concluída.", "STOP_NOT_FOUND": "Stop não encontrado.", "STOP_CRITERION_DISABLED": "Este critério de stop está desativado nas configurações.", "RESOLUTION_NOT_APPLICABLE": "Essa resolução não se aplica a este stop." };
const nav$1 = { "account": "Minha Conta", "comingSoon": "Em breve", "home": "Início", "settings": "Configurações" };
const notifications$1 = { "allCaughtUp": "Você está em dia.", "aria": "Notificações", "title": "Notificações", "unreadCount_one": "{{count}} não lida", "unreadCount_other": "{{count}} não lidas" };
const zod$1 = { "invalidEmail": "E-mail inválido", "invalid_date": "Data inválida.", "invalid_enum_value": "Valor inválido. Opções: {{options}}", "invalid_format_datetime": "Data/hora inválida", "invalid_format_email": "E-mail inválido", "invalid_format_regex": "Formato inválido", "invalid_format_url": "URL inválida", "invalid_format_uuid": "UUID inválido", "invalid_type": "Tipo inválido (esperado {{expected}}, recebido {{received}})", "required": "Campo obrigatório", "too_big_array": "Deve ter no máximo {{maximum}} item(s)", "too_big_number": "Deve ser no máximo {{maximum}}", "too_big_string": "Deve ter no máximo {{maximum}} caractere(s)", "too_small_array": "Precisa ter pelo menos {{minimum}} item(s)", "too_small_number": "Precisa ser pelo menos {{minimum}}", "too_small_string": "Precisa ter pelo menos {{minimum}} caractere(s)" };
const ptTranslations = {
  account: account$1,
  auth: auth$1,
  calendar: calendar$1,
  common: common$1,
  dataTable: dataTable$1,
  enums: enums$1,
  errors: errors$1,
  nav: nav$1,
  notifications: notifications$1,
  zod: zod$1
};
const account = { "header": { "title": "My Account" }, "preferences": { "currency": "Currency (read-only)", "language": "Language", "languagePlaceholder": "Select a language", "loadError": "Failed to load preferences", "save": "Save preferences", "saveSuccess": "Preferences updated successfully", "sectionDescription": "Configure language, timezone and notifications", "sectionTitle": "Preferences", "timezone": "Timezone" }, "profile": { "avatar": { "remove": "Remove photo", "upload": "Upload photo", "uploadAriaLabel": "Choose profile image", "uploadStub": "Avatar upload not yet available" }, "company": "Company", "email": "Email", "loadError": "Failed to load profile data", "name": "Name", "save": "Save changes", "saveSuccess": "Profile updated successfully", "sectionDescription": "Update your personal information", "sectionTitle": "Profile" }, "security": { "changePassword": { "button": "Change password", "cancel": "Cancel", "confirmPassword": "Confirm new password", "currentPassword": "Current password", "description": "Update your login password", "dialogDescription": "Enter your current password and choose a new one", "dialogTitle": "Change password", "label": "Change password", "newPassword": "New password", "stub": "Password change not yet available (SDK pending)", "submit": "Change password" }, "deleteAccount": { "button": "Delete account", "confirmAction": "Delete", "confirmCancel": "Cancel", "confirmDescription": "Are you sure you want to delete your account? This action cannot be undone.", "confirmTitle": "Delete account", "description": "This action is irreversible and will delete all your data", "label": "Delete account", "stub": "Account deletion not yet available (SDK pending)" }, "lastPasswordChange": "Last password change on {{date}}", "loadError": "Failed to load security settings", "sectionDescription": "Manage your password and account access", "sectionTitle": "Security", "twoFactor": { "disabled": "Two-factor authentication disabled", "enabled": "Two-factor authentication enabled" } } };
const auth = { "resetPassword": { "breadcrumb": "Reset password", "confirmNewPassword": "Confirm password", "email": "Email", "newPassword": "New password", "rememberPassword": "Remembered your password?", "requestSubmit": "Send email", "requestSubtitle": "We'll send you an email with instructions", "requestSuccess": "Email sent", "requestSuccessDescription": "Check your inbox", "requestTitle": "Reset password", "resetSubmit": "Save new password", "resetSubtitle": "Choose a new, secure password", "resetSuccess": "Password updated", "resetSuccessDescription": "You can now sign in with the new password", "resetTitle": "Set a new password" } };
const calendar = { "presets": { "lastMonth": "Last month", "lastWeek": "Last week", "thisMonth": "This month", "thisWeek": "This week", "thisYear": "This year", "today": "Today", "yesterday": "Yesterday" } };
const common = { "back": "Back", "errorTitle": "Something went wrong", "help": "Help", "logout": "Log out", "privacy": "Privacy", "retry": "Retry", "terms": "Terms" };
const dataTable = { "emptyDescription": "Try adjusting your search filters.", "emptyTitle": "No results", "itemsPerPage": "items per page" };
const enums = { "CurrencyCode": { "AED": "UAE Dirham (AED)", "ALL": "Albanian Lek (ALL)", "ARS": "Argentine Peso (ARS)", "AUD": "Australian Dollar (AUD)", "BDT": "Bangladeshi Taka (BDT)", "BGN": "Bulgarian Lev (BGN)", "BHD": "Bahraini Dinar (BHD)", "BIF": "Burundian Franc (BIF)", "BOB": "Bolivian Boliviano (BOB)", "BRL": "Brazilian Real (BRL)", "BWP": "Botswanan Pula (BWP)", "CAD": "Canadian Dollar (CAD)", "CHF": "Swiss Franc (CHF)", "CLP": "Chilean Peso (CLP)", "CNY": "Chinese Yuan (CNY)", "COP": "Colombian Peso (COP)", "CVE": "Cape Verdean Escudo (CVE)", "CZK": "Czech Koruna (CZK)", "DKK": "Danish Krone (DKK)", "DOP": "Dominican Peso (DOP)", "EGP": "Egyptian Pound (EGP)", "ETB": "Ethiopian Birr (ETB)", "EUR": "Euro (EUR)", "FJD": "Fijian Dollar (FJD)", "GBP": "British Pound (GBP)", "GHS": "Ghanaian Cedi (GHS)", "GIP": "Gibraltar Pound (GIP)", "GMD": "Gambian Dalasi (GMD)", "GNF": "Guinean Franc (GNF)", "GTQ": "Guatemalan Quetzal (GTQ)", "HKD": "Hong Kong Dollar (HKD)", "HUF": "Hungarian Forint (HUF)", "IDR": "Indonesian Rupiah (IDR)", "INR": "Indian Rupee (INR)", "ISK": "Icelandic Krona (ISK)", "JOD": "Jordanian Dinar (JOD)", "JPY": "Japanese Yen (JPY)", "KES": "Kenyan Shilling (KES)", "KRW": "South Korean Won (KRW)", "KWD": "Kuwaiti Dinar (KWD)", "LAK": "Laotian Kip (LAK)", "LKR": "Sri Lankan Rupee (LKR)", "MAD": "Moroccan Dirham (MAD)", "MGA": "Malagasy Ariary (MGA)", "MWK": "Malawian Kwacha (MWK)", "MXN": "Mexican Peso (MXN)", "MYR": "Malaysian Ringgit (MYR)", "MZN": "Mozambican Metical (MZN)", "NGN": "Nigerian Naira (NGN)", "NOK": "Norwegian Krone (NOK)", "NPR": "Nepalese Rupee (NPR)", "NZD": "New Zealand Dollar (NZD)", "OMR": "Omani Rial (OMR)", "PEN": "Peruvian Sol (PEN)", "PHP": "Philippine Peso (PHP)", "PKR": "Pakistani Rupee (PKR)", "PLN": "Polish Zloty (PLN)", "PYG": "Paraguayan Guarani (PYG)", "QAR": "Qatari Riyal (QAR)", "RON": "Romanian Leu (RON)", "RUB": "Russian Ruble (RUB)", "RWF": "Rwandan Franc (RWF)", "SAR": "Saudi Riyal (SAR)", "SEK": "Swedish Krona (SEK)", "SGD": "Singapore Dollar (SGD)", "SLE": "Sierra Leonean Leone (SLE)", "SRD": "Surinamese Dollar (SRD)", "THB": "Thai Baht (THB)", "TND": "Tunisian Dinar (TND)", "TRY": "Turkish Lira (TRY)", "TWD": "New Taiwan Dollar (TWD)", "TZS": "Tanzanian Shilling (TZS)", "UGX": "Ugandan Shilling (UGX)", "USD": "US Dollar (USD)", "VND": "Vietnamese Dong (VND)", "XAF": "Central African CFA Franc (XAF)", "XCD": "East Caribbean Dollar (XCD)", "XOF": "West African CFA Franc (XOF)", "ZAR": "South African Rand (ZAR)", "ZMW": "Zambian Kwacha (ZMW)" }, "Language": { "en-US": "English (US)", "pt-BR": "Português (Brasil)" }, "NotificationCategory": { "DAILY_DIGEST": "Daily digest", "FEATURE_ANNOUNCEMENT": "Feature announcement", "INTEGRATION_DISCONNECTED": "Integration disconnected", "INVITATION": "Invitation", "ORDER_RECEIVED": "Order received", "OTHER": "Other", "SYNC_ERROR": "Sync error" } };
const errors = { "CANNOT_CONVERT_INPUT": "The request could not be processed. Review the submitted data.", "CHECKOUT_SESSION_REF_REQUIRED": "The checkout session reference is required.", "CLASSIFICATION_FAILED": "Could not classify the message.", "COMMAND_HANDLER_NOT_FOUND": "Internal error while processing the operation. Try again shortly.", "COMMAND_QUEUE_NOT_FOUND": "Internal error while queuing the operation. Try again shortly.", "CREDENTIAL_DECRYPT_FAILED": "Stored credentials could not be read. Contact support.", "DELIVERY_NOT_OWNED_BY_USER": "This notification does not belong to your account.", "DISPUTE_REF_REQUIRED": "The dispute reference is required.", "DOWNGRADE_SELECTION_INVALID": "The selection for the downgrade is invalid. Review the kept items.", "EMAIL_ALREADY_REGISTERED": "This email is already registered.", "EMPTY_RECIPIENTS": "No recipients for this notification.", "ENTITY_NOT_FOUND_WHILE_SAVING": "The record no longer exists and could not be saved.", "FORBIDDEN": "You do not have permission to perform this action.", "FREE_PLAN_NOT_SUBSCRIBABLE": "The free plan cannot be subscribed to directly.", "HANDLER_NOT_BOUND": "Internal error while dispatching the operation. Try again shortly.", "INVALIDATED_AUTH_TOKEN": "Your session was invalidated. Sign in again.", "INVALID_AUTH_TOKEN": "Invalid authentication token. Sign in again.", "INVALID_CHARGE_TRANSITION": "This charge cannot change to the requested status.", "INVALID_CHECKOUT_SESSION_TRANSITION": "This checkout session cannot change to the requested status.", "INVALID_CONTROLLER_EXAMPLES": "Internal API documentation error. Contact support.", "INVALID_DISPUTE_TRANSITION": "This dispute cannot change to the requested status.", "INVALID_EMAIL": "Invalid email address.", "INVALID_EMAIL_FORMAT": "Invalid email format.", "INVALID_EMAIL_OR_PASSWORD": "Invalid email or password", "INVALID_ENTITY": "The submitted data is invalid.", "INVALID_ID": "Invalid identifier.", "INVALID_ID_VALUES_LENGTH": "Invalid identifier values.", "INVALID_LANGUAGE": 'Invalid language. Use a BCP-47 tag such as "en-US".', "INVALID_MANDATE": "The payment mandate is invalid or expired.", "INVALID_NAME": "Invalid name.", "INVALID_OUTBOX_PAYLOAD": "Internal event processing error. Try again shortly.", "INVALID_PAYMENT_METHOD_TRANSITION": "This payment method cannot change to the requested status.", "INVALID_PHONE": "Invalid phone number.", "INVALID_PICTURE_URL": "Invalid picture URL.", "INVALID_RANGE": "Invalid range.", "INVALID_REQUEST": "Invalid request.", "INVALID_TIMEZONE": 'Invalid timezone. Use an IANA name such as "America/Sao_Paulo".', "INVOICE_ALREADY_PAID": "This invoice has already been paid.", "INVOICE_LINES_MISMATCH": "The invoice lines do not match the expected total.", "MISSING_ENVIRONMENT_VARIABLE": "Server configuration error. Contact support.", "MISSING_LOG_CONTENT": "Internal logging error.", "NETWORK_ERROR": "Network error", "NOTIFICATION_DELIVERY_NOT_FOUND": "Notification not found.", "NOT_FOUND": "Resource not found.", "NOT_IMPLEMENTED": "This feature is not available yet.", "NO_CHANNEL_ENABLED": "No notification channel is enabled for this delivery.", "ONBOARDING_ALREADY_COMPLETED": "Onboarding already completed", "ONBOARDING_NOT_COMPLETED": "Onboarding not completed", "OPTIMISTIC_LOCK_CONFLICT": "The record was changed by another operation. Reload and try again.", "OWNER_ALREADY_DISABLED": "This account is already disabled.", "OWNER_NOT_DISABLED": "This account is not disabled.", "OWNER_NOT_FOUND": "Account not found.", "PASSWORDS_DONT_MATCH": "Passwords do not match.", "PASSWORD_TOO_LONG": "Password is too long.", "PASSWORD_TOO_SHORT": "Password is too short (minimum 8 characters).", "PASSWORD_TOO_WEAK": "Password too weak. Use letters, numbers and symbols.", "PAYMENT_METHOD_IS_DEFAULT": "The default payment method cannot be removed. Set another as default first.", "PAYMENT_METHOD_LAST_ACTIVE": "The last active payment method cannot be removed while a subscription is active.", "PAYMENT_METHOD_NOT_FOUND": "Payment method not found.", "PAYMENT_METHOD_OWNER_ID_REQUIRED": "Account identifier is required for this payment method.", "PAYMENT_METHOD_REQUIRED": "Add a payment method to continue.", "PAYMENT_METHOD_UNSUPPORTED": "This payment method is not supported.", "PROVIDER_CAPABILITY_UNSUPPORTED": "The payment provider does not support this operation.", "PROVIDER_ERROR": "The payment provider returned an error. Try again shortly.", "PROVIDER_NOT_DETECTED": "Agent provider not detected.", "RATE_LIMITED": "Too many attempts. Please wait a moment and try again.", "RESOURCE_LOCKED_BY_PLAN": "This resource is locked by your current plan.", "SESSION_ALREADY_STREAMING": "This session is already streaming.", "SESSION_EXPIRED": "Session expired", "SUBSCRIPTION_ALREADY_EXISTS": "An active subscription already exists.", "SUBSCRIPTION_ALREADY_FINALIZED": "This subscription has already been finalized.", "SUBSCRIPTION_NOT_FOUND": "Subscription not found.", "SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION": "This subscription is not scheduled for cancellation.", "SUBSCRIPTION_PENDING_CANCELLATION": "This subscription is pending cancellation.", "TERMINAL_ALREADY_RUNNING": "A terminal session is already running for this issue.", "TERMINAL_SPAWN_FAILED": "Failed to start the terminal session.", "TERMS_REQUIRED": "Please accept the terms to continue.", "TOO_MANY_TERMINAL_STREAMS": "Too many concurrent terminal streams.", "UNAUTHORIZED": "Unauthorized", "UNKNOWN_ERROR": "Unknown error", "USER_ALREADY_EXISTS": "User already exists", "USER_NOT_FOUND": "User not found.", "VALIDATION_ERROR": "Some fields are invalid.", "WEAK_PASSWORD": "Password too weak. Use letters, numbers and symbols.", "WEBHOOK_SIGNATURE_INVALID": "Invalid webhook signature.", "WEBHOOK_SOURCE_UNKNOWN": "Unknown webhook source.", "PATH_NOT_FOUND": "The selected path does not exist.", "PATH_NOT_A_DIRECTORY": "The selected path is not a directory.", "WORKSPACE_ALREADY_REGISTERED": "This workspace is already registered.", "WORKSPACE_NOT_FOUND": "Workspace not found.", "WORKSPACE_IN_USE": "This workspace has an issue currently working on it.", "NO_PROVIDER_SELECTED": "Select at least one provider.", "LAST_INVOKER": "At least one participant must keep invocation rights.", "PARTICIPANT_NOT_FOUND": "Participant not found.", "THREAD_NOT_FOUND": "Thread not found.", "THREAD_ALREADY_ATTACHED": "A thread is already attached to this contact.", "THREAD_PAUSED": "This thread is paused — use direct mode instead.", "THREAD_NOT_PAUSED": "Pause the thread to talk directly.", "NO_CHANNEL_CONNECTED": "Connect a channel first.", "CHANNEL_NOT_CONNECTED": "The channel is not connected.", "ENTRY_NOT_FOUND": "Message entry not found.", "ENTRY_NOT_INVOCABLE": "This message cannot invoke an agent.", "CLARIFICATION_ALREADY_PENDING": "A clarification is already pending for this sender.", "ISSUE_NOT_FOUND": "Issue not found.", "ISSUE_ARCHIVED": "This issue is archived.", "ISSUE_NOT_ARCHIVED": "This issue is not archived.", "ISSUE_ALREADY_ARCHIVED": "This issue is already archived.", "ISSUE_ALREADY_COMPLETED": "This issue is already completed.", "STOP_NOT_FOUND": "Stop not found.", "STOP_CRITERION_DISABLED": "This stop criterion is disabled in settings.", "RESOLUTION_NOT_APPLICABLE": "That resolution does not apply to this stop." };
const nav = { "account": "My Account", "comingSoon": "Coming soon", "home": "Home", "settings": "Settings" };
const notifications = { "allCaughtUp": "You're all caught up.", "aria": "Notifications", "title": "Notifications", "unreadCount_one": "{{count}} unread", "unreadCount_other": "{{count}} unread" };
const zod = { "invalidEmail": "Invalid email", "invalid_date": "Invalid date.", "invalid_enum_value": "Invalid value. Options: {{options}}", "invalid_format_datetime": "Invalid date/time", "invalid_format_email": "Invalid email", "invalid_format_regex": "Invalid format", "invalid_format_url": "Invalid URL", "invalid_format_uuid": "Invalid UUID", "invalid_type": "Invalid type (expected {{expected}}, received {{received}})", "required": "Required", "too_big_array": "Must have at most {{maximum}} item(s)", "too_big_number": "Must be at most {{maximum}}", "too_big_string": "Must be at most {{maximum}} character(s)", "too_small_array": "Must have at least {{minimum}} item(s)", "too_small_number": "Must be at least {{minimum}}", "too_small_string": "Must be at least {{minimum}} character(s)" };
const enTranslations = {
  account,
  auth,
  calendar,
  common,
  dataTable,
  enums,
  errors,
  nav,
  notifications,
  zod
};
const chain = instance.use(initReactI18next);
if (typeof window !== "undefined") {
  const detectorModule = await import("../_libs/i18next-browser-languagedetector+[...].mjs");
  chain.use(detectorModule.default);
}
chain.init({
  resources: {
    pt: { translation: ptTranslations },
    en: { translation: enTranslations }
  },
  lng: typeof window === "undefined" ? "pt" : void 0,
  fallbackLng: "pt",
  defaultNS: "translation",
  interpolation: {
    escapeValue: false
  },
  returnNull: false,
  detection: {
    order: ["localStorage", "navigator"],
    caches: ["localStorage"]
  }
});
const ApiErrorsEnum = {
  CANNOT_CONVERT_INPUT: "CANNOT_CONVERT_INPUT",
  CHANNEL_NOT_CONNECTED: "CHANNEL_NOT_CONNECTED",
  CLARIFICATION_ALREADY_PENDING: "CLARIFICATION_ALREADY_PENDING",
  CLASSIFICATION_FAILED: "CLASSIFICATION_FAILED",
  COMMAND_HANDLER_NOT_FOUND: "COMMAND_HANDLER_NOT_FOUND",
  COMMAND_QUEUE_NOT_FOUND: "COMMAND_QUEUE_NOT_FOUND",
  CREDENTIAL_DECRYPT_FAILED: "CREDENTIAL_DECRYPT_FAILED",
  EMAIL_ALREADY_REGISTERED: "EMAIL_ALREADY_REGISTERED",
  ENTITY_NOT_FOUND_WHILE_SAVING: "ENTITY_NOT_FOUND_WHILE_SAVING",
  ENTRY_NOT_FOUND: "ENTRY_NOT_FOUND",
  ENTRY_NOT_INVOCABLE: "ENTRY_NOT_INVOCABLE",
  FORBIDDEN: "FORBIDDEN",
  HANDLER_NOT_BOUND: "HANDLER_NOT_BOUND",
  INVALIDATED_AUTH_TOKEN: "INVALIDATED_AUTH_TOKEN",
  INVALID_AUTH_TOKEN: "INVALID_AUTH_TOKEN",
  INVALID_CONTROLLER_EXAMPLES: "INVALID_CONTROLLER_EXAMPLES",
  INVALID_EMAIL: "INVALID_EMAIL",
  INVALID_EMAIL_FORMAT: "INVALID_EMAIL_FORMAT",
  INVALID_ENTITY: "INVALID_ENTITY",
  INVALID_ID: "INVALID_ID",
  INVALID_ID_VALUES_LENGTH: "INVALID_ID_VALUES_LENGTH",
  INVALID_LANGUAGE: "INVALID_LANGUAGE",
  INVALID_OUTBOX_PAYLOAD: "INVALID_OUTBOX_PAYLOAD",
  INVALID_PHONE: "INVALID_PHONE",
  INVALID_PICTURE_URL: "INVALID_PICTURE_URL",
  INVALID_RANGE: "INVALID_RANGE",
  INVALID_REQUEST: "INVALID_REQUEST",
  INVALID_TIMEZONE: "INVALID_TIMEZONE",
  ISSUE_ALREADY_ARCHIVED: "ISSUE_ALREADY_ARCHIVED",
  ISSUE_ALREADY_COMPLETED: "ISSUE_ALREADY_COMPLETED",
  ISSUE_ARCHIVED: "ISSUE_ARCHIVED",
  ISSUE_NOT_ARCHIVED: "ISSUE_NOT_ARCHIVED",
  ISSUE_NOT_FOUND: "ISSUE_NOT_FOUND",
  LAST_INVOKER: "LAST_INVOKER",
  MISSING_ENVIRONMENT_VARIABLE: "MISSING_ENVIRONMENT_VARIABLE",
  MISSING_LOG_CONTENT: "MISSING_LOG_CONTENT",
  NOT_FOUND: "NOT_FOUND",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  NO_CHANNEL_CONNECTED: "NO_CHANNEL_CONNECTED",
  NO_PROVIDER_SELECTED: "NO_PROVIDER_SELECTED",
  OPTIMISTIC_LOCK_CONFLICT: "OPTIMISTIC_LOCK_CONFLICT",
  OWNER_ALREADY_DISABLED: "OWNER_ALREADY_DISABLED",
  OWNER_NOT_DISABLED: "OWNER_NOT_DISABLED",
  OWNER_NOT_FOUND: "OWNER_NOT_FOUND",
  PARTICIPANT_NOT_FOUND: "PARTICIPANT_NOT_FOUND",
  PASSWORDS_DONT_MATCH: "PASSWORDS_DONT_MATCH",
  PASSWORD_TOO_WEAK: "PASSWORD_TOO_WEAK",
  PATH_NOT_A_DIRECTORY: "PATH_NOT_A_DIRECTORY",
  PATH_NOT_FOUND: "PATH_NOT_FOUND",
  PROVIDER_NOT_DETECTED: "PROVIDER_NOT_DETECTED",
  RATE_LIMITED: "RATE_LIMITED",
  RESOLUTION_NOT_APPLICABLE: "RESOLUTION_NOT_APPLICABLE",
  SESSION_ALREADY_STREAMING: "SESSION_ALREADY_STREAMING",
  STOP_CRITERION_DISABLED: "STOP_CRITERION_DISABLED",
  STOP_NOT_FOUND: "STOP_NOT_FOUND",
  TERMINAL_ALREADY_RUNNING: "TERMINAL_ALREADY_RUNNING",
  TERMINAL_SPAWN_FAILED: "TERMINAL_SPAWN_FAILED",
  THREAD_ALREADY_ATTACHED: "THREAD_ALREADY_ATTACHED",
  THREAD_NOT_FOUND: "THREAD_NOT_FOUND",
  THREAD_NOT_PAUSED: "THREAD_NOT_PAUSED",
  THREAD_PAUSED: "THREAD_PAUSED",
  TOO_MANY_TERMINAL_STREAMS: "TOO_MANY_TERMINAL_STREAMS",
  UNAUTHORIZED: "UNAUTHORIZED",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  WEAK_PASSWORD: "WEAK_PASSWORD",
  WORKSPACE_ALREADY_REGISTERED: "WORKSPACE_ALREADY_REGISTERED",
  WORKSPACE_IN_USE: "WORKSPACE_IN_USE",
  WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND"
};
const workspaceBadgeSchema = _enum(["GIT", "CLAUDE_PROJECT"]);
const addWorkspace200Schema = object({
  "workspaceId": uuid(),
  get "badges"() {
    return array(workspaceBadgeSchema);
  }
});
object({
  "path": string().min(1)
});
lazy(() => addWorkspace200Schema);
_enum(["CANNOT_CONVERT_INPUT", "CHANNEL_NOT_CONNECTED", "CLARIFICATION_ALREADY_PENDING", "CLASSIFICATION_FAILED", "COMMAND_HANDLER_NOT_FOUND", "COMMAND_QUEUE_NOT_FOUND", "CREDENTIAL_DECRYPT_FAILED", "EMAIL_ALREADY_REGISTERED", "ENTITY_NOT_FOUND_WHILE_SAVING", "ENTRY_NOT_FOUND", "ENTRY_NOT_INVOCABLE", "FORBIDDEN", "HANDLER_NOT_BOUND", "INVALIDATED_AUTH_TOKEN", "INVALID_AUTH_TOKEN", "INVALID_CONTROLLER_EXAMPLES", "INVALID_EMAIL", "INVALID_EMAIL_FORMAT", "INVALID_ENTITY", "INVALID_ID", "INVALID_ID_VALUES_LENGTH", "INVALID_LANGUAGE", "INVALID_OUTBOX_PAYLOAD", "INVALID_PHONE", "INVALID_PICTURE_URL", "INVALID_RANGE", "INVALID_REQUEST", "INVALID_TIMEZONE", "ISSUE_ALREADY_ARCHIVED", "ISSUE_ALREADY_COMPLETED", "ISSUE_ARCHIVED", "ISSUE_NOT_ARCHIVED", "ISSUE_NOT_FOUND", "LAST_INVOKER", "MISSING_ENVIRONMENT_VARIABLE", "MISSING_LOG_CONTENT", "NOT_FOUND", "NOT_IMPLEMENTED", "NO_CHANNEL_CONNECTED", "NO_PROVIDER_SELECTED", "OPTIMISTIC_LOCK_CONFLICT", "OWNER_ALREADY_DISABLED", "OWNER_NOT_DISABLED", "OWNER_NOT_FOUND", "PARTICIPANT_NOT_FOUND", "PASSWORDS_DONT_MATCH", "PASSWORD_TOO_WEAK", "PATH_NOT_A_DIRECTORY", "PATH_NOT_FOUND", "PROVIDER_NOT_DETECTED", "RATE_LIMITED", "RESOLUTION_NOT_APPLICABLE", "SESSION_ALREADY_STREAMING", "STOP_CRITERION_DISABLED", "STOP_NOT_FOUND", "TERMINAL_ALREADY_RUNNING", "TERMINAL_SPAWN_FAILED", "THREAD_ALREADY_ATTACHED", "THREAD_NOT_FOUND", "THREAD_NOT_PAUSED", "THREAD_PAUSED", "TOO_MANY_TERMINAL_STREAMS", "UNAUTHORIZED", "USER_NOT_FOUND", "VALIDATION_ERROR", "WEAK_PASSWORD", "WORKSPACE_ALREADY_REGISTERED", "WORKSPACE_IN_USE", "WORKSPACE_NOT_FOUND"]).describe("All possible error codes");
object({
  "issueId": string()
});
const archiveIssue200Schema = any();
lazy(() => archiveIssue200Schema);
const artifactKindSchema = _enum(["IMAGE", "FILE", "LINK"]);
const contactKindSchema = _enum(["CONTACT", "GROUP"]);
const providerKindSchema = _enum(["CLAUDE_CODE", "CODEX", "OPENCODE"]);
const attachThread200Schema = object({
  "threadId": uuid()
});
object({
  "contactRef": object({
    "channelId": uuid(),
    "externalId": string().min(1),
    "displayName": string().min(1),
    get "kind"() {
      return contactKindSchema;
    }
  }),
  "workspaceId": uuid(),
  get "providers"() {
    return array(providerKindSchema).min(1);
  }
});
lazy(() => attachThread200Schema);
const bufferSizeSchema = _enum(["25", "50", "100", "200"]);
const channelKindSchema = _enum(["WHATSAPP", "INSTAGRAM_DM", "TELEGRAM"]);
const channelStatusSchema = _enum(["DISCONNECTED", "PAIRING", "CONNECTED"]);
const classificationMethodSchema = _enum(["REPLY_QUOTE", "CONTEXT_MATCH", "NEW_ISSUE", "CLARIFIED"]);
object({
  "threadId": string()
});
const configureContextBuffer200Schema = any();
object({
  get "bufferSize"() {
    return bufferSizeSchema;
  }
});
lazy(() => configureContextBuffer200Schema);
object({
  "threadId": string()
});
const configureMentionGate200Schema = any();
object({
  "mentionGate": union([object({
    "enabled": literal(false)
  }), object({
    "enabled": literal(true),
    "tag": string().min(1)
  })])
});
lazy(() => configureMentionGate200Schema);
const ownerKindSchema = _enum(["ORGANIZATION", "INDIVIDUAL"]).default("ORGANIZATION");
const createOwner200Schema = object({
  "ownerId": uuid()
});
object({
  "name": string().min(1).max(120),
  get "kind"() {
    return ownerKindSchema.default("ORGANIZATION").optional();
  },
  "timezone": optional(string().min(1)),
  "pictureUrl": optional(url())
});
lazy(() => createOwner200Schema);
const currencyCodeSchema = _enum(["AED", "ALL", "ARS", "AUD", "BDT", "BGN", "BHD", "BIF", "BOB", "BRL", "BWP", "CAD", "CHF", "CLP", "CNY", "COP", "CVE", "CZK", "DKK", "DOP", "EGP", "ETB", "EUR", "FJD", "GBP", "GHS", "GIP", "GMD", "GNF", "GTQ", "HKD", "HUF", "IDR", "INR", "ISK", "JOD", "JPY", "KES", "KRW", "KWD", "LAK", "LKR", "MAD", "MGA", "MWK", "MXN", "MYR", "MZN", "NGN", "NOK", "NPR", "NZD", "OMR", "PEN", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RUB", "RWF", "SAR", "SEK", "SGD", "SLE", "SRD", "THB", "TND", "TRY", "TWD", "TZS", "UGX", "USD", "VND", "XAF", "XCD", "XOF", "ZAR", "ZMW"]);
const providerStatusSchema = _enum(["DETECTED", "NOT_INSTALLED"]);
const refreshSchema = _enum(["true", "false"]);
object({
  get "refresh"() {
    return refreshSchema.optional();
  }
}).optional();
const detectProviders200Schema = object({
  "providers": array(object({
    get "name"() {
      return providerKindSchema;
    },
    get "status"() {
      return providerStatusSchema;
    },
    "binaryPath": optional(string()),
    "version": optional(string())
  }))
});
lazy(() => detectProviders200Schema);
const disableOwner200Schema = object({
  "ownerId": uuid(),
  "isDisabled": boolean()
});
object({
  "reason": optional(string().min(1).max(500))
});
lazy(() => disableOwner200Schema);
const enableOwner200Schema = object({
  "ownerId": uuid(),
  "isDisabled": boolean()
});
lazy(() => enableOwner200Schema);
const getAttachThreadWizard200Schema = object({
  "noChannelConnected": boolean(),
  "channels": array(object({
    "channelId": uuid(),
    get "kind"() {
      return channelKindSchema;
    }
  })),
  "contacts": array(object({
    "channelId": uuid(),
    "externalId": string(),
    "displayName": string(),
    get "kind"() {
      return contactKindSchema;
    },
    "alreadyAttached": boolean()
  })),
  "workspaces": array(object({
    "workspaceId": uuid(),
    "path": string(),
    get "badges"() {
      return array(workspaceBadgeSchema);
    }
  })),
  "providers": array(object({
    get "provider"() {
      return providerKindSchema;
    },
    get "status"() {
      return providerStatusSchema;
    },
    "available": boolean(),
    "version": optional(string())
  }))
});
lazy(() => getAttachThreadWizard200Schema);
const stopKindSchema = _enum(["SERVER_ERROR", "BLOCKED_BY_CLASSIFICATION", "HUMAN_REQUESTED", "APPROVAL_NEEDED"]);
const threadStatusSchema = _enum(["RUNNING", "IDLE", "NEEDS_ATTENTION", "PAUSED"]);
const getHomeDashboard200Schema = object({
  "agentsRunningNow": int().min(-9007199254740991).max(9007199254740991),
  "needsYou": optional(object({
    "threadId": uuid(),
    "threadDisplayName": string(),
    get "stopKinds"() {
      return array(stopKindSchema);
    }
  })),
  "activeSessions": array(object({
    "threadId": uuid(),
    "displayName": string(),
    get "channelKind"() {
      return channelKindSchema;
    },
    "workspacePath": string(),
    get "providers"() {
      return array(providerKindSchema);
    },
    get "status"() {
      return threadStatusSchema;
    },
    "lastActivity": string()
  })),
  "latestActivity": array(object({
    "title": string(),
    "subtitle": string(),
    "threadId": uuid(),
    "at": string()
  })),
  "today": object({
    "issuesOpened": int().min(-9007199254740991).max(9007199254740991),
    "issuesClosed": int().min(-9007199254740991).max(9007199254740991),
    "medianResponseSeconds": number()
  }),
  "channels": array(object({
    get "kind"() {
      return channelKindSchema;
    },
    get "status"() {
      return channelStatusSchema;
    }
  }))
});
lazy(() => getHomeDashboard200Schema);
const issueStatusSchema = _enum(["NEEDS_INPUT", "WORKING", "COMPLETED"]);
const transcriptKindSchema = _enum(["CONTACT", "AGENT", "OPERATOR_DIRECT", "WHISPER", "ACTION"]);
object({
  "issueId": string()
});
const getIssueDetail200Schema = object({
  "issue": object({
    "issueId": uuid(),
    "key": string(),
    "title": string(),
    get "status"() {
      return issueStatusSchema;
    },
    "meta": optional(string()),
    "archived": boolean()
  }),
  get "provider"() {
    return providerKindSchema;
  },
  "terminalLog": array(object({
    "at": string(),
    "line": string()
  })),
  "routedMessages": array(object({
    "entryId": uuid(),
    get "kind"() {
      return transcriptKindSchema;
    },
    "text": string(),
    "at": string(),
    get "classification"() {
      return classificationMethodSchema.optional();
    }
  })),
  "stops": array(object({
    "stopId": uuid(),
    get "kind"() {
      return stopKindSchema;
    },
    "title": string(),
    "detail": string(),
    "raisedAt": string()
  }))
});
lazy(() => getIssueDetail200Schema);
object({
  "includeArchived": boolean().default(false)
});
const getIssuesOverview200Schema = object({
  "statsLine": object({
    "awaitingInput": int().min(-9007199254740991).max(9007199254740991),
    "working": int().min(-9007199254740991).max(9007199254740991),
    "completed": int().min(-9007199254740991).max(9007199254740991),
    "archived": int().min(-9007199254740991).max(9007199254740991)
  }),
  "groups": array(object({
    get "status"() {
      return issueStatusSchema;
    },
    "items": array(object({
      "issueId": uuid(),
      "key": string(),
      "title": string(),
      get "status"() {
        return issueStatusSchema;
      },
      "meta": optional(string()),
      "archived": boolean(),
      "threadId": uuid(),
      "threadDisplayName": string()
    }))
  })),
  "archived": array(object({
    "issueId": uuid(),
    "key": string(),
    "title": string(),
    get "status"() {
      return issueStatusSchema;
    },
    "meta": optional(string()),
    "archived": boolean(),
    "threadId": uuid(),
    "threadDisplayName": string()
  }))
});
lazy(() => getIssuesOverview200Schema);
const languageSchema = _enum(["pt-BR", "en-US"]);
const getMyAccount200Schema = object({
  "profile": object({
    "userId": string(),
    "name": string(),
    "email": string(),
    "company": nullable(string()),
    "pictureUrl": nullable(url())
  }),
  "preferences": object({
    get "language"() {
      return languageSchema;
    },
    get "currency"() {
      return currencyCodeSchema;
    },
    "timezone": string()
  }),
  "security": object({
    "hasPassword": boolean(),
    "lastPasswordChangeAt": nullable(datetime()),
    "twoFactorEnabled": boolean()
  })
});
lazy(() => getMyAccount200Schema);
const stopResolutionSchema = _enum(["RETRY", "REVIEW_AND_SEND", "TAKE_OVER", "APPROVE", "DENY"]);
object({
  "threadId": string()
});
const getNeedsYouPanel200Schema = object({
  "stops": array(object({
    "stopId": uuid(),
    "issueId": uuid(),
    "issueKey": string(),
    get "kind"() {
      return stopKindSchema;
    },
    "title": string(),
    "detail": string(),
    "raisedAt": string(),
    get "availableResolutions"() {
      return array(stopResolutionSchema);
    }
  }))
});
lazy(() => getNeedsYouPanel200Schema);
const threadModeSchema = _enum(["STEER", "DIRECT"]);
object({
  "threadId": string()
});
const getSessionChat200Schema = object({
  "thread": object({
    "threadId": uuid(),
    "displayName": string(),
    get "channelKind"() {
      return channelKindSchema;
    },
    "workspacePath": string(),
    get "providers"() {
      return array(providerKindSchema);
    },
    get "status"() {
      return threadStatusSchema;
    },
    "lastActivity": string()
  }),
  "paused": boolean(),
  "mentionGate": union([object({
    "enabled": literal(false)
  }), object({
    "enabled": literal(true),
    "tag": string()
  })]),
  "autonomyCaption": string(),
  "activeStops": array(object({
    "stopId": uuid(),
    get "kind"() {
      return stopKindSchema;
    },
    "title": string(),
    "detail": string(),
    "raisedAt": string()
  })),
  "transcript": array(object({
    "entryId": uuid(),
    get "kind"() {
      return transcriptKindSchema;
    },
    "text": string(),
    "at": string(),
    "issueId": optional(uuid()),
    get "provider"() {
      return providerKindSchema.optional();
    },
    "quotedEntryId": optional(string()),
    get "classification"() {
      return classificationMethodSchema.optional();
    }
  })),
  get "composerMode"() {
    return threadModeSchema;
  }
});
lazy(() => getSessionChat200Schema);
object({
  "threadId": string()
});
const getSessionIssues200Schema = object({
  "statsLine": object({
    "awaitingInput": int().min(-9007199254740991).max(9007199254740991),
    "working": int().min(-9007199254740991).max(9007199254740991),
    "completed": int().min(-9007199254740991).max(9007199254740991)
  }),
  "groups": array(object({
    get "status"() {
      return issueStatusSchema;
    },
    "items": array(object({
      "issueId": uuid(),
      "key": string(),
      "title": string(),
      get "status"() {
        return issueStatusSchema;
      },
      "meta": optional(string()),
      "archived": boolean()
    }))
  })),
  "archived": array(object({
    "issueId": uuid(),
    "key": string(),
    "title": string(),
    get "status"() {
      return issueStatusSchema;
    },
    "meta": optional(string()),
    "archived": boolean()
  })),
  "autoArchiveNote": string()
});
lazy(() => getSessionIssues200Schema);
const getSession200Schema = object({
  "user": object({
    "id": string(),
    "email": string(),
    "name": nullable(string()),
    "emailVerified": boolean()
  }),
  "session": object({
    "id": string(),
    "userId": uuid(),
    "expiresAt": datetime(),
    "ownerId": nullable(string())
  })
});
lazy(() => getSession200Schema);
const getSettings200Schema = object({
  "providers": array(object({
    get "provider"() {
      return providerKindSchema;
    },
    get "status"() {
      return providerStatusSchema;
    },
    "available": boolean(),
    "version": optional(string())
  })),
  "stopCriteria": object({
    "serverErrors": boolean(),
    "blockedByClassification": boolean(),
    "humanRequested": boolean(),
    "approvalNeeded": boolean()
  }),
  "general": object({
    "operatorName": string(),
    "timezone": string(),
    "dataDir": string()
  }),
  "appVersion": string()
});
lazy(() => getSettings200Schema);
const getSetupChecklist200Schema = object({
  "channelDone": boolean(),
  "workspaceDone": boolean(),
  "threadDone": boolean()
});
lazy(() => getSetupChecklist200Schema);
object({
  "threadId": string()
});
const getThreadSettings200Schema = object({
  "mentionGate": union([object({
    "enabled": literal(false)
  }), object({
    "enabled": literal(true),
    "tag": string()
  })]),
  "participants": array(object({
    "participantId": string(),
    "name": string(),
    "source": string(),
    "canInvoke": boolean()
  })),
  "invokerCount": int().min(-9007199254740991).max(9007199254740991),
  get "bufferSize"() {
    return bufferSizeSchema;
  }
});
lazy(() => getThreadSettings200Schema);
const getUserInfo200Schema = object({
  "user": object({
    "id": uuid(),
    "name": string(),
    "email": email(),
    "avatarUrl": nullable(url())
  }),
  "current": nullable(object({
    "id": uuid(),
    "name": string()
  })),
  "owners": array(object({
    "id": uuid(),
    "name": string()
  }))
});
lazy(() => getUserInfo200Schema);
object({
  "threadId": string()
});
const listArtifacts200Schema = object({
  "artifacts": array(object({
    "artifactId": uuid(),
    "issueId": optional(uuid()),
    get "kind"() {
      return artifactKindSchema;
    },
    "name": string(),
    "meta": string(),
    "recordedAt": string()
  }))
});
lazy(() => listArtifacts200Schema);
const listWorkspaces200Schema = object({
  "workspaces": array(object({
    "workspaceId": uuid(),
    "path": string(),
    get "badges"() {
      return array(workspaceBadgeSchema);
    },
    "threadCount": int().min(-9007199254740991).max(9007199254740991),
    "addedAt": datetime()
  }))
});
lazy(() => listWorkspaces200Schema);
const listenEvents200Schema = union([object({
  "name": _enum(["browser.thread_status_changed"]),
  "threadId": string(),
  get "status"() {
    return threadStatusSchema;
  },
  "agentsRunningNow": int().min(-9007199254740991).max(9007199254740991)
}), object({
  "name": _enum(["browser.stop_raised"]),
  "threadId": string(),
  "threadDisplayName": string(),
  "issueId": string(),
  "issueKey": string(),
  get "stopKind"() {
    return stopKindSchema;
  }
}), object({
  "name": string(),
  "ownerId": string(),
  "payload": object({
    "ownerId": uuid()
  }).catchall(any())
})]);
lazy(() => listenEvents200Schema);
object({
  "threadId": string()
});
const pauseThread200Schema = any();
lazy(() => pauseThread200Schema);
object({
  "threadId": string()
});
const recordArtifact200Schema = object({
  "artifactId": uuid()
});
object({
  "issueId": optional(uuid()),
  get "kind"() {
    return artifactKindSchema;
  },
  "name": string().min(1),
  "ref": string().min(1),
  "meta": string()
});
lazy(() => recordArtifact200Schema);
object({
  "workspaceId": string()
});
const removeWorkspace200Schema = any();
lazy(() => removeWorkspace200Schema);
object({
  "stopId": string()
});
const resolveStop200Schema = any();
object({
  get "resolution"() {
    return stopResolutionSchema;
  }
});
lazy(() => resolveStop200Schema);
object({
  "issueId": string()
});
const restoreIssue200Schema = any();
lazy(() => restoreIssue200Schema);
object({
  "threadId": string()
});
const resumeThread200Schema = any();
lazy(() => resumeThread200Schema);
object({
  "threadId": string()
});
const sendDirectMessage200Schema = object({
  "entryId": uuid()
});
object({
  "text": string().min(1)
});
lazy(() => sendDirectMessage200Schema);
object({
  "ownerId": string()
});
const setActiveOwner200Schema = object({
  "ownerId": string()
});
lazy(() => setActiveOwner200Schema);
object({
  "threadId": string(),
  "participantId": string()
});
const setParticipantInvocation200Schema = any();
object({
  "canInvoke": boolean()
});
lazy(() => setParticipantInvocation200Schema);
object({
  "issueId": string()
});
const steerIssue200Schema = object({
  "entryId": uuid()
});
object({
  "text": string().min(1)
});
lazy(() => steerIssue200Schema);
object({
  "threadId": string()
});
const steerThread200Schema = object({
  "entryId": uuid()
});
object({
  "text": string().min(1)
});
lazy(() => steerThread200Schema);
object({
  "issueId": string()
});
const streamTerminalSession200Schema = any();
lazy(() => streamTerminalSession200Schema);
const updateOwnerSettings200Schema = any();
object({
  "name": optional(string().min(1).max(120)),
  "pictureUrl": url().nullish(),
  "timezone": optional(string().min(1))
});
lazy(() => updateOwnerSettings200Schema);
const updateStopCriteria200Schema = any();
object({
  "stopCriteria": object({
    "serverErrors": boolean(),
    "blockedByClassification": boolean(),
    "humanRequested": boolean(),
    "approvalNeeded": boolean()
  })
});
lazy(() => updateStopCriteria200Schema);
const uploadAvatar200Schema = object({
  "pictureUrl": url()
});
lazy(() => uploadAvatar200Schema);
const frontendErrorsEnum = {
  NETWORK_ERROR: "NETWORK_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  SESSION_EXPIRED: "SESSION_EXPIRED"
};
const errorsEnum = {
  ...ApiErrorsEnum,
  ...frontendErrorsEnum
};
function getErrorTranslation(code) {
  const t = instance.getFixedT(instance.language, "translation");
  return t(`errors.${code}`) || code;
}
new Proxy({}, {
  get: (_, prop) => {
    if (prop in errorsEnum) {
      return getErrorTranslation(prop);
    }
    return void 0;
  }
});
const defaultErrorHandler = (ctx) => {
  const t = instance.getFixedT(instance.language, "translation");
  const translatedMessage = getErrorTranslation(ctx.code) || ctx.message || getErrorTranslation("UNKNOWN_ERROR");
  toast.error(t("common.errorTitle"), {
    description: translatedMessage
  });
};
const customErrorHandlers = {};
function handleError(code, message, originalError) {
  const errorCode = isValidErrorCode(code) ? code : "UNKNOWN_ERROR";
  const ctx = {
    code: errorCode,
    message,
    originalError
  };
  const handler = customErrorHandlers[errorCode] || defaultErrorHandler;
  handler(ctx);
}
function isValidErrorCode(code) {
  return code in errorsEnum;
}
function translateError(message) {
  if (!message) return getErrorTranslation("UNKNOWN_ERROR");
  if (isValidErrorCode(message)) {
    return getErrorTranslation(message);
  }
  return message;
}
function extractErrorCode(error) {
  if (error && typeof error === "object") {
    if ("code" in error && typeof error.code === "string" && isValidErrorCode(error.code)) {
      return error.code;
    }
    if ("data" in error && error.data && typeof error.data === "object") {
      const data = error.data;
      if ("code" in data && typeof data.code === "string" && isValidErrorCode(data.code)) {
        return data.code;
      }
      if ("name" in data && typeof data.name === "string" && isValidErrorCode(data.name)) {
        return data.name;
      }
    }
    if ("name" in error && typeof error.name === "string" && isValidErrorCode(error.name)) {
      return error.name;
    }
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return "NETWORK_ERROR";
    }
  }
  return "UNKNOWN_ERROR";
}
function handleApiError(error, fallbackMessage) {
  const code = extractErrorCode(error);
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : fallbackMessage;
  handleError(code, message, error);
}
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
function getInitials(name) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.split(" ").filter((n) => n.length > 0).map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}
function tryCatch(fn) {
  try {
    const data = fn();
    return { success: true, data };
  } catch (error) {
    return { success: false, error };
  }
}
function getEnumLabel(value) {
  const resources = instance.getResourceBundle(instance.language, "translation");
  const enums2 = resources?.enums;
  if (!enums2 || typeof enums2 !== "object") return void 0;
  for (const enumMap of Object.values(enums2)) {
    if (typeof enumMap === "object" && enumMap !== null && value in enumMap) {
      return enumMap[value];
    }
  }
  return void 0;
}
const zodErrorMap = (issue) => {
  const t = instance.getFixedT(instance.language, "translation", "zod");
  switch (issue.code) {
    case "invalid_type":
      if (!issue.received || issue.received === "undefined" || issue.received === "null") {
        return t("required");
      }
      return t("invalid_type", { expected: issue.expected, received: issue.received });
    case "too_small":
      if (issue.origin === "string") {
        if (issue.minimum === 1) {
          return t("required");
        }
        return t("too_small_string", { minimum: issue.minimum });
      }
      if (issue.origin === "number") {
        return t("too_small_number", { minimum: issue.minimum });
      }
      if (issue.origin === "array") {
        return t("too_small_array", { minimum: issue.minimum });
      }
      break;
    case "too_big":
      if (issue.origin === "string") {
        return t("too_big_string", { maximum: issue.maximum });
      }
      if (issue.origin === "number") {
        return t("too_big_number", { maximum: issue.maximum });
      }
      if (issue.origin === "array") {
        return t("too_big_array", { maximum: issue.maximum });
      }
      break;
    case "invalid_value": {
      const values = issue.values ?? [];
      const maxShown = 3;
      const shown = values.slice(0, maxShown).map((v) => {
        const label = getEnumLabel(String(v));
        return `"${label ?? v}"`;
      }).join(", ");
      const options = values.length > maxShown ? `${shown}, ...` : shown;
      return t("invalid_enum_value", { options });
    }
    case "invalid_format":
      if (issue.format === "email") {
        return t("invalid_format_email");
      }
      if (issue.format === "url") {
        return t("invalid_format_url");
      }
      if (issue.format === "uuid") {
        return t("invalid_format_uuid");
      }
      if (issue.format === "regex") {
        return t("invalid_format_regex");
      }
      if (issue.format === "datetime") {
        return t("invalid_format_datetime");
      }
      break;
  }
  return void 0;
};
function configureZod() {
  config({ customError: zodErrorMap });
}
const surface = "gradient-box gradient-bg-[var(--background)_0,color-mix(in_oklab,var(--background),var(--foreground)_8%)_100%] gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0.035)_86%]";
const trigger = "gradient-box gradient-bg-[color-mix(in_oklab,var(--background),var(--foreground)_11%)_-15%,color-mix(in_oklab,var(--background),var(--foreground)_3%)_125%] gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0.035)_86%] hover:brightness-90";
function Toaster({ theme = "system", ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Toaster$1,
    {
      theme,
      className: "toaster group",
      icons: {
        success: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconCircleCheck, { className: "size-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/sonner.tsx",
          lineNumber: 12,
          columnNumber: 14
        }, this),
        info: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconInfoCircle, { className: "size-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/sonner.tsx",
          lineNumber: 13,
          columnNumber: 11
        }, this),
        warning: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconAlertTriangle, { className: "size-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/sonner.tsx",
          lineNumber: 14,
          columnNumber: 14
        }, this),
        error: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconAlertOctagon, { className: "size-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/sonner.tsx",
          lineNumber: 15,
          columnNumber: 12
        }, this),
        loading: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconLoader, { className: "size-4 animate-spin" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/sonner.tsx",
          lineNumber: 16,
          columnNumber: 14
        }, this)
      },
      style: (
        // Neutralize sonner's internal --*-bg / --*-border vars so the surface
        // gradient applied via classNames.toast is what gets painted. Per-type
        // text colors are handled by [data-sonner-toast][data-type="…"] rules
        // in index.css.
        {
          "--normal-bg": "transparent",
          "--normal-text": "var(--foreground)",
          "--normal-border": "transparent",
          "--success-bg": "transparent",
          "--success-text": "var(--success)",
          "--success-border": "transparent",
          "--error-bg": "transparent",
          "--error-text": "var(--destructive)",
          "--error-border": "transparent",
          "--warning-bg": "transparent",
          "--warning-text": "var(--warning)",
          "--warning-border": "transparent",
          "--info-bg": "transparent",
          "--info-text": "var(--info)",
          "--info-border": "transparent",
          "--border-radius": "var(--radius)"
        }
      ),
      toastOptions: {
        classNames: {
          toast: `${surface} group toast rounded-lg group-[.toaster]:shadow-lg`,
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground"
        }
      },
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/sonner.tsx",
      lineNumber: 8,
      columnNumber: 3
    },
    this
  );
}
const primaryBg = "gradient-bg-[var(--primary),var(--primary)]";
const primaryBorder = "gradient-border-[oklch(from_var(--primary-foreground)_l_c_h_/_0.2)_0%,oklch(from_var(--primary-foreground)_l_c_h_/_0.035)_86%]";
const primaryAltBg = "gradient-bg-[var(--foreground)_0%,var(--background)_200%]";
const outlineBg = "gradient-bg-[var(--background)_-20%,color-mix(in_oklab,var(--background),var(--foreground)_6%)_160%]";
const outlineBorder = "gradient-border-[oklch(from_var(--border)_l_c_h_/_0.2)_0%,oklch(from_var(--border)_l_c_h_/_0.05)_100%]";
const destructiveBg = "gradient-bg-[var(--destructive),var(--destructive)]";
const destructiveBorder = "gradient-border-[oklch(from_var(--destructive-foreground)_l_c_h_/_0.3)_0%,oklch(from_var(--destructive-foreground)_l_c_h_/_0.035)_86%]";
const buttonVariants = cva(
  "focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-lg text-sm font-medium focus-visible:ring-2 aria-invalid:ring-2 [&_svg:not([class*='size-'])]:size-4 inline-flex items-center justify-center whitespace-nowrap transition-all duration-200 ease-in-out cursor-pointer disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none group/button select-none",
  {
    variants: {
      variant: {
        default: `gradient-box ${primaryBg} ${primaryBorder} hover:brightness-90 text-primary-foreground font-semibold`,
        primaryAlt: `gradient-box ${primaryAltBg} hover:brightness-90 text-secondary-foreground font-semibold`,
        secondary: `${trigger}`,
        outline: `gradient-box ${outlineBg} ${outlineBorder} hover:brightness-90`,
        ghost: "border border-transparent hover:bg-hover hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive: `gradient-box ${destructiveBg} ${destructiveBorder} hover:brightness-90 text-destructive-foreground font-semibold`,
        warning: "bg-warning/10 hover:bg-warning/20 active:bg-warning/25 focus-visible:ring-warning/20 dark:bg-warning/15 text-warning border border-warning/30 hover:border-warning/50 focus-visible:border-warning/40 disabled:text-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary/80"
      },
      size: {
        default: "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-lg px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-lg px-2.5 text-sm in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs": "size-6 rounded-lg in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-lg in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
        none: ""
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
const Button = reactExports.forwardRef(function Button2({ className, variant, size, ...props }, ref) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button$1, { ref, "data-slot": "button", className: cn(buttonVariants({ variant, size }), className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/button.tsx",
    lineNumber: 63,
    columnNumber: 9
  }, this);
});
function Empty({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      "data-slot": "empty",
      className: cn(
        "gap-4 rounded-lg border-dashed p-6 flex w-full min-w-0 flex-1 flex-col items-center justify-center text-center text-balance",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/empty.tsx",
      lineNumber: 7,
      columnNumber: 3
    },
    this
  );
}
function EmptyHeader({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { "data-slot": "empty-header", className: cn("gap-2 flex max-w-sm flex-col items-center", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/empty.tsx",
    lineNumber: 19,
    columnNumber: 9
  }, this);
}
const emptyMediaVariants = cva("mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0", {
  variants: {
    variant: {
      default: "bg-transparent",
      icon: "bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-4"
    }
  },
  defaultVariants: {
    variant: "default"
  }
});
function EmptyMedia({ className, variant = "default", ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { "data-slot": "empty-icon", "data-variant": variant, className: cn(emptyMediaVariants({ variant, className })), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/empty.tsx",
    lineNumber: 35,
    columnNumber: 9
  }, this);
}
function EmptyTitle({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { "data-slot": "empty-title", className: cn("text-sm font-medium tracking-tight", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/empty.tsx",
    lineNumber: 39,
    columnNumber: 9
  }, this);
}
function EmptyDescription({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      "data-slot": "empty-description",
      className: cn("text-sm/relaxed text-muted-foreground [&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4", className),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/empty.tsx",
      lineNumber: 44,
      columnNumber: 3
    },
    this
  );
}
function EmptyContent({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      "data-slot": "empty-content",
      className: cn("gap-2.5 text-sm flex w-full max-w-sm min-w-0 flex-col items-center text-balance", className),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/empty.tsx",
      lineNumber: 54,
      columnNumber: 3
    },
    this
  );
}
function RouteError({ title, description }) {
  const router2 = useRouter();
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("common.errorTitle");
  const resolvedDescription = description ?? t("errors.UNKNOWN_ERROR");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Empty, { className: "flex-1 border-none", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyHeader, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyMedia, { variant: "icon", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconAlertTriangle, { className: "text-destructive" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/RouteError/index.tsx",
        lineNumber: 23,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/RouteError/index.tsx",
        lineNumber: 22,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyTitle, { children: resolvedTitle }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/RouteError/index.tsx",
        lineNumber: 25,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyDescription, { children: resolvedDescription }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/RouteError/index.tsx",
        lineNumber: 26,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/RouteError/index.tsx",
      lineNumber: 21,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyContent, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "outline", size: "sm", onClick: () => router2.history.back(), children: t("common.back") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/RouteError/index.tsx",
      lineNumber: 29,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/RouteError/index.tsx",
      lineNumber: 28,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/RouteError/index.tsx",
    lineNumber: 20,
    columnNumber: 3
  }, this);
}
const Route$4 = createRootRouteWithContext()({
  head: () => ({
    meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title: "App" }]
  }),
  shellComponent: RootShell,
  component: RootComponent,
  errorComponent: RouteError
});
function RootShell({ children }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("html", { lang: "pt", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("head", { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(HeadContent, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
      lineNumber: 28,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
      lineNumber: 27,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("body", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { id: "root", children }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
        lineNumber: 31,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Scripts, {}, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
        lineNumber: 32,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
      lineNumber: 30,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
    lineNumber: 26,
    columnNumber: 3
  }, this);
}
function RootComponent() {
  const { queryClient } = Route$4.useRouteContext();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(QueryClientProvider, { client: queryClient, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Outlet, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
      lineNumber: 42,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toaster, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
      lineNumber: 43,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TanStackRouterDevtools, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
      lineNumber: 44,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ReactQueryDevtools2, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
      lineNumber: 45,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
    lineNumber: 41,
    columnNumber: 3
  }, this);
}
const Route$3 = createFileRoute("/")({
  ssr: true,
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  }
});
const $$splitComponentImporter$2 = () => import("./route-LY6wjV0-.mjs");
const Route$2 = createFileRoute("/(app)")({
  component: lazyRouteComponent($$splitComponentImporter$2, "component")
});
const $$splitComponentImporter$1 = () => import("./index-CeaTXb9Q.mjs");
const Route$1 = createFileRoute("/(app)/dashboard/")({
  validateSearch: () => ({}),
  component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
const $$splitComponentImporter = () => import("./index-C-L-PGLo.mjs");
const Route = createFileRoute("/(app)/settings/account/")({
  staticData: {
    breadcrumb: "Minha Conta"
  },
  component: lazyRouteComponent($$splitComponentImporter, "component")
});
const IndexRoute = Route$3.update({
  id: "/",
  path: "/",
  getParentRoute: () => Route$4
});
const appRouteRoute = Route$2.update({
  id: "/(app)",
  getParentRoute: () => Route$4
});
const appDashboardIndexRoute = Route$1.update({
  id: "/dashboard/",
  path: "/dashboard/",
  getParentRoute: () => appRouteRoute
});
const appSettingsAccountIndexRoute = Route.update({
  id: "/settings/account/",
  path: "/settings/account/",
  getParentRoute: () => appRouteRoute
});
const appRouteRouteChildren = {
  appDashboardIndexRoute,
  appSettingsAccountIndexRoute
};
const appRouteRouteWithChildren = appRouteRoute._addFileChildren(
  appRouteRouteChildren
);
const rootRouteChildren = {
  IndexRoute,
  appRouteRoute: appRouteRouteWithChildren
};
const routeTree = Route$4._addFileChildren(rootRouteChildren)._addFileTypes();
configureZod();
configureClient({
  typescript: Config.baseUrl,
  rust: Config.baseUrl,
  go: Config.baseUrl
});
function getRouter() {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => handleApiError(error)
    }),
    mutationCache: new MutationCache({
      onError: (error) => handleApiError(error)
    }),
    defaultOptions: {
      queries: {
        retry: false,
        throwOnError: false
      }
    }
  });
  return createRouter({
    routeTree,
    basepath: "/app",
    context: { queryClient },
    // Prefetch route chunks + loaders on hover/focus. `defaultPreloadStaleTime: 0`
    // hands staleness control to React Query: the loader always re-runs and
    // `ensureQueryData` decides from its cache whether a request actually fires.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    scrollRestoration: true
  });
}
const router = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getRouter
}, Symbol.toStringTag, { value: "Module" }));
export {
  Button as B,
  Config as C,
  Empty as E,
  EmptyDescription as a,
  createClient as b,
  cn as c,
  translateError as d,
  getInitials as g,
  router as r,
  surface as s,
  tryCatch as t
};
