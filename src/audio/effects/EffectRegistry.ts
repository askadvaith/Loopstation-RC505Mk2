/**
 * Effect Registry — Maps type strings to effect constructors and metadata.
 *
 * Provides a central factory for creating any effect by its type string.
 * All effect types are registered here with their display labels and categories.
 */

import { BaseEffect } from './BaseEffect';
import type { EffectCategory, EffectTypeDef } from './BaseEffect';

// Filter effects
import { LPFEffect, HPFEffect, BPFEffect } from './FilterEffects';

// Modulation effects
import {
  PhaserEffect, FlangerEffect, TremoloEffect, VibratoEffect,
  AutoPanEffect, RingModEffect, ChorusEffect,
} from './ModulationEffects';

// Delay effects
import {
  DelayEffect, ModDelayEffect, ReverseDelayEffect, PanningDelayEffect,
  TapeEcho1Effect, TapeEcho2Effect, Roll1Effect, Roll2Effect, GranularDelayEffect,
} from './DelayEffects';

// Dynamics / Guitar effects
import {
  DynamicsEffect, EQEffect, DistEffect, PreampEffect, SustainerEffect, G2BEffect,
} from './DynamicsEffects';

// Character effects
import {
  LoFiEffect, RadioEffect, TwistEffect, WarpEffect, FreezeEffect,
} from './CharacterEffects';

// Pitch effects
import {
  PitchBendEffect, SlowGearEffect, TransposeEffect, OctaveEffect,
  RobotEffect, ElectricEffect, SynthEffect,
} from './PitchEffects';

// Spatial effects
import {
  StereoEnhanceEffect, ManualPanEffect, IsolatorEffect, AutoRiffEffect,
} from './SpatialEffects';

// Reverb effects
import { ReverbEffect, ReverseReverbEffect, GateReverbEffect } from './ReverbEffects';

// Slicer effects
import { PatternSlicerEffect, StepSlicerEffect } from './SlicerEffects';

// Voice effects
import {
  VocoderEffect, OSCVocoderEffect, HarmonistManualEffect,
  HarmonistAutoEffect, OSCBotEffect,
} from './VoiceEffects';

// Beat effects
import {
  BeatScatterEffect, BeatRepeatEffect, BeatShiftEffect, VinylFlickEffect,
} from './BeatEffects';

/* ─── Registry Entry ─── */

interface RegistryEntry {
  label: string;
  category: EffectCategory;
  trackOnly?: boolean;
  factory: (ctx: AudioContext) => BaseEffect;
  /** Cached param metadata — built once at registration time. */
  cachedDef: EffectTypeDef;
}

/* ─── The Registry ─── */

const registry = new Map<string, RegistryEntry>();

/**
 * Shared OfflineAudioContext used only for extracting param metadata at
 * registration time. Never used for audio rendering.
 */
const _metaCtx = new OfflineAudioContext(2, 1, 44100);

function reg(
  type: string,
  label: string,
  category: EffectCategory,
  factory: (ctx: AudioContext) => BaseEffect,
  trackOnly = false,
): void {
  // Build a temporary instance to read param definitions, then dispose it.
  // We call init() first so all internal nodes exist and dispose() is safe.
  const tempEffect = factory(_metaCtx as unknown as AudioContext);
  tempEffect.init();
  const params = tempEffect.getParamDefs();
  tempEffect.dispose();

  const cachedDef: EffectTypeDef = { type, label, category, params, trackOnly };
  registry.set(type, { label, category, trackOnly, factory, cachedDef });
}

/* ── Filter ── */
reg('LPF',            'Low Pass Filter',        'filter',      ctx => new LPFEffect(ctx));
reg('HPF',            'High Pass Filter',       'filter',      ctx => new HPFEffect(ctx));
reg('BPF',            'Band Pass Filter',       'filter',      ctx => new BPFEffect(ctx));

