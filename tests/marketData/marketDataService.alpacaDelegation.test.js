import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockAdapterGetQuote,
  mockAxiosGet,
  mockNormalizePriceData,
} = vi.hoisted(() => ({
  mockAdapterGetQuote: vi.fn(),
  mockAxiosGet: vi.fn(),
  mockNormalizePriceData: vi.fn(),
}));

vi.mock("../../brokers/AlpacaAdapter.js", () => {
  return {
    AlpacaAdapter: class {
      getQuote(symbol, userId) {
        return mockAdapterGetQuote(symbol, userId);
      }
    },
  };
});

vi.mock("axios", () => ({
  default: {
    get: mockAxiosGet,
  },
}));

vi.mock("../../services/normalizePriceData.js", () => ({
  normalizePriceData: mockNormalizePriceData,
}));

import { buildCacheKey, deleteCacheKey } from "../../services/cache.js";
import { getFundamentals, getMarketSnapshot } from "../../services/marketDataService.js";

const SNAPSHOT_SYMBOLS = ["AAPL", "MSFT", "AMZN", "NVDA", "INTC"];

describe("marketDataService Alpaca adapter delegation", () => {
  let originalFetch;
  let originalPolygon;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalPolygon = process.env.POLYGON_API_KEY;

    global.fetch = vi.fn();
    process.env.POLYGON_API_KEY = "polygon-test-key";

    mockAdapterGetQuote.mockReset();
    mockAxiosGet.mockReset();
    mockNormalizePriceData.mockReset();

    deleteCacheKey(buildCacheKey("snapshot", [SNAPSHOT_SYMBOLS.join(",")]));
    deleteCacheKey(buildCacheKey("fundamentals", ["AAPL"]));
  });

  afterEach(() => {
    global.fetch = originalFetch;

    if (originalPolygon === undefined) {
      delete process.env.POLYGON_API_KEY;
    } else {
      process.env.POLYGON_API_KEY = originalPolygon;
    }

    vi.restoreAllMocks();
  });

  it("getMarketSnapshot returns quote objects and delegates via fetchSharedAlpacaQuote to adapter", async () => {
    mockAdapterGetQuote.mockImplementation(async (symbol) => ({
      symbol,
      bid: 100.1,
      ask: 100.2,
      last: 100.15,
      volume: 5000,
    }));

    const result = await getMarketSnapshot("user-snapshot-1");

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(SNAPSHOT_SYMBOLS.length);
    expect(result[0]).toHaveProperty("bid");
    expect(result[0]).toHaveProperty("ask");

    expect(mockAdapterGetQuote).toHaveBeenCalledTimes(SNAPSHOT_SYMBOLS.length);
    for (const symbol of SNAPSHOT_SYMBOLS) {
      expect(mockAdapterGetQuote).toHaveBeenCalledWith(symbol, "shared");
    }

    const alpacaFetchCalls = global.fetch.mock.calls.filter(([url]) =>
      String(url).includes("data.alpaca.markets")
    );
    expect(alpacaFetchCalls.length).toBe(0);
  });

  it("fetchSharedAlpacaQuote has no direct data.alpaca.markets fetch in source", () => {
    const filePath = path.resolve(process.cwd(), "services", "marketDataService.js");
    const source = fs.readFileSync(filePath, "utf8");
    const match = source.match(/async function fetchSharedAlpacaQuote\(symbol\)\s*\{[\s\S]*?\n\}/);

    expect(match).toBeTruthy();
    const functionBody = match ? match[0] : "";

    expect(functionBody).toContain("sharedAdapter.getQuote(symbol, \"shared\")");
    expect(functionBody).not.toContain("data.alpaca.markets");
    expect(functionBody).not.toContain("fetch(");
  });

  it("getFundamentals price computation uses AlpacaAdapter.getQuote rather than raw fetch", async () => {
    mockAdapterGetQuote.mockResolvedValue({
      ap: 150,
      bp: 149.5,
      ask: 150,
      bid: 149.5,
      last: 149.8,
      volume: 4000,
    });

    mockAxiosGet
      .mockResolvedValueOnce({
        data: {
          status: "OK",
          results: {
            type: "CS",
            name: "Apple Inc.",
            description: "Consumer electronics",
            market_cap: 1000000000,
            sic_description: "Technology",
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          results: [
            {
              financials: {
                income_statement: {
                  basic_earnings_per_share: { value: 10 },
                  revenues: { value: 1000000 },
                  net_income_loss: { value: 250000 },
                },
              },
            },
          ],
        },
      });

    mockNormalizePriceData.mockResolvedValue({
      normalized52WeekHigh: 200,
      normalized52WeekLow: 100,
      normalized52WeekSource: "test-source",
    });

    const result = await getFundamentals("aapl", "user-fund-1");

    expect(result).toBeTruthy();
    expect(result.symbol).toBe("AAPL");
    expect(result.peRatio).toBe("15.00");
    expect(mockAdapterGetQuote).toHaveBeenCalledWith("AAPL", "user-fund-1");

    const directAlpacaFetchCalls = global.fetch.mock.calls.filter(([url]) =>
      String(url).includes("data.alpaca.markets")
    );
    expect(directAlpacaFetchCalls.length).toBe(0);

    const alphaVantageGlobalQuoteCalls = mockAxiosGet.mock.calls.filter(([url]) =>
      String(url).includes("function=GLOBAL_QUOTE")
    );
    expect(alphaVantageGlobalQuoteCalls.length).toBe(0);
  });
});
