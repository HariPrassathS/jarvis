// ──────────────────────────────────────────────
// Tool: Web Search — Multi-Source (Wikipedia + DuckDuckGo)
// Sub-second response time with fallback and anti-loop guards
// ──────────────────────────────────────────────

/**
 * Search the web using Wikipedia and DuckDuckGo in parallel with strict timeout.
 * Returns concise synthesized results.
 */
export async function webSearch(query: string): Promise<string> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return 'Please provide a search query.';
  }

  const timeoutMs = 3000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 1. Run Wikipedia search and DuckDuckGo in parallel
    const wikiPromise = (async () => {
      try {
        const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
          cleanQuery
        )}&utf8=&format=json&origin=*`;
        const res = await fetch(wikiUrl, { signal: controller.signal });
        const data = await res.json();
        const items = data.query?.search?.slice(0, 2) || [];
        return items.map((item: { title: string; snippet: string }) => {
          const cleanSnippet = item.snippet.replace(/<[^>]+>/g, '');
          return `• ${item.title}: ${cleanSnippet}`;
        });
      } catch {
        return [];
      }
    })();

    const ddgPromise = (async () => {
      try {
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(
          cleanQuery
        )}&format=json&no_html=1&skip_disambig=1`;
        const res = await fetch(ddgUrl, { signal: controller.signal });
        const data = await res.json();
        const results: string[] = [];
        if (data.AbstractText || data.Abstract) {
          results.push(`${data.Heading || 'Overview'}: ${data.AbstractText || data.Abstract}`);
        }
        if (data.Answer) {
          results.push(`Instant Answer: ${data.Answer}`);
        }
        if (data.RelatedTopics && data.RelatedTopics.length > 0) {
          const topTopics = data.RelatedTopics.filter((t: { Text?: string }) => t.Text).slice(0, 2);
          for (const t of topTopics) {
            results.push(`• ${t.Text}`);
          }
        }
        return results;
      } catch {
        return [];
      }
    })();

    const [wikiResults, ddgResults] = await Promise.all([wikiPromise, ddgPromise]);
    clearTimeout(timeoutId);

    const combined = [...ddgResults, ...wikiResults];

    if (combined.length === 0) {
      return `No live web intelligence found for "${cleanQuery}". Note: Do not attempt additional searches. Answer the user directly using your internal knowledge base.`;
    }

    return `Search Intelligence for "${cleanQuery}":\n${combined.slice(0, 4).join('\n')}\n(Use this intelligence to answer directly. Do not call web_search again for this request.)`;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Web search error:', error);
    return `Search service temporarily unavailable for "${cleanQuery}". Answer directly based on your core knowledge.`;
  }
}

