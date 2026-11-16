import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BannerModelInstance,
  BannerSceneKind,
  buildBannerModel,
} from './banner3d/bannerModels';
import { BannerTextureSet, createBannerTextureSet } from './banner3d/materials';

interface Banner3DViewportProps {
  kind: BannerSceneKind;
  folderColor?: string;
  folderBadgeChar?: string;
  depth3D: number;
}

const _clockDelta = { value: 0 };

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const Banner3DViewport: React.FC<Banner3DViewportProps> = ({
  kind,
  folderColor,
  folderBadgeChar,
  depth3D,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Refs synced to live values so the WebGL loop never restarts on prop updates
  const depth3DRef = useRef(depth3D);
  depth3DRef.current = depth3D;

  const dragStateRef = useRef({
    dragging: false,
    lastX: 0,
    lastY: 0,
    targetYaw: 0,
    targetPitch: 0,
    yaw: 0,
    pitch: 0,
  });

  const sceneRefs = useRef<{
    scene: THREE.Scene;
    pivot: THREE.Group;
    textures: BannerTextureSet;
    isSoftwareGl: boolean;
    activeModel: BannerModelInstance | null;
    popScale: number;
  } | null>(null);

  // Initialize Three.js WebGLRenderer, RoomEnvironment, Lighting & Animation Loop ONCE
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 160);
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);
    camera.position.set(0, 0.32, 4.75);
    camera.lookAt(0, -0.05, 0);

    // Mandatory studio environment map for crisp PBR reflections on chrome/glass
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Balanced 3-point warm/cool studio lighting rig
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x94a3b8, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.85);
    keyLight.position.set(3.2, 4.5, 4.2);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(512, 512);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 14;
      keyLight.shadow.camera.left = -2.5;
      keyLight.shadow.camera.right = 2.5;
      keyLight.shadow.camera.top = 2.5;
      keyLight.shadow.camera.bottom = -2.5;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xbae6fd, 1.05);
    rimLight.position.set(-3.5, 2.0, -3.0);
    scene.add(rimLight);

    const pivot = new THREE.Group();
    scene.add(pivot);

    const textures = createBannerTextureSet(renderer.capabilities.getMaxAnisotropy());

    // Build initial banner model cleanly before first frame
    const initialModel = buildBannerModel(
      { kind, folderColor, folderBadgeChar, isSoftwareGl },
      textures
    );
    pivot.add(initialModel.root);

    sceneRefs.current = {
      scene,
      pivot,
      textures,
      isSoftwareGl,
      activeModel: initialModel,
      popScale: 0.72,
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(Math.round(entry.contentRect.width), 64);
        const h = Math.max(Math.round(entry.contentRect.height), 64);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      }
    });
    resizeObserver.observe(container);

    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.08);
      _clockDelta.value = dt;
      const elapsed = clock.getElapsedTime();
      const refs = sceneRefs.current;

      if (refs?.activeModel) {
        refs.activeModel.update(elapsed, dt);
        refs.popScale = THREE.MathUtils.damp(refs.popScale, 1.0, 12, dt);
        refs.pivot.scale.setScalar(refs.popScale);
      }

      // Smooth pointer inspection damping + 3D Depth Slider parallax sway
      const d = dragStateRef.current;
      if (!d.dragging) {
        d.targetYaw = THREE.MathUtils.damp(d.targetYaw, 0, 3.5, dt);
        d.targetPitch = THREE.MathUtils.damp(d.targetPitch, 0, 3.5, dt);
      }
      d.yaw = THREE.MathUtils.damp(d.yaw, d.targetYaw, 10, dt);
      d.pitch = THREE.MathUtils.damp(d.pitch, d.targetPitch, 10, dt);

      const depth = depth3DRef.current;
      const targetFov = 36 + depth * 11;
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 8, dt);
        camera.updateProjectionMatrix();
      }

      camera.position.x = Math.sin(elapsed * 1.1) * (0.14 + depth * 0.42);
      camera.position.y = 0.28 + Math.cos(elapsed * 0.85) * (0.06 + depth * 0.14);
      camera.position.z = 4.9 - depth * 0.55;
      camera.lookAt(0, -0.04, 0);

      if (refs) {
        refs.pivot.rotation.y = d.yaw;
        refs.pivot.rotation.x = d.pitch;
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();

      if (sceneRefs.current?.activeModel) {
        pivot.remove(sceneRefs.current.activeModel.root);
        sceneRefs.current.activeModel.dispose();
      }
      textures.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRefs.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap 3D banner group cleanly whenever selected app / folder changes (without recreating WebGLRenderer)
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    if (refs.activeModel) {
      refs.pivot.remove(refs.activeModel.root);
      refs.activeModel.dispose();
      refs.activeModel = null;
    }

    const nextModel = buildBannerModel(
      {
        kind,
        folderColor,
        folderBadgeChar,
        isSoftwareGl: refs.isSoftwareGl,
      },
      refs.textures
    );
    refs.pivot.add(nextModel.root);
    refs.activeModel = nextModel;
    refs.popScale = 0.68;
  }, [kind, folderColor, folderBadgeChar]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current.dragging = true;
    dragStateRef.current.lastX = e.clientX;
    dragStateRef.current.lastY = e.clientY;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragStateRef.current;
    if (!d.dragging) return;
    const dx = e.clientX - d.lastX;
    const dy = e.clientY - d.lastY;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.targetYaw = THREE.MathUtils.clamp(d.targetYaw + dx * 0.012, -1.35, 1.35);
    d.targetPitch = THREE.MathUtils.clamp(d.targetPitch + dy * 0.012, -0.75, 0.75);
  };

  const handlePointerUp = () => {
    dragStateRef.current.dragging = false;
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      title="Drag to inspect 3D Banner"
      className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
    />
  );
};
