export { AudioEngine } from './AudioEngine';
export { LoopTrack } from './LoopTrack';
export type {
  TrackState,
  LoopTrackOptions,
  TrackSettings,
  DubMode,
  StartMode,
  StopMode,
  SpeedMode,
  MeasureSetting,
  QuantizeMode,
  RecAction,
} from './LoopTrack';

// Effects (Phase 4)
export {
  BaseEffect,
  EffectsChain,
  FXSequencer,
  createDefaultChainState,
  createDefaultSequenceState,
  EFFECT_TYPES,
  createEffect,
  isValidEffectType,
  getEffectLabel,
  isTrackOnlyEffect,
  getEffectCategories,
  getEffectTypeDef,
  getAllEffectTypeDefs,
  getAvailableEffectTypes,
  FX_BANK_IDS,
} from './effects';

export type {
  ParamValue,
  EffectParamDef,
  EffectTypeDef,
  EffectCategory,
  FXBankId,
  FXBankMode,
  FXSwMode,
  FXInsertTarget,
  FXSlotState,
  FXBankState,
  FXChainState,
  FXSequenceTarget,
  FXSequenceState,
} from './effects';
