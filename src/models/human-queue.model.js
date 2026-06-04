import mongoose from 'mongoose';

const humanQueueSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
  assignedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  reason: { type: String, default: '' },
  status: { type: String, enum: ['waiting', 'assigned', 'resolved'], default: 'waiting', index: true },
  priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal', index: true },
}, { timestamps: true });

humanQueueSchema.index({ organizationId: 1, status: 1, createdAt: 1 });

export const HumanQueue = mongoose.model('HumanQueue', humanQueueSchema, 'human_queue');
