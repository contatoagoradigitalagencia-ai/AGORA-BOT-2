import mongoose from 'mongoose';

const promptSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['bot', 'catalog', 'handoff', 'system'], default: 'bot', index: true },
  content: { type: String, required: true },
  model: { type: String, default: 'llama-3.3-70b-versatile' },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

promptSchema.index({ organizationId: 1, type: 1, active: 1 });

export const Prompt = mongoose.model('Prompt', promptSchema, 'prompts');
