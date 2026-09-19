# The Speak News - Backend API

Node.js backend API for The Speak News website with PostgreSQL database.

## Environment Variables Required

- `DB_HOST` - PostgreSQL database host
- `DB_PORT` - PostgreSQL database port (usually 5432)
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `DB_SSL` - SSL requirement (set to 'require' for production)

## Installation

```bash
npm install
```

## Running Locally

```bash
npm start
```

Server will run on http://localhost:3000

## API Endpoints

- `GET /api/articles` - Get all articles
- `POST /api/articles` - Create new article
- `GET /api/tickers` - Get all tickers
- `POST /api/tickers` - Create new ticker
- `POST /api/upload-image` - Upload image file

## Database Tables

- `articles` - News articles with full content
- `tickers` - Breaking news ticker items
