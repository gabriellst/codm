export class BaseError<T extends string = string> extends Error {
	constructor(name: T, message?: string) {
		super(message)
		this.name = name
	}
}
