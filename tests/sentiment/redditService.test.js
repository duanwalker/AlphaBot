import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchRedditPosts } from '../../services/redditService.js';

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

describe('fetchRedditPosts', () => {
  it('returns mapped posts from all subreddits on success', async () => {
    mockFetch({
      ok: true,
      contentType: 'application/json',
      json: {
        data: {
          children: [
            {
              data: {
                title: 'AAPL earnings beat',
                selftext: 'Strong numbers',
                score: 100,
                num_comments: 50,
                created_utc: 1719475200,
              },
            },
          ],
        },
      },
    });

    const posts = await fetchRedditPosts('AAPL');

    expect(posts).toHaveLength(3);
    for (const post of posts) {
      expect(post.source).toBe('reddit');
      expect(post.engagement).toBe(200);
      expect(post.text).toContain('AAPL earnings beat');
      expect(post.text).toContain('Strong numbers');
    }
  });

  it('skips subreddit and continues when response is 403 HTML', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: { get: (h) => (h === 'content-type' ? 'text/html' : null) },
        json: jest.fn(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: (h) => (h === 'content-type' ? 'application/json' : null) },
        json: jest.fn().mockResolvedValue({
          data: {
            children: [
              {
                data: {
                  title: 'AAPL earnings beat',
                  selftext: 'Strong numbers',
                  score: 100,
                  num_comments: 50,
                  created_utc: 1719475200,
                },
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: (h) => (h === 'content-type' ? 'application/json' : null) },
        json: jest.fn().mockResolvedValue({
          data: {
            children: [
              {
                data: {
                  title: 'AAPL still strong',
                  selftext: 'Momentum intact',
                  score: 25,
                  num_comments: 10,
                  created_utc: 1719475200,
                },
              },
            ],
          },
        }),
      });

    const posts = await fetchRedditPosts('AAPL');

    expect(posts).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('returns empty array when all subreddits return 403', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: (h) => (h === 'content-type' ? 'text/html' : null) },
      json: jest.fn(),
    });

    await expect(fetchRedditPosts('AAPL')).resolves.toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('skips subreddit when content-type is HTML even if status 200', async () => {
    mockFetch({ ok: true, status: 200, contentType: 'text/html' });

    await expect(fetchRedditPosts('AAPL')).resolves.toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('handles missing selftext gracefully', async () => {
    mockFetch({
      ok: true,
      contentType: 'application/json',
      json: {
        data: {
          children: [
            {
              data: {
                title: 'AAPL earnings beat',
                selftext: undefined,
                score: 10,
                num_comments: 0,
                created_utc: 1719475200,
              },
            },
          ],
        },
      },
    });

    const posts = await fetchRedditPosts('AAPL');

    expect(posts).toHaveLength(3);
    for (const post of posts) {
      expect(post.text).toBe('AAPL earnings beat');
      expect(post.text).not.toContain('undefined');
    }
  });

  it('returns empty array and does not throw when fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('DNS failure'));

    await expect(fetchRedditPosts('AAPL')).resolves.toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('sets correct User-Agent and Accept headers', async () => {
    mockFetch({
      ok: true,
      contentType: 'application/json',
      json: {
        data: {
          children: [
            {
              data: {
                title: 'AAPL earnings beat',
                selftext: 'Strong numbers',
                score: 100,
                num_comments: 50,
                created_utc: 1719475200,
              },
            },
          ],
        },
      },
    });

    await fetchRedditPosts('AAPL');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'AlphaBot/1.0',
          Accept: 'application/json',
        }),
      })
    );
  });
});
