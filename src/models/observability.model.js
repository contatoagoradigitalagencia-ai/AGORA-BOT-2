import mongoose from 'mongoose';

const metricSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
  name: { type: String, required: true, index: true },
  value: { type: Number, default: 1 },
  dimensions: { type: Object, default: {} },
  occurredAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

const logSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
  level: { type: String, enum: ['debug', 'info', 'warn', 'error'], default: 'info', index: true },
  message: { type: String, required: true },
  context: { type: Object, default: {} },
}, { timestamps: true });

const errorSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
  source: { type: String, required: true, index: true },
  message: { type: String, required: true },
  stack: { type: String, default: '' },
  context: { type: Object, default: {} },
  resolved: { type: Boolean, default: false, index: true },
}, { timestamps: true });

metricSchema.index({ organizationId: 1, name: 1, occurredAt: -1 });
logSchema.index({ organizationId: 1, level: 1, createdAt: -1 });
errorSchema.index({ organizationId: 1, source: 1, createdAt: -1 });

export const Metric = mongoose.model('Metric', metricSchema, 'metrics');
export const Log = mongoose.model('Log', logSchema, 'logs');
export const ErrorLog = mongoose.model('ErrorLog', errorSchema, 'errors');
