import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  whatsappAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAccount', required: true, index: true },
  phone: { type: String, required: true, trim: true },
  name: { type: String, default: '', trim: true },
  tags: { type: [String], default: [] },
  lastMessageAt: { type: Date, index: true },
  metadata: { type: Object, default: {} },
}, { timestamps: true });

contactSchema.index({ organizationId: 1, whatsappAccountId: 1, phone: 1 }, { unique: true });
contactSchema.index({ organizationId: 1, lastMessageAt: -1 });

export const Contact = mongoose.model('Contact', contactSchema, 'contacts');
