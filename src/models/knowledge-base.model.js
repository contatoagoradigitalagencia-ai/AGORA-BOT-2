import mongoose from 'mongoose';

const knowledgeBaseSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  tags: { type: [String], default: [] },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

knowledgeBaseSchema.index({ organizationId: 1, active: 1, title: 1 });

export const KnowledgeBase = mongoose.model('KnowledgeBase', knowledgeBaseSchema, 'knowledge_base');
