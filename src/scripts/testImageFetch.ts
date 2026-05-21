const url1 = "https://i2-vnexpress.vnecdn.net/2026/05/21/download94-1779323555-9693-1779323664.jpg?w=1200&h=0&q=100&dpr=1&fit=crop&s=r3-VaDn1Hu4jBdbGsDsPWA";

const u3 = new URL(url1);
u3.search = ""; // remove all params

async function testFetch(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    console.log(`URL: ${url} \nStatus: ${res.status}`);
  } catch (err) {
    console.log(`URL: ${url} \nError: ${err}`);
  }
}

async function run() {
  await testFetch(u3.toString());
}
run();
