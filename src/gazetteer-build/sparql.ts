const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'SlaktforskningBot/1.0 (genealogy gazetteer builder)';

export { SPARQL_ENDPOINT, USER_AGENT };

/** Sleep for ms milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Fetch with retry on 429/5xx. */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<Response> {
  const { attempts = 3, delayMs = 2000 } = opts;
  let lastError: Error | null = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, init);
      if (response.status === 429 || response.status >= 500) {
        if (i < attempts - 1) {
          await sleep(delayMs * (i + 1));
          continue;
        }
      }
      return response;
    } catch (e) {
      lastError = e as Error;
      if (i < attempts - 1) {
        await sleep(delayMs * (i + 1));
      }
    }
  }
  throw lastError ?? new Error('fetchWithRetry: all attempts failed');
}

/** Fetch SPARQL results from Wikidata. Returns the bindings array. */
export async function sparqlFetch<T = Record<string, { value: string }>>(
  query: string,
): Promise<T[]> {
  const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/sparql-results+json',
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SPARQL query failed: ${response.status} ${response.statusText}\n${body}`);
  }

  const json = await response.json() as {
    results: { bindings: T[] };
  };

  return json.results.bindings;
}
