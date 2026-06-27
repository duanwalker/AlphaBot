import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchStockTwitsPosts } from '../../services/stocktwitsService.js';

const jest = vi;

function mockFetch({ ok = true, status = 200, contentType = 'application/json', json = {} }) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    headers: { get: (h) => (h === 'content-type' ? contentType : null) },
    json: jest.fn().mockResolvedValue(json),
  });
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  global.fetch = undefined;
});

describe('fetchStockTwitsPosts', () => {
  it('returns mapped posts on successful response', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: (h) => (h === 'content-type' ? 'application/json' : null) },
        json: jest.fn().mockResolvedValue({
          messages: [
            {
              id: 1,
              body: 'AAPL looking bullish',
              likes: { total: 10 },
              user: { followers: 500 },
              entities: { sentiment: { basic: 'Bullish' } },
              created_at: '2026-06-27T10:00:00Z',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: (h) => (h === 'content-type' ? 'application/json' : null) },
        json: jest.fn().mockResolvedValue({ messages: [] }),
      });

    const posts = await fetchStockTwitsPosts('AAPL');

    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      text: 'AAPL looking bullish',
      source: 'stocktwits',
      engagement: 510,
      declaredSentiment: 'Bullish',
      createdAt: '2026-06-27T10:00:00Z',
    });
  });

  it('returns empty array when response is not ok (403)', async () => {
    mockFetch({ ok: false, status: 403, contentType: 'text/html' });

    await expect(fetchStockTwitsPosts('AAPL')).resolves.toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when content-type is HTML even if status 200', async () => {
    mockFetch({ ok: true, status: 200, contentType: 'text/html' });

    await expect(fetchStockTwitsPosts('AAPL')).resolves.toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('stops pagination when messages array is empty', async () => {
    mockFetch({
      ok: true,
      contentType: 'application/json',
      json: { messages: [] },
    });

    const posts = await fetchStockTwitsPosts('AAPL');

    expect(posts).toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('paginates up to 5 times when messages keep returning', async () => {
    let id = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      id += 1;
      return {
        ok: true,
        status: 200,
        headers: { get: (h) => (h === 'content-type' ? 'application/json' : null) },
        json: jest.fn().mockResolvedValue({
          messages: [
            {
              id,
              body: `Post ${id}`,
              likes: { total: 1 },
              user: { followers: 2 },
              entities: { sentiment: { basic: 'Bullish' } },
              created_at: '2026-06-27T10:00:00Z',
            },
          ],
        }),
      };
    });

    const posts = await fetchStockTwitsPosts('AAPL');

    expect(global.fetch).toHaveBeenCalledTimes(5);
    expect(posts).toHaveLength(5);
  });

  it('returns empty array and does not throw when fetch itself rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));

    await expect(fetchStockTwitsPosts('AAPL')).resolves.toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
