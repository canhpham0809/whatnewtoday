const fetch = require('node-fetch');
require('dotenv').config();

const BUFFER_API_URL = 'https://api.buffer.com';
const API_KEY = process.env.BUFFER_API_KEY;

if (!API_KEY) {
  console.error("Lỗi: Không tìm thấy BUFFER_API_KEY trong file .env");
  process.exit(1);
}

async function getChannels() {
  const query = `
    query { 
      channels { 
        id 
        name 
        service
      } 
    }
  `;

  try {
    const response = await fetch(BUFFER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query })
    });

    const result = await response.json();
    
    if (result.errors) {
      console.error("Lỗi từ Buffer API:", JSON.stringify(result.errors, null, 2));
      return;
    }

    console.log("=== DANH SÁCH CÁC KÊNH ĐÃ KẾT NỐI VỚI BUFFER ===");
    const channels = result.data.channels;
    
    channels.forEach(channel => {
      console.log(`- Nền tảng: ${channel.service ? channel.service.toUpperCase() : 'UNKNOWN'}`);
      console.log(`- Tên tài khoản: ${channel.name}`);
      console.log(`- CHANNEL ID: ${channel.id}`);
      console.log("-------------------------");
    });
    
    console.log("Hãy copy mã CHANNEL ID của TikTok và dán vào file .env (biến BUFFER_TIKTOK_CHANNEL_ID) nhé!");

  } catch (error) {
    console.error("Lỗi khi kết nối:", error);
  }
}

getChannels();
