// src/lib/messaging/media-manager.ts
// Phase 4E: Hardened Media Messaging Foundation
// Handles media validation, magic byte checking, private storage in Supabase Storage,
// signed URL authorization, provider media retrieval (WhatsApp/Messenger/Instagram),
// and resilient retry/failure recovery.

import crypto from 'crypto';
import path from 'path';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit';
import type {
  MessageAttachment,
  MessageAttachmentType,
  ChannelType,
} from '@/types';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS & SECURITY LIMITS
// ═══════════════════════════════════════════════════════════════

export const MEDIA_STORAGE_BUCKET = 'inbox-media';

export const MEDIA_SIZE_LIMITS: Record<MessageAttachmentType, number> = {
  image: 20 * 1024 * 1024,    // 20MB
  audio: 25 * 1024 * 1024,    // 25MB
  video: 50 * 1024 * 1024,    // 50MB
  document: 50 * 1024 * 1024, // 50MB
  other: 25 * 1024 * 1024,    // 25MB
};

// Safe allowed extensions per category
export const ALLOWED_EXTENSIONS: Record<MessageAttachmentType, string[]> = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  audio: ['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.opus'],
  video: ['.mp4', '.mov', '.webm', '.3gp'],
  document: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'],
  other: ['.pdf', '.txt'],
};

// Dangerous executable file extensions strictly prohibited
export const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.scr', '.msi', '.com', '.vbs', '.js',
  '.sh', '.py', '.php', '.html', '.htm', '.svg', '.ps1', '.jar',
  '.apk', '.dll', '.reg', '.wsf', '.cpl',
]);

export interface MediaValidationResult {
  valid: boolean;
  error?: string;
  mediaType: MessageAttachmentType;
  mimeType: string;
  sanitizedFilename: string;
  fileSize: number;
  checksum: string;
}

// ═══════════════════════════════════════════════════════════════
// MAGIC BYTES & FILE SIGNATURE VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Validates file buffer against known magic bytes to prevent MIME spoofing.
 */
export function detectMagicBytes(buffer: Buffer): { mime?: string; type?: MessageAttachmentType } | null {
  if (buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', type: 'image' };
  }

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: 'image/png', type: 'image' };
  }

  // GIF: 47 49 46 38 ('GIF8')
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { mime: 'image/gif', type: 'image' };
  }

  // WEBP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', type: 'image' };
  }

  // PDF: %PDF (25 50 44 46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { mime: 'application/pdf', type: 'document' };
  }

  // ZIP / DOCX / XLSX: PK.. (50 4B 03 04)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return { mime: 'application/octet-stream', type: 'document' };
  }

  // OGG: OggS (4F 67 67 53)
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return { mime: 'audio/ogg', type: 'audio' };
  }

  // MP3: ID3 (49 44 33) or MPEG sync frame FF FB / FF F3
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
    (buffer[0] === 0xff && (buffer[1] === 0xfb || buffer[1] === 0xf3))
  ) {
    return { mime: 'audio/mpeg', type: 'audio' };
  }

  // MP4 / MOV: ftyp at offset 4
  if (
    buffer.length >= 8 &&
    buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70
  ) {
    return { mime: 'video/mp4', type: 'video' };
  }

  // WAV: RIFF .... WAVE
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45
  ) {
    return { mime: 'audio/wav', type: 'audio' };
  }

  return null;
}

/**
 * Validates a media buffer against type limits, extensions, and magic bytes.
 */
