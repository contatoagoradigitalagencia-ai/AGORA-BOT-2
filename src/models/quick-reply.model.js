import mongoose from 'mongoose';

const quickReplySchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  title: { type: String, required: true, trim: true },
  type: { type: String, enum: ['text', 'image', 'audio', 'document'], default: 'text' },
  payload: { type: Object, required: true },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

quickReplySchema.index({ organizationId: 1, active: 1, title: 1 });

export const QuickReply = mongoose.model('QuickReply', quickReplySchema, 'quick_replies');
