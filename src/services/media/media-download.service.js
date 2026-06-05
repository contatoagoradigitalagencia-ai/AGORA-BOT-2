/**
 * Media Download Service
 * Baixa mídia do provedor WhatsApp e retorna buffer.
 * Suporta Z-API (URL pública ou autenticada) e Meta (Graph API).
 */
import { env } from '../../config/env.js';

const MAX_BYTES   = env.mediaMaxBytes || 20 * 1024 * 1024; // 20MB
const TIMEOUT_MS  = 30_000;

const ALLOWED_MIME = new Set([
  'image/jpeg','image/png','image/webp','image/gif',
  'audio/ogg','audio/mpeg','audio/mp4','audio/webm',
  'video/mp4','video/webm','video/quicktime',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip','application/x-zip-compressed',
  'text/plain',
]);

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Obtém a URL de download para Z-API.
 * A Z-API geralmente retorna URL pública diretamente no payload.
 * Se não, usa o endpoint de download autenticado.
 */
function extractZapiMediaUrl(media, raw, account) {
  const direct = media?.link || media?.url || media?.mediaUrl
    || raw?.image?.imageUrl || raw?.audio?.audioUrl
    || raw?.document?.documentUrl || raw?.video?.videoUrl
    || raw?.sticker?.stickerUrl;
  if (direct) return direct;

  // Fallback: endpoint autenticado da Z-API
  const instanceId = account?.credentials?.instanceId || account?.instanceId;
  const token      = account?.credentials?.instanceToken;
  const base       = (account?.credentials?.baseUrl || env.zapiBaseUrl || 'https://api.z-api.io').replace(/\/$/, '');
  const msgId      = raw?.messageId || raw?.id;
  if (instanceId && token && msgId) {
    return `${base}/instances/${instanceId}/token/${token}/download-media?messageId=${msgId}`;
  }
  return null;
}

/**
 * Obtém URL de download para Meta Cloud API.
 * Requer media_id → GET /MEDIA_ID → url → download com token.
 */
async function resolveMetaMediaUrl(mediaId, accessToken) {
  const metaVersion = env.metaGraphVersion || 'v22.0';
  const res = await fetchWithTimeout(
    `https://graph.facebook.com/${metaVersion}/${mediaId}?access_token=${accessToken}`
  );
  if (!res.ok) throw new Error(`Meta media resolve failed: ${res.status}`);
  const data = await res.json();
  return data.url;
}

/**
 * Baixa mídia do provedor e retorna { buffer, mimeType, fileName, size }.
 */
export async function downloadProviderMedia({ provider, account, media, raw }) {
  try {
    let downloadUrl = null;
    let authHeaders = {};

    if (provider === 'zapi') {
      downloadUrl = extractZapiMediaUrl(media, raw, account?.toObject ? account.toObject() : account);
      console.log('[Media] Z-API download URL:', downloadUrl ? downloadUrl.slice(0, 80) : 'not found');
    } else if (provider === 'meta') {
      const mediaId = media?.id || raw?.image?.id || raw?.audio?.id || raw?.document?.id;
      const token   = account?.credentials?.accessToken || process.env.META_ACCESS_TOKEN;
      if (!mediaId || !token) throw new Error('Meta: mediaId or token missing');
      downloadUrl = await resolveMetaMediaUrl(mediaId, token);
      authHeaders = { Authorization: `Bearer ${token}` };
      console.log('[Media] Meta download URL resolved');
    }

    if (!downloadUrl) throw new Error('No download URL available');

    const res = await fetchWithTimeout(downloadUrl, { headers: authHeaders });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const contentType  = res.headers.get('content-type') || 'application/octet-stream';
    const mimeType     = contentType.split(';')[0].trim();
    const contentLength = parseInt(res.headers.get('content-length') || '0');

    if (contentLength > MAX_BYTES) throw new Error(`File too large: ${contentLength} bytes`);

    const arrayBuffer = await res.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);
    if (buffer.length > MAX_BYTES) throw new Error(`File too large after download: ${buffer.length} bytes`);

    // Tenta detectar fileName
    const contentDisposition = res.headers.get('content-disposition') || '';
    const fileNameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    const ext      = mimeType.split('/')[1]?.replace('jpeg','jpg') || 'bin';
    const fileName = media?.fileName || media?.filename
      || (fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : null)
      || `media-${Date.now()}.${ext}`;

    console.log('[Media] downloaded:', fileName, buffer.length, 'bytes', mimeType);
    return { buffer, mimeType, fileName, size: buffer.length };
  } catch (err) {
    console.error('[Media] download failed:', err.message);
    return null;
  }
}
