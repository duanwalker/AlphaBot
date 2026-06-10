import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveUserProfile } from '../../client/src/services/userProfileApi.js';

describe('userProfileApi.saveUserProfile', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ profile: { activeStrategies: ['wheel'] } }),
    });
  });

  it('sends PUT to /api/profile/strategies', async () => {
    const updates = { activeStrategies: ['wheel', 'longTerm'] };

    await saveUserProfile(updates);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/profile/strategies',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual(updates);
  });
});
