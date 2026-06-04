import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  whatsappAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAccount', required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
  status: { type: String, enum: ['open', 'pending_human', 'closed'], default: 'open', index: true },
  assignedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  aiEnabled: { type: Boolean, default: true },
  humanRequired: { type: Boolean, default: false, index: true },
  lastMessageAt: { type: Date, index: true },
  lastMessagePreview: { type: String, default: '' },
  unreadCount: { type: Number, default: 0 },
  metadata: { type: Object, default: {} },
}, { timestamps: true });

conversationSchema.index({ organizationId: 1, whatsappAccountId: 1, contactId: 1 }, { unique: true });
conversationSchema.index({ organizationId: 1, status: 1, lastMessageAt: -1 });

export const Conversation = mongoose.model('Conversation', conversationSchema, 'conversations');
