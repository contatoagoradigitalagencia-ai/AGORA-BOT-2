import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true, unique: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: {
    type: String,
    enum: ['owner', 'admin', 'manager', 'agent', 'seller', 'viewer'],
    default: 'agent',
    index: true,
  },
  active:     { type: Boolean, default: true, index: true },
  avatarUrl:  { type: String, default: '' },
  department: { type: String, default: '' },
}, {
  timestamps: true,
  collection: 'users',
});

userSchema.index({ organizationId: 1, role: 1 });
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });

export const User = mongoose.model('User', userSchema);
