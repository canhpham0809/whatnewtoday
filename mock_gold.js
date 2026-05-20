const fs = require("fs");
const path = require("path");

const historyFile = path.resolve(__dirname, "data/last_gold_price.json");
const dataDir = path.dirname(historyFile);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const mockData = [
  {
    store: "Vàng Thế Giới",
    storeEn: "world",
    worldUSD: "$4,000.00",
    worldVND: "N/A"
  },
  {
    store: "Vàng SJC",
    storeEn: "sjc",
    nhaN: { buy: "15,800", sell: "16,000" },
    vang998: { buy: "15,000", sell: "15,500" },
    vang999: { buy: "15,500", sell: "15,800" }
  }
];
fs.writeFileSync(historyFile, JSON.stringify(mockData, null, 2));
console.log("Mock data written.");
