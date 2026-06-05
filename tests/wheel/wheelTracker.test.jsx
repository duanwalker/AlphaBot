// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WheelTracker from '../../client/src/components/WheelTracker.jsx';

// ── Recharts mock ─────────────────────────────────────────────────────────────

vi.mock('recharts', () => ({
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}));

// ── Fetch mock helpers ────────────────────────────────────────────────────────

const DEFAULT_RESPONSES = {
  'GET /api/wheel/positions': { positions: [] },
  'GET /api/wheel/cycles':    { cycles: [] },
  'GET /api/wheel/income':    { income: [] },
};

function makeFetchResponse(data) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  });
}

function mockFetch(overrides = {}) {
  const responses = { ...DEFAULT_RESPONSES, ...overrides };

  global.fetch = vi.fn((url, options) => {
    const method = (options?.method || 'GET').toUpperCase();
    const key = `${method} ${url}`;

    if (Object.prototype.hasOwnProperty.call(responses, key)) {
      return makeFetchResponse(responses[key]);
    }
    return makeFetchResponse({ success: true });
  });
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch();
});

afterEach(() => {
  cleanup();
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 1 — Initial render and loading
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 1 — Initial render and loading', () => {
  it('1. Shows loading state then renders dashboard', async () => {
    render(<WheelTracker />);
    await waitFor(() => {
      expect(screen.getByText('Wheel Strategy')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '+ Log position' })).toBeTruthy();
    const statCards = document.querySelectorAll('.wheel-stat-card');
    expect(statCards.length).toBe(3);
  });

  it('2. Stat cards show zero state correctly', async () => {
    render(<WheelTracker />);
    await waitFor(() => {
      expect(screen.getByText('Wheel Strategy')).toBeTruthy();
    });
    expect(screen.getByText('$0.00')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('0 CSP · 0 CC')).toBeTruthy();
  });

  it('3. Empty state message shown when no positions', async () => {
    render(<WheelTracker />);
    await waitFor(() => {
      expect(screen.getByText(/Log your first wheel position/i)).toBeTruthy();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 2 — Stat card calculations
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 2 — Stat card calculations', () => {
  it('4. Stat cards calculate correctly from position data', async () => {
    mockFetch({
      'GET /api/wheel/positions': {
        positions: [
          { contractType: 'CSP', totalPremium: 420, strike: 180, contracts: 1, status: 'open' },
          { contractType: 'CC',  totalPremium: 250, strike: 185, contracts: 1, status: 'open' },
        ],
      },
    });
    render(<WheelTracker />);
    await waitFor(() => {
      expect(screen.getByText('Wheel Strategy')).toBeTruthy();
    });
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('1 CSP · 1 CC')).toBeTruthy();
    expect(screen.getByText('$36,500')).toBeTruthy();
  });

  it('5. Current month income from income data', async () => {
    mockFetch({
      'GET /api/wheel/income': {
        income: [{ rowKey: '2026-06', premiumCollected: 840 }],
      },
    });
    render(<WheelTracker />);
    await waitFor(() => {
      expect(screen.getByText('$840.00')).toBeTruthy();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 3 — Inner view tabs
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 3 — Inner view tabs', () => {
  it('6. Tab switching works', async () => {
    render(<WheelTracker />);
    await waitFor(() => {
      expect(screen.getByText('Wheel Strategy')).toBeTruthy();
    });

    const dashBtn = screen.getByRole('button', { name: 'Dashboard' });
    expect(dashBtn.classList.contains('active')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Positions' }));
    await waitFor(() => {
      // PositionsList empty state is unique to the positions view
      expect(screen.getByText('No positions to display.')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    await waitFor(() => {
      expect(screen.getByText('All positions')).toBeTruthy();
    });
  });

  it('7. History tab lazy-loads positions/all on first visit only', async () => {
    mockFetch({
      'GET /api/wheel/positions/all': { positions: [] },
    });
    render(<WheelTracker />);
    await waitFor(() => {
      expect(screen.getByText('Wheel Strategy')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    await waitFor(() => {
      expect(screen.getByText('All positions')).toBeTruthy();
    });

    const callsAfterFirst = global.fetch.mock.calls.filter(
      c => c[0] === '/api/wheel/positions/all'
    );
    expect(callsAfterFirst.length).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    await waitFor(() => {
      expect(screen.getByText('All positions')).toBeTruthy();
    });

    const callsAfterSecond = global.fetch.mock.calls.filter(
      c => c[0] === '/api/wheel/positions/all'
    );
    expect(callsAfterSecond.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 4 — PositionsList action buttons
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 4 — PositionsList action buttons', () => {
  const cspPosition = {
    rowKey: 'pos-1',
    positionId: 'pos-1',
    contractType: 'CSP',
    ticker: 'AAPL',
    strike: 180,
    expiry: '2026-07-18',
    contracts: 1,
    totalPremium: 420,
    status: 'open',
    premiumPerContract: 4.20,
  };

  const ccPosition = {
    rowKey: 'pos-1',
    positionId: 'pos-1',
    contractType: 'CC',
    ticker: 'AAPL',
    strike: 180,
    expiry: '2026-07-18',
    contracts: 1,
    totalPremium: 420,
    status: 'open',
    premiumPerContract: 4.20,
  };

  it('8. CSP position shows Expire and Assign buttons', async () => {
    mockFetch({
      'GET /api/wheel/positions': { positions: [cspPosition] },
    });
    render(<WheelTracker />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Expire' })).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Assign' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Called away' })).toBeNull();
  });

  it('9. CC position shows Expire and Called away buttons', async () => {
    mockFetch({
      'GET /api/wheel/positions': { positions: [ccPosition] },
    });
    render(<WheelTracker />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Expire' })).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Called away' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
  });

  it('10. handleExpire calls PUT with correct body', async () => {
    mockFetch({
      'GET /api/wheel/positions':      { positions: [cspPosition] },
      'PUT /api/wheel/positions/pos-1': { success: true },
    });
    render(<WheelTracker />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Expire' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Expire' }));
    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(c => c[1]?.method === 'PUT');
      expect(putCall).toBeDefined();
      const body = JSON.parse(putCall[1].body);
      expect(body.status).toBe('expired');
      expect(body.totalPremium).toBe(420);
    });
  });

  it('11. handleAssign calls PUT with correct body', async () => {
    mockFetch({
      'GET /api/wheel/positions': { positions: [cspPosition] },
    });
    render(<WheelTracker />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Assign' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(c => c[1]?.method === 'PUT');
      expect(putCall).toBeDefined();
      const body = JSON.parse(putCall[1].body);
      expect(body.status).toBe('assigned');
      expect(body.assigned).toBe(true);
      expect(body.sharesAcquired).toBe(100);
      expect(body.assignedPrice).toBe(180);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 5 — AddPositionModal
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 5 — AddPositionModal', () => {
  async function openModal() {
    render(<WheelTracker />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+ Log position' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: '+ Log position' }));
    await waitFor(() => {
      expect(document.querySelector('.wheel-modal-overlay')).not.toBeNull();
    });
  }

  it('12. Modal opens when "+ Log position" clicked', async () => {
    await openModal();
    expect(document.querySelector('.wheel-modal-overlay')).not.toBeNull();
    expect(screen.getByPlaceholderText('AAPL')).toBeTruthy();
    expect(screen.getByPlaceholderText('150.00')).toBeTruthy();
    expect(document.querySelector('input[type="date"]')).not.toBeNull();
    expect(screen.getByPlaceholderText('2.50')).toBeTruthy();
  });

  it('13. Log position button disabled when required fields are empty', async () => {
    await openModal();
    const saveBtn = screen.getByRole('button', { name: 'Log position' });
    expect(saveBtn.disabled).toBe(true);
  });

  it('14. Live calculations update as user types', async () => {
    await openModal();

    const strikeInput  = screen.getByPlaceholderText('150.00');
    const premiumInput = screen.getByPlaceholderText('2.50');
    const expiryInput  = document.querySelector('input[type="date"]');
    const contractsInputs = document.querySelectorAll('input[type="number"]');
    const contractsInput = Array.from(contractsInputs).find(el => el.value === '1');

    fireEvent.change(strikeInput,    { target: { value: '180' } });
    fireEvent.change(premiumInput,   { target: { value: '4.20' } });
    fireEvent.change(contractsInput, { target: { value: '1' } });
    fireEvent.change(expiryInput,    { target: { value: '2026-12-19' } });

    await waitFor(() => {
      const preview = document.querySelector('.wheel-calc-preview');
      expect(preview).not.toBeNull();
      expect(preview.textContent).toContain('$420.00');
      expect(preview.textContent).toContain('$18,000');
      expect(preview.textContent).toMatch(/%/);
    });
  });

  it('15. Submitting modal calls POST and reloads', async () => {
    mockFetch({
      'POST /api/wheel/positions': { success: true, position: { positionId: 'new-1' } },
    });
    await openModal();

    const tickerInput  = screen.getByPlaceholderText('AAPL');
    const strikeInput  = screen.getByPlaceholderText('150.00');
    const premiumInput = screen.getByPlaceholderText('2.50');
    const expiryInput  = document.querySelector('input[type="date"]');

    fireEvent.change(tickerInput,  { target: { value: 'AAPL' } });
    fireEvent.change(strikeInput,  { target: { value: '180' } });
    fireEvent.change(premiumInput, { target: { value: '4.20' } });
    fireEvent.change(expiryInput,  { target: { value: '2026-07-18' } });

    const saveBtn = screen.getByRole('button', { name: 'Log position' });
    await waitFor(() => expect(saveBtn.disabled).toBe(false));
    fireEvent.click(saveBtn);

    await waitFor(() => {
      const postCall = global.fetch.mock.calls.find(c => c[1]?.method === 'POST');
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall[1].body);
      expect(body.ticker).toBe('AAPL');
      expect(parseFloat(body.strike)).toBe(180);
      expect(parseFloat(body.premiumPerContract)).toBe(4.20);
    });

    const getPositionsCalls = global.fetch.mock.calls.filter(
      c => c[0] === '/api/wheel/positions' && !c[1]?.method
    );
    expect(getPositionsCalls.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 6 — IncomeChart
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 6 — IncomeChart', () => {
  it('16. Income chart renders when data present', async () => {
    mockFetch({
      'GET /api/wheel/income': {
        income: [
          { rowKey: '2026-06', premiumCollected: 420 },
          { rowKey: '2026-05', premiumCollected: 310 },
          { rowKey: '2026-04', premiumCollected: 580 },
        ],
      },
    });
    render(<WheelTracker />);
    await waitFor(() => {
      expect(screen.getByTestId('bar-chart')).toBeTruthy();
    });
  });

  it('17. Income chart empty state when no data', async () => {
    render(<WheelTracker />);
    await waitFor(() => {
      expect(screen.getByText('Wheel Strategy')).toBeTruthy();
    });
    expect(screen.queryByTestId('bar-chart')).toBeNull();
    expect(screen.getByText(/Income chart will appear/i)).toBeTruthy();
  });
});
