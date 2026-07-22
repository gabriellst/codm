import { HttpControllerRequest, HttpMiddlewareResponse } from './Http'

export abstract class Middleware {
	abstract execute: (request: HttpControllerRequest<unknown>) => Promise<HttpMiddlewareResponse<unknown>>
}

export type MiddlewareClass = new (...args: any[]) => Middleware
