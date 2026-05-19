---
title: WhatNew AI Auto Publisher
emoji: 📰
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# 📰 WhatNew AI Auto Publisher

Ứng dụng tự động lấy tin tức buổi sáng (RSS), tổng hợp thông minh bằng Google Gemini AI, tự động thiết kế slide ảnh tin tức đẹp mắt bằng Playwright, dựng video lồng tiếng thuyết minh sinh động bằng FFmpeg và tự động đăng tải trực tiếp lên TikTok!

Hệ thống được đóng gói bằng Docker và vận hành ổn định trên **Hugging Face Spaces** với cấu hình miễn phí cực khủng 16GB RAM / 2 vCPUs!

---

## ⚡ Hướng Dẫn Triển Khai Lên Hugging Face Spaces (5 Phút)

### Bước 1: Tạo Space trên Hugging Face
1. Truy cập [huggingface.co](https://huggingface.co) và đăng ký/đăng nhập tài khoản miễn phí.
2. Nhấp chọn **`Spaces`** ở thanh menu trên cùng -> Chọn **`Create new Space`**.
3. Điền các thông tin:
   * **Space name**: Ví dụ: `whatnew-ai`
   * **License**: `mit` (hoặc để trống)
   * **Select the Space SDK**: Chọn **`Docker`** 
   * **Docker template**: Chọn **`Blank`**
   * **Space visibility**: Chọn **`Public`** hoặc **`Private`** (nên chọn Private nếu bạn muốn giữ kín giao diện Dashboard).
4. Nhấn nút **`Create Space`** ở cuối trang để khởi tạo!

### Bước 2: Đẩy mã nguồn từ máy tính lên Space của bạn
Hugging Face Space thực chất là một kho Git. Bạn có hai cách cực kỳ đơn giản để đưa mã nguồn lên:

#### Cách 1: Tải tệp trực tiếp lên Web (Dành cho người không dùng Git)
1. Trên giao diện Space vừa tạo, vào tab **`Files and versions`**.
2. Nhấn nút **`Add file`** -> Chọn **`Upload files`**.
3. Kéo toàn bộ các tệp và thư mục trong thư mục `D:\WhatNew` của bạn thả vào đây (Lưu ý: bỏ qua thư mục `node_modules` và thư mục `output` để tải lên nhanh hơn).
4. Nhấn **`Commit changes`** để lưu lại. Hệ thống sẽ tự động bắt đầu build và chạy online!

#### Cách 2: Sử dụng dòng lệnh Git (Khuyên dùng - Nhanh nhất)
Mở Command Prompt/PowerShell tại thư mục `D:\WhatNew` và chạy các lệnh sau:
```bash
# 1. Khởi tạo Git nếu chưa có
git init

# 2. Tạo liên kết với Hugging Face Space (Thay tên tài khoản và tên Space của bạn)
git remote add hf https://huggingface.co/spaces/<TÊN_TÀI_KHOẢN_CỦA_BẠN>/<TÊN_SPACE_CỦA_BẠN>

# 3. Thêm tất cả tệp tin
git add .

# 4. Ghi nhận thay đổi
git commit -m "Deploy WhatNew to Hugging Face Spaces"

# 5. Đẩy code lên đám mây để khởi động build!
git push -f hf master:main
```

### Bước 3: Cấu hình khóa bảo mật (Biến môi trường)
Vì các khóa bảo mật (như Gemini Key, TikTok Token, Supabase Key) không được đẩy lên Git công khai để đảm bảo an toàn, bạn cấu hình trực tiếp trên Hugging Face như sau:
1. Vào tab **`Settings`** của Space trên Hugging Face.
2. Cuộn xuống phần **`Variables and secrets`** -> Nhấp vào nút **`New secret`**.
3. Thêm đầy đủ các biến bảo mật từ tệp `.env` ở máy tính của bạn:
   * `GEMINI_API_KEY`
   * `SUPABASE_URL`
   * `SUPABASE_ANON_KEY`
   * `GOOGLE_DRIVE_FOLDER_ID`
   * `TIKTOK_ACCESS_TOKEN`
4. Hệ thống sẽ tự động khởi động lại và áp dụng ngay các khóa này tuyệt đối an toàn bảo mật!
