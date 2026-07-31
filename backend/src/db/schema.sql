-- Library Management System Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Shelves table
CREATE TABLE IF NOT EXISTS shelves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    description TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

-- Books table (master book catalog)
CREATE TABLE IF NOT EXISTS books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    isbn VARCHAR(20) UNIQUE,
    isbn13 VARCHAR(20),
    title VARCHAR(500) NOT NULL,
    subtitle VARCHAR(500),
    authors TEXT[], -- Array of author names
    publisher VARCHAR(255),
    published_date VARCHAR(50),
    description TEXT,
    page_count INTEGER,
    categories TEXT[], -- Array of categories/genres
    language VARCHAR(10) DEFAULT 'en',
    image_url VARCHAR(500),
    google_books_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Books (ownership tracking)
CREATE TABLE IF NOT EXISTS user_books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    shelf_id UUID REFERENCES shelves(id) ON DELETE SET NULL,
    position_on_shelf INTEGER,
    acquisition_date DATE,
    condition VARCHAR(50), -- 'new', 'like_new', 'good', 'fair', 'poor'
    notes TEXT,
    is_duplicate BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, book_id, shelf_id, position_on_shelf)
);

-- Reading status tracking
CREATE TABLE IF NOT EXISTS readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL, -- 'want_to_read', 'currently_reading', 'completed', 'abandoned'
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    current_page INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, book_id)
);

-- User preferences for organization
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_method VARCHAR(50) DEFAULT 'genre', -- 'genre', 'author', 'series', 'alphabetical', 'custom'
    theme VARCHAR(20) DEFAULT 'light',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scan history for tracking scanning sessions. Also doubles as the async
-- scan job's status record: a row is inserted with status='processing' the
-- moment a shelf photo is submitted, then updated to 'completed'/'failed'
-- once the OCR+matching pipeline finishes in the background (see
-- scanController.js) - status/result/error don't apply to the older
-- synchronous-only rows, which is why status defaults to 'completed'.
CREATE TABLE IF NOT EXISTS scan_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shelf_id UUID REFERENCES shelves(id) ON DELETE SET NULL,
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    books_found INTEGER DEFAULT 0,
    image_url VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'completed', -- 'processing' | 'completed' | 'failed'
    result JSONB,
    error TEXT
);

-- CREATE TABLE IF NOT EXISTS above only helps a fresh database - it won't
-- retroactively add columns to the already-existing scan_sessions table in
-- a real deployed database, since migrate.js just re-runs this whole file.
ALTER TABLE scan_sessions ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'completed';
ALTER TABLE scan_sessions ADD COLUMN IF NOT EXISTS result JSONB;
ALTER TABLE scan_sessions ADD COLUMN IF NOT EXISTS error TEXT;

-- Create indexes for performance (skip if they already exist)
CREATE INDEX IF NOT EXISTS idx_user_books_user_id ON user_books(user_id);
CREATE INDEX IF NOT EXISTS idx_user_books_book_id ON user_books(book_id);
CREATE INDEX IF NOT EXISTS idx_user_books_shelf_id ON user_books(shelf_id);
CREATE INDEX IF NOT EXISTS idx_readings_user_id ON readings(user_id);
CREATE INDEX IF NOT EXISTS idx_readings_status ON readings(status);
CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_authors ON books USING GIN(authors);
CREATE INDEX IF NOT EXISTS idx_books_categories ON books USING GIN(categories);
CREATE INDEX IF NOT EXISTS idx_shelves_user_id ON shelves(user_id);

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers (drop first if they exist)
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shelves_updated_at ON shelves;
CREATE TRIGGER update_shelves_updated_at BEFORE UPDATE ON shelves
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_books_updated_at ON books;
CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON books
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_books_updated_at ON user_books;
CREATE TRIGGER update_user_books_updated_at BEFORE UPDATE ON user_books
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_readings_updated_at ON readings;
CREATE TRIGGER update_readings_updated_at BEFORE UPDATE ON readings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
