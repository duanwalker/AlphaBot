// Fetches JSON, guarding against non-OK / non-JSON responses (e.g. a dev-server
// proxy error, a 500 HTML page, a rate-limit block) so callers never hand a
// plain-text/HTML body to JSON.parse and leak a raw parser error to the UI.
export async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('Unable to load data, try again shortly');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('application/json')) {
    const bodyPreview = await response.text().catch(() => '');
    console.error(`[fetchJson] ${url} -> ${response.status} ${contentType}: ${bodyPreview.slice(0, 300)}`);
    throw new Error('Unable to load data, try again shortly');
  }

  try {
    return await response.json();
  } catch (err) {
    console.error(`[fetchJson] ${url} returned invalid JSON:`, err.message);
    throw new Error('Unable to load data, try again shortly');
  }
}

export default fetchJson;
