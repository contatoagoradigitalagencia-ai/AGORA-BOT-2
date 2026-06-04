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