/* ── Modulation ── */
reg('PHASER',         'Phaser',                 'modulation',  ctx => new PhaserEffect(ctx));
reg('FLANGER',        'Flanger',                'modulation',  ctx => new FlangerEffect(ctx));
reg('TREMOLO',        'Tremolo',                'modulation',  ctx => new TremoloEffect(ctx));
reg('VIBRATO',        'Vibrato',                'modulation',  ctx => new VibratoEffect(ctx));
reg('AUTO_PAN',       'Auto Pan',               'modulation',  ctx => new AutoPanEffect(ctx));
reg('RING_MOD',       'Ring Modulator',         'modulation',  ctx => new RingModEffect(ctx));
reg('CHORUS',         'Chorus',                 'modulation',  ctx => new ChorusEffect(ctx));

/* ── Delay ── */
reg('DELAY',          'Delay',                  'delay',       ctx => new DelayEffect(ctx));
reg('MOD_DELAY',      'Mod Delay',              'delay',       ctx => new ModDelayEffect(ctx));
reg('REVERSE_DELAY',  'Reverse Delay',          'delay',       ctx => new ReverseDelayEffect(ctx));
reg('PANNING_DELAY',  'Panning Delay',          'delay',       ctx => new PanningDelayEffect(ctx));
reg('TAPE_ECHO_1',    'Tape Echo 1',            'delay',       ctx => new TapeEcho1Effect(ctx));
reg('TAPE_ECHO_2',    'Tape Echo 2',            'delay',       ctx => new TapeEcho2Effect(ctx));
reg('ROLL_1',         'Roll 1',                 'delay',       ctx => new Roll1Effect(ctx));
reg('ROLL_2',         'Roll 2',                 'delay',       ctx => new Roll2Effect(ctx));
reg('GRANULAR_DELAY', 'Granular Delay',         'delay',       ctx => new GranularDelayEffect(ctx));

/* ── Dynamics / Guitar ── */
reg('DYNAMICS',       'Dynamics',               'dynamics',    ctx => new DynamicsEffect(ctx));
reg('EQ',             'Equalizer',              'dynamics',    ctx => new EQEffect(ctx));
reg('DIST',           'Distortion',             'dynamics',    ctx => new DistEffect(ctx));
reg('PREAMP',         'Preamp',                 'dynamics',    ctx => new PreampEffect(ctx));
reg('SUSTAINER',      'Sustainer',              'guitar',      ctx => new SustainerEffect(ctx));
reg('G2B',            'Guitar to Bass',         'guitar',      ctx => new G2BEffect(ctx));

/* ── Character ── */
reg('LO_FI',          'Lo-Fi',                  'character',   ctx => new LoFiEffect(ctx));
reg('RADIO',          'Radio',                  'character',   ctx => new RadioEffect(ctx));
reg('TWIST',          'Twist',                  'character',   ctx => new TwistEffect(ctx));
reg('WARP',           'Warp',                   'character',   ctx => new WarpEffect(ctx));
reg('FREEZE',         'Freeze',                 'character',   ctx => new FreezeEffect(ctx));

/* ── Pitch ── */
reg('PITCH_BEND',     'Pitch Bend',             'pitch',       ctx => new PitchBendEffect(ctx));
reg('SLOW_GEAR',      'Slow Gear',              'pitch',       ctx => new SlowGearEffect(ctx));
reg('TRANSPOSE',      'Transpose',              'pitch',       ctx => new TransposeEffect(ctx));
reg('OCTAVE',         'Octave',                 'pitch',       ctx => new OctaveEffect(ctx));
reg('ROBOT',          'Robot',                  'pitch',       ctx => new RobotEffect(ctx));
reg('ELECTRIC',       'Electric',               'pitch',       ctx => new ElectricEffect(ctx));
reg('SYNTH',          'Synth',                  'pitch',       ctx => new SynthEffect(ctx));

/* ── Spatial ── */
reg('STEREO_ENHANCE', 'Stereo Enhance',         'spatial',     ctx => new StereoEnhanceEffect(ctx));
reg('MANUAL_PAN',     'Manual Pan',             'spatial',     ctx => new ManualPanEffect(ctx));
reg('ISOLATOR',       'Isolator',               'spatial',     ctx => new IsolatorEffect(ctx));
reg('AUTO_RIFF',      'Auto Riff',              'slicer',      ctx => new AutoRiffEffect(ctx));

