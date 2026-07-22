import { BaseError } from './BaseError'

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'ws' | 'sse'

export type HttpClient = Record<HttpMethod, (request: Request) => Promise<Response>>

export type HttpBaseRequest<T = unknown> = T & {
	url: string
	ctx: Record<string, unknown>
	body?: Record<string, unknown>
	headers?: Record<string, string | undefined>
	params?: Record<string, string | undefined>
	query?: Record<string, string | string[] | undefined>
	cookie?: Record<string, HttpCookie>
	rawRequest?: Request
}

export type HttpControllerRequest<T> = HttpBaseRequest<T> & {
	raw: Request
}

export class HttpControllerError extends BaseError<string> {
	constructor(
		name: string,
		readonly status: HttpStatusCode,
		message?: string,
	) {
		super(name, message)
	}
}

export interface HttpCookie {
	value: string
	Expires?: Date
	'Max-Age'?: number
	Domain?: string
	Path?: string
	Secure?: boolean
	HttpOnly?: boolean
	SameSite?: 'none' | 'lax' | 'strict'
	Priority?: 'low' | 'medium' | 'high'
}

export interface HttpBaseResponse<T> {
	status?: HttpStatusCode
	data?: T
	cookie?: Record<string, HttpCookie>
	headers?: Record<string, string | undefined>
}

export interface HttpControllerResponse<T> extends HttpBaseResponse<T> {
	status: HttpStatusCode
}

export type HttpMiddlewareResponse<T> = HttpBaseResponse<T>

export enum HttpStatusCode {
	CONTINUE = 100,
	SWITCHING_PROTOCOLS = 101,
	PROCESSING = 102,
	EARLY_HINTS = 103,
	OK = 200,
	CREATED = 201,
	ACCEPTED = 202,
	NON_AUTHORITATIVE_INFORMATION = 203,
	NO_CONTENT = 204,
	RESET_CONTENT = 205,
	PARTIAL_CONTENT = 206,
	MULTI_STATUS = 207,
	MULTIPLE_CHOICES = 300,
	MOVED_PERMANENTLY = 301,
	MOVED_TEMPORARILY = 302,
	SEE_OTHER = 303,
	NOT_MODIFIED = 304,
	USE_PROXY = 305,
	TEMPORARY_REDIRECT = 307,
	PERMANENT_REDIRECT = 308,
	BAD_REQUEST = 400,
	UNAUTHORIZED = 401,
	PAYMENT_REQUIRED = 402,
	FORBIDDEN = 403,
	NOT_FOUND = 404,
	METHOD_NOT_ALLOWED = 405,
	NOT_ACCEPTABLE = 406,
	PROXY_AUTHENTICATION_REQUIRED = 407,
	REQUEST_TIMEOUT = 408,
	CONFLICT = 409,
	GONE = 410,
	LENGTH_REQUIRED = 411,
	PRECONDITION_FAILED = 412,
	REQUEST_TOO_LONG = 413,
	REQUEST_URI_TOO_LONG = 414,
	UNSUPPORTED_MEDIA_TYPE = 415,
	REQUESTED_RANGE_NOT_SATISFIABLE = 416,
	EXPECTATION_FAILED = 417,
	IM_A_TEAPOT = 418,
	INSUFFICIENT_SPACE_ON_RESOURCE = 419,
	METHOD_FAILURE = 420,
	MISDIRECTED_REQUEST = 421,
	UNPROCESSABLE_ENTITY = 422,
	LOCKED = 423,
	FAILED_DEPENDENCY = 424,
	UPGRADE_REQUIRED = 426,
	PRECONDITION_REQUIRED = 428,
	TOO_MANY_REQUESTS = 429,
	REQUEST_HEADER_FIELDS_TOO_LARGE = 431,
	UNAVAILABLE_FOR_LEGAL_REASONS = 451,
	INTERNAL_SERVER_ERROR = 500,
	NOT_IMPLEMENTED = 501,
	BAD_GATEWAY = 502,
	SERVICE_UNAVAILABLE = 503,
	GATEWAY_TIMEOUT = 504,
	HTTP_VERSION_NOT_SUPPORTED = 505,
	INSUFFICIENT_STORAGE = 507,
	NETWORK_AUTHENTICATION_REQUIRED = 511,
}

export enum MimeTypes {
	'.aac' = 'audio/aac',
	'.abw' = 'application/x-abiword',
	'.arc' = 'application/x-freearc',
	'.avi' = 'video/x-msvideo',
	'.azw' = 'application/vnd.amazon.ebook',
	'.bin' = 'application/octet-stream',
	'.bmp' = 'image/bmp',
	'.bz' = 'application/x-bzip',
	'.bz2' = 'application/x-bzip2',
	'.csh' = 'application/x-csh',
	'.css' = 'text/css',
	'.csv' = 'text/csv',
	'.doc' = 'application/msword',
	'.docx' = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'.eot' = 'application/vnd.ms-fontobject',
	'.epub' = 'application/epub+zip',
	'.gz' = 'application/gzip',
	'.gif' = 'image/gif',
	'.htm' = 'text/html',
	'.html' = 'text/html',
	'.ico' = 'image/vnd.microsoft.icon',
	'.ics' = 'text/calendar',
	'.jar' = 'application/java-archive',
	'.jpeg' = '.jpg',
	'.js' = 'text/javascript',
	'.json' = 'application/json',
	'.jsonld' = 'application/ld+json',
	'.mid' = '.midi',
	'.mjs' = 'text/javascript',
	'.md' = 'text/markdown',
	'.mp3' = 'audio/mpeg',
	'.mpeg' = 'video/mpeg',
	'.mpkg' = 'application/vnd.apple.installer+xml',
	'.odp' = 'application/vnd.oasis.opendocument.presentation',
	'.ods' = 'application/vnd.oasis.opendocument.spreadsheet',
	'.odt' = 'application/vnd.oasis.opendocument.text',
	'.oga' = 'audio/ogg',
	'.ogv' = 'video/ogg',
	'.ogx' = 'application/ogg',
	'.opus' = 'audio/opus',
	'.otf' = 'font/otf',
	'.png' = 'image/png',
	'.pdf' = 'application/pdf',
	'.php' = 'application/php',
	'.ppt' = 'application/vnd.ms-powerpoint',
	'.pptx' = 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'.rar' = 'application/vnd.rar',
	'.rtf' = 'application/rtf',
	'.sh' = 'application/x-sh',
	'.svg' = 'image/svg+xml',
	'.swf' = 'application/x-shockwave-flash',
	'.tar' = 'application/x-tar',
	'.tif' = 'image/tiff',
	'.tiff' = 'image/tiff',
	'.ts' = 'video/mp2t',
	'.ttf' = 'font/ttf',
	'.txt' = 'text/plain',
	'.stream' = 'text/event-stream',
	'.vsd' = 'application/vnd.visio',
	'.wav' = 'audio/wav',
	'.weba' = 'audio/webm',
	'.webm' = 'video/webm',
	'.webp' = 'image/webp',
	'.woff' = 'font/woff',
	'.woff2' = 'font/woff2',
	'.xhtml' = 'application/xhtml+xml',
	'.xls' = 'application/vnd.ms-excel',
	'.xlsx' = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'.xml' = 'XML',
	'.xul' = 'application/vnd.mozilla.xul+xml',
	'.zip' = 'application/zip',
	'.3gp' = 'video/3gpp',
	'.3g2' = 'video/3gpp2',
	'.7z' = 'application/x-7z-compressed',
}
