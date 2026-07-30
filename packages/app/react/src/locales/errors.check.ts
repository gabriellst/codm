// COMPILE-TIME error-i18n contract (user decision): every registered backend error code has a
// translation in BOTH catalogues. The `ErrorCode` union is GENERATED from the backends' runtime
// error registry (openapi.json x-error-codes → @codedm/client-typescript/errors), so a new
// `registerErrorCodes` entry without a translation here is a tsc error at the app — never a raw
// key rendered to the user. Extra client-side keys (NETWORK_ERROR, SESSION_EXPIRED, …) are fine;
// a MISSING backend code is not. Fix by adding the translation — never by widening the type.
import type { ErrorCode } from '@codedm/client-typescript/errors'
import en from './en.json'
import pt from './pt.json'

pt.errors satisfies Record<ErrorCode, string>
en.errors satisfies Record<ErrorCode, string>