/* ── Reverb ── */
reg('REVERB',         'Reverb',                 'reverb',      ctx => new ReverbEffect(ctx));
reg('REVERSE_REVERB', 'Reverse Reverb',         'reverb',      ctx => new ReverseReverbEffect(ctx));
reg('GATE_REVERB',    'Gate Reverb',            'reverb',      ctx => new GateReverbEffect(ctx));

/* ── Slicer ── */
reg('PATTERN_SLICER', 'Pattern Slicer',         'slicer',      ctx => new PatternSlicerEffect(ctx));
reg('STEP_SLICER',    'Step Slicer',            'slicer',      ctx => new StepSlicerEffect(ctx));

/* ── Voice ── */
reg('VOCODER',           'Vocoder',             'pitch',       ctx => new VocoderEffect(ctx));
reg('OSC_VOCODER',       'OSC Vocoder',         'pitch',       ctx => new OSCVocoderEffect(ctx));
reg('HARMONIST_MANUAL',  'Harmonist (Manual)',  'pitch',       ctx => new HarmonistManualEffect(ctx));
reg('HARMONIST_AUTO',    'Harmonist (Auto)',    'pitch',       ctx => new HarmonistAutoEffect(ctx));
reg('OSC_BOT',           'OSC Bot',             'pitch',       ctx => new OSCBotEffect(ctx));

/* ── Beat (Track-FX only) ── */
reg('BEAT_SCATTER',   'Beat Scatter',           'beat',        ctx => new BeatScatterEffect(ctx), true);
reg('BEAT_REPEAT',    'Beat Repeat',            'beat',        ctx => new BeatRepeatEffect(ctx), true);
reg('BEAT_SHIFT',     'Beat Shift',             'beat',        ctx => new BeatShiftEffect(ctx), true);
reg('VINYL_FLICK',    'Vinyl Flick',            'beat',        ctx => new VinylFlickEffect(ctx), true);

/* ─── Public API ─── */

/** All available effect type strings. */
export const EFFECT_TYPES: string[] = Array.from(registry.keys());

/** Get metadata for all effects, grouped by category. */
export function getEffectCategories(): Map<EffectCategory, EffectTypeDef[]> {
  const grouped = new Map<EffectCategory, EffectTypeDef[]>();
  for (const [, entry] of registry) {
    if (!grouped.has(entry.category)) {
      grouped.set(entry.category, []);
    }
    grouped.get(entry.category)!.push(entry.cachedDef);
  }
  return grouped;
}

/** Get metadata for a single effect type (uses cached data — no audio context needed). */
export function getEffectTypeDef(type: string): EffectTypeDef | null {
  return registry.get(type)?.cachedDef ?? null;
}

/** Get a flat list of all effect type definitions (for UI menus). */
export function getAllEffectTypeDefs(): EffectTypeDef[] {
  return Array.from(registry.values()).map(e => e.cachedDef);
}

/** Get all effect types available for a given context (input vs. track). */
export function getAvailableEffectTypes(isTrackFX: boolean): EffectTypeDef[] {
  return getAllEffectTypeDefs().filter(
    d => isTrackFX || !d.trackOnly
  );
}

/** Create an effect instance by type string. */
export function createEffect(type: string, ctx: AudioContext): BaseEffect | null {
  const entry = registry.get(type);
  if (!entry) {
    console.warn(`[EffectRegistry] Unknown effect type: ${type}`);
    return null;
  }

  const effect = entry.factory(ctx);
  effect.init();
  return effect;
}

/** Check if a type exists in the registry. */
export function isValidEffectType(type: string): boolean {
  return registry.has(type);
}

/** Get the label for a given type. */
export function getEffectLabel(type: string): string {
  return registry.get(type)?.label ?? type;
}

/** Check if a type is track-only (not available on input FX). */
export function isTrackOnlyEffect(type: string): boolean {
  return registry.get(type)?.trackOnly ?? false;
}
