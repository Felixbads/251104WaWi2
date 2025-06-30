/**
 * Image Processing Service
 * Handles image resizing, optimization, and format conversion
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  sizes?: Array<{ suffix: string; width: number; height?: number }>;
}

export interface ProcessedImage {
  filename: string;
  url: string;
  size: number;
  width: number;
  height: number;
  format: string;
}

export class ImageProcessor {
  private uploadsDir: string;

  constructor(uploadsDir: string) {
    this.uploadsDir = uploadsDir;
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  /**
   * Process a single image with multiple size variants
   */
  async processImage(
    inputBuffer: Buffer,
    originalName: string,
    options: ImageProcessingOptions = {}
  ): Promise<ProcessedImage[]> {
    const {
      maxWidth = 1200,
      maxHeight = 1200,
      quality = 85,
      format = 'webp',
      sizes = [
        { suffix: '_thumb', width: 150, height: 150 },
        { suffix: '_medium', width: 400, height: 400 },
        { suffix: '_large', width: 800, height: 800 }
      ]
    } = options;

    const timestamp = Date.now();
    const baseName = path.parse(originalName).name;
    const processedImages: ProcessedImage[] = [];

    try {
      // Get image metadata
      const metadata = await sharp(inputBuffer).metadata();
      
      // Process main image
      const mainFilename = `${baseName}_${timestamp}.${format}`;
      const mainPath = path.join(this.uploadsDir, mainFilename);
      
      const mainImage = await sharp(inputBuffer)
        .resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .toFormat(format, { quality })
        .toFile(mainPath);

      processedImages.push({
        filename: mainFilename,
        url: `/uploads/photos/${mainFilename}`,
        size: mainImage.size,
        width: mainImage.width,
        height: mainImage.height,
        format: format
      });

      // Process size variants
      for (const size of sizes) {
        const sizeFilename = `${baseName}_${timestamp}${size.suffix}.${format}`;
        const sizePath = path.join(this.uploadsDir, sizeFilename);
        
        const resizeOptions = size.height 
          ? { width: size.width, height: size.height, fit: 'cover' as const }
          : { width: size.width, fit: 'inside' as const, withoutEnlargement: true };

        const sizeImage = await sharp(inputBuffer)
          .resize(resizeOptions)
          .toFormat(format, { quality })
          .toFile(sizePath);

        processedImages.push({
          filename: sizeFilename,
          url: `/uploads/photos/${sizeFilename}`,
          size: sizeImage.size,
          width: sizeImage.width,
          height: sizeImage.height,
          format: format
        });
      }

      return processedImages;
    } catch (error) {
      console.error('Image processing error:', error);
      throw new Error('Fehler bei der Bildverarbeitung');
    }
  }

  /**
   * Delete processed images and their variants
   */
  async deleteImages(filenames: string[]): Promise<void> {
    for (const filename of filenames) {
      try {
        const filePath = path.join(this.uploadsDir, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.error(`Error deleting image ${filename}:`, error);
      }
    }
  }

  /**
   * Get image information
   */
  async getImageInfo(buffer: Buffer): Promise<{
    width: number;
    height: number;
    format: string;
    size: number;
  }> {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
      size: buffer.length
    };
  }
}

// Create global instance
export const imageProcessor = new ImageProcessor(
  path.join(process.cwd(), 'uploads', 'photos')
);