/** OpenCode Zen Jev System One client (no local model or Docker required). */
export const DEFAULT_OPENCODE_JEV_URL = 'https://opencode.ai/zen/v1/systemone';

/** Restrict credential-bearing requests to the official endpoint or local tests. */
export function validateOpenCodeUrl(raw) {
  let url;
  try { url = new URL(raw); }
  catch { throw new Error('--opencode-url must be a valid URL'); }
  const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const official = url.protocol === 'https:' && url.hostname === 'opencode.ai' &&
    url.port === '' && ['/zen/v1/systemone', '/inference/systemone/v1/systemone']
      .includes(url.pathname);
  if (url.username || url.password || url.search || url.hash ||
      !(official || (localhost && ['http:', 'https:'].includes(url.protocol) &&
        url.pathname.startsWith('/')))) {
    throw new Error('--opencode-url must use the official OpenCode Jev endpoint or localhost for testing');
  }
  return url;
}

export function createOpenCodeClient(args, fetchImpl = fetch) {
  const url = validateOpenCodeUrl(args.opencodeUrl || DEFAULT_OPENCODE_JEV_URL);
  const key = process.env.OPENCODE_API_KEY || process.env.OPENCODE_ZEN_API_KEY;
  if (!key?.trim()) {
    throw new Error('OpenCode Zen requires OPENCODE_API_KEY (or OPENCODE_ZEN_API_KEY). Obtain a Zen API key from OpenCode Console.');
  }
  const headers = {
    'content-type': 'application/json',
    'user-agent': 'custom-skills-jev-classifier/1.0',
    authorization: 'Bearer ' + key,
  };

  async function predict(state, questions) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST', headers,
        body: JSON.stringify({model:args.model, state, questions}),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      throw new Error('OpenCode Jev request failed: ' + error.message);
    }
    if (!response.ok) {
      // Never include any request headers, API keys, or untrusted response bodies.
      throw new Error('OpenCode Jev HTTP ' + response.status +
        (response.status === 401 || response.status === 403
          ? ' (check the Zen API key and account access)'
          : response.status === 429 ? ' (rate limit: retry later)' : ''));
    }
    let result;
    try { result = await response.json(); }
    catch { throw new Error('OpenCode Jev returned invalid JSON'); }
    if (!result?.answers || typeof result.answers !== 'object' ||
        Array.isArray(result.answers)) {
      throw new Error('OpenCode Jev returned an invalid System One response');
    }
    return result;
  }
  return {
    predict,
    // OpenCode documents a single-state System One endpoint, not a batch endpoint.
    // Run sequentially to avoid unnecessary free-tier bursts and keep order stable.
    predictBatch: async (states, questions) => {
      const results = [];
      for (const state of states) results.push(await predict(state, questions));
      return results;
    },
  };
}
