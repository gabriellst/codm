import { BaseEntity } from './BaseEntity'
import type { ZodObject, ZodRawShape } from 'zod'

export class AggregateRoot<T extends ZodObject = ZodObject<ZodRawShape>> extends BaseEntity<T> {}
