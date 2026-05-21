export async function fetchOgImage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return "";
    const html = await res.text();
    const metaTagMatch = html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]*>/i);
    if (!metaTagMatch) return "";
    const contentMatch = metaTagMatch[0].match(/content=["']([^"']+)["']/i);
    if (contentMatch && contentMatch[1]) {
      return contentMatch[1];
    }
  } catch (err) {
    console.error(`fetchOgImage failed for ${url}: ${err}`);
  }
  return "";
}

async function run() {
  const url = "https://vnexpress.net/linh-my-do-bo-kham-xet-tau-iran-vi-pham-phong-toa-5076335.html";
  console.log("ogImage:", await fetchOgImage(url));
}

run();
