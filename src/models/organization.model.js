import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
  ownerName: { type: String, trim: true, default: '' },
  responsibleName: { type: String, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  plan: { type: String, trim: true, default: 'starter' },
  notes: { type: String, default: '' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  settings: { type: Object, default: {} },
}, { timestamps: true });

export const Organization = mongoose.model('Organization', organizationSchema, 'organizations');
