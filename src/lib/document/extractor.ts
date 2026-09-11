// ──────────────────────────────────────────────
// Multi-Modal Document & Image Extractor
// Client-side PDF parsing, image encoding, and text truncation
// ──────────────────────────────────────────────

import type { ChatAttachment } from '@/types';

// Maximum characters for client-extracted document text before safe truncation
const MAX_DOCUMENT_CHARS = 50000;

/**
 * Configure PDF.js worker URL lazily in browser
 */
async function getPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    // Standard CDN worker matching installed pdfjs-dist version (3.11.174)
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
  }
  return pdfjs;
}

/**
 * Convert a File into a base64 Data URL string
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Extract text from a PDF file using client-side PDF.js
 */
export async function extractPdfText(file: File): Promise<{ text: string; pageCount: number; truncated: boolean }> {
  try {
    const pdfjs = await getPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;

    let fullText = '';
    let isTruncated = false;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageStrings = textContent.items.map((item: any) => item.str || '');
      const pageText = pageStrings.join(' ').replace(/\s+/g, ' ').trim();

      if (pageText) {
        fullText += `--- Page ${pageNum} ---\n${pageText}\n\n`;
      }

      if (fullText.length > MAX_DOCUMENT_CHARS) {
        fullText = fullText.slice(0, MAX_DOCUMENT_CHARS);
        fullText += `\n\n[TELEMETRY BUFFER NOTICE: Document truncated at page ${pageNum} of ${numPages} due to neural context budget]`;
        isTruncated = true;
        break;
      }
    }

    return {
      text: fullText.trim() || '(No readable text could be extracted from this PDF)',
      pageCount: numPages,
      truncated: isTruncated,
    };
  } catch (err: any) {
    console.error('[PDF Extractor] Error parsing PDF:', err);
    return {
      text: `[PDF Parsing Error: ${err?.message || 'Could not parse document structure'}]`,
      pageCount: 1,
      truncated: false,
    };
  }
}

// Maximum allowed image size (10MB)
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

/**
 * Main dispatcher: Process any uploaded File into a structured ChatAttachment
 */
export async function processUploadedFile(file: File): Promise<ChatAttachment> {
  const fileId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const fileName = file.name;
  const mimeType = (file.type || '').toLowerCase();
  const size = file.size;

  // 1. Image Files (PNG, JPG, WebP)
  if (mimeType.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(fileName)) {
    // Check size limit (10MB)
    if (size > MAX_IMAGE_BYTES) {
      throw new Error(`Visual telemetry exceeds maximum bandwidth limit of 10MB (${(size / (1024 * 1024)).toFixed(1)}MB), sir. Please crop or compress the image.`);
    }

    // Check supported format
    const isSupportedMime = SUPPORTED_IMAGE_MIMES.some(m => mimeType.includes(m.replace('image/', ''))) || /\.(png|jpe?g|webp)$/i.test(fileName);
    if (!isSupportedMime) {
      throw new Error(`Visual sensor array only accepts JPG, PNG, and WebP formats, sir.`);
    }

    const dataUrl = await readFileAsDataUrl(file);
    return {
      id: fileId,
      type: 'image',
      name: fileName,
      mimeType: mimeType || 'image/png',
      size,
      dataUrl,
    };
  }

  // 2. PDF Documents
  if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
    const { text, pageCount } = await extractPdfText(file);
    return {
      id: fileId,
      type: 'document',
      name: fileName,
      mimeType: 'application/pdf',
      size,
      extractedText: text,
      pageCount,
    };
  }

  // 3. Plain Text, Markdown, Code, CSV, JSON Documents
  try {
    let rawText = await file.text();
    let truncated = false;
    if (rawText.length > MAX_DOCUMENT_CHARS) {
      rawText = rawText.slice(0, MAX_DOCUMENT_CHARS) + '\n\n[TELEMETRY BUFFER NOTICE: File truncated due to context limit]';
      truncated = true;
    }

    return {
      id: fileId,
      type: 'document',
      name: fileName,
      mimeType: mimeType || 'text/plain',
      size,
      extractedText: rawText,
      pageCount: 1,
    };
  } catch (textErr: any) {
    return {
      id: fileId,
      type: 'document',
      name: fileName,
      mimeType,
      size,
      extractedText: `[Could not read text from ${fileName}: ${textErr?.message || 'Binary file'}]`,
      pageCount: 1,
    };
  }
}
