require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory:', uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Middleware
app.use(cors({
  origin: '*', // Allow all origins for development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' })); // Increase limit for image uploads
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(uploadsDir));

// PostgreSQL Connection Pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to PostgreSQL:', err);
  } else {
    console.log('✅ Connected to PostgreSQL database successfully');
    release();
  }
});

// Initialize database tables
async function initializeDatabase() {
  try {
    console.log('🔧 Initializing database tables...');
    
    // Create articles table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS articles (
        id SERIAL PRIMARY KEY,
        section VARCHAR(50),
        page INTEGER,
        category VARCHAR(50),
        edition VARCHAR(50),
        author VARCHAR(255),
        title TEXT,
        excerpt TEXT,
        body TEXT,
        image TEXT,
        time VARCHAR(255),
        badge VARCHAR(100),
        badge_color VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Articles table ready');

    // Create tickers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickers (
        id SERIAL PRIMARY KEY,
        text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tickers table ready');

    console.log('✅ Database tables initialized successfully');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
    throw err; // Re-throw to prevent server from starting if DB init fails
  }
}

// API Routes

// Get all articles
app.get('/api/articles', async (req, res) => {
  try {
    console.log('📖 Fetching all articles...');
    const result = await pool.query('SELECT * FROM articles ORDER BY created_at DESC');
    console.log(`✅ Found ${result.rows.length} articles`);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching articles:', err);
    res.status(500).json({ error: 'Failed to fetch articles: ' + err.message });
  }
});

// Get articles by section
app.get('/api/articles/section/:section', async (req, res) => {
  try {
    const { section } = req.params;
    const result = await pool.query('SELECT * FROM articles WHERE section = $1 ORDER BY created_at DESC', [section]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching articles by section:', err);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// Get articles by page (for E-Paper)
app.get('/api/articles/page/:page', async (req, res) => {
  try {
    const { page } = req.params;
    const result = await pool.query('SELECT * FROM articles WHERE page = $1::integer ORDER BY created_at DESC', [page]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching articles by page:', err);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// Get single article by ID
app.get('/api/articles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM articles WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching article:', err);
    res.status(500).json({ error: 'Failed to fetch article' });
  }
});

// Image upload endpoint
app.post('/api/upload-image', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    
    const imageUrl = `/uploads/${req.file.filename}`;
    console.log('Image uploaded successfully:', imageUrl);
    res.json({ imageUrl: imageUrl });
  } catch (err) {
    console.error('Error uploading image:', err);
    res.status(500).json({ error: 'Failed to upload image: ' + err.message });
  }
});

// Create new article
app.post('/api/articles', async (req, res) => {
  try {
    const { section, page, category, edition, author, title, excerpt, body, image, badge, badge_color } = req.body;
    
    // Validation
    if (!title || !author || !section) {
      return res.status(400).json({ error: 'Title, author, and section are required' });
    }
    
    const time = new Date().toLocaleDateString('hi-IN') + ' • हालिया';
    
    const result = await pool.query(
      `INSERT INTO articles (section, page, category, edition, author, title, excerpt, body, image, time, badge, badge_color)
       VALUES ($1, $2::integer, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [section, page, category, edition, author, title, excerpt, body, image, time, badge, badge_color]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating article:', err);
    res.status(500).json({ error: 'Failed to create article: ' + err.message });
  }
});

// Update article
app.put('/api/articles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { section, page, category, edition, author, title, excerpt, body, image, badge, badge_color } = req.body;
    
    // Check if article exists
    const checkResult = await pool.query('SELECT id FROM articles WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Update the article
    const result = await pool.query(
      `UPDATE articles 
       SET section = $1, page = $2::integer, category = $3, edition = $4, author = $5, 
           title = $6, excerpt = $7, body = $8, image = $9, badge = $10, badge_color = $11
       WHERE id = $12
       RETURNING *`,
      [section, page, category, edition, author, title, excerpt, body, image, badge, badge_color, id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating article:', err);
    res.status(500).json({ error: 'Failed to update article: ' + err.message });
  }
});

// Delete article
app.delete('/api/articles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if article exists
    const checkResult = await pool.query('SELECT id FROM articles WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Delete the article
    await pool.query('DELETE FROM articles WHERE id = $1', [id]);
    res.json({ message: 'Article deleted successfully' });
  } catch (err) {
    console.error('Error deleting article:', err);
    res.status(500).json({ error: 'Failed to delete article' });
  }
});

// Get all tickers
app.get('/api/tickers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tickers ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching tickers:', err);
    res.status(500).json({ error: 'Failed to fetch tickers' });
  }
});

// Create new ticker
app.post('/api/tickers', async (req, res) => {
  try {
    const { text } = req.body;
    
    // Validation
    if (!text || text.trim() === '') {
      return res.status(400).json({ error: 'Ticker text is required' });
    }
    
    const result = await pool.query(
      'INSERT INTO tickers (text) VALUES ($1) RETURNING *',
      [text.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating ticker:', err);
    res.status(500).json({ error: 'Failed to create ticker: ' + err.message });
  }
});

// Update ticker
app.put('/api/tickers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    
    // Check if ticker exists
    const checkResult = await pool.query('SELECT id FROM tickers WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticker not found' });
    }
    
    // Update the ticker
    const result = await pool.query(
      'UPDATE tickers SET text = $1 WHERE id = $2 RETURNING *',
      [text.trim(), id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating ticker:', err);
    res.status(500).json({ error: 'Failed to update ticker: ' + err.message });
  }
});

// Delete ticker
app.delete('/api/tickers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if ticker exists
    const checkResult = await pool.query('SELECT id FROM tickers WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticker not found' });
    }
    
    // Delete the ticker
    await pool.query('DELETE FROM tickers WHERE id = $1', [id]);
    res.json({ message: 'Ticker deleted successfully' });
  } catch (err) {
    console.error('Error deleting ticker:', err);
    res.status(500).json({ error: 'Failed to delete ticker' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected' });
});

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  await initializeDatabase();
});

module.exports = app;