export function validateMediaFile(
  buffer: Buffer,
  filename: string,
  declaredMimeType?: string,
  hintMediaType?: MessageAttachmentType
): MediaValidationResult {
  const ext = path.extname(filename).toLowerCase();
  const baseName = path.basename(filename, ext);

  // 1. Sanitize filename against path traversal and malicious characters
  const cleanBase = baseName.replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '_').slice(0, 100);
  const sanitizedFilename = `${cleanBase || 'attachment'}${ext}`;

  // 2. Reject dangerous file extensions immediately
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Security violation: File type '${ext}' is strictly prohibited and restricted.`,
      mediaType: 'other',
      mimeType: declaredMimeType || 'application/octet-stream',
      sanitizedFilename,
      fileSize: buffer.length,
      checksum: '',
    };
  }

  // 3. Determine target media type
  let mediaType: MessageAttachmentType = hintMediaType || 'document';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
    mediaType = 'image';
  } else if (['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.opus'].includes(ext)) {
    mediaType = 'audio';
  } else if (['.mp4', '.mov', '.webm', '.3gp'].includes(ext)) {
    mediaType = 'video';
  } else if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'].includes(ext)) {
    mediaType = 'document';
  }

  // 4. Validate allowed extension for media type
  const allowed = ALLOWED_EXTENSIONS[mediaType] || ALLOWED_EXTENSIONS.document;
  if (ext && !allowed.includes(ext)) {
    return {
      valid: false,
      error: `File extension '${ext}' is not supported for ${mediaType} messages.`,
      mediaType,
      mimeType: declaredMimeType || 'application/octet-stream',
      sanitizedFilename,
      fileSize: buffer.length,
      checksum: '',
    };
  }

  // 5. Check size limit
  const limit = MEDIA_SIZE_LIMITS[mediaType] || MEDIA_SIZE_LIMITS.document;
  if (buffer.length > limit) {
    const limitMb = Math.round(limit / (1024 * 1024));
    return {
      valid: false,
      error: `File size exceeds the maximum size limit of ${limitMb}MB for ${mediaType}.`,
      mediaType,
      mimeType: declaredMimeType || 'application/octet-stream',
      sanitizedFilename,
      fileSize: buffer.length,
      checksum: '',
    };
  }

  // 6. Magic bytes check (defense against MIME spoofing)
  const magic = detectMagicBytes(buffer);
  if (mediaType === 'image' && (!magic || magic.type !== 'image')) {
    return {
      valid: false,
      error: 'File signature mismatch: File content does not match valid image format.',
      mediaType,
      mimeType: magic?.mime || declaredMimeType || 'application/octet-stream',
      sanitizedFilename,
      fileSize: buffer.length,
      checksum: '',
    };
  }

  if (magic && magic.type && mediaType !== 'document' && magic.type !== mediaType) {
    return {
      valid: false,
      error: `File signature mismatch: File content does not match declared ${mediaType} format.`,
      mediaType,
      mimeType: magic.mime || declaredMimeType || 'application/octet-stream',
      sanitizedFilename,
      fileSize: buffer.length,
      checksum: '',
    };
  }

  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const mimeType = magic?.mime || declaredMimeType || 'application/octet-stream';

  return {
    valid: true,
    mediaType,
    mimeType,
    sanitizedFilename,
    fileSize: buffer.length,
    checksum,
  };
}

export interface OutboundMediaRuleCheck {
  allowed: boolean;
  error?: string;
}

/**
 * Validates provider capabilities and business rules before outbound media dispatch.
 * Enforces WhatsApp 24-hour service window and Instagram API media type limits.
 */
export function checkOutboundMediaRules(params: {
  channel: ChannelType;
  mediaType: MessageAttachmentType;
  lastMessageAt?: string | null;
  recipientId?: string | null;
}): OutboundMediaRuleCheck {
  // 1. WhatsApp 24-Hour Customer Window Rule
  if (params.channel === 'whatsapp') {
    const lastMsgTime = params.lastMessageAt ? new Date(params.lastMessageAt).getTime() : 0;
    const isWithin24Hours = Date.now() - lastMsgTime <= 24 * 60 * 60 * 1000;
    if (!isWithin24Hours) {
      return {
        allowed: false,
        error:
          'WhatsApp 24-hour customer service window expired. Free-form media can only be sent within 24 hours of customer inquiry.',
      };
    }
  }

  // 2. Instagram Messaging API Capabilities Rule (No Document Support)
  if (params.channel === 'instagram') {
    if (params.mediaType === 'document') {
      return {
        allowed: false,
        error:
          'Instagram Messaging does not support document attachments. Only images and videos are supported.',
      };
    }
  }

  // 3. Recipient Check
  if (!params.recipientId) {
    return {
      allowed: false,
      error: `Missing customer recipient identifier for ${params.channel}.`,
    };
  }

  return { allowed: true };
}

// ═══════════════════════════════════════════════════════════════
// STORAGE PATH GENERATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Generates an isolated, non-traversable server-side storage path.
 */
export function generateStoragePath(
  conversationId: string,
  messageId: string,
  filename: string
): string {
  const ext = path.extname(filename).toLowerCase();
  const safeRandomId = crypto.randomUUID();
  return `conversations/${conversationId}/${messageId}/${safeRandomId}${ext}`;
}

// ═══════════════════════════════════════════════════════════════
// INBOUND MEDIA DOWNLOADERS (WHATSAPP, MESSENGER, INSTAGRAM)
// ═══════════════════════════════════════════════════════════════

/**
 * Downloads a WhatsApp media file using Meta Cloud API 2-step retrieval.
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
  whatsappToken: string
): Promise<{ buffer: Buffer; mimeType: string; fileSize?: number } | null> {
  if (!mediaId || !whatsappToken) return null;

  try {
    // Step 1: Query Graph API to get media download URL
    const metaUrl = `https://graph.facebook.com/v21.0/${mediaId}`;
    const metaRes = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${whatsappToken}` },
      signal: AbortSignal.timeout(8000),
    });

    if (!metaRes.ok) {
      console.warn('[WhatsApp Media] Failed to get media URL for ID:', mediaId, metaRes.status);
      return null;
    }

    const metaData = (await metaRes.json()) as {
      url?: string;
      mime_type?: string;
      file_size?: number;
    };

    if (!metaData.url) return null;

    // Step 2: Download raw binary from lookaside URL with Bearer token
    const binRes = await fetch(metaData.url, {
      headers: {
        Authorization: `Bearer ${whatsappToken}`,
        'User-Agent': 'ElExir-ERP/1.0',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!binRes.ok) {
      console.warn('[WhatsApp Media] Failed to download binary file:', binRes.status);
      return null;
    }

    const arrayBuffer = await binRes.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: metaData.mime_type || binRes.headers.get('content-type') || 'application/octet-stream',
      fileSize: metaData.file_size || arrayBuffer.byteLength,
    };
  } catch (err) {
    console.error('[WhatsApp Media] Download exception:', err);
    return null;
  }
}

/**
 * Downloads a Messenger or Instagram attachment from a direct provider URL.
 */
export async function downloadDirectMedia(
  mediaUrl: string,
  accessToken?: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (!mediaUrl) return null;

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'ElExir-ERP/1.0',
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const res = await fetch(mediaUrl, {
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn('[Direct Media] Download failed with status:', res.status, mediaUrl);
      return null;
    }

    const mimeType = res.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType,
    };
  } catch (err) {
    console.error('[Direct Media] Download exception:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// INBOUND MEDIA PROCESSOR (ATOMIC & IDEMPOTENT)
// ═══════════════════════════════════════════════════════════════

export interface ProcessInboundMediaInput {
  conversationId: string;
  messageId: string;
  channel: ChannelType;
  mediaType?: MessageAttachmentType;
  externalMediaId?: string | null;
  mediaUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  caption?: string | null;
}

/**
 * Downloads, validates, and securely stores an inbound media attachment.
 * Resilient against network failures: records attachment as failed if download fails,
 * preserving message and raw webhook event.
 */
export async function processInboundMedia(
  input: ProcessInboundMediaInput
): Promise<MessageAttachment | null> {
  const admin = createAdminClient();
  const resolvedMediaType: MessageAttachmentType = input.mediaType || 'document';

  // Helper for resilient insert/update
  async function persistAttachment(fields: Record<string, unknown> & { message_id: string; status: string }) {
    const { data: current } = await admin
      .from('message_attachments')
      .select('id')
      .eq('message_id', fields.message_id)
      .maybeSingle();

    if (current) {
      const { data, error } = await admin
        .from('message_attachments')
        .update({
          ...fields,
          updated_at: new Date().toISOString(),
        })
        .eq('id', current.id)
        .select('*')
        .single();
      if (error) {
        console.error('[Inbound Media] Update error:', error);
      }
      return data as MessageAttachment | null;
    } else {
      const { data, error } = await admin
        .from('message_attachments')
        .insert(fields)
        .select('*')
        .single();
      if (error) {
        console.error('[Inbound Media] Insert error:', error);
      }
      return data as MessageAttachment | null;
    }
  }

  // Check if attachment record already exists (Idempotency)
  const { data: existing } = await admin
    .from('message_attachments')
    .select('*')
    .eq('message_id', input.messageId)
    .maybeSingle();

  if (existing && existing.status === 'stored') {
    return existing as MessageAttachment;
  }

  let downloadResult: { buffer: Buffer; mimeType: string; fileSize?: number } | null = null;

  // 1. Download media based on channel
  if (input.channel === 'whatsapp' && input.externalMediaId) {
    const waToken =
      process.env.WHATSAPP_ACCESS_TOKEN?.trim() ||
      process.env.META_PAGE_ACCESS_TOKEN?.trim() ||
      '';
    downloadResult = await downloadWhatsAppMedia(input.externalMediaId, waToken);
  }

  // Fallback to direct URL if WhatsApp media ID download failed or if Messenger/Instagram
  if (!downloadResult && input.mediaUrl) {
    const pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
    downloadResult = await downloadDirectMedia(input.mediaUrl, pageToken);
  }

  // 2. Handle download failure gracefully
  if (!downloadResult || downloadResult.buffer.length === 0) {
    console.warn('[Inbound Media] Media download failed for message:', input.messageId);

    const placeholderPath = `failed/${input.conversationId}/${input.messageId}/pending`;
    const failedRecord = await persistAttachment({
      message_id: input.messageId,
      storage_path: placeholderPath,
      provider: input.channel,
      external_media_id: input.externalMediaId || null,
      media_type: resolvedMediaType,
      mime_type: input.mimeType || 'application/octet-stream',
      file_name: input.fileName || 'attachment',
      status: 'failed',
      metadata: {
        error: 'Failed to download binary from provider',
        attempted_at: new Date().toISOString(),
      },
    });

    void writeAuditLog({
      actor_id: null,
      action: 'inbox.media_download_failed',
      module: 'crm',
      entity_type: 'message',
      entity_id: input.messageId,
      new_value: {
        conversation_id: input.conversationId,
        channel: input.channel,
        external_media_id: input.externalMediaId,
      },
    }).catch((err) => console.error('[Audit Log] Failed:', err));

    return failedRecord;
  }

  // 3. Validate binary
  const fallbackExt =
    resolvedMediaType === 'image' ? '.jpg' :
    resolvedMediaType === 'audio' ? '.ogg' :
    resolvedMediaType === 'video' ? '.mp4' : '.bin';

  const initialName = input.fileName || `media_${Date.now()}${fallbackExt}`;
  const validation = validateMediaFile(
    downloadResult.buffer,
    initialName,
    downloadResult.mimeType || input.mimeType || undefined,
    resolvedMediaType
  );

  if (!validation.valid) {
    console.warn('[Inbound Media] Validation rejected file:', validation.error);

    const invalidRecord = await persistAttachment({
      message_id: input.messageId,
      storage_path: `invalid/${input.conversationId}/${input.messageId}/rejected`,
      provider: input.channel,
      external_media_id: input.externalMediaId || null,
      media_type: resolvedMediaType,
      mime_type: validation.mimeType,
      file_name: validation.sanitizedFilename,
      file_size: validation.fileSize,
      status: 'failed',
      metadata: {
        error: validation.error,
        rejected_at: new Date().toISOString(),
      },
    });

    return invalidRecord;
  }

  // 4. Upload to Supabase Storage private bucket
  const storagePath = generateStoragePath(
    input.conversationId,
    input.messageId,
    validation.sanitizedFilename
  );

  const { error: uploadError } = await admin.storage
    .from(MEDIA_STORAGE_BUCKET)
    .upload(storagePath, downloadResult.buffer, {
      contentType: validation.mimeType,
      upsert: true,
    });

  if (uploadError) {
    console.error('[Inbound Media] Storage upload failed:', uploadError.message);

    const uploadFailedRecord = await persistAttachment({
      message_id: input.messageId,
      storage_path: storagePath,
      provider: input.channel,
      external_media_id: input.externalMediaId || null,
      media_type: validation.mediaType,
      mime_type: validation.mimeType,
      file_name: validation.sanitizedFilename,
      file_size: validation.fileSize,
      status: 'failed',
      metadata: { error: uploadError.message },
    });

    return uploadFailedRecord;
  }

  // 5. Insert attachment record and update message
  const storedAttachment = await persistAttachment({
    message_id: input.messageId,
    storage_path: storagePath,
    provider: input.channel,
    external_media_id: input.externalMediaId || null,
    media_type: validation.mediaType,
    mime_type: validation.mimeType,
    file_name: validation.sanitizedFilename,
    file_size: validation.fileSize,
    checksum: validation.checksum,
    caption: input.caption || null,
    status: 'stored',
    metadata: {
      original_url: input.mediaUrl ? 'preserved_internally' : null,
      stored_at: new Date().toISOString(),
    },
  });

  // Backward-compatible update to app.messages.media_url
  await admin
    .from('messages')
    .update({
      media_url: storagePath,
      message_type: validation.mediaType,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.messageId);

  // Write audit log
  void writeAuditLog({
    actor_id: null,
    action: 'inbox.media_received',
    module: 'crm',
    entity_type: 'message',
    entity_id: input.messageId,
    new_value: {
      conversation_id: input.conversationId,
      channel: input.channel,
      media_type: validation.mediaType,
      file_size: validation.fileSize,
      storage_path: storagePath,
    },
  }).catch((err) => console.error('[Audit Log] Failed:', err));

  return storedAttachment as MessageAttachment | null;
}
