import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateEntity, mockUpsertEntity, mockGetEntity, mockListEntities } = vi.hoisted(() => ({
  mockCreateEntity: vi.fn(),
  mockUpsertEntity: vi.fn(),
  mockGetEntity: vi.fn(),
  mockListEntities: vi.fn(),
}));

vi.mock('dotenv/config', () => ({}));

vi.mock('@azure/data-tables', () => ({
  TableClient: {
    fromConnectionString: vi.fn(() => ({
      createEntity: mockCreateEntity,
      upsertEntity: mockUpsertEntity,
      getEntity: mockGetEntity,
      listEntities: mockListEntities,
      createTable: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

process.env.AZURE_STORAGE_CONNECTION_STRING = 'fake_connection_string';

import {
  createPosition,
  getOpenPositions,
  createCycle,
  getActiveCycles,
  updateMonthlyIncome,
  getMonthlyIncome,
} from '../../services/wheelDb.js';

function makeAsyncIterable(items) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const item of items) yield item;
    },
  };
}

describe('wheelDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListEntities.mockReturnValue(makeAsyncIterable([]));
    mockCreateEntity.mockResolvedValue(undefined);
    mockUpsertEntity.mockResolvedValue(undefined);
    mockGetEntity.mockResolvedValue(null);
  });

  // ── 1. createPosition ──────────────────────────────────────────────────────

  describe('createPosition', () => {
    it('calls createEntity with correct partitionKey, rowKey starting with wheel_, status open, assigned false, calledAway false', async () => {
      const userId = 'user-42';
      const positionData = { ticker: 'AAPL', strike: 150, premium: 3.5, shares: 100 };

      await createPosition(userId, positionData);

      expect(mockUpsertEntity).toHaveBeenCalledOnce();
      const entity = mockUpsertEntity.mock.calls[0][0];
      expect(entity.partitionKey).toBe(userId);
      expect(entity.rowKey).toMatch(/^wheel_/);
      expect(entity.status).toBe('open');
      expect(entity.assigned).toBe(false);
      expect(entity.calledAway).toBe(false);
    });

    it('includes all positionData fields in the entity', async () => {
      const userId = 'user-42';
      const positionData = { ticker: 'TSLA', strike: 200, premium: 5.0, shares: 50 };

      await createPosition(userId, positionData);

      const entity = mockUpsertEntity.mock.calls[0][0];
      expect(entity.ticker).toBe(positionData.ticker);
      expect(entity.strike).toBe(positionData.strike);
      expect(entity.premium).toBe(positionData.premium);
      expect(entity.shares).toBe(positionData.shares);
      expect(entity.status).toBe('open');
      expect(entity.assigned).toBe(false);
      expect(entity.calledAway).toBe(false);
    });
  });

  // ── 2. getOpenPositions ────────────────────────────────────────────────────

  describe('getOpenPositions', () => {
    it("calls listEntities with filter containing status eq 'open' and correct userId", async () => {
      const userId = 'user-42';

      await getOpenPositions(userId);

      expect(mockListEntities).toHaveBeenCalledOnce();
      const { filter } = mockListEntities.mock.calls[0][0].queryOptions;
      expect(filter).toContain("status eq 'open'");
      expect(filter).toContain(userId);
    });

    it('returns an array of normalized positions', async () => {
      const userId = 'user-42';
      const rawEntity = {
        partitionKey: userId,
        rowKey: 'wheel_123_AAPL',
        ticker: 'AAPL',
        strike: '150.0',
        premium: '3.5',
        shares: '100',
        costBasis: '0',
        currentPrice: '155.0',
        breakeven: '146.5',
        status: 'open',
        assigned: false,
        calledAway: false,
      };
      mockListEntities.mockReturnValue(makeAsyncIterable([rawEntity]));

      const result = await getOpenPositions(userId);

      expect(result).toHaveLength(1);
      expect(result[0].strike).toBe(150.0);
      expect(result[0].premium).toBe(3.5);
      expect(result[0].shares).toBe(100);
    });
  });

  // ── 3. createCycle ─────────────────────────────────────────────────────────

  describe('createCycle', () => {
    it('calls createEntity with status csp_open and rowKey equal to cycleData.cycleId', async () => {
      const userId = 'user-42';
      const cycleData = { cycleId: 'cycle-001', ticker: 'AAPL' };

      await createCycle(userId, cycleData);

      expect(mockUpsertEntity).toHaveBeenCalledOnce();
      const entity = mockUpsertEntity.mock.calls[0][0];
      expect(entity.status).toBe('csp_open');
      expect(entity.rowKey).toBe(cycleData.cycleId);
    });
  });

  // ── 4. getActiveCycles ─────────────────────────────────────────────────────

  describe('getActiveCycles', () => {
    it("calls listEntities with filter containing status ne 'complete'", async () => {
      const userId = 'user-42';

      await getActiveCycles(userId);

      expect(mockListEntities).toHaveBeenCalledOnce();
      const { filter } = mockListEntities.mock.calls[0][0].queryOptions;
      expect(filter).toContain("status ne 'complete'");
    });
  });

  // ── 5. updateMonthlyIncome ─────────────────────────────────────────────────

  describe('updateMonthlyIncome', () => {
    it('Case A: no existing record — upsertEntity called with delta.premiumCollected and delta.cyclesOpen', async () => {
      const userId = 'user-42';
      const month = '2026-05';
      const delta = { premiumCollected: 420, cyclesOpen: 1 };

      mockGetEntity.mockRejectedValue(new Error('ResourceNotFound'));

      await updateMonthlyIncome(userId, month, delta);

      expect(mockUpsertEntity).toHaveBeenCalledOnce();
      const entity = mockUpsertEntity.mock.calls[0][0];
      expect(entity.premiumCollected).toBe(delta.premiumCollected);
      expect(entity.cyclesOpen).toBe(delta.cyclesOpen);
    });

    it('Case B: existing record — upsertEntity called with summed premiumCollected 620 and cyclesOpen 2', async () => {
      const userId = 'user-42';
      const month = '2026-05';
      const existing = { premiumCollected: 200, cyclesOpen: 1 };
      const delta = { premiumCollected: 420, cyclesOpen: 1 };

      mockGetEntity.mockResolvedValue(existing);

      await updateMonthlyIncome(userId, month, delta);

      expect(mockUpsertEntity).toHaveBeenCalledOnce();
      const entity = mockUpsertEntity.mock.calls[0][0];
      expect(entity.premiumCollected).toBe(620);
      expect(entity.cyclesOpen).toBe(2);
    });
  });

  // ── 6. getMonthlyIncome ────────────────────────────────────────────────────

  describe('getMonthlyIncome', () => {
    it('returns records sorted descending by rowKey (most recent month first)', async () => {
      const userId = 'user-42';
      const records = [
        { partitionKey: userId, rowKey: '2026-03' },
        { partitionKey: userId, rowKey: '2026-05' },
        { partitionKey: userId, rowKey: '2026-04' },
      ];
      mockListEntities.mockReturnValue(makeAsyncIterable(records));

      const result = await getMonthlyIncome(userId);

      expect(result[0].rowKey).toBe('2026-05');
      expect(result[1].rowKey).toBe('2026-04');
      expect(result[2].rowKey).toBe('2026-03');
    });
  });
});
