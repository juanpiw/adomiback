import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  progressive?: boolean;
}

export interface CompressionResult {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  outputPath: string;
  format: string;
  dimensions: {
    width: number;
    height: number;
  };
}

/**
 * Comprime una imagen usando Sharp
 */
export async function compressImage(
  inputPath: string,
  outputPath: string,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 85,
    format = 'jpeg',
    progressive = true
  } = options;

  try {
    // Obtener información de la imagen original
    const originalStats = fs.statSync(inputPath);
    const originalSize = originalStats.size;

    // Obtener metadatos de la imagen
    const metadata = await sharp(inputPath).metadata();
    const { width: originalWidth, height: originalHeight } = metadata;

    if (!originalWidth || !originalHeight) {
      throw new Error('No se pudieron obtener las dimensiones de la imagen');
    }

    // Calcular nuevas dimensiones manteniendo aspect ratio
    const aspectRatio = originalWidth / originalHeight;
    let newWidth = originalWidth;
    let newHeight = originalHeight;

    if (originalWidth > maxWidth || originalHeight > maxHeight) {
      if (aspectRatio > 1) {
        // Imagen horizontal
        newWidth = Math.min(originalWidth, maxWidth);
        newHeight = Math.round(newWidth / aspectRatio);
      } else {
        // Imagen vertical
        newHeight = Math.min(originalHeight, maxHeight);
        newWidth = Math.round(newHeight * aspectRatio);
      }
    }

    // Configurar Sharp para compresión
    let sharpInstance = sharp(inputPath)
      .resize(newWidth, newHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });

    // Aplicar formato específico
    switch (format) {
      case 'jpeg':
        sharpInstance = sharpInstance.jpeg({
          quality,
          progressive,
          mozjpeg: true // Mejor compresión
        });
        break;
      case 'png':
        sharpInstance = sharpInstance.png({
          quality,
          progressive,
          compressionLevel: 9
        });
        break;
      case 'webp':
        sharpInstance = sharpInstance.webp({
          quality,
          effort: 6 // Máximo esfuerzo de compresión
        });
        break;
    }

    // Aplicar optimizaciones adicionales
    sharpInstance = sharpInstance
      .sharpen() // Mejorar nitidez después de redimensionar
      .normalize(); // Normalizar colores

    // Procesar y guardar imagen
    await sharpInstance.toFile(outputPath);

    // Obtener información de la imagen comprimida
    const compressedStats = fs.statSync(outputPath);
    const compressedSize = compressedStats.size;
    const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;

    return {
      originalSize,
      compressedSize,
      compressionRatio,
      outputPath,
      format,
      dimensions: {
        width: newWidth,
        height: newHeight
      }
    };

  } catch (error) {
    console.error('[IMAGE_COMPRESSION] Error comprimiendo imagen:', error);
    throw new Error(`Error al comprimir imagen: ${error}`);
  }
}

/**
 * Comprime múltiples imágenes en lote
 */
export async function compressImages(
  images: Array<{ inputPath: string; outputPath: string; options?: CompressionOptions }>
): Promise<CompressionResult[]> {
  const results: CompressionResult[] = [];

  for (const image of images) {
    try {
      const result = await compressImage(image.inputPath, image.outputPath, image.options);
      results.push(result);
    } catch (error) {
      console.error(`[IMAGE_COMPRESSION] Error comprimiendo ${image.inputPath}:`, error);
      // Continuar con las demás imágenes
    }
  }

  return results;
}

/**
 * Genera thumbnail de una imagen
 */
export async function generateThumbnail(
  inputPath: string,
  outputPath: string,
  size: number = 300
): Promise<CompressionResult> {
  return compressImage(inputPath, outputPath, {
    maxWidth: size,
    maxHeight: size,
    quality: 80,
    format: 'jpeg'
  });
}

/**
 * Valida si un archivo es una imagen válida
 */
export async function validateImage(filePath: string): Promise<boolean> {
  try {
    const metadata = await sharp(filePath).metadata();
    return !!(metadata.width && metadata.height);
  } catch (error) {
    return false;
  }
}

/**
 * Obtiene información detallada de una imagen
 */
export async function getImageInfo(filePath: string) {
  try {
    const metadata = await sharp(filePath).metadata();
    const stats = fs.statSync(filePath);
    
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: stats.size,
      hasAlpha: metadata.hasAlpha,
      density: metadata.density,
      channels: metadata.channels,
      space: metadata.space
    };
  } catch (error) {
    console.error('[IMAGE_COMPRESSION] Error obteniendo info de imagen:', error);
    return null;
  }
}
