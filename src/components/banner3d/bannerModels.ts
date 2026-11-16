import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { AppletId } from '../../nand/types';
import { BannerTextureSet } from './materials';

export type BannerSceneKind = AppletId | 'folder' | 'empty-cartridge' | 'empty-slot';

export interface BannerModelInstance {
  root: THREE.Group;
  update: (elapsedSec: number, dt: number) => void;
  dispose: () => void;
}

export interface BannerModelOptions {
  kind: BannerSceneKind;
  folderColor?: string;
  folderBadgeChar?: string;
  isSoftwareGl: boolean;
}

function addRoundedTriangleShape(radius: number, cornerRadius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < 3; i++) {
    const angle = Math.PI / 2 + (i * Math.PI * 2) / 3;
    pts.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
  }
  const dir = (a: THREE.Vector2, b: THREE.Vector2) => b.clone().sub(a).normalize();
  for (let i = 0; i < 3; i++) {
    const prev = pts[(i + 2) % 3];
    const curr = pts[i];
    const next = pts[(i + 1) % 3];
    const d1 = dir(curr, prev);
    const d2 = dir(curr, next);
    const p1 = curr.clone().addScaledVector(d1, cornerRadius);
    const p2 = curr.clone().addScaledVector(d2, cornerRadius);
    if (i === 0) shape.moveTo(p1.x, p1.y);
    else shape.lineTo(p1.x, p1.y);
    shape.quadraticCurveTo(curr.x, curr.y, p2.x, p2.y);
  }
  shape.closePath();
  return shape;
}

function createGearShape(teeth: number, outerR: number, innerR: number, holeR: number): THREE.Shape {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.18;
    const a2 = a0 + step * 0.42;
    const a3 = a0 + step * 0.6;
    const a4 = a0 + step * 0.84;

    const p0x = Math.cos(a0) * innerR;
    const p0y = Math.sin(a0) * innerR;
    if (i === 0) shape.moveTo(p0x, p0y);
    else shape.lineTo(p0x, p0y);
    shape.lineTo(Math.cos(a1) * innerR, Math.sin(a1) * innerR);
    shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
    shape.lineTo(Math.cos(a3) * outerR, Math.sin(a3) * outerR);
    shape.lineTo(Math.cos(a4) * innerR, Math.sin(a4) * innerR);
  }
  shape.closePath();

  const hole = new THREE.Path();
  hole.absarc(0, 0, holeR, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

function createWrenchShape(): THREE.Shape {
  const shape = new THREE.Shape();
  // Sleek mechanical open-end wrench silhouette
  shape.moveTo(-0.16, -0.82);
  shape.lineTo(0.16, -0.82);
  shape.quadraticCurveTo(0.24, -0.82, 0.24, -0.7);
  shape.lineTo(0.2, 0.25);
  shape.quadraticCurveTo(0.5, 0.42, 0.5, 0.78);
  shape.quadraticCurveTo(0.45, 1.05, 0.24, 1.12);
  shape.lineTo(0.18, 0.72);
  shape.lineTo(-0.18, 0.72);
  shape.lineTo(-0.24, 1.12);
  shape.quadraticCurveTo(-0.45, 1.05, -0.5, 0.78);
  shape.quadraticCurveTo(-0.5, 0.42, -0.2, 0.25);
  shape.lineTo(-0.24, -0.7);
  shape.quadraticCurveTo(-0.24, -0.82, -0.16, -0.82);
  shape.closePath();
  return shape;
}

function createFolderShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-1.15, -0.78);
  s.lineTo(1.15, -0.78);
  s.quadraticCurveTo(1.28, -0.78, 1.28, -0.65);
  s.lineTo(1.28, 0.58);
  s.quadraticCurveTo(1.28, 0.72, 1.14, 0.72);
  s.lineTo(-0.08, 0.72);
  s.lineTo(-0.28, 0.94);
  s.lineTo(-1.14, 0.94);
  s.quadraticCurveTo(-1.28, 0.94, -1.28, 0.8);
  s.lineTo(-1.28, -0.65);
  s.quadraticCurveTo(-1.28, -0.78, -1.15, -0.78);
  return s;
}

