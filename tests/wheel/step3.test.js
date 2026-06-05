// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// ── Hoisted mock functions ────────────────────────────────────────────────────

const { mockGetUserProfile } = vi.hoisted(() => ({
  mockGetUserProfile: vi.fn(),
}));

// ── Module mocks (Part A: brokerService dependencies) ─────────────────────────

vi.mock('../../services/userProfileDb.js', () => ({
  getUserProfile: mockGetUserProfile,
}));

vi.mock('../../brokers/brokerFactory.js', () => ({
  createBrokerAdapter: vi.fn(),
}));

vi.mock('../../brokers/AlpacaAdapter.js', () => ({
  AlpacaAdapter: vi.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { getBrokerConfig } from '../../services/brokerService.js';
import TradingModeToggle from '../../client/src/components/TradingModeToggle.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockResponse(data, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(data),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PART A: getBrokerConfig
// ─────────────────────────────────────────────────────────────────────────────

describe('getBrokerConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. returns paper config by default', async () => {
    mockGetUserProfile.mockResolvedValue({ tradingMode: 'paper' });
    const config = await getBrokerConfig('user-1', 'tenant-1');
    expect(config.mode).toBe('paper');
    expect(config.apiKey).toBe(process.env.ALPACA_API_KEY);
    expect(config.baseUrl).toContain('paper-api.alpaca.markets');
  });

  it('2. returns live config when tradingMode is live', async () => {
    mockGetUserProfile.mockResolvedValue({ tradingMode: 'live' });
    const origKey    = process.env.ALPACA_LIVE_API_KEY;
    const origSecret = process.env.ALPACA_LIVE_SECRET_KEY;
    try {
      process.env.ALPACA_LIVE_API_KEY    = 'live-key-test';
      process.env.ALPACA_LIVE_SECRET_KEY = 'live-secret-test';
      const config = await getBrokerConfig('user-1', 'tenant-1');
      expect(config.mode).toBe('live');
      expect(config.apiKey).toBe('live-key-test');
      expect(config.baseUrl).toContain('api.alpaca.markets');
      expect(config.baseUrl).not.toContain('paper');
    } finally {
      process.env.ALPACA_LIVE_API_KEY    = origKey;
      process.env.ALPACA_LIVE_SECRET_KEY = origSecret;
    }
  });

  it('3. defaults to paper when getUserProfile throws', async () => {
    mockGetUserProfile.mockRejectedValue(new Error('DB error'));
    const config = await getBrokerConfig('user-1', 'tenant-1');
    expect(config.mode).toBe('paper');
  });

  it('4. defaults to paper when profile has no tradingMode field', async () => {
    mockGetUserProfile.mockResolvedValue({});
    const config = await getBrokerConfig('user-1', 'tenant-1');
    expect(config.mode).toBe('paper');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PART B: TradingModeToggle
// ─────────────────────────────────────────────────────────────────────────────

describe('TradingModeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('5. renders paper mode by default', async () => {
    global.fetch.mockResolvedValue(mockResponse({ mode: 'paper' }));
    render(<TradingModeToggle />);
    const paperBtn = await screen.findByRole('button', { name: /Paper trading/ });
    expect(paperBtn.classList.contains('active')).toBe(true);
    expect(document.querySelector('.trading-mode-live-warning')).toBeNull();
  });

  it('6. renders live mode warning when mode is live', async () => {
    global.fetch.mockResolvedValue(mockResponse({ mode: 'live' }));
    render(<TradingModeToggle />);
    await waitFor(() => {
      expect(document.querySelector('.trading-mode-live-warning')).not.toBeNull();
    });
  });

  it('7. clicking live button shows confirm dialog, does not immediately call PUT', async () => {
    global.fetch.mockResolvedValue(mockResponse({ mode: 'paper' }));
    render(<TradingModeToggle />);
    const liveBtn = await screen.findByRole('button', { name: /Live trading/ });
    fireEvent.click(liveBtn);
    expect(document.querySelector('.trading-mode-confirm-dialog')).not.toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('8. clicking Cancel in confirm dialog hides it', async () => {
    global.fetch.mockResolvedValue(mockResponse({ mode: 'paper' }));
    render(<TradingModeToggle />);
    const liveBtn = await screen.findByRole('button', { name: /Live trading/ });
    fireEvent.click(liveBtn);
    expect(document.querySelector('.trading-mode-confirm-dialog')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(document.querySelector('.trading-mode-confirm-dialog')).toBeNull();
    });
    const paperBtn = screen.getByRole('button', { name: /Paper trading/ });
    expect(paperBtn.classList.contains('active')).toBe(true);
  });

  it('9. confirming live switch calls PUT and updates mode', async () => {
    global.fetch
      .mockResolvedValueOnce(mockResponse({ mode: 'paper' }))
      .mockResolvedValueOnce(mockResponse({ success: true, mode: 'live' }));
    render(<TradingModeToggle />);
    const liveBtn = await screen.findByRole('button', { name: /Live trading/ });
    fireEvent.click(liveBtn);
    fireEvent.click(screen.getByRole('button', { name: /Yes, switch to live/ }));
    await waitFor(() => {
      expect(document.querySelector('.trading-mode-live-warning')).not.toBeNull();
    });
    const putCall = global.fetch.mock.calls.find(c => c[1]?.method === 'PUT');
    expect(putCall).toBeDefined();
    expect(putCall[0]).toBe('/api/settings/trading-mode');
    expect(JSON.parse(putCall[1].body)).toEqual({ mode: 'live' });
  });

  it('10. switching to paper calls PUT directly (no dialog)', async () => {
    global.fetch
      .mockResolvedValueOnce(mockResponse({ mode: 'live' }))
      .mockResolvedValueOnce(mockResponse({ success: true, mode: 'paper' }));
    render(<TradingModeToggle />);
    const paperBtn = await screen.findByRole('button', { name: /Paper trading/ });
    fireEvent.click(paperBtn);
    expect(document.querySelector('.trading-mode-confirm-dialog')).toBeNull();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
    const putCall = global.fetch.mock.calls.find(c => c[1]?.method === 'PUT');
    expect(putCall).toBeDefined();
    expect(JSON.parse(putCall[1].body)).toEqual({ mode: 'paper' });
  });

  it('11. shows error message when PUT fails', async () => {
    global.fetch
      .mockResolvedValueOnce(mockResponse({ mode: 'paper' }))
      .mockResolvedValueOnce(mockResponse({ error: 'Live account API keys not configured' }, false));
    render(<TradingModeToggle />);
    const liveBtn = await screen.findByRole('button', { name: /Live trading/ });
    fireEvent.click(liveBtn);
    fireEvent.click(screen.getByRole('button', { name: /Yes, switch to live/ }));
    await waitFor(() => {
      expect(document.querySelector('.trading-mode-error')).not.toBeNull();
    });
    expect(document.querySelector('.trading-mode-error').textContent).toContain(
      'Live account API keys not configured'
    );
  });
});
