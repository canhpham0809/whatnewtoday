# concept.md

# AI Morning News Video Generator

## Project Overview

AI Morning News Video Generator là hệ thống tự động tổng hợp tin tức nóng hổi mỗi ngày từ các trang báo điện tử, sử dụng AI để tóm tắt nội dung và tạo thành video slideshow dạng dọc (vertical video) phục vụ cho:

- TikTok
- Facebook Reels
- YouTube Shorts
- Morning News Digest
- Internal Daily Briefing

Hệ thống sẽ tự động chạy lúc:

```text
08:00 AM (Asia/Ho_Chi_Minh)
Main Workflow
Cron Scheduler
↓
Fetch RSS News
↓
Normalize News Data
↓
Deduplicate News
↓
AI Hot News Ranking
↓
AI Summary Generation
↓
Render News Cards PNG
↓
Create Slideshow Video
↓
Upload to Google Drive
↓
Save Metadata to Supabase
Core Goals
Main Objectives
tự động hóa quy trình tạo bản tin sáng
giảm thời gian biên tập thủ công
tạo nội dung video ngắn nhanh chóng
tối ưu cho nền tảng vertical video
dễ mở rộng sang social media automation
Technology Stack
Layer	Technology
Backend	Node.js
Frontend Admin (future)	Next.js
Database	Supabase
AI	Gemini API
Image Rendering	Playwright
Video Rendering	FFmpeg
Scheduler	Cron Job / GitHub Actions
Storage	Google Drive API
RSS Parsing	rss-parser
HTML Template	HTML/CSS
System Architecture
┌─────────────────────┐
│   RSS News Sources  │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Fetch RSS Articles  │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Normalize Raw Data  │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Deduplicate News    │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Gemini AI Ranking   │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Gemini AI Summary   │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Render PNG Cards    │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ FFmpeg Video Build  │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Upload Google Drive │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Save Metadata DB    │
└─────────────────────┘
News Sources

Nguồn dữ liệu chính:

VnExpress
Tuổi Trẻ
Thanh Niên
VietnamNet
Dân Trí
ZNews
CafeF
Reuters
BBC
AP

Dữ liệu lấy từ RSS feed để giảm phụ thuộc vào scraping HTML.

News Data Structure
Raw Article Format
{
  "title": "",
  "url": "",
  "summary_raw": "",
  "image_url": "",
  "source": "",
  "published_at": "",
  "category": ""
}
News Processing
Normalize Data

Chuẩn hóa dữ liệu từ nhiều nguồn báo khác nhau về cùng một format.

Deduplicate

Loại bỏ các tin trùng nhau bằng:

URL
similar title
semantic similarity
same event detection

Ví dụ:

"Giá vàng tăng mạnh hôm nay"
"Giá vàng tiếp tục tăng"

=> cùng một sự kiện
AI Ranking System

Gemini AI sẽ chấm điểm độ nóng của tin dựa trên:

thời gian đăng
mức độ ảnh hưởng
category
xuất hiện trên nhiều báo
mức độ viral
chất lượng ảnh thumbnail

Ví dụ:

Politics      +15
Economy       +12
Weather       +10
Technology    +8
Sports        +5
Celebrity     +2

Sau đó chọn:

Top 20 hottest news
AI Summary Generation

Gemini AI sẽ:

viết lại title ngắn gọn
tạo summary 30–50 chữ
tránh clickbait
tránh trùng lặp
dễ đọc trên mobile video

Ví dụ:

{
  "title": "Mưa lớn tại miền Bắc",
  "summary": "Nhiều tỉnh miền Bắc ghi nhận mưa lớn kéo dài, nguy cơ ngập úng và sạt lở tại các khu vực vùng núi."
}
News Card Rendering

Mỗi tin sẽ được render thành 1 ảnh PNG.

Layout
┌────────────────────────┐
│                        │
│       NEWS IMAGE       │
│                        │
├────────────────────────┤
│ TITLE                  │
│                        │
│ Summary 30–50 words    │
│                        │
│ Source | Time          │
└────────────────────────┘
Resolution
1080 x 1920
9:16 vertical
Rendering Technology
HTML/CSS
Playwright screenshot rendering
Video Generation

Tất cả ảnh PNG sẽ được ghép thành video slideshow.

Video Specs
Format: MP4
Codec: H264
FPS: 30
Resolution: 1080x1920
Aspect Ratio: 9:16
Video Effects
zoom nhẹ
pan nhẹ
fade transition
background music
Rendering Engine
FFmpeg

Ví dụ:

ffmpeg -framerate 1/4 -i news_%02d.png \
-c:v libx264 \
-r 30 \
-pix_fmt yuv420p \
output.mp4
Google Drive Storage

Tất cả output sẽ upload lên Google Drive.

Folder Structure
/output
  /2026-05-19
    /cards
      news_01.png
      news_02.png
    morning-news.mp4
Stored Assets
PNG cards
MP4 videos
thumbnails
metadata exports
Supabase Database

Supabase dùng để:

lưu article data
lưu lịch sử video
lưu render jobs
tránh duplicate
logging
app settings
Suggested Tables
rss_sources
id
name
rss_url
is_active
created_at
news_articles
id
title
summary
url
image_url
source
published_at
score
created_at
video_history
id
video_name
drive_url
total_news
duration
created_at
render_jobs
id
status
started_at
finished_at
error_message
Scheduler

Hệ thống chạy tự động mỗi ngày:

08:00 AM Asia/Ho_Chi_Minh

Scheduler options:

Cron Job
GitHub Actions
VPS Scheduler
MVP Scope
Included
RSS fetch
AI ranking
AI summary
PNG rendering
MP4 generation
Google Drive upload
Supabase metadata storage
Not Included Yet
frontend admin dashboard
TikTok auto upload
Facebook auto upload
AI voice
AI avatar
realtime analytics
Future Improvements
AI Voice Narration

Tích hợp:

ElevenLabs
Google TTS
Azure TTS
Social Auto Upload
TikTok
Facebook Reels
YouTube Shorts
AI News Anchor

Tạo MC AI dẫn bản tin.

Dynamic Themes
Dark mode
News TV style
Tech style
Minimal style
Multi Language
Vietnamese
English
Japanese
Design Style

Phong cách thiết kế:

cinematic
minimal
clean
modern
mobile-first
optimized for short-form video

Reference style:

Bloomberg Shorts
TikTok News
Instagram News Carousel
Morning Briefing