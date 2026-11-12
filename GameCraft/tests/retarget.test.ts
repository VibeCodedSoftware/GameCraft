// P1: Import animation — clips from another file (Mixamo FBX, GLB) retargeted onto a model's bones.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { canonicalBone, retargetClip } from '../src/engine/retarget';

describe('animation retargeting', () => {
  it('bone names from different rigs meet on one canonical name', () => {
    const same = (names: string[], want: string) => { for (const n of names) expect(canonicalBone(n), n).toBe(want); };
    same(['mixamorig:Hips', 'Hips', 'pelvis', 'Armature|Hips', 'mixamorig1:Hips'], 'hips');
    same(['mixamorig:LeftUpLeg', 'thigh.L', 'LeftUpLeg', 'Thigh_L', 'L_Thigh', 'upper_leg.L'], 'upperLeg.L');
    same(['mixamorig:RightForeArm', 'forearm.R', 'lowerarm_r', 'RightForeArm'], 'lowerArm.R');
    same(['mixamorig:Spine', 'spine'], 'spine');
    same(['mixamorig:LeftHand', 'hand.L', 'Hand_L'], 'hand.L');
    same(['mixamorig:Head', 'head'], 'head');
    expect(canonicalBone('mixamorig:LeftLeg')).toBe('lowerLeg.L'); // Mixamo "Leg" = shin
    // Rigify deform bones (the Universal Animation Library): DEF- prefix, side glued on as a capital L / R.
    same(['DEF-hips'], 'hips');
    same(['DEF-upper_armL'], 'upperArm.L'); same(['DEF-forearmR', 'mixamorig:RightForeArm'], 'lowerArm.R');
    same(['DEF-thighL'], 'upperLeg.L'); same(['DEF-shinL'], 'lowerLeg.L'); same(['DEF-footR'], 'foot.R');
    // Spine segments line up across Mixamo and Rigify numbering.
    same(['mixamorig:Spine', 'DEF-spine001'], 'spine'); same(['mixamorig:Spine1', 'DEF-spine002'], 'spine1'); same(['mixamorig:Spine2', 'DEF-spine003'], 'chest');
  });

  it('a Mixamo clip drives a Blender-named skeleton: rotations renamed, hips motion scaled, other moves dropped', () => {
    const q = (n: string) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0.7071, 0, 0.7071]);
    const src = new THREE.AnimationClip('Walking', 1, [
      q('mixamorig:Hips'), new THREE.VectorKeyframeTrack('mixamorig:Hips.position', [0, 1], [0, 100, 0, 0, 110, 50]),
      q('mixamorig:LeftUpLeg'), q('mixamorig:RightForeArm'), new THREE.VectorKeyframeTrack('mixamorig:LeftUpLeg.position', [0, 1], [1, 2, 3, 4, 5, 6]),
      q('mixamorig:Tail'),
    ]);
    const { clip, report } = retargetClip(src, ['pelvis', 'thigh.L', 'forearm.R', 'spine', 'head'], 0.01);
    expect(clip.tracks.map((t) => t.name).sort()).toEqual(['forearm.R.quaternion', 'pelvis.position', 'pelvis.quaternion', 'thigh.L.quaternion']);
    const pos = clip.tracks.find((t) => t.name === 'pelvis.position')!;
    [0, 1, 0, 0, 1.1, 0.5].forEach((v, k) => expect(pos.values[k]).toBeCloseTo(v, 5)); // centimetres → this skeleton's size
    expect(report.matched).toBe(4);
    expect(report.skipped).toEqual(['mixamorig:Tail']);
    expect(clip.name).toBe('Walking'); expect(clip.duration).toBe(1);
  });
});
