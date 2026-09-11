// ──────────────────────────────────────────────
// Tool: Recall Uploaded Files — Search & Retrieve Operator File Telemetry
// Retrieves stored image descriptions and document summaries from Supabase
// ──────────────────────────────────────────────

import { getUploadedFiles, FileQueryFilters } from '@/lib/files/metadata';
import { getSignedFileUrl } from '@/lib/files/storage';

export interface RecallFilesArgs {
  query?: string;
  file_type?: 'image' | 'document' | 'all';
  time_range?: 'today' | 'yesterday' | 'this_week' | 'all';
  limit?: number;
}

/**
 * Recall past files and their stored AI descriptions for the operator
 */
export async function recallUploadedFiles(
  profileId: string,
  args?: RecallFilesArgs
): Promise<string> {
  if (!profileId) {
    return 'Operator authentication required to access file vault.';
  }

  try {
    const filters: FileQueryFilters = {
      query: args?.query,
      file_type: args?.file_type,
      time_range: args?.time_range,
      limit: args?.limit || 10,
    };

    const files = await getUploadedFiles(profileId, filters);

    if (files.length === 0) {
      if (args?.query) {
        return `No stored files or visual feeds found matching "${args.query}", sir.`;
      }
      return 'No past uploaded images or documents found in your archive, sir.';
    }

    // Format files into structured report
    const entries = await Promise.all(
      files.map(async (f, idx) => {
        const uploadDate = new Date(f.uploaded_at);
        const dateStr = uploadDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const timeStr = uploadDate.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });

        const sizeKb = Math.round(f.file_size_bytes / 1024);
        const typeLabel = f.file_type === 'image' ? 'Visual Scan / Photo' : 'Document';

        return `[FILE ${idx + 1}] "${f.original_filename}" (${typeLabel}, ${sizeKb}KB, Uploaded: ${dateStr} at ${timeStr})
- Stored Analysis / Description: "${f.ai_description || 'No description recorded.'}"`;
      })
    );

    return `Found ${files.length} relevant file record(s) in Stark Telemetry Vault:\n\n${entries.join('\n\n')}`;
  } catch (error: any) {
    console.error('[Tool:recall_uploaded_files] Error querying files:', error);
    return `Encountered an anomaly accessing the file vault: ${error?.message || 'Database error'}`;
  }
}
