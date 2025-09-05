// ===== Globals (types removed) =====
let bgImage = null;
let bgScale = 0.8, bgOffsetX = 0, bgOffsetY = 15;

let img, maskImg;
let labels = [];

let imageFadesWithBG = true, stampStrength = 1;
let pg;

let isBackgroundFading = true, bgPhase = 0.0, bgSpeed = 0.02, shadowNorm = 0.5, shadowOffset = 3.0;

let imgX = 0, imgY = 0;
let pgBgAlpha = 120;

let denseFG = false, fgStride = 4, fgMinDist = 4, scaleFG = 0.95;

let placed = [];
let labelColors = new Map(), labelSumX = new Map(), labelSumY = new Map(), labelCount = new Map(), labelHueMap = new Map();

let shapeNames = ["Droplet","Ellipse","Circle","Diamond","Star","Petal"];
let shapeIndex = 0;        // FG
let bgShapeIndex = 2;      // BG (Circle)
let spiralModeIndex = 1;   // 1=Golden, 2=Double
let bgShadowModeIndex = 0; // 0=Fade Sync, 1=Angular

let bgAngleStepDeg = 137.5, bgRadiusStep = 1.2;

const edgeMargin = 3;

function preload() {
  // 로컬 asset — 반드시 상대경로 사용 (GitHub Pages에서 file:// 금지)
  img = loadImage("assets/pumpkin_bgrmv.png", () => {
    // ok
  });
  // bgImage = loadImage("assets/pumpkin_another.jpg");
}

function setup() {
  createCanvas(600, 600);
  setupGUI();
  noStroke();
  colorMode(RGB, 255);

  if (typeof dat !== 'undefined' && typeof dat.GUI === 'function') {
    setupGUI();
  } else {
    console.error('[dat.GUI] not loaded. Check <script> order or CDN reachability.');
  }

  // 이미지 기준 마스크 생성
  img.resize(600, 600);
  maskImg = createImage(img.width, img.height);
  thresholdImage(img, maskImg);

  labels = new Array(maskImg.width * maskImg.height).fill(-1);
  connectedComponentLabeling();
  assignLabColors();

  pg = createGraphics(width, height);
}

function draw() {
  imgX = (width - img.width) / 2.0;
  imgY = (height - img.height) / 2.0;

  background(255);
  updateBackground();

  drawBaseImageWithPhase();
  applyGlobalOverlayWithPhase();

  pg.push();
  pg.clear();
  drawBackgroundPattern();
  drawPatternOnComponents();
  pg.pop();

  imageMode(CORNER);
  image(pg, 0, 0);
}

// -------- Fade / BG ----------
function updateBackground() {
  if (isBackgroundFading) bgPhase += bgSpeed;
  shadowNorm = (Math.cos(bgPhase) + 1) * 0.5;
}

function drawBaseImageWithPhase() {
  if (!bgImage) {
    const phaseB = (Math.sin(bgPhase) + 1) * 0.5 * 255.0;
    background(phaseB);
    return;
  }
  const phaseB = (Math.sin(bgPhase) + 1) * 0.5 * 255.0;
  push();
  tint(phaseB);
  push();
  imageMode(CENTER);
  translate(width/2 + bgOffsetX, height/2 + bgOffsetY);
  const drawW = bgImage.width  * bgScale;
  const drawH = bgImage.height * bgScale;
  image(bgImage, 0, 0, drawW, drawH);
  pop();
  imageMode(CORNER);
  pop();
}

function applyGlobalOverlayWithPhase() {
  const k = Math.sin(bgPhase);
  const aLight = Math.max(0, k) * 255.0 * stampStrength;
  const aDark  = Math.max(0, -k) * 255.0 * stampStrength;

  push();
  noStroke();
  if (aLight > 0.5) {
    drawingContext.globalCompositeOperation = 'screen';
    fill(255, aLight);
    rect(0, 0, width, height);
  }
  if (aDark > 0.5) {
    drawingContext.globalCompositeOperation = 'multiply';
    fill(0, aDark);
    rect(0, 0, width, height);
  }
  drawingContext.globalCompositeOperation = 'source-over';
  pop();
}

// -------- Mask & labeling ----------
function thresholdImage(src, dst) {
  src.loadPixels();
  dst.loadPixels();
  for (let i = 0; i < src.pixels.length; i += 4) {
    const r = src.pixels[i], g = src.pixels[i+1], b = src.pixels[i+2];
    const isBlack = (r < 40 && g < 40 && b < 40);
    const v = isBlack ? 255 : 0;
    dst.pixels[i] = dst.pixels[i+1] = dst.pixels[i+2] = v;
    dst.pixels[i+3] = 255;
  }
  dst.updatePixels();
}

