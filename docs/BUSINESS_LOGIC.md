# Tài Liệu Logic Nghiệp Vụ (Business Logic Specification)
## Hệ Thống AI Morning News Video Generator

---

### 1. Tổng Quan Hệ Thống & Mục Tiêu Nghiệp Vụ

Hệ thống **AI Morning News Video Generator** là nền tảng tự động hóa quy trình tổng hợp, xử lý tin tức, sử dụng Trí tuệ Nhân tạo (Gemini AI) và công nghệ dựng đồ họa (Playwright & FFmpeg) để tạo ra các bản tin ngắn đa chủ đề ở dạng:
- **Slide ảnh truyền thông** (Tin tức đồ họa chuẩn 1080x1920).
- **Video dạng dọc (Vertical Video 9:16)** phục vụ TikTok, Facebook Reels, YouTube Shorts.

Hệ thống hỗ trợ 6 chủ đề tin tức độc lập:
1. **Bản Tin Tổng Hợp (General)**
2. **Thể Thao (Sports)**
3. **Chính Trị (Politics)**
4. **Xã Hội (Society)**
5. **Giải Trí (Entertainment)**
6. **Giá Vàng & Tài Chính (Gold)**

---

### 2. Logic Thu Thập & Phân Loại Nguồn Tin (RSS Sources by Category)

#### 2.1. Phân Loại Nguồn Tin Kênh Đầu Vào
Mỗi nguồn tin RSS khi đăng ký trong bảng `rss_sources` sẽ được gán thuộc tính `category` tương ứng:

| Loại Nguồn (`category`) | Tên Nguồn Tin Tiêu Biểu | Mục Đích Sử Dụng |
| :--- | :--- | :--- |
| **`Thể Thao`** | Thể Thao 247, VnExpress Thể Thao, Thanh Niên Thể Thao, 24h Thể Thao | Dành riêng cho bản tin **Thể Thao** |
| **`Current Affairs`** | VnExpress Thời Sự, Thanh Niên Thời Sự | Dành cho mảng **Chính Trị** và **Xã Hội** |
| **`Society`** | Thanh Niên Đời Sống | Dành cho mảng **Xã Hội** |
| **`Entertainment`** | VnExpress Giải Trí, Thanh Niên Giải Trí, 24h Giải Trí | Dành riêng cho mảng **Giải Trí** |
| **`Gold` / `Finance`** | VnExpress Kinh Doanh, 24h Giá Vàng | Dành cho mảng **Giá Vàng & Tài Chính** |
| **`Featured`** | VnExpress Tin Mới Nhất, Thanh Niên Trang Chủ, 24h Tin Trong Ngày | Dành cho **Bản Tin Tổng Hợp** |

#### 2.2. Cơ Chế Lọc Nguồn Cứng (Strict Dedicated Source Filtering)
Để đảm bảo **nội dung bản tin Thể thao không bị lẫn tin Thời sự, Kinh tế hay Giải trí**:
1. Hệ thống thiết lập mapping `sourceCategoryMap` giữa chủ đề (`TopicKey`) và danh sách ID các nguồn tin thuộc mảng đó.
2. Khi xử lý một chủ đề (ví dụ `sports`):
   - Hệ thống lọc ra tập bài viết `topicArts` đến từ các nguồn thuộc danh mục `Thể Thao`.
   - **Quy tắc nghiêm ngặt**: Nếu `topicArts` có số lượng bài viết lớn hơn hoặc bằng `topN` yêu cầu (>= 10 tin), **pool xếp hạng sẽ đóng kín 100% từ `topicArts`**, tuyệt đối loại bỏ tất cả bài viết thuộc mảng khác.
   - Chỉ khi nguồn chuyên mảng bị thiếu tin (< 10 tin), hệ thống mới bổ sung bài viết từ nguồn chung để đảm bảo đủ dung lượng bản tin.

---

### 3. Logic Lọc Trùng (Deduplication) & Chấm Điểm Ban Đầu (Pre-Scoring)

