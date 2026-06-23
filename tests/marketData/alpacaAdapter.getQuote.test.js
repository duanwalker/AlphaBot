import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AlpacaAdapter } from "../../brokers/AlpacaAdapter.js";

function mockFetchOk(jsonBody) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(jsonBody),
    text: () => Promise.resolve(""),
  });
}

describe("AlpacaAdapter.getQuote", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns an object with bid and ask numbers", async () => {
    const adapter = new AlpacaAdapter({
      apiKey: "test-key",
      secretKey: "test-secret",
      baseUrl: "https://paper-api.alpaca.markets",
    });

    global.fetch = mockFetchOk({
      quote: {
        bp: 198.11,
        ap: 198.22,
        t: "2026-06-23T13:30:00Z",
      },
    });

    const quote = await adapter.getQuote("aapl", "user-quote-1");

    expect(quote).toBeTruthy();
    expect(quote).toHaveProperty("bid");
    expect(quote).toHaveProperty("ask");

    expect(typeof quote.bid).toBe("number");
    expect(typeof quote.ask).toBe("number");

    // Alpaca latest quotes endpoint returns best bid/ask; last trade price/size
    // require a separate latest trades endpoint call.
    expect(quote.last ?? null).toBeNull();
    expect(quote.volume ?? null).toBeNull();
  });

  it("calls the latest Alpaca stock quote endpoint with auth headers", async () => {
    const adapter = new AlpacaAdapter({
      apiKey: "test-key",
      secretKey: "test-secret",
      baseUrl: "https://paper-api.alpaca.markets",
    });

    global.fetch = mockFetchOk({
      quote: { bp: 100.5, ap: 101.0, t: "2026-06-23T13:30:00Z" },
    });

    await adapter.getQuote("msft", "user-quote-2");

    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("https://data.alpaca.markets/v2/stocks/MSFT/quotes/latest");

    expect(options).toBeTruthy();
    expect(options.headers).toBeTruthy();
    expect(options.headers["APCA-API-KEY-ID"]).toBe("test-key");
    expect(options.headers["APCA-API-SECRET-KEY"]).toBe("test-secret");
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("throws on upstream error", async () => {
    const adapter = new AlpacaAdapter({
      apiKey: "test-key",
      secretKey: "test-secret",
      baseUrl: "https://paper-api.alpaca.markets",
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve("Service Unavailable"),
    });

    await expect(adapter.getQuote("nvda", "user-quote-3")).rejects.toThrow("Alpaca 503");
  });
});
