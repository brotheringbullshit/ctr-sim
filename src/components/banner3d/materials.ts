import * as THREE from 'three';

export interface BannerTextureSet {
  earthMap: THREE.CanvasTexture;
  earthGridBump: THREE.CanvasTexture;
  notepadLines: THREE.CanvasTexture;
  starGridFloor: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  miiWordmarkTexture: (text: string, color: string) => THREE.CanvasTexture;
  folderBadgeTexture: (char: string, color: string) => THREE.CanvasTexture;
  coinEmblem: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export function createBannerTextureSet(maxAnisotropy: number): BannerTextureSet {
  const created: THREE.Texture[] = [];

  const registerColorTex = (canvas: HTMLCanvasElement): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    tex.needsUpdate = true;
    created.push(tex);
    return tex;
  };

  const registerDataTex = (canvas: HTMLCanvasElement): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = maxAnisotropy;
    tex.needsUpdate = true;
    created.push(tex);
    return tex;
  };

  // 1. Earth Globe Color Texture (stylized 3DS Internet Browser globe)
  const [earthCanvas, ectx] = makeCanvas(512, 256);
  const oceanGrad = ectx.createLinearGradient(0, 0, 0, 256);
  oceanGrad.addColorStop(0, '#38bdf8');
  oceanGrad.addColorStop(0.5, '#0284c7');
  oceanGrad.addColorStop(1, '#1d4ed8');
  ectx.fillStyle = oceanGrad;
  ectx.fillRect(0, 0, 512, 256);

  // Stylized bright continents
  ectx.fillStyle = '#bae6fd';
  const blobs: Array<[number, number, number, number]> = [
    [95, 86, 48, 30],
    [135, 118, 28, 24],
    [140, 175, 22, 42],
    [250, 74, 42, 26],
    [262, 132, 34, 44],
    [352, 84, 62, 34],
    [396, 158, 30, 22],
    [438, 186, 22, 16],
  ];
  blobs.forEach(([x, y, rx, ry]) => {
    ectx.beginPath();
    ectx.ellipse(x, y, rx, ry, 0.2, 0, Math.PI * 2);
    ectx.fill();
  });

  // Crisp latitude / longitude graticules
  ectx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  ectx.lineWidth = 2.5;
  for (let lat = 32; lat < 256; lat += 32) {
    ectx.beginPath();
    ectx.moveTo(0, lat);
    ectx.lineTo(512, lat);
    ectx.stroke();
  }
  for (let lon = 0; lon < 512; lon += 42.66) {
    ectx.beginPath();
    ectx.moveTo(lon, 0);
    ectx.lineTo(lon, 256);
    ectx.stroke();
  }
  const earthMap = registerColorTex(earthCanvas);

  // Earth bump texture
  const [bumpCanvas, bctx] = makeCanvas(256, 128);
  bctx.fillStyle = '#404040';
  bctx.fillRect(0, 0, 256, 128);
  bctx.fillStyle = '#c8c8c8';
  blobs.forEach(([x, y, rx, ry]) => {
    bctx.beginPath();
    bctx.ellipse(x / 2, y / 2, rx / 2, ry / 2, 0.2, 0, Math.PI * 2);
    bctx.fill();
  });
  const earthGridBump = registerDataTex(bumpCanvas);

  // 2. Game Notes Ruled Paper & Sketch Texture
  const [noteCanvas, nctx] = makeCanvas(512, 512);
  nctx.fillStyle = '#fffbeb';
  nctx.fillRect(0, 0, 512, 512);
  nctx.fillStyle = '#fef3c7';
  nctx.fillRect(0, 0, 512, 72);
  nctx.strokeStyle = '#f59e0b';
  nctx.lineWidth = 5;
  nctx.beginPath();
  nctx.moveTo(0, 72);
  nctx.lineTo(512, 72);
  nctx.stroke();

  nctx.strokeStyle = '#cbd5e1';
  nctx.lineWidth = 3;
  for (let y = 128; y <= 460; y += 54) {
    nctx.beginPath();
    nctx.moveTo(32, y);
    nctx.lineTo(480, y);
    nctx.stroke();
  }
  // Cute pencil doodle on notepad
  nctx.strokeStyle = '#0284c7';
  nctx.lineWidth = 8;
  nctx.lineCap = 'round';
  nctx.lineJoin = 'round';
  nctx.beginPath();
  nctx.moveTo(96, 224);
  nctx.quadraticCurveTo(170, 145, 240, 220);
  nctx.quadraticCurveTo(320, 290, 410, 195);
  nctx.stroke();
  nctx.strokeStyle = '#e11d48';
  nctx.beginPath();
  nctx.arc(155, 345, 34, 0, Math.PI * 2);
  nctx.stroke();
  const notepadLines = registerColorTex(noteCanvas);

  // 4. Starburst 3D Arcade Grid Horizon Texture
  const [gridCanvas, gctx] = makeCanvas(512, 512);
  const skyGrad = gctx.createLinearGradient(0, 0, 0, 512);
  skyGrad.addColorStop(0, '#020617');
  skyGrad.addColorStop(1, '#0c4a6e');
  gctx.fillStyle = skyGrad;
  gctx.fillRect(0, 0, 512, 512);
  gctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
  gctx.lineWidth = 3;
  for (let i = 0; i <= 512; i += 42.66) {
    gctx.beginPath();
    gctx.moveTo(i, 0);
    gctx.lineTo(i, 512);
    gctx.stroke();
    gctx.beginPath();
    gctx.moveTo(0, i);
    gctx.lineTo(512, i);
    gctx.stroke();
  }
  const starGridFloor = registerColorTex(gridCanvas);
  starGridFloor.wrapS = THREE.RepeatWrapping;
  starGridFloor.wrapT = THREE.RepeatWrapping;

  // 5. Soft Radial Contact Ground Shadow Texture
  const [shadowCanvas, sctx] = makeCanvas(256, 256);
  const rad = sctx.createRadialGradient(128, 128, 10, 128, 128, 122);
  rad.addColorStop(0, 'rgba(15, 23, 42, 0.42)');
  rad.addColorStop(0.55, 'rgba(15, 23, 42, 0.16)');
  rad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
  sctx.fillStyle = rad;
  sctx.fillRect(0, 0, 256, 256);
  const contactShadow = registerColorTex(shadowCanvas);

  // 6. Play Coin Emblem Texture ("C")
  const [coinCanvas, coctx] = makeCanvas(256, 256);
  coctx.fillStyle = '#f59e0b';
  coctx.fillRect(0, 0, 256, 256);
  coctx.strokeStyle = '#fde047';
  coctx.lineWidth = 14;
  coctx.beginPath();
  coctx.arc(128, 128, 102, 0, Math.PI * 2);
  coctx.stroke();
  coctx.fillStyle = '#fffbeb';
  coctx.font = 'bold 148px system-ui, sans-serif';
  coctx.textAlign = 'center';
  coctx.textBaseline = 'middle';
  coctx.fillText('C', 128, 136);
  const coinEmblem = registerColorTex(coinCanvas);

  // Dynamic cached helpers for text plaques (prevents GPU texture leaks across selections)
  const dynamicTexCache = new Map<string, THREE.CanvasTexture>();

  const miiWordmarkTexture = (text: string, color: string) => {
    const key = `mii:${text}:${color}`;
    const cached = dynamicTexCache.get(key);
    if (cached) return cached;
    const [c, ctx] = makeCanvas(256, 256);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = color;
    ctx.font = '900 170px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 138);
    const tex = registerColorTex(c);
    dynamicTexCache.set(key, tex);
    return tex;
  };

  const folderBadgeTexture = (char: string, color: string) => {
    const letter = char.slice(0, 1).toUpperCase() || 'F';
    const key = `fld:${letter}:${color}`;
    const cached = dynamicTexCache.get(key);
    if (cached) return cached;
    const [c, ctx] = makeCanvas(256, 256);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = color;
    ctx.lineWidth = 14;
    ctx.strokeRect(12, 12, 232, 232);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 148px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 128, 134);
    const tex = registerColorTex(c);
    dynamicTexCache.set(key, tex);
    return tex;
  };

  return {
    earthMap,
    earthGridBump,
    notepadLines,
    starGridFloor,
    contactShadow,
    miiWordmarkTexture,
    folderBadgeTexture,
    coinEmblem,
    dispose: () => {
      dynamicTexCache.clear();
      created.forEach((t) => t.dispose());
    },
  };
}