function createMiniMii(
  shirtHex: number,
  skinHex: number,
  hairHex: number,
  disposables: { geo: THREE.BufferGeometry[]; mat: THREE.Material[] }
): THREE.Group {
  const g = new THREE.Group();
  const trackGeo = <T extends THREE.BufferGeometry>(x: T) => {
    disposables.geo.push(x);
    return x;
  };
  const trackMat = <T extends THREE.Material>(x: T) => {
    disposables.mat.push(x);
    return x;
  };

  const skinMat = trackMat(new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.6, metalness: 0.02 }));
  const shirtMat = trackMat(new THREE.MeshStandardMaterial({ color: shirtHex, roughness: 0.35, metalness: 0.08 }));
  const hairMat = trackMat(new THREE.MeshStandardMaterial({ color: hairHex, roughness: 0.75, metalness: 0.05 }));
  const eyeMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.1 }));

  // Torso (grounded at y=0)
  const torso = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.24, 0.44, 18)), shirtMat);
  torso.position.y = 0.22;
  torso.castShadow = true;
  g.add(torso);

  // Arms
  const armGeo = trackGeo(new THREE.CapsuleGeometry(0.055, 0.22, 6, 10));
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.24, 0.28, 0);
  armL.rotation.z = 0.45;
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.24, 0.28, 0);
  armR.rotation.z = -0.45;
  g.add(armL, armR);

  // Head
  const head = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.24, 24, 20)), skinMat);
  head.position.y = 0.64;
  head.castShadow = true;
  g.add(head);

  // Hair cap
  const hair = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.252, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.52)),
    hairMat
  );
  hair.position.set(0, 0.67, -0.02);
  hair.rotation.x = -0.18;
  g.add(hair);

  // Eyes
  const eyeGeo = trackGeo(new THREE.SphereGeometry(0.028, 10, 10));
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.08, 0.64, 0.22);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.08, 0.64, 0.22);
  g.add(eyeL, eyeR);

  return g;
}

