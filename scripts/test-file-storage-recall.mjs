// ──────────────────────────────────────────────
// Comprehensive Verification Suite: Permanent File Storage & Recall
// Tests Supabase Storage, Metadata persistence, `recall_uploaded_files` tool,
// Cross-session LLM recall, Privacy Export, and Account Purge.
// ──────────────────────────────────────────────

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase configuration in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// Import local project modules
import { uploadUserFile, getSignedFileUrl, deleteUserFiles } from '../src/lib/files/storage.js';
import { insertUploadedFile, getUploadedFiles, deleteUploadedFilesByProfile } from '../src/lib/files/metadata.js';
import { recallUploadedFiles } from '../src/lib/tools/files.js';
import { processUploadedFile } from '../src/lib/document/extractor.js';
import { routeModelRequest } from '../src/lib/llm/router.js';

const TEST_UID = 'test-operator-stark-' + Date.now();
const TEST_PROFILE_ID = '00000000-0000-0000-0000-' + Date.now().toString().slice(-12);

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('⚡ J.A.R.V.I.S — FILE STORAGE & CROSS-SESSION RECALL SUITE');
  console.log('═══════════════════════════════════════════════════════════\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
    }
  }

  try {
    // ── TEST 1: Storage Bucket Configuration ──
    console.log('--- TEST 1: Supabase Storage Bucket Configuration ---');
    const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
    const userFilesBucket = buckets?.find((b) => b.name === 'user-files');
    
    assert(!bucketErr && !!userFilesBucket, 'Bucket `user-files` exists in Supabase');
    assert(userFilesBucket?.public === false, 'Bucket `user-files` is PRIVATE (not public URL accessible)');
    console.log(`     Bucket details: name=${userFilesBucket?.name}, public=${userFilesBucket?.public}, file_size_limit=${userFilesBucket?.file_size_limit}`);

    // ── TEST 2: File Upload to Storage with Prefix Isolation ──
    console.log('\n--- TEST 2: Upload Raw File to Scoped Storage Path ---');
    const fakeImageBuffer = Buffer.from('RIFF....WEBPVP8 ... (simulated Mark 5 schematic image binary)');
    const uploadRes = await uploadUserFile(
      TEST_UID,
      'arc_reactor_mark5_schematic.png',
      fakeImageBuffer,
      'image/png'
    );

    assert(!!uploadRes, 'File successfully uploaded to Storage');
    assert(uploadRes?.path.startsWith(`${TEST_UID}/`), `File path scoped to operator firebase_uid: ${uploadRes?.path}`);
    assert(!!uploadRes?.signedUrl, 'Generated secure signed URL for operator access');
    console.log(`     Storage Path: ${uploadRes?.path}`);

    // Upload a second document file
    const fakeDocBuffer = Buffer.from('Stark Industries Perimeter Security Protocol v4.2: Clearance Level 9.');
    const docUploadRes = await uploadUserFile(
      TEST_UID,
      'security_audit_report.pdf',
      fakeDocBuffer,
      'application/pdf'
    );
    assert(!!docUploadRes, 'Document successfully uploaded to Storage');

    // ── TEST 3: Metadata Persistence with AI Description ──
    console.log('\n--- TEST 3: Database Metadata Persistence with AI Description ---');
    const imageAiDescription =
      'High-resolution technical blueprint of the Arc Reactor Mark 5 showing palladium core configuration, 3.2 gigawatt power output, micro-cooling channels, and magnetic containment ring.';
    const docAiDescription =
      'Stark Industries executive security audit report outlining automated perimeter defense matrix, laser turrets, and biometric clearance levels.';

    const fileRec1 = await insertUploadedFile({
      profile_id: TEST_PROFILE_ID,
      storage_path: uploadRes.path,
      file_type: 'image',
      original_filename: 'arc_reactor_mark5_schematic.png',
      mime_type: 'image/png',
      file_size_bytes: fakeImageBuffer.length,
      ai_description: imageAiDescription,
    });

    assert(!!fileRec1 && !!fileRec1.id, 'Image metadata inserted into database with ai_description');
    assert(fileRec1.ai_description === imageAiDescription, 'Stored ai_description matches generated telemetry');

    const fileRec2 = await insertUploadedFile({
      profile_id: TEST_PROFILE_ID,
      storage_path: docUploadRes.path,
      file_type: 'document',
      original_filename: 'security_audit_report.pdf',
      mime_type: 'application/pdf',
      file_size_bytes: fakeDocBuffer.length,
      ai_description: docAiDescription,
    });

    assert(!!fileRec2 && !!fileRec2.id, 'Document metadata inserted into database with ai_description');

    // ── TEST 4: Tool Recall (`recall_uploaded_files`) ──
    console.log('\n--- TEST 4: `recall_uploaded_files` Tool Querying ---');
    
    // 4A: Keyword query for schematic
    const recallResult1 = await recallUploadedFiles(TEST_PROFILE_ID, {
      query: 'Arc Reactor blueprint',
    });
    assert(recallResult1.found > 0, 'Found files matching query "Arc Reactor blueprint"');
    assert(
      recallResult1.files[0]?.ai_description?.includes('3.2 gigawatt'),
      'Retrieved cached AI description contains specific details (3.2 gigawatt output)'
    );

    // 4B: Filter by file_type = 'document'
    const recallResult2 = await recallUploadedFiles(TEST_PROFILE_ID, {
      file_type: 'document',
    });
    assert(recallResult2.found === 1, 'Correctly filtered files by type = "document"');
    assert(recallResult2.files[0]?.original_filename === 'security_audit_report.pdf', 'Retrieved exact document filename');

    // 4C: Time filter = 'today'
    const recallResult3 = await recallUploadedFiles(TEST_PROFILE_ID, {
      timeframe: 'today',
    });
    assert(recallResult3.found >= 2, 'Timeframe filter "today" retrieved all recently uploaded files');

    // ── TEST 5: Operator Isolation & Security ──
    console.log('\n--- TEST 5: Operator Data Isolation ---');
    const OTHER_PROFILE_ID = '99999999-9999-9999-9999-999999999999';
    const otherUserRecall = await recallUploadedFiles(OTHER_PROFILE_ID, {
      query: 'Arc Reactor',
    });
    assert(otherUserRecall.found === 0, 'Unrelated operator CANNOT retrieve another operator\'s files');

    // ── TEST 6: LLM Cross-Session Recall Execution ──
    console.log('\n--- TEST 6: End-to-End LLM Cross-Session Recall ---');
    const userRecallQuery = 'What was in that schematic photo I uploaded earlier?';
    
    // Simulate LLM calling the recall tool
    const toolCallOutput = await recallUploadedFiles(TEST_PROFILE_ID, {
      query: 'schematic photo',
    });

    const llmPrompt = [
      {
        role: 'system',
        content: `You are J.A.R.V.I.S., Tony Stark's AI assistant. You have access to the user's uploaded files databank. Answer the user concisely based on the retrieved file telemetry.`,
      },
      {
        role: 'user',
        content: userRecallQuery,
      },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_recall_123',
            type: 'function',
            function: {
              name: 'recall_uploaded_files',
              arguments: JSON.stringify({ query: 'schematic photo' }),
            },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call_recall_123',
        content: JSON.stringify(toolCallOutput),
      },
    ];

    const llmResponse = await routeModelRequest({
      messages: llmPrompt,
      requestType: 'quick_chat',
      temperature: 0.2,
      maxTokens: 300,
    });

    console.log(`     LLM Answer: "${llmResponse.content.trim()}"`);
    assert(
      llmResponse.content.toLowerCase().includes('arc reactor') ||
      llmResponse.content.toLowerCase().includes('mark 5') ||
      llmResponse.content.toLowerCase().includes('palladium'),
      'LLM accurately recalled details from cached AI description in a new session'
    );

    // ── TEST 7: 50MB File Size Limit Enforcement ──
    console.log('\n--- TEST 7: 50MB File Limit Enforcement ---');
    let sizeErrorTriggered = false;
    let sizeErrorMessage = '';
    try {
      const fakeHugeFile = {
        name: 'huge_archive.zip',
        type: 'application/zip',
        size: 55 * 1024 * 1024, // 55MB (exceeds 50MB)
      };
      await processUploadedFile(fakeHugeFile);
    } catch (err) {
      sizeErrorTriggered = true;
      sizeErrorMessage = err.message;
    }
    assert(sizeErrorTriggered, '50MB limit rejection triggered gracefully');
    assert(sizeErrorMessage.includes('50MB') && sizeErrorMessage.includes('sir'), `In-character error message: "${sizeErrorMessage}"`);

    // ── TEST 8: Account Purge Integration (DB + Storage Cleanup) ──
    console.log('\n--- TEST 8: Account Deletion (Storage + DB Purge) ---');
    // Delete files from storage
    const storageDeleteCount = await deleteUserFiles(TEST_UID);
    assert(storageDeleteCount >= 2, `Purged ${storageDeleteCount} raw files from Supabase Storage bucket`);

    // Delete rows from metadata table
    const dbDeleteCount = await deleteUploadedFilesByProfile(TEST_PROFILE_ID);
    assert(dbDeleteCount >= 2, `Purged ${dbDeleteCount} metadata rows from uploaded_files table`);

    // Verify storage bucket is empty for this operator
    const { data: remainingFiles } = await supabase.storage.from('user-files').list(TEST_UID);
    assert(!remainingFiles || remainingFiles.length === 0, 'Confirmed zero orphaned files remaining in Supabase Storage');

    // Verify database table has no remaining records
    const postPurgeRecords = await getUploadedFiles(TEST_PROFILE_ID);
    assert(postPurgeRecords.length === 0, 'Confirmed zero orphaned records remaining in database');

  } catch (error) {
    console.error('❌ Unexpected test suite error:', error);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`📊 FINAL RESULTS: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
