/**
 * PDF Generierungs-Hilfsfunktionen
 */

import puppeteer from 'puppeteer';

/**
 * Generiert ein PDF aus einem HTML-Template mit Puppeteer
 */
export async function generatePDF(htmlContent: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-ipc-flooding-protection'
    ],
    headless: true
  });
  
  try {
    const page = await browser.newPage();
    
    // HTML-Inhalt setzen
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    // PDF generieren
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });
    
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}