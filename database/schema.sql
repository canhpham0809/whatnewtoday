-- Create tables for AI Morning News Video Generator MVP

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. rss_sources table
CREATE TABLE IF NOT EXISTS rss_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    url VARCHAR(512) UNIQUE NOT NULL,
    category VARCHAR(100) DEFAULT 'General',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. news_articles table
CREATE TABLE IF NOT EXISTS news_articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID REFERENCES rss_sources(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT,
    url VARCHAR(1024) UNIQUE NOT NULL,
    pub_date TIMESTAMP WITH TIME ZONE,
    guid VARCHAR(512),
    normalized_title TEXT,
    normalized_content TEXT,
    score INTEGER DEFAULT 0,
    is_ranked BOOLEAN DEFAULT FALSE,
    summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. video_history table
CREATE TABLE IF NOT EXISTS video_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_title VARCHAR(255) NOT NULL,
    drive_file_id VARCHAR(255),
    drive_url TEXT,
    meta_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. render_jobs table
CREATE TABLE IF NOT EXISTS render_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id UUID REFERENCES video_history(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'rendering', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial Vietnamese RSS feeds
INSERT INTO rss_sources (name, url, category) VALUES
('VnExpress Tin Nổi Bật', 'https://vnexpress.net/rss/tin-noi-bat.rss', 'Featured'),
('VnExpress Thế Giới', 'https://vnexpress.net/rss/the-gioi.rss', 'World'),
('VnExpress Thời Sự', 'https://vnexpress.net/rss/thoi-su.rss', 'Current Affairs'),
('Tuổi Trẻ Mới Nhất', 'https://tuoitre.vn/rss/tin-moi-nhat.rss', 'Featured'),
('Thanh Niên Nóng', 'https://thanhnien.vn/rss/home.rss', 'Featured')
ON CONFLICT (url) DO NOTHING;
