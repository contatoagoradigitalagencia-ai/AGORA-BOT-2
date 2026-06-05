import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  whatsappAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAccount', required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  provider: { type: String, enum: ['meta', 'zapi'], required: true, index: true },
  providerMessageId: { type: String, trim: true },
  direction: { type: String, enum: ['inbound', 'outbound'], required: true, index: true },
  type: { type: String, enum: ['text', 'image', 'audio', 'document', 'video', 'sticker', 'location', 'contacts', 'interactive', 'unknown'], default: 'text' },
  text: { type: String, default: '' },
  media: { type: Object, default: {} },
  status: { type: String, enum: ['received', 'sent', 'delivered', 'read', 'failed'], default: 'received', index: true },
  raw: { type: Object, default: {} },
  occurredAt: { type: Date, default: Date.now, index: true },
  aiGenerated:          { type: Boolean, default: false },
  // Autoria humana
  sentByUserId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sentByUserName:       { type: String, default: '' },
  source:               { type: String, enum: ['bot', 'human', 'system', 'client'], default: 'client' },
  // Reply
  replyToMessageId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  replyToPreview:       { type: Object, default: null },
}, { timestamps: true });

messageSchema.index({ whatsappAccountId: 1, provider: 1, providerMessageId: 1 }, { unique: true, sparse: true });
messageSchema.index({ organizationId: 1, conversationId: 1, occurredAt: 1 });

export const Message = mongoose.model('Message', messageSchema, 'messages');
