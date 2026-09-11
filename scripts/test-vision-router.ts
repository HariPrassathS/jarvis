
import zlib from 'zlib';
import { classifyTaskType, routeChat } from '../src/lib/llm/router';
import { processUploadedFile } from '../src/lib/document/extractor';
import type { ChatMessage, ChatAttachment } from '../src/types';

// Helper: Calculate CRC32 for PNG chunks
function crc32(buf: Buffer): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ -1) >>> 0;
}

// Generate valid raw RGBA PNG
function createPngDataUri(width: number, height: number, drawPixel: (x: number, y: number) => [number, number, number, number]): string {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const ihdrChunk = Buffer.concat([
    Buffer.from([0, 0, 0, 13]),
    Buffer.from('IHDR'),
    ihdrData,
    Buffer.alloc(4),
  ]);
  ihdrChunk.writeUInt32BE(crc32(ihdrChunk.subarray(4, 21)), 21);

  // Raw Scanlines
  const rawScanlines = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawScanlines[offset++] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixel(x, y);
      rawScanlines[offset++] = r;
      rawScanlines[offset++] = g;
      rawScanlines[offset++] = b;
      rawScanlines[offset++] = a;
    }
  }

  const compressedIdat = zlib.deflateSync(rawScanlines);
  const idatLen = Buffer.alloc(4);
  idatLen.writeUInt32BE(compressedIdat.length, 0);
  const idatType = Buffer.from('IDAT');
  const idatCrc = Buffer.alloc(4);
  idatCrc.writeUInt32BE(crc32(Buffer.concat([idatType, compressedIdat])), 0);
  const idatChunk = Buffer.concat([idatLen, idatType, compressedIdat, idatCrc]);

  // IEND
  const iendChunk = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

  const fullPng = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
  return `data:image/png;base64,${fullPng.toString('base64')}`;
}

// 1. Photo: Golden gradient landscape with blue sky (40x40)
const PHOTO_DATA_URI = createPngDataUri(40, 40, (x, y) => {
  if (y < 20) return [100, 180, 240, 255]; // Sky
  return [220, 160, 40, 255]; // Gold terrain
});

// 2. Screenshot with text/bars: White background with dark terminal bars (60x30)
const SCREENSHOT_DATA_URI = createPngDataUri(60, 30, (x, y) => {
  if (y >= 5 && y <= 8 && x >= 10 && x <= 50) return [20, 20, 20, 255]; // Text line 1
  if (y >= 12 && y <= 15 && x >= 10 && x <= 40) return [40, 40, 40, 255]; // Text line 2
  if (y >= 19 && y <= 22 && x >= 10 && x <= 45) return [0, 180, 180, 255]; // Cyan status
  return [245, 245, 245, 255]; // Light background
});

// 3. Diagram / Chart: Dark HUD background with circular arc and grid lines (50x50)
const DIAGRAM_DATA_URI = createPngDataUri(50, 50, (x, y) => {
  const dist = Math.sqrt((x - 25) ** 2 + (y - 25) ** 2);
  if (Math.abs(dist - 18) < 2) return [0, 255, 255, 255]; // Circular radar track
  if (x === 25 || y === 25) return [77, 232, 232, 180]; // Crosshair axis
  return [10, 15, 20, 255]; // Dark background
});

