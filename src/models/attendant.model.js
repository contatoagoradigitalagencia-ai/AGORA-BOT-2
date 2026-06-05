import mongoose from 'mongoose';

const attendantSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  name:           { type: String, required: true, trim: true },
  displayName:    { type: String, trim: true, default: '' },
  phone:          { type: String, trim: true, default: '' },
  roleLabel:      { type: String, trim: true, default: 'Atendente' },
  colorTag:       { type: String, default: 'orange' },
  notes:          { type: String, default: '' },
  active:         { type: Boolean, default: true, index: true },
}, { timestamps: true, collection: 'attendants' });

attendantSchema.index({ organizationId: 1, active: 1 });

export const Attendant = mongoose.model('Attendant', attendantSchema, 'attendants');
