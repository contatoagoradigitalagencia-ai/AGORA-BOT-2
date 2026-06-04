import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  settings: { type: Object, default: {} },
}, { timestamps: true });

export const Organization = mongoose.model('Organization', organizationSchema, 'organizations');
