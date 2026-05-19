Bạn là Senior Fullstack Engineer.

Hãy đọc file concept.md trong project và triển khai source code MVP cho hệ thống “AI Morning News Video Generator”.

Mục tiêu MVP:
- Chạy bằng Node.js
- Lấy tin từ RSS
- Chuẩn hóa dữ liệu tin tức
- Loại bỏ tin trùng
- Dùng Gemini API để chọn Top 20 tin nóng
- Dùng Gemini API để tóm tắt mỗi tin 30–50 chữ
- Render mỗi tin thành ảnh PNG 1080x1920 bằng Playwright
- Ghép các ảnh thành video MP4 9:16 bằng FFmpeg
- Upload video và ảnh lên Google Drive
- Lưu metadata vào Supabase

Yêu cầu kỹ thuật:
- Dùng TypeScript
- Code clean, dễ mở rộng
- Có cấu trúc thư mục rõ ràng
- Dùng biến môi trường trong file .env
- Có file README.md hướng dẫn chạy
- Có file .env.example
- Có script npm để chạy workflow thủ công
- Có script npm để chạy scheduler 8:00 sáng giờ Việt Nam
- Có xử lý lỗi và logging cơ bản
- Không hard-code API key
- Nếu chưa có API thật thì tạo mock/fallback hợp lý

Tech stack bắt buộc:
- Node.js
- TypeScript
- rss-parser
- Gemini API
- Supabase JS client
- Google Drive API
- Playwright
- FFmpeg / fluent-ffmpeg
- node-cron

Cấu trúc thư mục mong muốn:

src/
  config/
    env.ts
  modules/
    rss/
      fetchRss.ts
      normalizeNews.ts
    news/
      deduplicateNews.ts
      scoreNews.ts
    ai/
      geminiClient.ts
      rankNews.ts
      summarizeNews.ts
    render/
      renderNewsCard.ts
      createVideo.ts
    storage/
      googleDrive.ts
    database/
      supabaseClient.ts
      repositories.ts
    scheduler/
      cron.ts
  templates/
    news-card.html
  utils/
    logger.ts
    date.ts
  main.ts

assets/
  bg-music.mp3

output/

database/
  schema.sql

Nhiệm vụ cần thực hiện:
1. Tạo toàn bộ source code theo cấu trúc trên.
2. Tạo database/schema.sql cho Supabase gồm các bảng:
   - rss_sources
   - news_articles
   - video_history
   - render_jobs
3. Tạo file .env.example gồm:
   - GEMINI_API_KEY
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - GOOGLE_CLIENT_EMAIL
   - GOOGLE_PRIVATE_KEY
   - GOOGLE_DRIVE_FOLDER_ID
   - CRON_TIME
4. Tạo workflow chính:
   - fetch RSS
   - normalize
   - deduplicate
   - rank bằng AI
   - summarize bằng AI
   - render PNG
   - create MP4
   - upload Drive
   - save metadata Supabase
5. Tạo template HTML/CSS đẹp, hiện đại, dễ đọc trên mobile.
6. Tạo README.md hướng dẫn:
   - cài đặt
   - cấu hình API key
   - setup Supabase
   - setup Google Drive API
   - chạy local
   - chạy scheduler
7. Trước khi code, hãy phân tích concept.md và liệt kê kế hoạch triển khai ngắn gọn.
8. Sau đó tạo code theo từng file.
9. Ưu tiên MVP chạy được trước, chưa cần frontend admin.
10. Không tự ý thêm tính năng ngoài phạm vi MVP.

Output mong muốn:
- Source code hoàn chỉnh
- README.md
- schema.sql
- .env.example
- package.json
- hướng dẫn chạy lệnh:

npm install
npm run dev
npm run build
npm run start
npm run scheduler