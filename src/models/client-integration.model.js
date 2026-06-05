import mongoose from 'mongoose';

/**
 * Armazena credenciais de integração por cliente/organização.
 * Tokens sensíveis são criptografados antes de salvar.
 * Nunca retornar campos com select: false nas queries normais.
 */
const clientIntegrationSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  clientName:     { type: String, required: true, trim: true },
  companyName:    { type: String, trim: true, default: '' },
  provider:       { type: String, enum: ['meta', 'zapi'], required: true },
  status:         { type: String, enum: ['active', 'inactive', 'pending', 'error'], default: 'pending' },
  lastTestedAt:   { type: Date, default: null },
  lastTestResult: { type: String, default: '' },

  // Meta Cloud API
  metaWabaId:           { type: String, default: '' },
  metaPhoneNumberId:    { type: String, default: '' },
  metaAccessToken:      { type: String, default: '', select: false },
  metaVerifyToken:      { type: String, default: '', select: false },
  metaAppId:            { type: String, default: '' },
  metaAppSecret:        { type: String, default: '', select: false },

  // Z-API
  zapiInstanceId:    { type: String, default: '' },
  zapiInstanceToken: { type: String, default: '', select: false },
  zapiClientToken:   { type: String, default: '', select: false },
  zapiBaseUrl:       { type: String, default: 'https://api.z-api.io' },
}, { timestamps: true, collection: 'client_integrations' });

clientIntegrationSchema.index({ organizationId: 1, provider: 1 });

export const ClientIntegration = mongoose.model('ClientIntegration', clientIntegrationSchema, 'client_integrations');
