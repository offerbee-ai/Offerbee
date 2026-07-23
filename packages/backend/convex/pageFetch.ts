// Fetch-first extraction source: pull the issuer's own card page and reduce it
// to plain text for LLM extraction. Search-snippet extraction (the OpenRouter
// `web` plugin) cannot see full pages, which makes array fields (benefits,
// earn categories) structurally unverifiable; feeding the model the actual
// page text fixes that. Pure module — fetch is injectable so it unit-tests
// without network. Callers fall back to web search when this returns null.

export type FetchedPage = { text: string; finalUrl: string };

// Issuer pages (chase/amex/capitalone…) serve full content to a browser UA;
// default-UA fetches can hit bot walls.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 15_000;
// Ceiling on stripped text handed to the LLM (~30k tokens worst case). Most
// issuer pages strip+dedup to well under this; the mega-pages that motivated
// raising it (Chase Sapphire Reserve ran past the old 60k cap and lost its
// benefit-dense tail) now fit. dedupeBlocks recovers most of the budget, so
// this is a safety ceiling rather than the common case.
const MAX_TEXT_CHARS = 120_000;
// A stripped page shorter than this is a JS-only shell or a bot wall, not the
// card's terms — web-search fallback beats extracting from nothing.
const MIN_TEXT_CHARS = 500;
// Substantial lines (benefit/term paragraphs) are deduped; shorter lines
// (headers, "4X POINTS", footnote markers) pass through so page structure
// survives. Issuer accordions render each benefit block 2-3×, so exact-line
// dedup at this threshold recovers 25-40% of the character budget without
// touching unique content.
const DEDUP_MIN_LEN = 40;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ENTITIES[name])
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

// Drop repeated substantial lines while preserving order and short structural
// lines. Issuer pages (Chase/Amex accordions) render each benefit paragraph
// more than once — collapsing the repeats keeps the benefit-dense content
// under MAX_TEXT_CHARS on mega-pages instead of truncating it away.
function dedupeBlocks(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    if (line.length >= DEDUP_MIN_LEN) {
      if (seen.has(line)) continue;
      seen.add(line);
    }
    out.push(line);
  }
  return out;
}

// HTML -> readable plain text. Regex-based on purpose: issuer pages are the
// input, and the LLM tolerates imperfect text — a full parser buys nothing.
export function stripHtml(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const lines = decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim());
  return dedupeBlocks(lines)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Fetch an issuer page as plain text. Follows redirects (biltrewards.com/card
// 308s to its canonical URL); returns null on any failure — HTTP error,
// non-HTML payload, timeout, or a stripped body too short to be the real page.
export async function fetchIssuerPage(
  url: string,
  opts?: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    maxChars?: number;
  },
): Promise<FetchedPage | null> {
  const doFetch = opts?.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts?.timeoutMs ?? FETCH_TIMEOUT_MS,
  );
  try {
    const res = await doFetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) {
      console.error(`pageFetch: HTTP ${res.status} for ${url}`);
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/html|text/i.test(contentType)) {
      console.error(`pageFetch: non-HTML content-type '${contentType}' for ${url}`);
      return null;
    }
    const text = stripHtml(await res.text());
    if (text.length < MIN_TEXT_CHARS) {
      console.error(
        `pageFetch: stripped body too short (${text.length} chars) for ${url}`,
      );
      return null;
    }
    return {
      text: text.slice(0, opts?.maxChars ?? MAX_TEXT_CHARS),
      finalUrl: res.url || url,
    };
  } catch (e) {
    console.error(`pageFetch: fetch failed for ${url}`, e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