#### 3.1. Lọc Trùng 3 Cấp Độ (Deduplication)
1. **Lọc theo URL tuyệt đối**: Sử dụng ràng buộc `UNIQUE(url)` trên DB và Set kiểm tra trùng URL trong bộ nhớ.
2. **Lọc theo độ tương đồng tiêu đề (Title Similarity)**:
   - Áp dụng thuật toán so sánh chuỗi văn bản (Dice's Coefficient / Levenshtein Distance).
   - Nếu 2 tiêu đề có độ tương đồng **> 80%**, hệ thống sẽ giữ lại bài viết đăng sớm/nội dung đầy đủ hơn và bỏ bài viết trùng lặp.
3. **Lọc trùng cùng sự kiện**: Phát hiện các từ khóa sự kiện diễn ra cùng thời điểm để tránh đưa 2 bài cùng một sự việc vào bản tin.

#### 3.2. Chấm Điểm Tiền Xử Lý (Pre-Scoring)
Trước khi gửi dữ liệu sang AI, hệ thống tính toán `score` sơ bộ cho mỗi bài viết:
$$\text{Score} = \text{Recency Score} + \text{Source Credibility} + \text{Dedicated Category Boost}$$
- **Recency Score**: Bài viết xuất bản trong vòng vài giờ gần nhất được cộng tới +50 điểm.
- **Dedicated Category Boost**: Tin nằm đúng nguồn chuyên mảng được cộng thêm +30 điểm ưu tiên.

---

### 4. Logic Xếp Hạng AI (Gemini AI Ranking) & Tóm Tắt (Summarization)

#### 4.1. AI Ranking (Chấm Điểm Top N Tin Nóng)
- Hệ thống gửi danh sách JSON tin tức rút gọn (ID, Title, Description, Source) sang Gemini API (`gemini-2.0-flash`).
- **Prompt Yêu Cầu**: AI chấm điểm từ 1-100 và lọc đúng `topN` bài nổi bật nhất chuyên mảng.
- **Cấu hình Timeout & Fallback**:
  - Gửi request đi kèm `timeout: 15000ms` (15 giây).
  - Nếu gặp sự cố API key hết Quota (429), lỗi mạng hoặc timeout 15s ➔ Hệ thống tự động chuyển sang **Rule-based Sorting Fallback** (Xếp hạng theo điểm pre-scoring), đảm bảo hệ thống không bị treo.

#### 4.2. AI Summarization (Tóm Tắt Bản Tin Chuẩn 30-50 Từ)
- Tóm tắt từng tin được chọn thành một đoạn văn ngắn từ **30 đến 50 từ** bằng tiếng Việt súc tích, câu văn lôi cuốn người xem video.
- **Fallback**: Nếu AI lỗi, hàm `generateMockSummary()` sẽ tự động phân tích và chuẩn hóa độ dài văn bản gốc về khung 30-50 từ.

---

### 5. Logic Quy Trình Tạo Đồ Họa Slide & Video

1. **Render Slide Ảnh PNG (Playwright)**:
   - Sử dụng Playwright headless Chromium mở template HTML5/CSS3 (`news-card.html`).
   - Nạp dữ liệu tiêu đề, tóm tắt, ảnh thumbnail, logo nguồn tin và thời gian.
   - Chờ load Google Fonts hoàn tất ➔ Chụp ảnh màn hình độ phân giải 1080x1920 PNG.
2. **Tổng Hợp Video MP4 (FFmpeg & Edge TTS)**:
   - Chuyển văn bản tóm tắt sang giọng đọc tiếng Việt bằng Edge TTS (`vi-VN-NamMinhNeural`).
   - Dùng FFmpeg ghép nối các hình ảnh PNG, audio voice và nhạc nền (`bg-music.mp3`) thành file video MP4 dọc 9:16.

---

### 6. Logic Lưu Trữ Kho & Đồng Bộ Cloud (Storage Architecture)

#### 6.1. Lưu Trữ Cục Bộ (Local Output)
- Ảnh slide: `output/slides/{topic_folder}/cover.png`, `slide_01.png`, `slide_02.png`...
- Video hoàn chỉnh: `output/videos/{video_filename}.mp4`

#### 6.2. Lưu Trữ Cloud (Google Drive API Integration)
- **Cơ chế Xác thực Ưu tiên**:
  - **OAuth 2.0 User Credentials** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`): Sử dụng dung lượng tài khoản Google cá nhân thật (15GB / 2TB / 5TB).
  - **Service Account (JWT)**: Dùng fallback khi chưa cấu hình OAuth2.
- **Cấu trúc Cây Thư Mục Drive**:
  - Root Folder: ID cấu hình trong `GOOGLE_DRIVE_FOLDER_ID`.
  - Folder Ngày: Ví dụ `Thể Thao 09-08-2026`
  - Folder Con: Ví dụ `Thể Thao 09-08-2026 - Thể Thao`
- **Phân Quyền**: Tự động cấp quyền `anyone -> reader` để có thể truy cập xem công khai qua URL web.

---

### 7. Thời Gian Lưu Trữ & Logic Tự Động Xóa Dữ Liệu (Retention & DB Cleanup)

#### 7.1. Cửa Sổ Xử Lý Tin Nóng (24h Active Window)
- Hệ thống chỉ truy vấn và lấy các bài viết tin tức có `pub_date` nằm trong vòng **24 giờ gần nhất** (`gte("pub_date", cutoffDate)`).

#### 7.2. Chính Sách Tự Động Dọn Dẹp Dữ Liệu (7-Day Auto-Cleanup Logic)
Nhằm tránh phình to cơ sở dữ liệu Supabase và đĩa cứng local server:

1. **Xóa Bài Viết Cũ Trong Database (`news_articles`)**:
   - Các bài viết RSS lưu tạm chỉ phục vụ cho việc chấm điểm và lọc trùng trong tuần.
   - Hàng ngày, tiến trình dọn dẹp thực thi câu lệnh SQL xóa dữ liệu quá 7 ngày:
     ```sql
     DELETE FROM news_articles 
     WHERE created_at < NOW() - INTERVAL '7 days';
     ```
2. **Dọn Dẹp Tiến Trình Render Jobs (`render_jobs`)**:
   - Xóa các nhật ký render cũ hơn 7 ngày:
     ```sql
     DELETE FROM render_jobs 
     WHERE created_at < NOW() - INTERVAL '7 days';
     ```
3. **Dọn Dẹp Đĩa Cứng Local (`output/slides/`)**:
   - Trước mỗi lượt render bài viết chủ đề mới, hệ thống tự động xóa sạch các file `.png` cũ trong thư mục output local tương ứng để sẵn sàng cho bản tin tiếp theo.