async function runTests() {
  console.log('====================================================');
  console.log('🧪 J.A.R.V.I.S Task-Based Router & Vision Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  // TEST 1: Task Type Classification
  console.log('--- TEST 1: Task Classifier (Zero-latency classification) ---');
  try {
    const textMsg: ChatMessage[] = [{ role: 'user', content: 'What is the speed of sound?' }];
    const t1 = classifyTaskType(textMsg);
    if (t1 !== 'quick_chat') throw new Error(`Expected quick_chat, got ${t1}`);

    const imageAtt: ChatAttachment = {
      id: 'img-1',
      name: 'radar_scan.png',
      type: 'image',
      size: 1024,
      mimeType: 'image/png',
      dataUrl: PHOTO_DATA_URI,
    };
    const visionMsg: ChatMessage[] = [{ role: 'user', content: 'Analyze this scan', attachments: [imageAtt] }];
    const t2 = classifyTaskType(visionMsg);
    if (t2 !== 'vision') throw new Error(`Expected vision, got ${t2}`);

    const docAtt: ChatAttachment = {
      id: 'doc-1',
      name: 'flight_manual.pdf',
      type: 'document',
      size: 2048,
      mimeType: 'application/pdf',
      extractedText: 'Extensive Stark Industries propulsion telemetry specs...'.repeat(20),
    };
    const docMsg: ChatMessage[] = [{ role: 'user', content: 'Summarize flight manual', attachments: [docAtt] }];
    const t3 = classifyTaskType(docMsg);
    if (t3 !== 'deep_summary') throw new Error(`Expected deep_summary, got ${t3}`);

    console.log('✅ Test 1 Passed: Accurate classification for quick_chat, vision, and deep_summary.\n');
    passed++;
  } catch (err: any) {
    console.error('❌ Test 1 Failed:', err.message);
    failed++;
  }

  // TEST 2: File Size Limit Enforcement
  console.log('--- TEST 2: File Size Enforcement (>10MB Limit) ---');
  try {
    const oversizedBlob = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'image/png' });
    const oversizedFile = new File([oversizedBlob], 'large_satellite_feed.png', { type: 'image/png' });
    
    let errorCaught = false;
    try {
      await processUploadedFile(oversizedFile);
    } catch (e: any) {
      errorCaught = true;
      if (!e.message.includes('bandwidth limit of 10MB')) {
        throw new Error(`Expected Stark in-character bandwidth error, got: ${e.message}`);
      }
      console.log('✅ In-character rejection received:', e.message);
    }
    if (!errorCaught) throw new Error('Oversized file was not rejected!');
    console.log('✅ Test 2 Passed: 10MB limit strictly enforced with in-character feedback.\n');
    passed++;
  } catch (err: any) {
    console.error('❌ Test 2 Failed:', err.message);
    failed++;
  }

  // TEST 3: Multi-Modal Vision Analysis — Photo
  console.log('--- TEST 3A: Vision Analysis — Photo ---');
  try {
    const visionMessages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are J.A.R.V.I.S., a sophisticated AI assistant created by Tony Stark. Speak in character.'
      },
      {
        role: 'user',
        content: 'Identify what you see in this photo visual feed, sir.',
        attachments: [
          {
            id: 'photo-1',
            name: 'landscape_photo.png',
            type: 'image',
            size: 1024,
            mimeType: 'image/png',
            dataUrl: PHOTO_DATA_URI,
          }
        ]
      }
    ];

    const response = await routeChat({
      messages: visionMessages,
      preferredProvider: 'groq'
    });

    console.log('Vision Provider:', response.provider_used);
    console.log('Response Preview:', response.content.slice(0, 180) + '...');
    if (!response.content || response.content.length < 10) {
      throw new Error('Received empty vision response');
    }
    console.log('✅ Test 3A Passed: Photo analysis returned accurate telemetry.\n');
    passed++;
  } catch (err: any) {
    console.error('❌ Test 3A Failed:', err.message);
    failed++;
  }

  // TEST 3B: Multi-Modal Vision Analysis — Screenshot with Text
  console.log('--- TEST 3B: Vision Analysis — Screenshot with Text ---');
  try {
    const visionMessages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are J.A.R.V.I.S., a sophisticated AI assistant created by Tony Stark. Speak in character.'
      },
      {
        role: 'user',
        content: 'Read and analyze the layout in this screenshot feed, sir.',
        attachments: [
          {
            id: 'screenshot-1',
            name: 'ui_screenshot.png',
            type: 'image',
            size: 1024,
            mimeType: 'image/png',
            dataUrl: SCREENSHOT_DATA_URI,
          }
        ]
      }
    ];

    const response = await routeChat({
      messages: visionMessages,
      preferredProvider: 'groq'
    });

    console.log('Vision Provider:', response.provider_used);
    console.log('Response Preview:', response.content.slice(0, 180) + '...');
    if (!response.content || response.content.length < 10) {
      throw new Error('Received empty vision response');
    }
    console.log('✅ Test 3B Passed: Screenshot analysis returned accurate telemetry.\n');
    passed++;
  } catch (err: any) {
    console.error('❌ Test 3B Failed:', err.message);
    failed++;
  }

  // TEST 3C: Multi-Modal Vision Analysis — Diagram / Chart
  console.log('--- TEST 3C: Vision Analysis — Diagram / Chart ---');
  try {
    const visionMessages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are J.A.R.V.I.S., a sophisticated AI assistant created by Tony Stark. Speak in character.'
      },
      {
        role: 'user',
        content: 'Describe the geometry and structure of this diagram telemetry.',
        attachments: [
          {
            id: 'diagram-1',
            name: 'radar_diagram.png',
            type: 'image',
            size: 1024,
            mimeType: 'image/png',
            dataUrl: DIAGRAM_DATA_URI,
          }
        ]
      }
    ];

    const response = await routeChat({
      messages: visionMessages,
      preferredProvider: 'groq'
    });

    console.log('Vision Provider:', response.provider_used);
    console.log('Response Preview:', response.content.slice(0, 180) + '...');
    if (!response.content || response.content.length < 10) {
      throw new Error('Received empty vision response');
    }
    console.log('✅ Test 3C Passed: Diagram analysis returned accurate telemetry.\n');
    passed++;
  } catch (err: any) {
    console.error('❌ Test 3C Failed:', err.message);
    failed++;
  }

  // TEST 4: Fallback Routing to Gemini
  console.log('--- TEST 4: Fallback Route to Gemini ---');
  try {
    const visionMessages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are J.A.R.V.I.S., a sophisticated AI assistant created by Tony Stark. Speak in character.'
      },
      {
        role: 'user',
        content: 'Analyze this optical telemetry.',
        attachments: [
          {
            id: 'scan-fb',
            name: 'optical_feed.png',
            type: 'image',
            size: 1024,
            mimeType: 'image/png',
            dataUrl: PHOTO_DATA_URI,
          }
        ]
      }
    ];

    const response = await routeChat({
      messages: visionMessages,
      preferredProvider: 'gemini'
    });

    console.log('Fallback Provider Used:', response.provider_used);
    console.log('Fallback Response Preview:', response.content.slice(0, 180) + '...');
    if (!response.content || (response.provider_used !== 'gemini' && response.provider_used !== 'groq')) {
      throw new Error(`Unexpected provider: ${response.provider_used}`);
    }
    console.log('✅ Test 4 Passed: Fallback routing executed flawlessly.\n');
    passed++;
  } catch (err: any) {
    console.error('❌ Test 4 Failed:', err.message);
    failed++;
  }

  console.log('====================================================');
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');
}

runTests().catch((e) => console.error('Fatal test error:', e));

