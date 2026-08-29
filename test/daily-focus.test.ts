import { describe, expect, test } from 'bun:test'
import { authorized, localDate, nextLink, readFizzy, type FizzyConfig } from '../.amp/plugins/daily-focus'

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

	test('reads Fizzy dynamically and exposes same-origin pagination', async () => {
		const originalFetch = globalThis.fetch
		const requests: Array<{ url: string; init?: RequestInit }> = []
		globalThis.fetch = (async (input, init) => {
			requests.push({ url: input.toString(), init })
			return Response.json(
				[{ id: 'card-1', number: 1, title: 'Current card' }],
				{ headers: { Link: '<https://app.fizzy.do/acct/cards?page=2>; rel="next"' } },
			)
		}) as typeof fetch

		const config = {
			fizzyBaseUrl: new URL('https://app.fizzy.do'),
			fizzyToken: 'not-logged',
		} satisfies FizzyConfig

		try {
			const result = JSON.parse(await readFizzy(config, '/acct/cards?column_ids[]=ready'))
			expect(result).toEqual({
				data: [{ id: 'card-1', number: 1, title: 'Current card' }],
				next_path: '/acct/cards?page=2',
			})
			expect(requests).toHaveLength(1)
			expect(requests[0].url).toBe('https://app.fizzy.do/acct/cards?column_ids[]=ready')
			expect(requests[0].init?.method).toBeUndefined()
			expect(requests[0].init?.headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer not-logged' })
		} finally {
			globalThis.fetch = originalFetch
		}
	})

	test('rejects absolute and cross-origin Fizzy paths', async () => {
		const config = {
			fizzyBaseUrl: new URL('https://app.fizzy.do'),
			fizzyToken: 'not-logged',
		} satisfies FizzyConfig

		expect(readFizzy(config, 'https://example.com/cards')).rejects.toThrow('fizzy_path_must_be_relative')
		expect(readFizzy(config, '//example.com/cards')).rejects.toThrow('fizzy_path_must_be_relative')
	})
})
