import { CurrencyCodeEnum } from '@template/client-typescript/typescript'

import { test, expect } from '../utils/test'
import { t } from '../utils/i18n'

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3030'

test.describe('purchase orders', () => {
	test('page loads and shows empty state', async ({ page, goto, given }) => {
		await given.freshUser()
		await goto('/procurement/purchase-orders')

		await expect(page.getByRole('heading', { name: t('purchaseOrders.pageTitle') })).toBeVisible()
		await expect(page.getByText(t('purchaseOrders.emptyState'))).toBeVisible()
	})

	test('creates a purchase order via dialog', async ({ page, goto, given }) => {
		await given.freshUser()
		await goto('/procurement/purchase-orders')

		await page.getByRole('button', { name: t('purchaseOrders.createButton') }).click()

		await page.getByLabel(t('purchaseOrders.createDialog.supplierName')).fill('Fornecedor Teste')

		await page.getByRole('button', { name: t('purchaseOrders.createDialog.submit') }).click()

		await expect(page.getByText('Fornecedor Teste')).toBeVisible()
	})

	test('realtime: new row appears via SSE without reload', async ({ page, goto, given, request }) => {
		const user = await given.freshUser()
		await goto('/procurement/purchase-orders')

		await expect(page.getByText(t('purchaseOrders.emptyState'))).toBeVisible()

		await request.post(`${API_BASE_URL}/v1/procurement/purchase-orders`, {
			headers: {
				Cookie: `better-auth.session_token=${user.session.token}`,
				Origin: API_BASE_URL,
			},
			data: {
				supplierName: 'Fornecedor SSE',
				totalAmount: { amountCents: 99900, currency: CurrencyCodeEnum.BRL },
			},
		})

		await expect(page.getByRole('cell', { name: 'Fornecedor SSE' })).toBeVisible({ timeout: 12_000 })
	})

	test('cancels a purchase order', async ({ page, goto, given, request }) => {
		const user = await given.freshUser()

		await request.post(`${API_BASE_URL}/v1/procurement/purchase-orders`, {
			headers: {
				Cookie: `better-auth.session_token=${user.session.token}`,
				Origin: API_BASE_URL,
			},
			data: {
				supplierName: 'Fornecedor Cancelar',
				totalAmount: { amountCents: 10000, currency: CurrencyCodeEnum.BRL },
			},
		})

		await goto('/procurement/purchase-orders')

		await expect(page.getByRole('cell', { name: 'Fornecedor Cancelar' })).toBeVisible()

		await page.getByRole('button', { name: t('purchaseOrders.table.cancelAriaLabel') }).first().click()

		await page.getByRole('button', { name: t('purchaseOrders.cancelConfirm.action') }).click()

		await expect(page.getByText(t('purchaseOrders.cancelSuccess'))).toBeVisible()
	})
})
