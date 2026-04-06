/**
 * Effects module barrel — exports everything needed by the rest of the app.
 */

// Base types
export { BaseEffect } from './BaseEffect';
export type {
  ParamValue, EffectParamDef, EffectTypeDef, EffectCategory,
} from './BaseEffect';

// Chain management
export { EffectsChain, createDefaultChainState } from './EffectsChain';
export type {
  FXBankId, FXBankMode, FXSwMode, FXInsertTarget,
  FXSlotState, FXBankState, FXChainState,
} from './EffectsChain';
export { FX_BANK_IDS } from './EffectsChain';

// Sequencer
export { FXSequencer, createDefaultSequenceState } from './FXSequencer';
export type { FXSequenceTarget, FXSequenceState } from './FXSequencer';

// Registry / Factory
export {
  EFFECT_TYPES,
  createEffect,
  isValidEffectType,
  getEffectLabel,
  isTrackOnlyEffect,
  getEffectCategories,
  getEffectTypeDef,
  getAllEffectTypeDefs,
  getAvailableEffectTypes,
} from './EffectRegistry';
