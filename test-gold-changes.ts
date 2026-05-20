import { scrapeGoldPrices } from "./src/modules/news/goldPrice";

async function main() {
  const res = await scrapeGoldPrices();
  console.log(JSON.stringify(res, null, 2));
}

main();
