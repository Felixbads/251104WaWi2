/**
 * Cloudinary Service for Photo Uploads
 * Handles image uploads to Cloudinary cloud storage
 */
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dzl0viskw',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface UploadResult {
  success: boolean;
  url?: string;
  publicId?: string;
  error?: string;
}

/**
 * Upload a photo to Cloudinary
 * @param buffer - Image buffer data
 * @param productId - Product ID for folder organization
 * @param filename - Original filename
 * @returns Upload result with URL or error
 */
export async function uploadProductPhoto(
  buffer: Buffer,
  productId: number,
  filename: string = 'photo.jpg'
): Promise<UploadResult> {
  try {
    console.log('[CLOUDINARY] Processing photo upload for product:', productId);

    // Process image with Sharp for optimization
    const processedBuffer = await sharp(buffer)
      .resize(800, 800, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    console.log('[CLOUDINARY] Image processed:', processedBuffer.length, 'bytes');

    // Upload to Cloudinary
    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'krippen-village/products',
          public_id: `product-${productId}-${Date.now()}`,
          format: 'jpg',
          transformation: [
            { width: 800, height: 800, crop: 'limit' },
            { quality: 'auto:good' }
          ]
        },
        (error, result) => {
          if (error) {
            console.error('[CLOUDINARY] Upload error:', error);
            reject(error);
          } else {
            console.log('[CLOUDINARY] Upload successful:', result?.secure_url);
            resolve(result);
          }
        }
      ).end(processedBuffer);
    });

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id
    };

  } catch (error) {
    console.error('[CLOUDINARY] Service error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed'
    };
  }
}

/**
 * Delete a photo from Cloudinary
 * @param publicId - Cloudinary public ID
 * @returns Deletion result
 */
export async function deleteProductPhoto(publicId: string): Promise<UploadResult> {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log('[CLOUDINARY] Delete result:', result);
    
    return {
      success: result.result === 'ok',
      error: result.result !== 'ok' ? 'Delete failed' : undefined
    };
  } catch (error) {
    console.error('[CLOUDINARY] Delete error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed'
    };
  }
}

/**
 * Get optimized image URL with transformations
 * @param publicId - Cloudinary public ID
 * @param width - Desired width
 * @param height - Desired height
 * @returns Optimized image URL
 */
export function getOptimizedImageUrl(
  publicId: string,
  width: number = 400,
  height: number = 400
): string {
  return cloudinary.url(publicId, {
    width,
    height,
    crop: 'fill',
    gravity: 'center',
    quality: 'auto:good',
    format: 'auto'
  });
}