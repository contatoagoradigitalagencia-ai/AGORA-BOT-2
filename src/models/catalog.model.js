import mongoose from 'mongoose';

const baseCatalogFields = {
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  price: { type: Number },
  currency: { type: String, default: 'BRL' },
  active: { type: Boolean, default: true, index: true },
  tags: { type: [String], default: [] },
  conditions: { type: String, default: '' },
  metadata: { type: Object, default: {} },
};

const options = { timestamps: true };

const productSchema = new mongoose.Schema({
  ...baseCatalogFields,
  sku: { type: String, trim: true },
  stock: { type: Number },
}, options);
const serviceSchema = new mongoose.Schema({
  ...baseCatalogFields,
  durationMinutes: { type: Number },
}, options);
const planSchema = new mongoose.Schema({
  ...baseCatalogFields,
  billingCycle: { type: String, enum: ['once', 'monthly', 'quarterly', 'yearly'], default: 'monthly' },
  features: { type: [String], default: [] },
}, options);

for (const schema of [productSchema, serviceSchema, planSchema]) {
  schema.index({ organizationId: 1, active: 1, name: 1 });
}
productSchema.index({ organizationId: 1, sku: 1 }, { unique: true, sparse: true });

export const Product = mongoose.model('Product', productSchema, 'products');
export const Service = mongoose.model('Service', serviceSchema, 'services');
export const Plan = mongoose.model('Plan', planSchema, 'plans');
