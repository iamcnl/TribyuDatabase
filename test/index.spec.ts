import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import schema from '../schema.sql?raw';

beforeAll(async () => {
	const statements = schema.split(';').map((s) => s.trim()).filter(Boolean);
	for (const statement of statements) {
		await env.DB.prepare(statement).run();
	}
	await env.DB.prepare(
		"INSERT OR REPLACE INTO channel_data (prize_pool, hashrate, timestamp) VALUES ('5,000,000', '1,200', '2025-09-10 12:05:00 UTC')"
	).run();
});

describe('read API', () => {
	it('returns channel data as JSON with open CORS', async () => {
		const response = await SELF.fetch('https://example.com/get-channel-data');
		expect(response.status).toBe(200);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		const rows = (await response.json()) as { prize_pool: string }[];
		expect(rows[0].prize_pool).toBe('5,000,000');
	});

	it('returns an empty list for an empty table', async () => {
		const response = await SELF.fetch('https://example.com/get-payment-data');
		expect(await response.json()).toEqual([]);
	});

	it('rejects non-GET methods', async () => {
		const response = await SELF.fetch('https://example.com/get-channel-data', { method: 'POST' });
		expect(response.status).toBe(405);
	});
});

describe('ingestion', () => {
	it('is disabled without USER_TOKEN', async () => {
		const response = await SELF.fetch('https://example.com/log-data');
		expect(response.status).toBe(503);
	});
});
