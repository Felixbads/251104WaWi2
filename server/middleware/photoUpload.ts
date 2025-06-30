import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

interface PhotoUploadRequest extends Request {
  photoFile?: {
    name: string;
    data: Buffer;
    mimetype: string;
    size: number;
  };
}

export function createPhotoUploadMiddleware() {
  return async (req: PhotoUploadRequest, res: Response, next: NextFunction) => {
    try {
      const contentType = req.headers['content-type'];
      
      if (!contentType || !contentType.includes('multipart/form-data')) {
        return next();
      }

      const boundary = contentType.split('boundary=')[1];
      if (!boundary) {
        return next();
      }

      let body = Buffer.alloc(0);
      
      req.on('data', (chunk: Buffer) => {
        body = Buffer.concat([body, chunk]);
      });

      req.on('end', () => {
        try {
          const boundaryStr = `--${boundary}`;
          const bodyStr = body.toString('binary');
          const parts = bodyStr.split(boundaryStr);
          
          for (const partStr of parts) {
            if (partStr.length < 10) continue;
            
            if (partStr.includes('name="photo"') && partStr.includes('Content-Type: image/')) {
              const headerEnd = partStr.indexOf('\r\n\r\n');
              if (headerEnd === -1) continue;
              
              const headers = partStr.substring(0, headerEnd);
              const filenameMatch = headers.match(/filename="([^"]+)"/);
              const mimetypeMatch = headers.match(/Content-Type: ([^\r\n]+)/);
              
              if (filenameMatch && mimetypeMatch) {
                const filename = filenameMatch[1];
                const mimetype = mimetypeMatch[1].trim();
                
                // Extract file data (skip headers and CRLF)
                const dataStart = headerEnd + 4;
                const dataEnd = partStr.length - 2; // Remove trailing CRLF
                const fileDataStr = partStr.substring(dataStart, dataEnd);
                
                // Convert binary string back to Buffer
                const fileData = Buffer.from(fileDataStr, 'binary');
                
                if (fileData.length > 0) {
                  req.photoFile = {
                    name: filename,
                    data: fileData,
                    mimetype: mimetype,
                    size: fileData.length
                  };
                  
                  console.log(`[PHOTO_MIDDLEWARE] Parsed file: ${filename}, ${fileData.length} bytes, ${mimetype}`);
                  break;
                }
              }
            }
          }
          
          next();
        } catch (parseError) {
          console.error('[PHOTO_MIDDLEWARE] Parse error:', parseError);
          next();
        }
      });

    } catch (error) {
      console.error('[PHOTO_MIDDLEWARE] Error:', error);
      next();
    }
  };
}