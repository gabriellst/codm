import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * A fusão de classes que TODO primitivo usa — e é por isso que ela mora aqui, e não no app.
 *
 * Ela vinha de `app/react/src/lib/utils.ts`, um saco de gato com helpers do console (serialização de
 * search params, validação por schema Zod, formatação de CPF). Quando os primitivos saíram para este
 * pacote, `cn` foi a ÚNICA coisa daquele arquivo que veio junto: é a única que o design system usa, e
 * mantê-la lá deixaria o pacote de UI dependendo do app que ele serve — a seta apontando para o lado
 * errado.
 *
 * O `lib/utils.ts` do console REEXPORTA daqui, para que os consumidores que já importavam `cn` de lá
 * não tenham de mudar e, mais importante, para que não existam duas definições.
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}
