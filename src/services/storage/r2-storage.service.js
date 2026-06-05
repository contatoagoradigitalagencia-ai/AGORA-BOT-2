/**
 * Cloudflare R2 Storage Service
 * Upload de mídias via S3-compatible API.
 * MongoDB armazena apenas metadados + URL pública.
 */
import { env } from '../../config/env.js';

function getR2Config() {
  if (!env.r2AccessKey || !env.r2SecretKey || !env.r2Bucket || !env.r2Endpoint) {
    return null;
  }
  return {
    endpoint:  env.r2Endpoint,
    accessKey: env.r2AccessKey,
    secretKey: env.r2SecretKey,
    bucket:    env.r2Bucket,
    publicUrl: env.r2PublicUrl,
  };
}

/**
 * Gera assinatura HMAC-SHA256 para AWS S3 Signature V4
 */
async function hmacSHA256(key, data) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

function toHex(buffer) {
  return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer instanceof Uint8Array ? buffer : new TextEncoder().encode(buffer));
  return toHex(new Uint8Array(hash));
}

async function buildSignedHeaders({ method, endpoint, bucket, key, buffer, mimeType, accessKey, secretKey }) {
  const url      = new URL(`${endpoint}/${bucket}/${key}`);
  const host     = url.hostname;
  const now      = new Date();
  const dateStr  = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateOnly = dateStr.slice(0, 8);
  const region   = 'auto';
  const service  = 's3';

  const payloadHash = await sha256Hex(buffer);
  const headers = {
    'content-type':        mimeType,
    'host':                host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date':          dateStr,
  };

  const signedHeaderNames = Object.keys(headers).sort().join(';');
  const canonicalHeaders  = Object.entries(headers).sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => `${k}:${v}`).join('\n') + '\n';

  const canonicalRequest = [method, `/${bucket}/${key}`, '', canonicalHeaders, signedHeaderNames, payloadHash].join('\n');
  const credentialScope  = `${dateOnly}/${region}/${service}/aws4_request`;
  const stringToSign     = ['AWS4-HMAC-SHA256', dateStr, credentialScope, await sha256Hex(new TextEncoder().encode(canonicalRequest))].join('\n');

  const kDate    = await hmacSHA256('AWS4' + secretKey, dateOnly);
  const kRegion  = await hmacSHA256(kDate, region);
  const kService = await hmacSHA256(kRegion, service);
  const kSigning = await hmacSHA256(kService, 'aws4_request');
  const signature = toHex(await hmacSHA256(kSigning, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`;

  return { url: url.toString(), headers: { ...headers, Authorization: authorization } };
}

/**
 * Upload de buffer para R2.
 * Retorna { storage, key, url, mimeType, fileName, size } ou null se R2 não configurado.
 */
export async function uploadToR2({ organizationId, conversationId, messageId, buffer, mimeType, fileName, type }) {
  const cfg = getR2Config();
  if (!cfg) {
    console.warn('[R2] Not configured — skipping upload');
    return null;
  }

  const timestamp = Date.now();
  const safeName  = (fileName || `${type}-${timestamp}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const key       = `organizations/${organizationId}/conversations/${conversationId}/${messageId}/${timestamp}-${safeName}`;

  try {
    const { url, headers } = await buildSignedHeaders({
      method:    'PUT',
      endpoint:  cfg.endpoint,
      bucket:    cfg.bucket,
      key,
      buffer:    buffer instanceof Buffer ? buffer : Buffer.from(buffer),
      mimeType,
      accessKey: cfg.accessKey,
      secretKey: cfg.secretKey,
    });

    const res = await fetch(url, {
      method:  'PUT',
      headers: { ...headers, 'content-length': String(buffer.length) },
      body:    buffer,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`R2 upload failed: ${res.status} ${body.slice(0, 200)}`);
    }

    const publicUrl = cfg.publicUrl
      ? `${cfg.publicUrl.replace(/\/$/, '')}/${key}`
      : `${cfg.endpoint}/${cfg.bucket}/${key}`;

    console.log('[R2] uploaded:', key);
    return { storage: 'r2', key, url: publicUrl, mimeType, fileName: safeName, size: buffer.length };
  } catch (err) {
    console.error('[R2] upload error:', err.message);
    return null;
  }
}

export function r2Configured() {
  return Boolean(env.r2AccessKey && env.r2SecretKey && env.r2Bucket && env.r2Endpoint);
}
