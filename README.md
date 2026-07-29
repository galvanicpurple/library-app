# Library App - Personal Library Management System

A full-stack web application for managing your personal book collection with camera scanning, smart organization, and personalized recommendations.

## Features

### Core Functionality
- **📷 Camera Scanning**: Scan bookshelves using your device camera with OCR technology
- **📚 Book Management**: Track and organize your entire book collection
- **📖 Reading Tracker**: Monitor reading progress and completion status
- **🔍 Duplicate Detection**: Automatically identify duplicate books in your collection
- **🗂️ Smart Organization**: AI-suggested organization by genre, author, series, or reading status
- **💡 Personalized Recommendations**: Get book suggestions based on your reading history
- **🏷️ Shelf Management**: Organize books across multiple shelves with locations
- **🔐 Multi-User Support**: Family members can have individual accounts and preferences

### Security Features
- JWT-based authentication with bcrypt password hashing
- Secure HTTPS-only camera access with user consent
- Rate limiting and CSRF protection
- Input validation and sanitization
- Helmet security headers
- Parameterized SQL queries to prevent injection

## Tech Stack

### Backend
- **Node.js** with Express.js
- **PostgreSQL** database
- **JWT** for authentication
- **Google Books API** for book metadata
- **Tesseract.js** for OCR text extraction
- **Sharp** for image processing
- **Bcrypt** for password hashing

### Frontend
- **React** 18 with Vite
- **React Router** for navigation
- **Zustand** for state management
- **Axios** for API requests
- **React Webcam** for camera access
- **React Icons** for UI icons
- **React Toastify** for notifications

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- Google Books API key (free from Google Cloud Console)

## Installation

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <your-repo-url>
cd LibraryApp

# Install root dependencies
npm install

# Install workspace dependencies
npm run install-all
```

### 2. Database Setup

```bash
# Create PostgreSQL database
createdb library_app

# Or using psql
psql -U postgres
CREATE DATABASE library_app;
\q
```

### 3. Backend Configuration

```bash
cd backend

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
```

Configure the following in `backend/.env`:
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=library_app
DB_USER=your_postgres_user
DB_PASSWORD=your_postgres_password

# JWT Secret (generate a strong random string)
JWT_SECRET=your_super_secret_jwt_key_here

# Google Books API
GOOGLE_BOOKS_API_KEY=your_google_books_api_key

# Server
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

### 4. Run Database Migrations

```bash
cd backend
npm run db:migrate
```

### 5. Frontend Configuration

```bash
cd frontend

# Copy environment template
cp .env.example .env
```

Edit `frontend/.env`:
```env
VITE_API_URL=http://localhost:5000/api
```

## Running the Application

### Development Mode

**Option 1: Run both servers concurrently (from root)**
```bash
npm run dev
```

**Option 2: Run servers separately**

Terminal 1 (Backend):
```bash
cd backend
npm run dev
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

### Access the Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
- Health Check: http://localhost:5000/health

## API Documentation

### Authentication Endpoints

#### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123",
  "fullName": "John Doe"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

#### Get Profile
```http
GET /api/auth/profile
Authorization: Bearer <token>
```

### Books Endpoints

#### Get All Books
```http
GET /api/books?search=query&shelf_id=uuid&status=reading
Authorization: Bearer <token>
```

#### Add Book
```http
POST /api/books
Authorization: Bearer <token>
Content-Type: application/json

{
  "isbn": "9780123456789",
  "title": "Book Title",
  "authors": ["Author Name"],
  "shelfId": "uuid"
}
```

#### Get Duplicates
```http
GET /api/books/duplicates
Authorization: Bearer <token>
```

### Scan Endpoints

#### Scan Shelf
```http
POST /api/scan/shelf
Authorization: Bearer <token>
Content-Type: multipart/form-data

image: <file>
shelfId: <uuid>
```

#### Search External Books
```http
GET /api/scan/search?query=book+title&type=general
Authorization: Bearer <token>
```

### Recommendations Endpoints

#### Get Recommendations
```http
GET /api/recommendations?limit=10
Authorization: Bearer <token>
```

#### Get Organization Suggestions
```http
GET /api/recommendations/organize?method=genre
Authorization: Bearer <token>
```

## Security Best Practices

### Camera Access
- Only works on HTTPS or localhost
- Requires explicit user permission
- Shows privacy notice
- Can be denied and reverted anytime
- Alternative file upload option provided

### Authentication
- Passwords hashed with bcrypt (12 rounds)
- JWT tokens expire after 7 days
- Tokens validated on every request
- Account lockout after failed attempts

### Data Protection
- SQL injection prevented via parameterized queries
- XSS protection through input sanitization
- CSRF tokens on state-changing operations
- Rate limiting on all endpoints
- Helmet.js security headers

## Deployment

### Production Build

```bash
# Build frontend
cd frontend
npm run build

# The build folder can be served by the backend or separately
```

### Environment Variables for Production

```env
NODE_ENV=production
DB_HOST=your_production_db_host
DB_PASSWORD=strong_production_password
JWT_SECRET=very_strong_random_secret
FRONTEND_URL=https://yourdomain.com
```

### Recommendations
- Use HTTPS certificate (Let's Encrypt)
- Enable PostgreSQL SSL
- Use environment-based secrets management
- Set up proper CORS origins
- Configure CDN for static assets
- Enable database backups
- Set up logging and monitoring

## Usage Guide

### 1. Register an Account
- Navigate to the registration page
- Enter your details with a strong password
- Each family member can create their own account

### 2. Scan Your Bookshelf
- Go to the "Scan" page
- Grant camera permission when prompted
- Position your bookshelf in the camera frame
- Capture the image
- Review identified books and add to library

### 3. Organize Your Books
- Create shelves (e.g., "Living Room", "Bedroom")
- Assign books to shelves with location details
- Use smart organization suggestions
- Get optimal arrangement by genre, author, or series

### 4. Track Your Reading
- Mark books as "Currently Reading", "Completed", etc.
- Rate and review finished books
- Track your reading progress

### 5. Get Recommendations
- View personalized suggestions based on your reading history
- Find next books in series you're reading
- Discover books by your favorite authors
- Explore books in genres you enjoy

### 6. Search Before Buying
- Use the search function when at a bookstore
- Check if you already own the book
- Avoid duplicate purchases

## Troubleshooting

### Camera not working
- Ensure you're on HTTPS or localhost
- Check browser camera permissions
- Try the file upload alternative

### Database connection failed
- Verify PostgreSQL is running
- Check credentials in .env file
- Ensure database exists

### Books not detected in scan
- Ensure good lighting
- Keep book spines clearly visible
- Try capturing again with better angle
- Use manual search as fallback

## Contributing

Contributions are welcome! Please follow these steps:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

## Acknowledgments

- Google Books API for book metadata
- Tesseract.js for OCR capabilities
- React community for excellent libraries
- All contributors and users

---

**Built with ❤️ for book lovers everywhere**
