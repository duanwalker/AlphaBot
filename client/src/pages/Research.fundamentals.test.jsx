import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Research from './Research';

jest.mock('../hooks/useSymbolSearch', () => ({
  __esModule: true,
  default: () => ({
    loading: false,
    error: null,
    result: {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      exchange: 'NASDAQ',
      price: 197.15,
      sentimentScore: 0.2,
    },
    searchSymbol: jest.fn(),
  }),
}));

jest.mock('../components/HistoricalSparklineCard', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-chart" />,
}));

jest.mock('../components/sentiment/ResearchSentimentPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-sentiment" />,
}));

jest.mock('../components/news/RelevantArticlesPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-news" />,
}));

jest.mock('../components/ResearchTradeWidget', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-trade-widget" />,
}));

jest.mock('../components/sentiment/SentimentBadge', () => ({
  __esModule: true,
  default: () => <span data-testid="mock-badge">sentiment</span>,
}));

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

const aaplPayload = {
  symbol: 'AAPL',
  name: 'Apple Inc.',
  description: 'Consumer electronics company',
  marketCap: '3025000000000',
  peRatio: '28.4',
  eps: '7.1',
  dividendYield: '0.0045',
  profitMargin: '0.241',
  analystTargetPrice: '218.0',
  week52High: '204.39',
  week52Low: '164.08',
  normalized52WeekHigh: '204.39',
  normalized52WeekLow: '164.08',
  beta: '1.23',
  sector: 'Technology',
  industry: 'Consumer Electronics',
  PERatio: '999.99',
  EPS: '999.99',
  MarketCapitalization: '123',
  Beta: '9.99',
};

const msftPayload = {
  ...aaplPayload,
  symbol: 'MSFT',
  name: 'Microsoft Corporation',
  peRatio: '36.2',
  eps: '8.25',
  week52High: '467.12',
  week52Low: '309.45',
  marketCap: '3300000000000',
};

describe('Research fundamentals flow', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    global.fetch = jest.fn();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('triggers fundamentals fetch on mount with relative URL', async () => {
    fetch.mockImplementation((url) => {
      if (url === '/api/fundamentals/AAPL') return jsonResponse(aaplPayload);
      return jsonResponse({}, false, 404);
    });

    render(<Research />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/fundamentals/AAPL');
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('shows loading placeholder before fundamentals resolve', async () => {
    let resolveFetch;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    fetch.mockImplementation(() => pending);

    const { container } = render(<Research />);
    expect(container.querySelector('.res-fund-skeleton')).toBeInTheDocument();

    resolveFetch({ ok: true, status: 200, json: async () => aaplPayload });
    await screen.findByText('P/E Ratio');
  });

  test('logs received fundamentals and renders normalized camelCase values', async () => {
    fetch.mockImplementation((url) => {
      if (url === '/api/fundamentals/AAPL') return jsonResponse(aaplPayload);
      return jsonResponse({}, false, 404);
    });

    render(<Research />);

    expect(await screen.findByText('28.40')).toBeInTheDocument();
    expect(screen.getByText('$7.10')).toBeInTheDocument();
    expect(screen.getByText('$3.02T')).toBeInTheDocument();
    expect(screen.getByText('1.23')).toBeInTheDocument();

    expect(screen.queryByText('999.99')).not.toBeInTheDocument();
    expect(screen.queryByText('$123')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(console.log).toHaveBeenCalledWith('[FUNDAMENTALS] received:', expect.objectContaining({
        symbol: 'AAPL',
        peRatio: '28.4',
        eps: '7.1',
      }));
    });
  });

  test('re-fetches fundamentals and updates UI when symbol changes (AAPL to MSFT)', async () => {
    fetch
      .mockImplementationOnce(() => jsonResponse(aaplPayload))
      .mockImplementationOnce(() => jsonResponse(msftPayload));

    render(<Research />);

    expect(await screen.findByText('$7.10')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/search symbol/i);
    userEvent.clear(searchInput);
    userEvent.type(searchInput, 'MSFT');
    userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenNthCalledWith(2, '/api/fundamentals/MSFT');
    });

    expect(await screen.findByText('$8.25')).toBeInTheDocument();
    expect(screen.getByText('36.20')).toBeInTheDocument();
    expect(screen.queryByText('$7.10')).not.toBeInTheDocument();
  });

  test('surfaces fundamentals fetch errors to UI', async () => {
    fetch.mockImplementation(() => Promise.reject(new Error('Network down')));

    render(<Research />);

    expect(await screen.findByText('Network down')).toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });
});