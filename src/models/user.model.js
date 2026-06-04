import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['owner', 'admin', 'manager', 'agent', 'viewer'], default: 'agent', index: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
}, { timestamps: true });

userSchema.index({ organizationId: 1, role: 1 });

export const User = mongoose.model('User', userSchema, 'users');