export function buildBannerModel(
  opts: BannerModelOptions,
  textures: BannerTextureSet
): BannerModelInstance {
  const root = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Ground contact shadow plane shared across banners
  const shadowPlane = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(3.2, 1.9)),
    trackMat(
      new THREE.MeshBasicMaterial({
        map: textures.contactShadow,
        transparent: true,
        depthWrite: false,
        opacity: 0.7,
      })
    )
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -1.25;
  root.add(shadowPlane);

  // Subject group floats above contact shadow
  const subject = new THREE.Group();
  root.add(subject);

  let animateFn: (t: number, dt: number) => void = (t) => {
    subject.position.y = Math.sin(t * 2.1) * 0.08;
    subject.rotation.y = Math.sin(t * 1.15) * 0.26;
  };

  const { kind, isSoftwareGl } = opts;

  switch (kind) {
    case 'health-safety': {
      // 1. Heavy glossy dark frame triangle
      const outerShape = addRoundedTriangleShape(1.18, 0.16);
      const outerGeo = trackGeo(
        new THREE.ExtrudeGeometry(outerShape, {
          depth: 0.24,
          bevelEnabled: true,
          bevelThickness: 0.06,
          bevelSize: 0.06,
          bevelSegments: 4,
        })
      );
      outerGeo.center();
      const darkTrimMat = trackMat(
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.45 })
      );
      const outerTri = new THREE.Mesh(outerGeo, darkTrimMat);
      outerTri.castShadow = true;

      // 2. Inner golden-yellow safety triangle
      const innerShape = addRoundedTriangleShape(0.92, 0.11);
      const innerGeo = trackGeo(
        new THREE.ExtrudeGeometry(innerShape, {
          depth: 0.28,
          bevelEnabled: true,
          bevelThickness: 0.03,
          bevelSize: 0.03,
          bevelSegments: 3,
        })
      );
      innerGeo.center();
      const yellowMat = trackMat(
        new THREE.MeshPhysicalMaterial({
          color: 0xfacc15,
          roughness: 0.2,
          metalness: 0.1,
          clearcoat: 1.0,
          clearcoatRoughness: 0.12,
        })
      );
      const innerTri = new THREE.Mesh(innerGeo, yellowMat);
      innerTri.position.z = 0.03;

      // 3 & 4. Raised 3D Exclamation Stem & Dot
      const exStem = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.11, 0.42, 8, 16)), darkTrimMat);
      exStem.position.set(0, 0.06, 0.22);
      const exDot = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.11, 18, 16)), darkTrimMat);
      exDot.position.set(0, -0.37, 0.22);

      // 5. Orbiting translucent safety halo ring
      const ringMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          roughness: 0.25,
          metalness: 0.7,
          emissive: 0xf59e0b,
          emissiveIntensity: 0.22,
        })
      );
      const halo = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.32, 0.032, 12, 56)), ringMat);
      halo.rotation.x = Math.PI * 0.38;

      subject.add(outerTri, innerTri, exStem, exDot, halo);
      animateFn = (t) => {
        subject.position.y = Math.sin(t * 2.2) * 0.09;
        subject.rotation.y = Math.sin(t * 1.1) * 0.34;
        subject.rotation.x = Math.cos(t * 0.9) * 0.08;
        halo.rotation.z = t * 0.65;
        halo.rotation.y = Math.sin(t * 0.8) * 0.25;
      };
      break;
    }

    case 'camera-ar': {
      // Composite 8-part 3DS Camera + Floating AR Prism
      const bodyMat = trackMat(
        new THREE.MeshPhysicalMaterial({
          color: 0xf97316,
          roughness: 0.26,
          metalness: 0.12,
          clearcoat: 0.9,
          clearcoatRoughness: 0.15,
        })
      );
      const whitePlastic = trackMat(
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.05 })
      );
      const chromeMat = trackMat(
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.14, metalness: 0.94 })
      );
      const darkApertureMat = trackMat(
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.6 })
      );
      const lensGlassMat = trackMat(
        new THREE.MeshPhysicalMaterial({
          color: 0x38bdf8,
          roughness: 0.06,
          metalness: 0.05,
          transmission: isSoftwareGl ? 0 : 0.82,
          transparent: true,
          opacity: isSoftwareGl ? 0.58 : 1,
          ior: 1.55,
          thickness: 0.6,
          clearcoat: 1.0,
        })
      );

      // Primary camera body
      const body = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(2.1, 1.38, 0.56, 4, 0.18)), bodyMat);
      body.castShadow = true;

      // White front bezel frame
      const bezel = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(2.18, 1.46, 0.44, 4, 0.2)), whitePlastic);
      bezel.position.z = -0.06;

      // Top deck shutter & dial
      const shutter = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.18, 0.2, 0.16, 20)), chromeMat);
      shutter.position.set(-0.56, 0.76, 0.02);
      const shutterCollar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 20)), whitePlastic);
      shutterCollar.position.set(-0.56, 0.71, 0.02);

      // Flash prism window
      const flash = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(0.38, 0.2, 0.08, 2, 0.04)), chromeMat);
      flash.position.set(0.62, 0.38, 0.29);

      // Stepped Lens Barrel (Lathe/Cylinders)
      const lensOuter = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.54, 0.56, 0.24, 32)), whitePlastic);
      lensOuter.rotation.x = Math.PI / 2;
      lensOuter.position.z = 0.31;

      const lensChromeRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.45, 0.045, 14, 32)), chromeMat);
      lensChromeRing.position.z = 0.43;

      const lensInnerBarrel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.39, 0.39, 0.22, 28)), darkApertureMat);
      lensInnerBarrel.rotation.x = Math.PI / 2;
      lensInnerBarrel.position.z = 0.35;

      const glassOptic = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(0.36, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.45)),
        lensGlassMat
      );
      glassOptic.rotation.x = Math.PI / 2;
      glassOptic.position.z = 0.3;

      // Floating mini gold AR Question-Star cube orbiting beside lens
      const arCube = new THREE.Mesh(
        trackGeo(new THREE.OctahedronGeometry(0.22, 0)),
        trackMat(new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.22, metalness: 0.75 }))
      );
      arCube.position.set(1.38, 0.55, 0.35);

      subject.add(body, bezel, shutter, shutterCollar, flash, lensOuter, lensChromeRing, lensInnerBarrel, glassOptic, arCube);
      animateFn = (t) => {
        subject.position.y = Math.sin(t * 2.0) * 0.08;
        subject.rotation.y = Math.sin(t * 1.1) * 0.32;
        subject.rotation.x = Math.cos(t * 0.9) * 0.08;
        arCube.rotation.y = t * 1.8;
        arCube.rotation.x = t * 1.1;
        arCube.position.y = 0.5 + Math.sin(t * 2.8) * 0.14;
      };
      break;
    }

    case 'mii-maker': {
      // Stage plinth + 3D "Mii" sculpted block + 3 cute 3D Mii characters
      const stageMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.15 }));
      const stage = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.55, 1.68, 0.18, 36)), stageMat);
      stage.position.y = -0.68;
      stage.receiveShadow = true;

      // Center 3D Sculpted "Mii" Pedestal Sign
      const plaqueBase = new THREE.Mesh(
        trackGeo(new RoundedBoxGeometry(1.55, 0.78, 0.26, 4, 0.12)),
        trackMat(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0.05, clearcoat: 0.8 }))
      );
      plaqueBase.position.set(0, -0.05, 0.26);

      const letters: Array<{ ch: string; col: string; x: number }> = [
        { ch: 'M', col: '#334155', x: -0.4 },
        { ch: 'i', col: '#14b8a6', x: 0.05 },
        { ch: 'i', col: '#0ea5e9', x: 0.42 },
      ];
      letters.forEach((l) => {
        const tex = textures.miiWordmarkTexture(l.ch, l.col);
        const tile = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(0.42, 0.56, 0.06)),
          trackMat(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0.05 }))
        );
        tile.position.set(l.x, -0.05, 0.39);
        subject.add(tile);
      });

      const mii1 = createMiniMii(0x0284c7, 0xfde6d0, 0x1e293b, { geo: geometries, mat: materials });
      mii1.position.set(-0.92, -0.58, -0.22);
      mii1.rotation.y = 0.28;

      const mii2 = createMiniMii(0x10b981, 0xf8d9bd, 0x451a03, { geo: geometries, mat: materials });
      mii2.position.set(0.92, -0.58, -0.22);
      mii2.rotation.y = -0.28;

      const mii3 = createMiniMii(0xe11d48, 0xfce2cb, 0x0f172a, { geo: geometries, mat: materials });
      mii3.position.set(0, -0.58, -0.62);

      subject.add(stage, plaqueBase, mii1, mii2, mii3);
      animateFn = (t) => {
        subject.position.y = Math.sin(t * 1.8) * 0.05;
        subject.rotation.y = Math.sin(t * 0.9) * 0.28;
        mii1.position.y = -0.58 + Math.abs(Math.sin(t * 3.1)) * 0.14;
        mii2.position.y = -0.58 + Math.abs(Math.sin(t * 3.1 + 1.2)) * 0.14;
        mii3.position.y = -0.58 + Math.abs(Math.sin(t * 3.1 + 2.4)) * 0.14;
        mii3.rotation.y = Math.sin(t * 1.5) * 0.35;
      };
      break;
    }

    case 'sound-studio': {
      // Glossy Sapphire Speaker Backing + Solid 3D Double-Eighth Note + Orbiting Sound Wave Rings + Yellow Budgie Mascot
      const tileMat = trackMat(
        new THREE.MeshPhysicalMaterial({
          color: 0x0284c7,
          roughness: 0.18,
          metalness: 0.12,
          clearcoat: 1.0,
        })
      );
      const whiteMat = trackMat(
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0.1 })
      );
      const waveMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x7dd3fc,
          roughness: 0.2,
          metalness: 0.65,
          emissive: 0x38bdf8,
          emissiveIntensity: 0.28,
        })
      );

      const tileBody = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(1.75, 1.5, 0.34, 4, 0.22)), tileMat);
      tileBody.position.z = -0.15;

      // 3D Musical Note (two tilted heads, two stems, diagonal crossbar)
      const noteGroup = new THREE.Group();
      const headGeo = trackGeo(new THREE.SphereGeometry(0.22, 20, 16));
      const head1 = new THREE.Mesh(headGeo, whiteMat);
      head1.scale.set(1.22, 0.88, 0.72);
      head1.rotation.z = 0.25;
      head1.position.set(-0.32, -0.35, 0.2);

      const head2 = new THREE.Mesh(headGeo, whiteMat);
      head2.scale.set(1.22, 0.88, 0.72);
      head2.rotation.z = 0.25;
      head2.position.set(0.32, -0.22, 0.2);

      const stemGeo = trackGeo(new THREE.CylinderGeometry(0.06, 0.06, 0.78, 14));
      const stem1 = new THREE.Mesh(stemGeo, whiteMat);
      stem1.position.set(-0.18, 0.04, 0.2);
      const stem2 = new THREE.Mesh(stemGeo, whiteMat);
      stem2.position.set(0.46, 0.16, 0.2);

      const beam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.76, 0.16, 0.13)), whiteMat);
      beam.position.set(0.14, 0.44, 0.2);
      beam.rotation.z = 0.19;

      noteGroup.add(head1, head2, stem1, stem2, beam);

      // Pulsing 3D Torus Equalizer Rings
      const wave1 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.08, 0.03, 12, 48)), waveMat);
      const wave2 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.32, 0.024, 12, 48)), waveMat);

      // Cute 3D yellow budgie mascot perched top-right
      const budgie = new THREE.Group();
      const budgieMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35, metalness: 0.05 }));
      const budgieBody = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.18, 16, 14)), budgieMat);
      budgieBody.scale.set(1, 1.2, 1);
      const beak = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(0.055, 0.12, 10)),
        trackMat(new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 }))
      );
      beak.rotation.z = -Math.PI / 2;
      beak.position.set(0.18, 0.06, 0);
      budgie.add(budgieBody, beak);
      budgie.position.set(0.95, 0.85, 0.12);

      subject.add(tileBody, noteGroup, wave1, wave2, budgie);
      animateFn = (t) => {
        subject.position.y = Math.sin(t * 2.2) * 0.08;
        subject.rotation.y = Math.sin(t * 1.1) * 0.3;
        const beat = 1 + Math.sin(t * 5.2) * 0.08;
        noteGroup.scale.setScalar(beat);
        wave1.scale.setScalar(0.95 + Math.sin(t * 4.0) * 0.09);
        wave2.scale.setScalar(1.0 + Math.cos(t * 4.0) * 0.09);
        wave1.rotation.x = Math.sin(t * 1.5) * 0.25;
        wave2.rotation.y = Math.cos(t * 1.2) * 0.3;
        budgie.rotation.z = Math.sin(t * 6.0) * 0.14;
      };
      break;
    }

    case 'system-settings': {
      // Metallic Brushed Backing + Two Meshing Spinning 3D Gears + Gleaming Forged Wrench
      const steelPlateMat = trackMat(
        new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.22, metalness: 0.86 })
      );
      const gearMat = trackMat(
        new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.28, metalness: 0.88 })
      );
      const goldGearMat = trackMat(
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, metalness: 0.82 })
      );
      const wrenchMat = trackMat(
        new THREE.MeshPhysicalMaterial({
          color: 0x1e293b,
          roughness: 0.2,
          metalness: 0.85,
          clearcoat: 0.8,
        })
      );

      const plate = new THREE.Mesh(
        trackGeo(new RoundedBoxGeometry(1.9, 1.5, 0.22, 4, 0.2)),
        steelPlateMat
      );
      plate.position.z = -0.22;

      const gear1Geo = trackGeo(
        new THREE.ExtrudeGeometry(createGearShape(10, 0.56, 0.43, 0.16), {
          depth: 0.14,
          bevelEnabled: true,
          bevelThickness: 0.025,
          bevelSize: 0.02,
          bevelSegments: 2,
        })
      );
      gear1Geo.center();
      const gear1 = new THREE.Mesh(gear1Geo, gearMat);
      gear1.position.set(-0.34, 0.16, 0.02);

      const gear2Geo = trackGeo(
        new THREE.ExtrudeGeometry(createGearShape(8, 0.42, 0.31, 0.11), {
          depth: 0.14,
          bevelEnabled: true,
          bevelThickness: 0.02,
          bevelSize: 0.02,
          bevelSegments: 2,
        })
      );
      gear2Geo.center();
      const gear2 = new THREE.Mesh(gear2Geo, goldGearMat);
      gear2.position.set(0.45, -0.24, 0.02);

      const wrenchGeo = trackGeo(
        new THREE.ExtrudeGeometry(createWrenchShape(), {
          depth: 0.16,
          bevelEnabled: true,
          bevelThickness: 0.035,
          bevelSize: 0.03,
          bevelSegments: 3,
        })
      );
      wrenchGeo.center();
      const wrench = new THREE.Mesh(wrenchGeo, wrenchMat);
      wrench.scale.setScalar(0.84);
      wrench.position.set(0, 0, 0.26);
      wrench.rotation.z = -0.55;

      subject.add(plate, gear1, gear2, wrench);
      animateFn = (t) => {
        subject.position.y = Math.sin(t * 1.9) * 0.07;
        subject.rotation.y = Math.sin(t * 1.05) * 0.28;
        gear1.rotation.z = t * 0.9;
        gear2.rotation.z = -t * 1.125 + 0.2;
        wrench.rotation.z = -0.55 + Math.sin(t * 2.0) * 0.15;
      };
      break;
    }

    case 'activity-log': {
      // Emerald Console Pedestal + 4 Animated 3D Graph Bars + Orbiting Golden Play Coin
      const greenBaseMat = trackMat(
        new THREE.MeshPhysicalMaterial({ color: 0x10b981, roughness: 0.22, metalness: 0.1, clearcoat: 0.85 })
      );
      const base = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(2.05, 0.24, 1.1, 3, 0.09)), greenBaseMat);
      base.position.y = -0.62;

      const backBook = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(2.05, 1.4, 0.18, 3, 0.1)), greenBaseMat);
      backBook.position.set(0, 0.02, -0.42);

      const barColors = [0xfef08a, 0xffffff, 0xfde047, 0xbae6fd];
      const barHeights = [0.55, 0.88, 1.18, 0.76];
      const bars: THREE.Mesh[] = [];
      barColors.forEach((col, i) => {
        const bMat = trackMat(new THREE.MeshStandardMaterial({ color: col, roughness: 0.25, metalness: 0.15 }));
        const bar = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(0.28, barHeights[i], 0.28, 3, 0.06)), bMat);
        bar.position.set(-0.6 + i * 0.4, -0.5 + barHeights[i] / 2, 0.04);
        bars.push(bar);
        subject.add(bar);
      });

      // Floating Golden 3DS Play Coin
      const coinGroup = new THREE.Group();
      const goldMat = trackMat(
        new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.18, metalness: 0.9 })
      );
      const coinFaceMat = trackMat(
        new THREE.MeshStandardMaterial({ map: textures.coinEmblem, roughness: 0.22, metalness: 0.72 })
      );
      const coinRim = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 28)), goldMat);
      coinRim.rotation.x = Math.PI / 2;
      const coinFace = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.28, 28)), coinFaceMat);
      coinFace.position.z = 0.042;
      const coinBack = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.28, 28)), coinFaceMat);
      coinBack.rotation.y = Math.PI;
      coinBack.position.z = -0.042;
      coinGroup.add(coinRim, coinFace, coinBack);
      coinGroup.position.set(0.86, 0.65, 0.38);

      subject.add(base, backBook, coinGroup);
      animateFn = (t) => {
        subject.position.y = Math.sin(t * 2.0) * 0.06;
        subject.rotation.y = Math.sin(t * 1.1) * 0.28;
        bars.forEach((bar, i) => {
          const s = 0.82 + Math.sin(t * 3.0 + i * 0.85) * 0.18;
          bar.scale.y = s;
          bar.position.y = -0.5 + (barHeights[i] * s) / 2;
        });
        coinGroup.rotation.y = t * 2.2;
        coinGroup.position.y = 0.65 + Math.sin(t * 2.6) * 0.1;
      };
      break;
    }

    case 'game-notes': {
      // Spiral Notepad (Ruled Paper Texture) + Silver Spiral Rings + Floating 3D Pencil
      const coverMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.1 }));
      const paperMat = trackMat(new THREE.MeshStandardMaterial({ map: textures.notepadLines, roughness: 0.78 }));
      const silverMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.9 }));

      const padBack = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(1.75, 1.65, 0.18, 3, 0.08)), coverMat);
      const paperBlock = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.56, 1.46, 0.06)), paperMat);
      paperBlock.position.z = 0.09;

      // 6 Spiral Wire Rings across top
      for (let i = 0; i < 6; i++) {
        const ring = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.11, 0.025, 10, 20)), silverMat);
        ring.rotation.y = Math.PI / 2;
        ring.position.set(-0.6 + i * 0.24, 0.8, 0.05);
        subject.add(ring);
      }

      // 3D Yellow Pencil / Stylus
      const pencil = new THREE.Group();
      const shaft = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.09, 0.09, 1.15, 6)),
        trackMat(new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.35, metalness: 0.05 }))
      );
      const woodTip = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(0.09, 0.24, 6)),
        trackMat(new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.65 }))
      );
      woodTip.position.y = -0.695;
      woodTip.rotation.x = Math.PI;
      const graphite = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(0.032, 0.09, 6)),
        trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 }))
      );
      graphite.position.y = -0.78;
      graphite.rotation.x = Math.PI;
      const ferrule = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.092, 0.092, 0.14, 12)), silverMat);
      ferrule.position.y = 0.64;
      const eraser = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.086, 0.086, 0.14, 12)),
        trackMat(new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.7 }))
      );
      eraser.position.y = 0.76;

      pencil.add(shaft, woodTip, graphite, ferrule, eraser);
      pencil.position.set(0.65, -0.02, 0.45);
      pencil.rotation.set(0.25, 0, -0.45);

      subject.add(padBack, paperBlock, pencil);
      animateFn = (t) => {
        subject.position.y = Math.sin(t * 2.0) * 0.07;
        subject.rotation.y = Math.sin(t * 1.1) * 0.26;
        pencil.position.x = 0.52 + Math.sin(t * 3.1) * 0.18;
        pencil.position.y = -0.05 + Math.cos(t * 2.3) * 0.12;
        pencil.rotation.z = -0.48 + Math.sin(t * 4.2) * 0.12;
      };
      break;
    }

    case 'nand-tool': {
      // Matte PCB + Raised IC Heatspreader + 12 Gold TSOP Leads + Rotating Emerald Cryptographic Shield Ring
      const pcbMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.55, metalness: 0.25 }));
      const chipMat = trackMat(new THREE.MeshStandardMaterial({ map: textures.nandChipLabel, roughness: 0.28, metalness: 0.45 }));
      const goldPinMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.18, metalness: 0.92 }));
      const holoMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x34d399,
          roughness: 0.2,
          metalness: 0.8,
          emissive: 0x10b981,
          emissiveIntensity: 0.35,
        })
      );

      const pcb = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(2.1, 1.38, 0.2, 3, 0.08)), pcbMat);
      const icTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.75, 0.96, 0.16)), chipMat);
      icTop.position.z = 0.13;

      const pinGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.22, 0.08));
      for (let i = 0; i < 6; i++) {
        const x = -0.68 + i * 0.27;
        const pTop = new THREE.Mesh(pinGeo, goldPinMat);
        pTop.position.set(x, 0.56, 0.1);
        const pBot = new THREE.Mesh(pinGeo, goldPinMat);
        pBot.position.set(x, -0.56, 0.1);
        subject.add(pTop, pBot);
      }

      const shieldRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.36, 0.032, 12, 48)), holoMat);
      shieldRing.rotation.x = Math.PI * 0.35;

      subject.add(pcb, icTop, shieldRing);
      animateFn = (t) => {
        subject.position.y = Math.sin(t * 1.9) * 0.07;
        subject.rotation.y = Math.sin(t * 1.0) * 0.28;
        shieldRing.rotation.z = t * 0.95;
        shieldRing.rotation.y = Math.sin(t * 1.3) * 0.35;
      };
      break;
    }

    case 'browser': {
      // Textured 3D Earth Globe + Clearcoat Atmosphere Shell + Twin Intersecting Orbital Rings + Data Satellite
      const globeMat = trackMat(
        new THREE.MeshStandardMaterial({
          map: textures.earthMap,
          bumpMap: textures.earthGridBump,
          bumpScale: 0.04,
          roughness: 0.28,
          metalness: 0.08,
        })
      );
      const globe = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.84, 36, 28)), globeMat);
      globe.rotation.z = 0.22;

      const ringMat = trackMat(
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2, metalness: 0.8 })
      );
      const orbit1 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.18, 0.028, 12, 56)), ringMat);
      orbit1.rotation.set(1.15, 0.35, 0);
      const orbit2 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.06, 0.022, 12, 56)), ringMat);
      orbit2.rotation.set(1.25, -0.55, 0);

      const satPivot = new THREE.Group();
      const satBody = new THREE.Mesh(
        trackGeo(new THREE.OctahedronGeometry(0.11, 0)),
        trackMat(new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, metalness: 0.85, emissive: 0x0284c7, emissiveIntensity: 0.35 }))
      );
      satBody.position.set(1.18, 0, 0);
      satPivot.add(satBody);
      satPivot.rotation.set(1.15, 0.35, 0);

      subject.add(globe, orbit1, orbit2, satPivot);
      animateFn = (t) => {
        subject.position.y = Math.sin(t * 2.1) * 0.07;
        globe.rotation.y = t * 0.55;
        orbit1.rotation.z = t * 0.35;
        orbit2.rotation.z = -t * 0.45;
        satPivot.rotation.z = t * 1.9;
      };
      break;
    }

    case 'cartridge': {
      // Starburst Pilot 3D: Multi-part 3D Space Fighter + Thrusters + Flying Grid Floor + Orbiting Asteroids
      const hullMat = trackMat(new THREE.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: 0.22, metalness: 0.35, clearcoat: 0.9 }));
      const wingMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.28, metalness: 0.55 }));
      const canopyMat = trackMat(
        new THREE.MeshPhysicalMaterial({
          color: 0x38bdf8,
          roughness: 0.08,
          metalness: 0.15,
          clearcoat: 1.0,
          emissive: 0x0ea5e9,
          emissiveIntensity: 0.25,
        })
      );
      const flameMat = trackMat(
        new THREE.MeshBasicMaterial({ color: 0x7dd3fc })
      );

      const ship = new THREE.Group();
      // Fuselage cone
      const nose = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.24, 1.28, 8)), hullMat);
      nose.rotation.x = Math.PI / 2;
      nose.position.z = 0.22;

      // Swept Main Wings
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0.3);
      wingShape.lineTo(1.08, -0.36);
      wingShape.lineTo(1.02, -0.54);
      wingShape.lineTo(0.22, -0.35);
      wingShape.lineTo(-0.22, -0.35);
      wingShape.lineTo(-1.02, -0.54);
      wingShape.lineTo(-1.08, -0.36);
      wingShape.closePath();
      const wingGeo = trackGeo(
        new THREE.ExtrudeGeometry(wingShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02 })
      );
      const wings = new THREE.Mesh(wingGeo, wingMat);
      wings.rotation.x = Math.PI / 2;
      wings.position.set(0, 0.02, -0.05);

      // Cockpit canopy
      const canopy = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.16, 16, 12)), canopyMat);
      canopy.scale.set(0.8, 0.65, 1.85);
      canopy.position.set(0, 0.13, 0.05);

      // Twin tail fins
      const finGeo = trackGeo(new THREE.BoxGeometry(0.05, 0.34, 0.34));
      const finL = new THREE.Mesh(finGeo, hullMat);
      finL.position.set(-0.26, 0.16, -0.34);
      finL.rotation.z = 0.28;
      const finR = new THREE.Mesh(finGeo, hullMat);
      finR.position.set(0.26, 0.16, -0.34);
      finR.rotation.z = -0.28;

      // Twin engine thrusters
      const flameGeo = trackGeo(new THREE.ConeGeometry(0.085, 0.35, 10));
      const flameL = new THREE.Mesh(flameGeo, flameMat);
      flameL.rotation.x = -Math.PI / 2;
      flameL.position.set(-0.16, -0.02, -0.62);
      const flameR = new THREE.Mesh(flameGeo, flameMat);
      flameR.rotation.x = -Math.PI / 2;
      flameR.position.set(0.16, -0.02, -0.62);

      ship.add(nose, wings, canopy, finL, finR, flameL, flameR);
      ship.rotation.set(0.16, -0.48, 0.12);
      ship.position.y = 0.06;

      // Scrolling cyber grid floor beneath fighter
      const floorGrid = new THREE.Mesh(
        trackGeo(new THREE.PlaneGeometry(5.5, 3.6)),
        trackMat(
          new THREE.MeshBasicMaterial({
            map: textures.starGridFloor,
            transparent: true,
            opacity: 0.72,
          })
        )
      );
      floorGrid.rotation.x = -Math.PI / 2;
      floorGrid.position.set(0, -0.88, -0.4);

      // Orbiting low-poly asteroids
      const rockMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85, metalness: 0.15, flatShading: true }));
      const rock1 = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.2, 0)), rockMat);
      rock1.position.set(-1.35, 0.45, -0.4);
      const rock2 = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.16, 0)), rockMat);
      rock2.position.set(1.38, -0.15, -0.5);

      subject.add(ship, floorGrid, rock1, rock2);
      animateFn = (t) => {
        ship.position.y = 0.08 + Math.sin(t * 2.6) * 0.1;
        ship.rotation.z = 0.1 + Math.sin(t * 1.9) * 0.22;
        ship.rotation.y = -0.48 + Math.sin(t * 1.0) * 0.18;
        const pulse = 0.85 + Math.sin(t * 18.0) * 0.22;
        flameL.scale.set(1, pulse, 1);
        flameR.scale.set(1, pulse, 1);
        textures.starGridFloor.offset.y = -(t * 0.45) % 1;
        rock1.rotation.set(t * 0.7, t * 0.9, 0);
        rock2.rotation.set(-t * 0.6, t * 0.8, 0);
      };
      break;
    }

    case 'folder': {
      const col = new THREE.Color(opts.folderColor || '#0284c7');
      const folderMat = trackMat(
        new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.25, metalness: 0.12, clearcoat: 0.75 })
      );
      const backGeo = trackGeo(
        new THREE.ExtrudeGeometry(createFolderShape(), {
          depth: 0.26,
          bevelEnabled: true,
          bevelThickness: 0.04,
          bevelSize: 0.04,
          bevelSegments: 3,
        })
      );
      backGeo.center();
      const folderBack = new THREE.Mesh(backGeo, folderMat);

      const paperSheet = new THREE.Mesh(
        trackGeo(new RoundedBoxGeometry(2.15, 1.25, 0.08, 2, 0.05)),
        trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }))
      );
      paperSheet.position.set(0, 0.08, 0.18);

      const frontPocket = new THREE.Mesh(
        trackGeo(new RoundedBoxGeometry(2.56, 1.22, 0.14, 3, 0.1)),
        folderMat
      );
      frontPocket.position.set(0, -0.18, 0.26);

      // Corner badge plaque with letter
      const badgeTex = textures.folderBadgeTexture(opts.folderBadgeChar || 'F', opts.folderColor || '#0284c7');
      const badgeCube = new THREE.Mesh(
        trackGeo(new RoundedBoxGeometry(0.56, 0.56, 0.16, 2, 0.06)),
        trackMat(new THREE.MeshStandardMaterial({ map: badgeTex, roughness: 0.25 }))
      );
      badgeCube.position.set(0.95, -0.52, 0.39);

      subject.add(folderBack, paperSheet, frontPocket, badgeCube);
      break;
    }

    case 'empty-cartridge': {
      const ghostMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x94a3b8,
          roughness: 0.4,
          metalness: 0.3,
          transparent: true,
          opacity: 0.55,
        })
      );
      const shell = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(1.45, 1.45, 0.2, 3, 0.1)), ghostMat);
      const edges = new THREE.LineSegments(
        trackGeo(new THREE.EdgesGeometry(shell.geometry)),
        trackMat(new THREE.LineBasicMaterial({ color: 0x64748b }))
      );
      subject.add(shell, edges);
      break;
    }

    case 'empty-slot':
    default: {
      const box = new THREE.Mesh(
        trackGeo(new RoundedBoxGeometry(1.2, 1.2, 0.28, 3, 0.16)),
        trackMat(
          new THREE.MeshStandardMaterial({
            color: 0xcbd5e1,
            roughness: 0.45,
            metalness: 0.1,
            transparent: true,
            opacity: 0.4,
          })
        )
      );
      const wire = new THREE.LineSegments(
        trackGeo(new THREE.EdgesGeometry(box.geometry)),
        trackMat(new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.65 }))
      );
      subject.add(box, wire);
      break;
    }
  }

  return {
    root,
    update: animateFn,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
