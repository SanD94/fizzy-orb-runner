import { describe, expect, test } from 'bun:test'
import { authorized, listFizzyCards, localDate, nextLink, type FizzyConfig } from '../.amp/plugins/daily-focus'

describe('daily focus helpers', () => {
	test('uses the configured timezone for the run date', () => {
		expect(localDate(new Date('2026-08-29T21:30:00Z'), 'Europe/Istanbul')).toBe('2026-08-30')
	})

	test('accepts only the configured bearer secret', () => {
		expect(authorized('Bearer correct horse', 'correct horse')).toBe(true)
		expect(authorized('Bearer wrong', 'correct horse')).toBe(false)
		expect(authorized(undefined, 'correct horse')).toBe(false)
	})

	test('extracts Fizzy rel=next pagination links', () => {
		expect(nextLink('<https://app.fizzy.do/123/cards?page=2>; rel="next", <https://app.fizzy.do/123/cards?page=4>; rel="last"'))
			.toBe('https://app.fizzy.do/123/cards?page=2')
		expect(nextLink(null)).toBeNull()
	})

	test('lists Fizzy cards read-only and follows at most one next link', async () => {
		const originalFetch = globalThis.fetch
		const requests: Array<{ url: string; init?: RequestInit }> = []
		globalThis.fetch = (async (input, init) => {
			requests.push({ url: input.toString(), init })
			if (requests.length === 1) {
				return Response.json(
					[{ id: 'newer', number: 2, title: '  Newer\ncard ', created_at: '2026-02-01T00:00:00Z' }],
					{ headers: { Link: '<https://app.fizzy.do/acct/cards?page=2>; rel="next"' } },
				)
			}
			return Response.json([{ id: 'older', number: 1, title: 'Older card', created_at: '2026-01-01T00:00:00Z' }])
		}) as typeof fetch

		const config = {
			fizzyBaseUrl: new URL('https://app.fizzy.do'),
			fizzyAccount: 'acct',
			fizzyColumnIds: ['ready'],
			fizzyToken: 'not-logged',
			maxCards: 10,
		} satisfies FizzyConfig

		try {
			const cards = await listFizzyCards(config)
			expect(cards.map(({ id, title }) => ({ id, title }))).toEqual([
				{ id: 'older', title: 'Older card' },
				{ id: 'newer', title: 'Newer card' },
			])
			expect(requests).toHaveLength(2)
			expect(requests[0].url).toContain('column_ids%5B%5D=ready')
			expect(requests[0].init?.method).toBeUndefined()
			expect(requests[0].init?.headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer not-logged' })
		} finally {
			globalThis.fetch = originalFetch
		}
	})

	test('discovers the Fizzy account when none is configured', async () => {
		const originalFetch = globalThis.fetch
		const urls: string[] = []
		globalThis.fetch = (async (input) => {
			urls.push(input.toString())
			if (urls.length === 1) return Response.json({ accounts: [{ slug: '/account-123' }] })
			return Response.json([])
		}) as typeof fetch

		try {
			const cards = await listFizzyCards({
				fizzyBaseUrl: new URL('https://app.fizzy.do'),
				fizzyAccount: '',
				fizzyColumnIds: [],
				fizzyToken: 'not-logged',
				maxCards: 10,
			} satisfies FizzyConfig)
			expect(cards).toEqual([])
			expect(urls).toEqual([
				'https://app.fizzy.do/my/identity',
				'https://app.fizzy.do/account-123/cards',
			])
		} finally {
			globalThis.fetch = originalFetch
		}
	})
})
