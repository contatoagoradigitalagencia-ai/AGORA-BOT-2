import mongoose from 'mongoose';

const whatsappAccountSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  provider: { type: String, enum: ['meta', 'zapi'], required: true, index: true },
  label: { type: String, required: true, trim: true },
  phoneNumber: { type: String, required: true, trim: true },
  phoneNumberId: { type: String, trim: true, index: true },
  wabaId: { type: String, trim: true },
  externalId: { type: String, trim: true, index: true },
  instanceId: { type: String, trim: true, index: true },
  accessTokenEncrypted: { type: String, default: '', select: false },
  clientTokenEncrypted: { type: String, default: '', select: false },
  verifyToken: { type: String, default: '', select: false },
  webhookSecret: { type: String, default: '', select: false },
  status: { type: String, enum: ['active', 'inactive', 'needs_attention'], default: 'active', index: true },
  settings: { type: Object, default: {} },
}, { timestamps: true });

whatsappAccountSchema.index({ organizationId: 1, provider: 1, phoneNumber: 1 }, { unique: true });
whatsappAccountSchema.index({ provider: 1, phoneNumberId: 1 }, { sparse: true });
whatsappAccountSchema.index({ provider: 1, instanceId: 1 }, { sparse: true });
whatsappAccountSchema.index({ provider: 1, externalId: 1 }, { sparse: true });

export const WhatsAppAccount = mongoose.model('WhatsAppAccount', whatsappAccountSchema, 'whatsapp_accounts');
