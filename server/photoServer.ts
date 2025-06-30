/**
 * Dedicated HTTP server for photo uploads
 * Completely bypasses Express to avoid multipart parsing issues
 */
import * as http from 'http';
import * as url from 'url';
import * as path from 'path';
import * as fs from 'fs';

const PHOTO_SERVER_PORT = 5001;

interface MultipartFile {
  filename: string;
  mimeType: string;
  data: Buffer;
}

function parseMultipartData(body: Buffer, boundary: string): MultipartFile | null {
  const bodyStr = body.toString('binary');
  const parts = bodyStr.split(`--${boundary}`);
  
  for (const part of parts) {
    if (part.includes('name="photo"') && part.includes('Content-Type:')) {
      const headerEndIndex = part.indexOf('\r\n\r\n');
      if (headerEndIndex === -1) continue;
      
      const headers = part.substring(0, headerEndIndex);
      
      // Extract filename
      const filenameMatch = headers.match(/filename="([^"]+)"/);
      const filename = filenameMatch ? filenameMatch[1] : 'photo.jpg';
      
      // Extract MIME type
      const mimeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/);
      const mimeType = mimeMatch ? mimeMatch[1].trim() : 'image/jpeg';
      
      // Extract file data
      const dataStart = headerEndIndex + 4;
      const dataEnd = part.lastIndexOf('\r\n');
      const fileDataStr = part.substring(dataStart, dataEnd > dataStart ? dataEnd : part.length);
      
      if (fileDataStr.length > 0) {
        const data = Buffer.from(fileDataStr, 'binary');
        console.log('[PHOTO_SERVER] Parsed file:', filename, data.length, 'bytes', mimeType);
        return { filename, mimeType, data };
      }
    }
  }
  
  return null;
}

async function updateProductPhoto(productId: number, photoUrl: string): Promise<any> {
  try {
    const { pool } = await import('./db');
    const result = await pool.query(
      'UPDATE products SET photo_url = $1, photos = COALESCE(photos, \'[]\') || $2::jsonb WHERE id = $3 RETURNING *',
      [photoUrl, JSON.stringify([photoUrl]), productId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('[PHOTO_SERVER] Database error:', error);
    return null;
  }
}

const photoServer = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  const parsedUrl = url.parse(req.url || '', true);
  const pathMatch = parsedUrl.pathname?.match(/^\/api\/photos\/upload\/(\d+)$/);
  
  if (!pathMatch) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid endpoint' }));
    return;
  }
  
  const productId = parseInt(pathMatch[1]);
  console.log('[PHOTO_SERVER] Processing upload for product:', productId);
  
  // Extract boundary from Content-Type
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=([^;]+)/);
  
  if (!boundaryMatch) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid multipart data' }));
    return;
  }
  
  const boundary = boundaryMatch[1];
  let body = Buffer.alloc(0);
  
  req.on('data', (chunk: Buffer) => {
    body = Buffer.concat([body, chunk]);
  });
  
  req.on('end', async () => {
    try {
      console.log('[PHOTO_SERVER] Received', body.length, 'bytes');
      
      const file = parseMultipartData(body, boundary);
      
      if (!file) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No photo data found' }));
        return;
      }
      
      // Validate file type
      if (!file.mimeType.startsWith('image/')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Only image files are allowed' }));
        return;
      }
      
      // Save file to disk
      const uploadDir = path.join(process.cwd(), 'uploads', 'products');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      const timestamp = Date.now();
      const extension = path.extname(file.filename) || '.jpg';
      const savedFilename = `product-${productId}-${timestamp}${extension}`;
      const filePath = path.join(uploadDir, savedFilename);
      
      fs.writeFileSync(filePath, file.data);
      console.log('[PHOTO_SERVER] File saved:', savedFilename, file.data.length, 'bytes');
      
      const photoUrl = `/uploads/products/${savedFilename}`;
      
      // Update database
      const product = await updateProductPhoto(productId, photoUrl);
      
      if (!product) {
        fs.unlinkSync(filePath); // Clean up file if product not found
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Product not found' }));
        return;
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        photoPath: photoUrl,
        filename: savedFilename,
        message: 'Photo uploaded successfully',
        fileSize: file.data.length,
        mimeType: file.mimeType,
        product: product
      }));
      
    } catch (error) {
      console.error('[PHOTO_SERVER] Processing error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Upload processing failed',
        details: error instanceof Error ? error.message : String(error)
      }));
    }
  });
  
  req.on('error', (error) => {
    console.error('[PHOTO_SERVER] Request error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Upload request failed' }));
  });
});

export function startPhotoServer() {
  photoServer.listen(PHOTO_SERVER_PORT, () => {
    console.log(`[PHOTO_SERVER] Photo upload server running on port ${PHOTO_SERVER_PORT}`);
  });
}

export function stopPhotoServer() {
  photoServer.close();
}