function brightnessFromPixels(pixels, idx) {
  // 간단한 평균 (Processing의 brightness 대체)
  const r = pixels[idx], g = pixels[idx+1], b = pixels[idx+2];
  return (r+g+b)/3;
}

function connectedComponentLabeling() {
  maskImg.loadPixels();
  let currentLabel = 0;
  const w = maskImg.width, h = maskImg.height;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idxPix = 4*(x + y*w);
      const idxLab = x + y*w;
      if (labels[idxLab] !== -1) continue;
      if (brightnessFromPixels(maskImg.pixels, idxPix) < 200) continue;

      labelSumX.set(currentLabel, 0);
      labelSumY.set(currentLabel, 0);
      labelCount.set(currentLabel, 0);
      floodFill(x, y, currentLabel, w, h);
      currentLabel++;
    }
  }
}

function floodFill(startX, startY, label, w, h) {
  const stack = [{ x: startX, y: startY }];
  maskImg.loadPixels();

  while (stack.length) {
    const p = stack.pop();
    const x = p.x, y = p.y;
    if (x < 0 || x >= w || y < 0 || y >= h) continue;

    const idxLab = x + y * w;
    if (labels[idxLab] !== -1) continue;

    const idxPix = 4 * idxLab;
    if (brightnessFromPixels(maskImg.pixels, idxPix) < 200) continue;

    labels[idxLab] = label;

    labelSumX.set(label, (labelSumX.get(label) || 0) + x);
    labelSumY.set(label, (labelSumY.get(label) || 0) + y);
    labelCount.set(label, (labelCount.get(label) || 0) + 1);

    stack.push({ x: x + 1, y: y });
    stack.push({ x: x - 1, y: y });
    stack.push({ x: x,     y: y + 1 });
    stack.push({ x: x,     y: y - 1 });
  }
}


function isPumpkin(ix, iy) {
  if (ix<0 || ix>=maskImg.width || iy<0 || iy>=maskImg.height) return false;
  const idxPix = 4*(ix + iy*maskImg.width);
  return brightnessFromPixels(maskImg.pixels, idxPix) > 128;
}

function isNearPumpkin(ix, iy, margin) {
  for (let dy=-margin; dy<=margin; dy++) {
    for (let dx=-margin; dx<=margin; dx++) {
      if (isPumpkin(ix+dx, iy+dy)) return true;
    }
  }
  return false;
}

// -------- BG pattern ----------
function drawBackgroundPattern() {
  const bgShape = shapeNames[bgShapeIndex];
  const total = 1200;
  const startRadius = 12;
  const centerX = width/2, centerY = height/2;

  randomSeed(424242);
  const step = bgRadiusStep;

  pg.push();
  for (let i=0; i<total; i++) {
    let x,y;
    let gAng = i * radians(bgAngleStepDeg);
    let gRad = startRadius + i*step;

    if (spiralModeIndex === 1) {
      x = centerX + gRad * Math.cos(gAng);
      y = centerY + gRad * Math.sin(gAng);
    } else {
      if ((i & 1) === 1) gAng += PI;
      x = centerX + gRad * Math.cos(gAng);
      y = centerY + gRad * Math.sin(gAng);
    }

    const ix = int(x - imgX), iy = int(y - imgY);
    if (isPumpkin(ix, iy) || isNearPumpkin(ix, iy, edgeMargin)) continue;

    const lr = computeBGShadow(x, y, centerX, centerY, bgShadowModeIndex, shadowNorm);

    const d = dist(x, y, centerX, centerY);
    const maxD = startRadius + (total - 1) * step;
    const ratio = constrain(d / maxD, 0, 1);
    const L = (ratio < 0.25) ? 30 : (ratio < 0.50) ? 50 : (ratio < 0.75) ? 70 : 90;

    const hueDeg = random(360);
    const chromaV = 100;

    const distNorm = map(d, startRadius, maxD, 0.5, 1.2);
    const rxBG = 10 * distNorm * 1.2;
    const ryBG = 10 * distNorm * 1.2;

    const fillColor = labToRGB(L, chromaV, hueDeg);

    pg.push();
    pg.translate(x, y);
    const ang = atan2(y - centerY, x - centerX);
    pg.rotate(ang + HALF_PI);
    const soff = shadowOffset * 0.2;
    drawShapeTriplet(pg, bgShape, rxBG, ryBG, -soff, soff, lr.left, lr.right, fillColor);
    pg.pop();
  }
  pg.pop();
}

