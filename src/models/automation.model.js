import mongoose from 'mongoose';

const automationSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  trigger: { type: String, required: true },
  conditions: { type: Object, default: {} },
  actions: { type: [Object], default: [] },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

const flowSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  nodes: { type: [Object], default: [] },
  edges: { type: [Object], default: [] },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

export const Automation = mongoose.model('Automation', automationSchema, 'automations');
export const Flow = mongoose.model('Flow', flowSchema, 'flows');
