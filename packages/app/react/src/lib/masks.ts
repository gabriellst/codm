import type { MaskitoOptions } from '@maskito/core'

export const cnpjMaskOptions: MaskitoOptions = {
	mask: [/\d/, /\d/, '.', /\d/, /\d/, /\d/, '.', /\d/, /\d/, /\d/, '/', /\d/, /\d/, /\d/, /\d/, '-', /\d/, /\d/],
}

export const phoneMaskOptions: MaskitoOptions = {
	mask: ['(', /\d/, /\d/, ')', ' ', /\d/, /\d/, /\d/, /\d/, /\d/, '-', /\d/, /\d/, /\d/, /\d/],
}

export const zipCodeMaskOptions: MaskitoOptions = {
	mask: [/\d/, /\d/, /\d/, /\d/, /\d/, '-', /\d/, /\d/, /\d/],
}

export const crmMaskOptions: MaskitoOptions = {
	mask: [/\d/, /\d/, /\d/, /\d/, /\d/, /\d/, /\d/],
}

export const rqeMaskOptions: MaskitoOptions = {
	mask: [/\d/, /\d/, /\d/, /\d/, /\d/, /\d/],
}

export const cpfMaskOptions: MaskitoOptions = {
	mask: [/\d/, /\d/, /\d/, '.', /\d/, /\d/, /\d/, '.', /\d/, /\d/, /\d/, '-', /\d/, /\d/],
}

export const rgMaskOptions: MaskitoOptions = {
	mask: [/\d/, /\d/, '.', /\d/, /\d/, /\d/, '.', /\d/, /\d/, /\d/, '-', /[\dXx]/],
}

export const unmask = (value: string) => value.replace(/\D/g, '')

export const documentMaskOptions: MaskitoOptions = {
	mask: ({ value }) => {
		const digits = value.replace(/\D/g, '')
		if (digits.length <= 11) {
			// CPF format: 999.999.999-99
			return [/\d/, /\d/, /\d/, '.', /\d/, /\d/, /\d/, '.', /\d/, /\d/, /\d/, '-', /\d/, /\d/]
		}
		// CNPJ format: 99.999.999/9999-99
		return [/\d/, /\d/, '.', /\d/, /\d/, /\d/, '.', /\d/, /\d/, /\d/, '/', /\d/, /\d/, /\d/, /\d/, '-', /\d/, /\d/]
	},
}