function computeBGShadow(x, y, centerX, centerY, mode, shadowNorm) {
  const out = { left: color(0), right: color(255) };
  if (mode === 0) {
    out.left  = lerpColor(color(0),   color(255), shadowNorm);
    out.right = lerpColor(color(255), color(0),   shadowNorm);
    return out;
  }
  const ang = atan2(y - centerY, x - centerX);
  const a = ((ang % TWO_PI) + TWO_PI) % TWO_PI;
  const baseLeftBlack = (a < PI);

  const leftBase      = baseLeftBlack ? color(0)   : color(255);
  const leftInverted  = baseLeftBlack ? color(255) : color(0);
  const rightBase     = baseLeftBlack ? color(255) : color(0);
  const rightInverted = baseLeftBlack ? color(0)   : color(255);

  out.left  = lerpColor(leftBase,  leftInverted,  shadowNorm);
  out.right = lerpColor(rightBase, rightInverted, shadowNorm);
  return out;
}

function drawShapeTriplet(g, shape, rx, ry, leftDx, rightDx, leftShadow, rightShadow, fillColor) {
  g.noStroke();
  if (shape === "Ellipse") {
    drawEllipse(g,  leftDx, 0, rx*1.5, ry*2.0, leftShadow);
    drawEllipse(g, rightDx, 0, rx*1.5, ry*2.0, rightShadow);
    drawEllipse(g,     0,   0, rx*1.5, ry*2.0, fillColor);
  } else if (shape === "Circle") {
    const r = Math.min(rx, ry) * 1.2;
    g.fill(leftShadow);  g.ellipse( leftDx, 0, r, r);
    g.fill(rightShadow); g.ellipse(rightDx, 0, r, r);
    g.fill(fillColor);   g.ellipse(    0,   0, r, r);
  } else if (shape === "Droplet") {
    drawDroplet(g,  leftDx, 0, rx*1.5, ry*2.0, leftShadow);
    drawDroplet(g, rightDx, 0, rx*1.5, ry*2.0, rightShadow);
    drawDroplet(g,     0,   0, rx*1.5, ry*2.0, fillColor);
  } else if (shape === "Diamond") {
    drawDiamond(g,  leftDx, 0, rx*1.5, ry*1.5, leftShadow);
    drawDiamond(g, rightDx, 0, rx*1.5, ry*1.5, rightShadow);
    drawDiamond(g,     0,   0, rx*1.5, ry*1.5, fillColor);
  } else if (shape === "Star") {
    drawStar(g,  leftDx, 0, rx*0.5, ry, 5, leftShadow);
    drawStar(g, rightDx, 0, rx*0.5, ry, 5, rightShadow);
    drawStar(g,     0,   0, rx*0.5, ry, 5, fillColor);
  } else if (shape === "Petal") {
    drawPetal(g,  leftDx, 0, rx*1.5, ry*1.5, leftShadow);
    drawPetal(g, rightDx, 0, rx*1.5, ry*1.5, rightShadow);
    drawPetal(g,     0,   0, rx*1.5, ry*1.5, fillColor);
  }
}

// -------- FG pattern (라벨 중심) ----------
function assignLabColors() {
  const centerX = img.width / 2, centerY = img.height / 2;
  const maxDist = dist(0,0,centerX,centerY);

  // labelCount 채워진 것만 순회
  for (const [label, cnt] of labelCount.entries()) {
    if (cnt < 5) continue;
    const cx = labelSumX.get(label) / cnt;
    const cy = labelSumY.get(label) / cnt;
    const d = dist(cx, cy, centerX, centerY);
    const t = constrain(d / maxDist, 0, 1);
    const L = lerp(90, 30, t);
    const C = 60;
    const hue = baseHueForLabel(label);
    labelColors.set(label, labToRGB(L, C, hue));
  }
}

function baseHueForLabel(label) {
  if (!labelHueMap.has(label)) labelHueMap.set(label, random(0,360));
  return labelHueMap.get(label);
}

