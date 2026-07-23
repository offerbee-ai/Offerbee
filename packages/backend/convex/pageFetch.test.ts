import { describe, expect, it, vi } from "vitest";
import { fetchIssuerPage, stripHtml } from "./pageFetch";

// Fetch-first extraction: the pipeline pulls the issuer's own card page and
// hands the LLM full page text instead of web-search snippets. These tests
// cover the HTML→text reduction and the fetch wrapper's failure modes (every
// failure returns null so verifyOneCard falls back to web search).

describe("stripHtml", () => {
  it("drops script/style/noscript content entirely", () => {
    const text = stripHtml(
      `<html><head><style>.fee{color:red}</style>` +
        `<script>var annualFee = 1;</script></head>` +
        `<body><noscript>enable js</noscript><p>Annual fee $895</p></body></html>`,
    );
    expect(text).toContain("Annual fee $895");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("var annualFee");
    expect(text).not.toContain("enable js");
  });

  it("strips tags and comments but keeps their text", () => {
    const text = stripHtml(
      `<!-- promo --><div><h2>Benefits</h2><ul><li>$200 airline credit</li>` +
        `<li>Lounge <b>access</b></li></ul></div>`,
    );
    expect(text).toContain("Benefits");
    expect(text).toContain("$200 airline credit");
    expect(text).toContain("Lounge access");
    expect(text).not.toContain("promo");
    expect(text).not.toContain("<");
  });

  it("turns block boundaries into line breaks", () => {
    const text = stripHtml(`<p>Annual fee</p><p>$895</p>`);
    expect(text.split("\n").map((l) => l.trim())).toEqual([
      "Annual fee",
      "$895",
    ]);
  });

  it("decodes named, decimal and hex entities", () => {
    expect(stripHtml("Points &amp; Miles &#36;95 &#x24;95&nbsp;fee")).toBe(
      "Points & Miles $95 $95 fee",
    );
  });

  it("collapses runs of whitespace and blank lines", () => {
    const text = stripHtml(
      `<div>  A   card\t\tpage  </div><br><br><br><div>next</div>`,
    );
    expect(text).toBe("A card page\n\nnext");
  });
});

// Minimal Response-like stub for the injected fetch.
function fakeResponse(opts: {
  ok?: boolean;
  status?: number;
  url?: string;
  contentType?: string | null;
  body?: string;
}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    url: opts.url ?? "",
    headers: { get: () => opts.contentType ?? "text/html; charset=utf-8" },
    text: async () => opts.body ?? "",
  } as unknown as Response;
}

const LONG_PAGE =
  `<html><body><h1>The Platinum Card</h1><p>Annual fee $895</p>` +
  `<p>${"Benefit detail. ".repeat(100)}</p></body></html>`;

describe("fetchIssuerPage", () => {
  it("returns stripped text and the post-redirect final URL", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse({ body: LONG_PAGE, url: "https://www.example.com/card/" }),
    );
    const page = await fetchIssuerPage("https://example.com/card", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(page).not.toBeNull();
    expect(page!.text).toContain("Annual fee $895");
    expect(page!.text).not.toContain("<p>");
    expect(page!.finalUrl).toBe("https://www.example.com/card/");
  });

  it("sends a browser user-agent (issuer pages bot-wall default UAs)", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      fakeResponse({ body: LONG_PAGE }),
    );
    await fetchIssuerPage("https://example.com/card", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const init = fetchImpl.mock.calls[0][1]!;
    expect((init.headers as Record<string, string>)["User-Agent"]).toContain(
      "Mozilla/5.0",
    );
    expect(init.redirect).toBe("follow");
  });

  it("returns null on HTTP errors", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse({ ok: false, status: 403, body: LONG_PAGE }),
    );
    expect(
      await fetchIssuerPage("https://example.com/card", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).toBeNull();
  });

  it("returns null on non-HTML content types", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse({ contentType: "application/pdf", body: LONG_PAGE }),
    );
    expect(
      await fetchIssuerPage("https://example.com/card.pdf", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).toBeNull();
  });

  it("returns null when the stripped body is a JS shell (too short)", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse({ body: "<html><body><div id='root'></div></body></html>" }),
    );
    expect(
      await fetchIssuerPage("https://example.com/card", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).toBeNull();
  });

  it("returns null when fetch throws (network / timeout abort)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    expect(
      await fetchIssuerPage("https://example.com/card", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).toBeNull();
  });

  it("caps the returned text length", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse({ body: `<p>${"x".repeat(5_000)}</p>` }),
    );
    const page = await fetchIssuerPage("https://example.com/card", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxChars: 1_000,
    });
    expect(page!.text.length).toBe(1_000);
  });
});
