import dotenv from 'dotenv';

dotenv.config();

function list(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
  corsOrigins: list(process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173'),
  mongodbUri: process.env.MONGODB_URI || '',
  mongodbDbName: process.env.MONGODB_DB_NAME || 'Agorabot2',
  jwtSecret: process.env.JWT_SECRET || '',
  internalApiToken: process.env.INTERNAL_API_TOKEN || '',
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  metaVerifyToken: process.env.META_VERIFY_TOKEN || '',
  metaGraphVersion: process.env.META_GRAPH_VERSION || 'v22.0',
  zapiBaseUrl: process.env.ZAPI_BASE_URL || 'https://api.z-api.io',
  zapiClientToken: process.env.ZAPI_CLIENT_TOKEN || '',
  // Cloudflare R2
  r2AccountId:   process.env.CLOUDFLARE_R2_ACCOUNT_ID  || '',
  r2AccessKey:   process.env.CLOUDFLARE_R2_ACCESS_KEY   || '',
  r2SecretKey:   process.env.CLOUDFLARE_R2_SECRET_KEY   || '',
  r2Bucket:      process.env.CLOUDFLARE_R2_BUCKET        || '',
  r2Endpoint:    process.env.CLOUDFLARE_R2_ENDPOINT      || '',
  r2PublicUrl:   process.env.CLOUDFLARE_R2_PUBLIC_URL    || process.env.CLOUDFLARE_R2_URL_PUBLIC || '',
  // Media limits
  mediaMaxBytes: Number(process.env.MEDIA_MAX_BYTES || 20 * 1024 * 1024), // 20MB
};

export function assertRuntimeEnv() {
  if (!env.mongodbUri) throw new Error('MONGODB_URI is required');
  if (env.mongodbDbName !== 'Agorabot2') {
    throw new Error(`MONGODB_DB_NAME must be Agorabot2. Received: ${env.mongodbDbName}`);
  }
  if (!env.jwtSecret) {
    throw new Error('JWT_SECRET is required for authentication');
  }
  if (env.nodeEnv === 'production') {
    const required = [
      ['JWT_SECRET', env.jwtSecret],
      ['INTERNAL_API_TOKEN', env.internalApiToken],
      ['GROQ_API_KEY', env.groqApiKey],
    ];
    for (const [name, value] of required) {
      if (!value) throw new Error(`${name} is required in production`);
    }
  }
}