function drawPatternOnComponents() {
  const centerX_img = img.width * 0.5, centerY_img = img.height * 0.5;
  placed = [];

  // 라벨을 중심에서 가까운 순으로 정렬
  const sorted = [...labelColors.keys()].sort((a,b) => {
    const ax = labelSumX.get(a) / labelCount.get(a);
    const ay = labelSumY.get(a) / labelCount.get(a);
    const bx = labelSumX.get(b) / labelCount.get(b);
    const by = labelSumY.get(b) / labelCount.get(b);
    const da = dist(ax, ay, centerX_img, centerY_img);
    const db = dist(bx, by, centerX_img, centerY_img);
    return da - db;
  });

  for (const label of sorted) {
    const count = labelCount.get(label);
    if (count < 5) continue;

    let cx_img = labelSumX.get(label) / count;
    let cy_img = labelSumY.get(label) / count;

    cx_img = centerX_img + (cx_img - centerX_img) * scaleFG;
    cy_img = centerY_img + (cy_img - centerY_img) * scaleFG;

    let overlaps = false;
    for (const p of placed) {
      if (dist(cx_img, cy_img, p.x, p.y) < 10) { overlaps = true; break; }
    }
    if (overlaps) continue;
    placed.push({x:cx_img, y:cy_img});

    const dx = cx_img - centerX_img;
    const dy = cy_img - centerY_img;
    const rotationAngle = atan2(dy, dx);

    let sizeFactor = constrain(map(count, 10, 150, 5, 14), 5, 14);
    if (count > 120) sizeFactor *= 0.6;
    else if (count > 100) sizeFactor *= 0.75;

    const w = sizeFactor * 1.5;
    const h = sizeFactor * 2.2;

    const fillColor = labelColors.get(label);
    const s = shadowOffset * 0.2;
    const topShadow    = lerpColor(color(0),   color(255), shadowNorm);
    const bottomShadow = lerpColor(color(255), color(0),   shadowNorm);

    pg.push();
    pg.translate(cx_img + imgX, cy_img + imgY);
    pg.rotate(rotationAngle);
    const shape = shapeNames[shapeIndex];

    if (shape === "Droplet") {
      drawDroplet(pg, 0,  s, w, h, topShadow);
      drawDroplet(pg, 0, -s, w, h, bottomShadow);
      drawDroplet(pg, 0,  0, w, h, fillColor);
    } else if (shape === "Star") {
      drawStar(pg,  s,  s, sizeFactor*0.5, sizeFactor, 5, topShadow);
      drawStar(pg, -s, -s, sizeFactor*0.5, sizeFactor, 5, bottomShadow);
      drawStar(pg,  0,  0, sizeFactor*0.5, sizeFactor, 5, fillColor);
    } else if (shape === "Ellipse") {
      drawEllipse(pg,  s,  s, w, h, topShadow);
      drawEllipse(pg, -s, -s, w, h, bottomShadow);
      drawEllipse(pg,  0,  0, w, h, fillColor);
    } else if (shape === "Circle") {
      const radius = sizeFactor * 1.4;
      pg.noStroke();
      pg.fill(topShadow);    pg.ellipse( s,  s, radius, radius);
      pg.fill(bottomShadow); pg.ellipse(-s, -s, radius, radius);
      pg.fill(fillColor);    pg.ellipse( 0,  0, radius, radius);
    } else if (shape === "Diamond") {
      drawDiamond(pg,  s,  s, sizeFactor*2, sizeFactor*2, topShadow);
      drawDiamond(pg, -s, -s, sizeFactor*2, sizeFactor*2, bottomShadow);
      drawDiamond(pg,  0,  0, sizeFactor*2, sizeFactor*2, fillColor);
    } else if (shape === "Petal") {
      drawPetal(pg,  s,  s, sizeFactor*1.5, sizeFactor*1.5, topShadow);
      drawPetal(pg, -s, -s, sizeFactor*1.5, sizeFactor*1.5, bottomShadow);
      drawPetal(pg,  0,  0, sizeFactor*1.5, sizeFactor*1.5, fillColor);
    }
    pg.pop();
  }
}

// -------- Shape drawers (p5 Graphics) ----------
function drawDroplet(g, dx, dy, w, h, c) {
  g.push();
  g.translate(dx, dy);
  g.fill(c); g.noStroke();
  g.beginShape();
  g.vertex(0, -h * 0.5);
  g.bezierVertex(-w*0.6, -h*0.1, -w*0.6,  h*0.4, 0,  h*0.5);
  g.bezierVertex( w*0.6,  h*0.4,  w*0.6, -h*0.1, 0, -h*0.5);
  g.endShape(CLOSE);
  g.pop();
}

