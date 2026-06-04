import mongoose from 'mongoose';

const botConfigSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  whatsappAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAccount', required: true, index: true },
  aiEnabled: { type: Boolean, default: true },
  catalogEnabled: { type: Boolean, default: true },
  humanHandoffEnabled: { type: Boolean, default: true },
  humanHandoffKeywords: { type: [String], default: ['humano', 'atendente', 'pessoa', 'suporte'] },
  fallbackMessage: { type: String, default: 'Vou te encaminhar para um atendimento humano.' },
  promptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prompt' },
  settings: { type: Object, default: {} },
}, { timestamps: true });

botConfigSchema.index({ organizationId: 1, whatsappAccountId: 1 }, { unique: true });

export const BotConfig = mongoose.model('BotConfig', botConfigSchema, 'bot_configs');
