import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DailyRunStore, authorized, decodeTrigger, localDate, nextLink, readFizzy, type FizzyConfig } from '../.amp/plugins/daily-focus'

describe('daily focus helpers', () => {
	test('uses the configured timezone for the run date', () => {
		expect(localDate(new Date('2026-08-29T21:30:00Z'), 'Europe/Istanbul')).toBe('2026-08-30')
	})

	test('accepts only the configured bearer secret', () => {
		expect(authorized('Bearer correct horse', 'correct horse')).toBe(true)
		expect(authorized('Bearer wrong', 'correct horse')).toBe(false)
		expect(authorized(undefined, 'correct horse')).toBe(false)
	})

	test('accepts a fresh trigger timestamp and rejects stale requests', () => {
		const body = (triggeredAt: string) => new TextEncoder().encode(JSON.stringify({ triggered_at: triggeredAt }))
		expect(decodeTrigger({
			body: body('2026-08-29T09:00:00Z'),
			receivedAt: '2026-08-29T09:05:00Z',
		}).triggeredAt.toISOString()).toBe('2026-08-29T09:00:00.000Z')
		expect(() => decodeTrigger({
			body: body('2026-08-29T08:49:59Z'),
			receivedAt: '2026-08-29T09:00:00Z',
		})).toThrow('stale_trigger')
	})

	test('atomically claims one run per timezone and local date', () => {
		const directory = mkdtempSync(join(tmpdir(), 'daily-focus-'))
		const store = new DailyRunStore(join(directory, 'state.sqlite'))
		try {
			const first = store.claim('2026-08-29', 'Europe/Istanbul', 'event-1')
			const duplicate = store.claim('2026-08-29', 'Europe/Istanbul', 'event-2')
			expect(first.claimed).toBe(true)
			expect(duplicate.claimed).toBe(false)
			expect(duplicate.run.eventId).toBe('event-1')

			const created = store.markThreadCreated(first.run.runKey, 'T-thread', 'https://ampcode.com/threads/T-thread')
			expect(created.status).toBe('thread_created')
			expect(created.threadId).toBe('T-thread')
			const notified = store.markNotified(first.run.runKey, 42)
			expect(notified.status).toBe('notified')
			expect(notified.telegramMessageId).toBe(42)
		} finally {
			store.close()
			rmSync(directory, { recursive: true, force: true })
		}
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