function drawStar(g, dx, dy, r1, r2, npoints, c) {
  g.push();
  g.translate(dx, dy);
  g.fill(c); g.noStroke();
  const angle = TWO_PI / npoints, halfAngle = angle/2.0;
  g.beginShape();
  for (let a = 0; a < TWO_PI; a += angle) {
    let sx = Math.cos(a) * r2, sy = Math.sin(a) * r2; g.vertex(sx, sy);
    sx = Math.cos(a + halfAngle) * r1; sy = Math.sin(a + halfAngle) * r1; g.vertex(sx, sy);
  }
  g.endShape(CLOSE);
  g.pop();
}

function drawEllipse(g, dx, dy, w, h, c) {
  g.push();
  g.translate(dx, dy);
  g.fill(c); g.noStroke();
  g.beginShape();
  g.vertex(0, -h/2);
  g.bezierVertex(-w/2, -h/4, -w/2, h/4, 0, h/2);
  g.bezierVertex( w/2,  h/4,  w/2, -h/4, 0, -h/2);
  g.endShape(CLOSE);
  g.pop();
}

function drawDiamond(g, dx, dy, w, h, c) {
  g.push();
  g.translate(dx, dy);
  g.fill(c); g.noStroke();
  g.beginShape();
  g.vertex(0, -h/2);
  g.vertex(-w/2, 0);
  g.vertex(0, h/2);
  g.vertex(w/2, 0);
  g.endShape(CLOSE);
  g.pop();
}

function drawPetal(g, dx, dy, w, h, c) {
  g.push();
  g.translate(dx, dy);
  g.fill(c); g.noStroke();
  g.beginShape();
  g.vertex(0, 0);
  g.bezierVertex(-w/2, -h/2, -w/2, h/2, 0, h);
  g.bezierVertex( w/2,  h/2,  w/2, -h/2, 0, 0);
  g.endShape(CLOSE);
  g.pop();
}

const UI = {
  get bgSpeed() { return bgSpeed; },
  set bgSpeed(v) { bgSpeed = v; },

  get bgScale() { return bgScale; },
  set bgScale(v) { bgScale = v; },

  get bgRadiusStep() { return bgRadiusStep; },
  set bgRadiusStep(v) { bgRadiusStep = v; },

  get FG_Shape() { return shapeNames[shapeIndex]; },
  set FG_Shape(name) { shapeIndex = shapeNames.indexOf(name); },
};

function setupGUI() {
  const gui = new dat.GUI();

  gui.add(UI, 'bgSpeed', 0.001, 0.1, 0.001);
  gui.add(UI, 'bgScale', 0.5, 2.0, 0.01);
  gui.add(UI, 'bgRadiusStep', 0.4, 3.0, 0.01);
  gui.add(UI, 'FG_Shape', shapeNames);
}

// Lab -> sRGB helpers (D65)
function labToRGB(L, C, thetaDeg) {
  const thetaRad = radians(thetaDeg);
  const a = C * Math.cos(thetaRad);
  const b = C * Math.sin(thetaRad);
  const [X,Y,Z] = labToXYZ(L, a, b);
  const [r,g,bv] = xyzToSRGB(X,Y,Z);
  return color(constrain(r,0,255), constrain(g,0,255), constrain(bv,0,255));
}

function labToXYZ(L, a, b) {
  const Xr = 0.95047, Yr = 1.00000, Zr = 1.08883;
  const fy = (L + 16) / 116.0;
  const fx = fy + (a / 500.0);
  const fz = fy - (b / 200.0);
  const X = Xr * fInv(fx);
  const Y = Yr * fInv(fy);
  const Z = Zr * fInv(fz);
  return [X,Y,Z];
}

function fInv(t) {
  const delta = 6.0/29.0;
  return (t > delta) ? t*t*t : 3*delta*delta*(t - 4.0/29.0);
}

function xyzToSRGB(X, Y, Z) {
  const rLin = 3.2406*X - 1.5372*Y - 0.4986*Z;
  const gLin = -0.9689*X + 1.8758*Y + 0.0415*Z;
  const bLin = 0.0557*X - 0.2040*Y + 1.0570*Z;
  return [ gammaCorrect(rLin)*255, gammaCorrect(gLin)*255, gammaCorrect(bLin)*255 ];
}

function gammaCorrect(c) {
  return (c <= 0.0031308) ? 12.92 * c : (1.055 * Math.pow(c, 1.0/2.4) - 0.055);
}


// -------- mouse wheel (BG tuning) ----
function mouseWheel(e) {
  bgAngleStepDeg = constrain(bgAngleStepDeg + e.delta * 0.05 * 2.0, 90, 200);
  bgRadiusStep   = constrain(bgRadiusStep   + e.delta * 0.05 * 0.05, 0.4, 3.0);
}
