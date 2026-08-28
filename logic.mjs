export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function calibrationFactor(knownMillimeters, renderedPixels) {
  const mm = Number(knownMillimeters);
  const px = Number(renderedPixels);
  if (!Number.isFinite(mm) || !Number.isFinite(px) || mm <= 0 || px <= 0) {
    throw new Error("Calibration dimensions must be positive numbers.");
  }
  return mm / px;
}

export function distance(a, b) {
  return Math.hypot(Number(b.x) - Number(a.x), Number(b.y) - Number(a.y));
}

export function pixelsPerMillimeter(a, b, knownMillimeters) {
  const mm = Number(knownMillimeters);
  if (!Number.isFinite(mm) || mm <= 0) throw new Error("Known distance must be positive.");
  return distance(a, b) / mm;
}

export function nearestDepth(depth, depthMap) {
  const entries = Object.entries(depthMap || {}).map(([code, mm]) => ({
    code: String(code),
    mm: Number(mm),
  })).filter((entry) => Number.isFinite(entry.mm));
  if (!entries.length) throw new Error("Profile does not contain valid depth codes.");
  entries.sort((a, b) => a.mm - b.mm);
  const ranked = entries
    .map((entry) => ({ ...entry, difference: Number(depth) - entry.mm, absolute: Math.abs(Number(depth) - entry.mm) }))
    .sort((a, b) => a.absolute - b.absolute);
  const first = ranked[0];
  const second = ranked[1] || first;
  return {
    code: first.code,
    depth: first.mm,
    difference: first.difference,
    ambiguity: Math.max(0, 1 - Math.abs(second.absolute - first.absolute) / Math.max(0.001, Math.abs(second.mm - first.mm))),
    outOfRange: Number(depth) < entries[0].mm || Number(depth) > entries[entries.length - 1].mm,
  };
}

export function cutPositions(profile, orientation = "ltr") {
  const count = Number(profile.cutCount || profile.cutSpacing?.length || 0);
  const explicit = Array.isArray(profile.cutSpacing) ? profile.cutSpacing.map(Number) : [];
  const first = Number(profile.firstCut || 0);
  const spacing = Number(profile.spacing || 4.5);
  const values = Array.from({ length: count }, (_, index) => first + (explicit[index] ?? index * spacing));
  return orientation === "rtl" ? [...values].reverse() : values;
}

export function reverseBitting(codes) {
  return [...codes].reverse();
}

export function convertPoint(point, transform) {
  const rad = (Number(transform.rotation || 0) * Math.PI) / 180;
  const sx = Number(transform.scaleX || 1);
  const sy = Number(transform.scaleY || 1);
  const mirror = transform.mirror ? -1 : 1;
  const x = Number(point.x) * mirror * sx;
  const y = Number(point.y) * sy;
  return {
    x: x * Math.cos(rad) - y * Math.sin(rad) + Number(transform.offsetX || 0),
    y: x * Math.sin(rad) + y * Math.cos(rad) + Number(transform.offsetY || 0),
  };
}

export const identityMatrix3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function multiplyMatrix3(a, b) {
  const output = Array(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      output[row * 3 + column] =
        a[row * 3] * b[column] +
        a[row * 3 + 1] * b[column + 3] +
        a[row * 3 + 2] * b[column + 6];
    }
  }
  return output;
}

export function invertMatrix3(matrix) {
  const [a, b, c, d, e, f, g, h, i] = matrix.map(Number);
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const determinant = a * A + b * B + c * C;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    throw new Error("The perspective reference is degenerate and cannot be corrected.");
  }
  return [
    A / determinant,
    (c * h - b * i) / determinant,
    (b * f - c * e) / determinant,
    B / determinant,
    (a * i - c * g) / determinant,
    (c * d - a * f) / determinant,
    C / determinant,
    (b * g - a * h) / determinant,
    (a * e - b * d) / determinant,
  ];
}

export function applyHomography(matrix, point) {
  const x = Number(point.x);
  const y = Number(point.y);
  const denominator = matrix[6] * x + matrix[7] * y + matrix[8];
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) {
    return { x: Number.NaN, y: Number.NaN };
  }
  return {
    x: (matrix[0] * x + matrix[1] * y + matrix[2]) / denominator,
    y: (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator,
  };
}

function solveLinearSystem(coefficients, constants) {
  const size = constants.length;
  const rows = coefficients.map((row, index) => [...row.map(Number), Number(constants[index])]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-12) throw new Error("The four reference corners do not define a usable perspective transform.");
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let index = column; index <= size; index += 1) rows[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let index = column; index <= size; index += 1) rows[row][index] -= factor * rows[column][index];
    }
  }
  return rows.map((row) => row[size]);
}

export function computeHomography(sourcePoints, destinationPoints) {
  if (!Array.isArray(sourcePoints) || !Array.isArray(destinationPoints) || sourcePoints.length !== 4 || destinationPoints.length !== 4) {
    throw new Error("A perspective transform requires four source and four destination points.");
  }
  const coefficients = [];
  const constants = [];
  sourcePoints.forEach((source, index) => {
    const destination = destinationPoints[index];
    const x = Number(source.x), y = Number(source.y), u = Number(destination.x), v = Number(destination.y);
    coefficients.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); constants.push(u);
    coefficients.push([0, 0, 0, x, y, 1, -v * x, -v * y]); constants.push(v);
  });
  const solved = solveLinearSystem(coefficients, constants);
  return [...solved, 1];
}

export function translationMatrix(x, y) {
  return [1, 0, Number(x), 0, 1, Number(y), 0, 0, 1];
}

export function scaleMatrix(x, y = x) {
  return [Number(x), 0, 0, 0, Number(y), 0, 0, 0, 1];
}

export function orientationPlan(sourceWidth, sourceHeight, rotation = 0, mirror = false) {
  const width = Number(sourceWidth), height = Number(sourceHeight);
  if (!(width > 0 && height > 0)) throw new Error("Source image dimensions must be positive.");
  const radians = (Number(rotation) * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians)) < 1e-12 ? 0 : Math.cos(radians);
  const sine = Math.abs(Math.sin(radians)) < 1e-12 ? 0 : Math.sin(radians);
  const mirrorMatrix = mirror ? [-1, 0, width - 1, 0, 1, 0, 0, 0, 1] : identityMatrix3();
  const rotationMatrix = [cosine, -sine, 0, sine, cosine, 0, 0, 0, 1];
  let matrix = multiplyMatrix3(rotationMatrix, mirrorMatrix);
  const corners = [
    applyHomography(matrix, { x: 0, y: 0 }),
    applyHomography(matrix, { x: width - 1, y: 0 }),
    applyHomography(matrix, { x: width - 1, y: height - 1 }),
    applyHomography(matrix, { x: 0, y: height - 1 }),
  ];
  const minX = Math.min(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxX = Math.max(...corners.map((point) => point.x));
  const maxY = Math.max(...corners.map((point) => point.y));
  matrix = multiplyMatrix3(translationMatrix(-minX, -minY), matrix);
  return {
    matrix,
    inverse: invertMatrix3(matrix),
    width: Math.max(1, Math.round(maxX - minX + 1)),
    height: Math.max(1, Math.round(maxY - minY + 1)),
  };
}

export function rectificationPlan(corners, imageWidth, imageHeight, options = {}) {
  if (!Array.isArray(corners) || corners.length !== 4) throw new Error("Place all four perspective corners first.");
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const measuredWidth = Math.max(2, (distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2);
  const measuredHeight = Math.max(2, (distance(topLeft, bottomLeft) + distance(topRight, bottomRight)) / 2);
  const aspect = Number(options.aspectRatio);
  let targetWidth = measuredWidth * Number(options.scaleX || 1);
  let targetHeight = (Number.isFinite(aspect) && aspect > 0 ? measuredWidth / aspect : measuredHeight) * Number(options.scaleY || 1);
  const fineKeystone = clamp(Number(options.keystone || 0), -0.35, 0.35);
  const inset = fineKeystone * targetWidth * 0.5;
  const destination = [
    { x: inset, y: 0 },
    { x: targetWidth - inset, y: 0 },
    { x: targetWidth, y: targetHeight },
    { x: 0, y: targetHeight },
  ];
  let matrix = computeHomography(corners, destination);
  const imageCorners = [
    applyHomography(matrix, { x: 0, y: 0 }),
    applyHomography(matrix, { x: imageWidth - 1, y: 0 }),
    applyHomography(matrix, { x: imageWidth - 1, y: imageHeight - 1 }),
    applyHomography(matrix, { x: 0, y: imageHeight - 1 }),
  ];
  const minX = Math.min(...imageCorners.map((point) => point.x));
  const minY = Math.min(...imageCorners.map((point) => point.y));
  const maxX = Math.max(...imageCorners.map((point) => point.x));
  const maxY = Math.max(...imageCorners.map((point) => point.y));
  matrix = multiplyMatrix3(translationMatrix(-minX, -minY), matrix);
  let outputWidth = Math.max(2, Math.ceil(maxX - minX + 1));
  let outputHeight = Math.max(2, Math.ceil(maxY - minY + 1));
  const maxPixels = Math.max(1_000_000, Number(options.maxPixels || 24_000_000));
  const downsample = Math.min(1, Math.sqrt(maxPixels / Math.max(1, outputWidth * outputHeight)));
  if (downsample < 1) {
    matrix = multiplyMatrix3(scaleMatrix(downsample), matrix);
    targetWidth *= downsample;
    targetHeight *= downsample;
    outputWidth = Math.max(2, Math.ceil(outputWidth * downsample));
    outputHeight = Math.max(2, Math.ceil(outputHeight * downsample));
  }
  const inverse = invertMatrix3(matrix);
  const transformedReference = corners.map((point) => applyHomography(matrix, point));
  const residual = transformedReference.reduce((sum, point, index) => {
    const target = applyHomography(multiplyMatrix3(scaleMatrix(downsample), translationMatrix(-minX, -minY)), destination[index]);
    return sum + distance(point, target);
  }, 0) / 4;
  return {
    matrix,
    inverse,
    width: outputWidth,
    height: outputHeight,
    referenceWidth: targetWidth,
    referenceHeight: targetHeight,
    downsample,
    residual,
    magnitude: perspectiveMagnitude(corners),
  };
}

export function displayPlan(analysisWidth, analysisHeight, maxWidth, maxHeight, crop = null) {
  const bounds = crop?.accepted
    ? {
        x: clamp(Number(crop.x), 0, analysisWidth - 1),
        y: clamp(Number(crop.y), 0, analysisHeight - 1),
        width: clamp(Number(crop.width), 1, analysisWidth),
        height: clamp(Number(crop.height), 1, analysisHeight),
      }
    : { x: 0, y: 0, width: analysisWidth, height: analysisHeight };
  bounds.width = Math.min(bounds.width, analysisWidth - bounds.x);
  bounds.height = Math.min(bounds.height, analysisHeight - bounds.y);
  const scale = Math.min(1, Number(maxWidth) / bounds.width, Number(maxHeight) / bounds.height);
  return {
    ...bounds,
    scale,
    displayWidth: Math.max(1, Math.round(bounds.width * scale)),
    displayHeight: Math.max(1, Math.round(bounds.height * scale)),
  };
}

export function analysisToDisplayPoint(point, plan) {
  return { x: (Number(point.x) - plan.x) * plan.scale, y: (Number(point.y) - plan.y) * plan.scale };
}

export function displayToAnalysisPoint(point, plan) {
  return { x: Number(point.x) / plan.scale + plan.x, y: Number(point.y) / plan.scale + plan.y };
}

export function transformGeometryModel(model, matrix) {
  const output = structuredClone(model || {});
  const mapPoint = (point) => point ? { ...point, ...applyHomography(matrix, point) } : point;
  for (const key of ["scalePoints", "corners", "baseline", "cuts"]) {
    if (Array.isArray(output[key])) output[key] = output[key].map(mapPoint);
  }
  output.reference = mapPoint(output.reference);
  for (const edge of ["top", "bottom"]) {
    if (Array.isArray(output.edgeAnalyses?.[edge])) output.edgeAnalyses[edge] = output.edgeAnalyses[edge].map(mapPoint);
    const geometry = output.edgeGeometry?.[edge];
    if (geometry) { if (Array.isArray(geometry.baseline)) geometry.baseline = geometry.baseline.map(mapPoint); geometry.reference = mapPoint(geometry.reference); }
  }
  if (output.crop) {
    const corners = [
      { x: output.crop.x, y: output.crop.y },
      { x: output.crop.x + output.crop.width, y: output.crop.y },
      { x: output.crop.x + output.crop.width, y: output.crop.y + output.crop.height },
      { x: output.crop.x, y: output.crop.y + output.crop.height },
    ].map((point) => applyHomography(matrix, point));
    const minX = Math.min(...corners.map((point) => point.x)), maxX = Math.max(...corners.map((point) => point.x)), minY = Math.min(...corners.map((point) => point.y)), maxY = Math.max(...corners.map((point) => point.y));
    output.crop = { ...output.crop, x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  return output;
}

export function perspectiveMagnitude(corners) {
  if (!Array.isArray(corners) || corners.length !== 4) return 1;
  const [tl, tr, br, bl] = corners;
  const top = distance(tl, tr);
  const bottom = distance(bl, br);
  const left = distance(tl, bl);
  const right = distance(tr, br);
  const horizontal = Math.abs(top - bottom) / Math.max(1, (top + bottom) / 2);
  const vertical = Math.abs(left - right) / Math.max(1, (left + right) / 2);
  return clamp((horizontal + vertical) / 2, 0, 1);
}

export function rgbaToGrayscale(rgba) {
  if (!rgba || rgba.length % 4 !== 0) throw new Error("RGBA data must contain complete pixels.");
  const gray = new Uint8ClampedArray(rgba.length / 4);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 1) {
    gray[target] = Math.round(rgba[source] * 0.2126 + rgba[source + 1] * 0.7152 + rgba[source + 2] * 0.0722);
  }
  return gray;
}

export function otsuThreshold(gray) {
  if (!gray?.length) throw new Error("A grayscale image is required.");
  const histogram = new Uint32Array(256);
  let totalSum = 0;
  for (const value of gray) { histogram[value] += 1; totalSum += value; }
  let backgroundWeight = 0, backgroundSum = 0, bestVariance = -1, bestThreshold = 127;
  for (let threshold = 0; threshold < 256; threshold += 1) {
    backgroundWeight += histogram[threshold];
    if (!backgroundWeight) continue;
    const foregroundWeight = gray.length - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += threshold * histogram[threshold];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (totalSum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) { bestVariance = variance; bestThreshold = threshold; }
  }
  return bestThreshold;
}

export function imageQualityMetrics(gray, width, height) {
  if (!gray?.length || gray.length !== width * height) throw new Error("Image dimensions do not match grayscale data.");
  let sum = 0, squareSum = 0, dark = 0, bright = 0, gradientSum = 0, gradientCount = 0, laplacianSum = 0, laplacianSquareSum = 0, laplacianCount = 0;
  for (const value of gray) { sum += value; squareSum += value * value; if (value < 24) dark += 1; if (value > 244) bright += 1; }
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const gx = -gray[index - width - 1] - 2 * gray[index - 1] - gray[index + width - 1] + gray[index - width + 1] + 2 * gray[index + 1] + gray[index + width + 1];
      const gy = -gray[index - width - 1] - 2 * gray[index - width] - gray[index - width + 1] + gray[index + width - 1] + 2 * gray[index + width] + gray[index + width + 1];
      gradientSum += Math.hypot(gx, gy); gradientCount += 1;
      const laplacian = gray[index - width] + gray[index - 1] - 4 * gray[index] + gray[index + 1] + gray[index + width];
      laplacianSum += laplacian; laplacianSquareSum += laplacian * laplacian; laplacianCount += 1;
    }
  }
  const mean = sum / gray.length;
  const standardDeviation = Math.sqrt(Math.max(0, squareSum / gray.length - mean * mean));
  const laplacianMean = laplacianSum / Math.max(1, laplacianCount);
  const laplacianVariance = Math.max(0, laplacianSquareSum / Math.max(1, laplacianCount) - laplacianMean * laplacianMean);
  const edgeContrast = clamp(gradientSum / Math.max(1, gradientCount) / 180, 0, 1);
  const contrastScore = clamp(standardDeviation / 70, 0, 1);
  const focusScore = clamp(Math.sqrt(laplacianVariance) / 42, 0, 1);
  const glareFraction = bright / gray.length, shadowFraction = dark / gray.length;
  const score = Math.round(100 * (focusScore * 0.35 + contrastScore * 0.25 + edgeContrast * 0.3 + (1 - clamp((glareFraction + shadowFraction) * 2, 0, 1)) * 0.1));
  return { mean, standardDeviation, contrastScore, laplacianVariance, focusScore, edgeContrast, glareFraction, shadowFraction, score, label: score >= 76 ? "Good" : score >= 48 ? "Review recommended" : "Retake recommended" };
}

export function binaryMask(gray, threshold, polarity = "dark") {
  const mask = new Uint8Array(gray.length);
  const dark = polarity !== "light";
  for (let index = 0; index < gray.length; index += 1) mask[index] = dark ? Number(gray[index] <= threshold) : Number(gray[index] > threshold);
  return mask;
}

export function cleanupBinaryMask(mask, width, height, passes = 1) {
  let input = Uint8Array.from(mask);
  for (let pass = 0; pass < Math.max(0, passes); pass += 1) {
    const output = Uint8Array.from(input);
    for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
      let neighbors = 0;
      for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) neighbors += input[(y + oy) * width + x + ox];
      output[y * width + x] = neighbors >= 5 ? 1 : 0;
    }
    input = output;
  }
  return input;
}

export function connectedComponents(mask, width, height, minimumArea = 1) {
  if (!mask?.length || mask.length !== width * height) throw new Error("Mask dimensions do not match image dimensions.");
  const visited = new Uint8Array(mask.length), queue = new Int32Array(mask.length), components = [];
  for (let seed = 0; seed < mask.length; seed += 1) {
    if (!mask[seed] || visited[seed]) continue;
    let head = 0, tail = 0, area = 0, sumX = 0, sumY = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0, minSum = Infinity, maxSum = -Infinity, maxDifference = -Infinity, minDifference = Infinity;
    let tl, tr, br, bl; queue[tail++] = seed; visited[seed] = 1;
    while (head < tail) {
      const index = queue[head++], x = index % width, y = Math.floor(index / width), sum = x + y, difference = x - y;
      area += 1; sumX += x; sumY += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (sum < minSum) { minSum = sum; tl = { x, y }; } if (sum > maxSum) { maxSum = sum; br = { x, y }; }
      if (difference > maxDifference) { maxDifference = difference; tr = { x, y }; } if (difference < minDifference) { minDifference = difference; bl = { x, y }; }
      for (const neighbor of [index - 1, index + 1, index - width, index + width]) {
        if (neighbor < 0 || neighbor >= mask.length || visited[neighbor] || !mask[neighbor]) continue;
        if ((neighbor === index - 1 || neighbor === index + 1) && Math.floor(neighbor / width) !== y) continue;
        visited[neighbor] = 1; queue[tail++] = neighbor;
      }
    }
    if (area >= minimumArea) components.push({ seed, area, minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1, centroid: { x: sumX / area, y: sumY / area }, corners: [tl, tr, br, bl], touchesBorder: minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1 });
  }
  return components.sort((a, b) => b.area - a.area);
}

function componentScore(component, imageArea) {
  const aspect = component.width / Math.max(1, component.height);
  const fill = component.area / Math.max(1, component.width * component.height);
  const elongation = aspect >= 1.5 ? Math.min(4, aspect) : Math.max(0.15, aspect / 6);
  const borderPenalty = component.touchesBorder ? 0.08 : 1;
  return component.area / imageArea * elongation * borderPenalty * clamp(fill * 2.8, 0.25, 1);
}

export function scanMaskEdges(mask, width, height, component) {
  const top = [], bottom = [];
  for (let x = component.minX; x <= component.maxX; x += 1) {
    let topY = -1, bottomY = -1;
    for (let y = component.minY; y <= component.maxY; y += 1) if (mask[y * width + x]) { topY = y; break; }
    for (let y = component.maxY; y >= component.minY; y -= 1) if (mask[y * width + x]) { bottomY = y; break; }
    if (topY >= 0) top.push({ x, y: topY }); if (bottomY >= 0) bottom.push({ x, y: bottomY });
  }
  return { top, bottom };
}

export function edgeRoughness(edge) {
  if (!Array.isArray(edge) || edge.length < 5) return 0;
  let sum = 0, count = 0;
  for (let index = 2; index < edge.length; index += 1) {
    const a = edge[index - 2].y, b = edge[index - 1].y, c = edge[index].y;
    sum += Math.abs(c - 2 * b + a); count += 1;
  }
  return sum / Math.max(1, count);
}

export function detectBladeReferences(topEdge, bottomEdge) {
  const count = Math.min(topEdge?.length || 0, bottomEdge?.length || 0);
  if (count < 8) return { shoulderX: topEdge?.[0]?.x ?? 0, tipX: topEdge?.at(-1)?.x ?? 0, tipSide: "right", confidence: 0 };
  const heights = Array.from({ length: count }, (_, index) => Math.max(0, bottomEdge[index].y - topEdge[index].y));
  const endWindow = Math.max(3, Math.round(count * .1)), leftMean = heights.slice(0, endWindow).reduce((sum, value) => sum + value, 0) / endWindow, rightMean = heights.slice(-endWindow).reduce((sum, value) => sum + value, 0) / endWindow;
  const tipSide = rightMean <= leftMean ? "right" : "left", tipX = tipSide === "right" ? topEdge[count - 1].x : topEdge[0].x;
  const searchStart = Math.max(2, Math.round(count * .04)), searchEnd = Math.min(count - 3, Math.round(count * .62));
  let bestIndex = tipSide === "right" ? searchStart : count - 1 - searchStart, bestChange = 0;
  if (tipSide === "right") {
    for (let index = searchStart; index <= searchEnd; index += 1) { const change = Math.abs(heights[index + 2] - heights[index - 2]); if (change > bestChange) { bestChange = change; bestIndex = index; } }
  } else {
    for (let index = count - 1 - searchStart; index >= count - 1 - searchEnd; index -= 1) { const change = Math.abs(heights[index - 2] - heights[index + 2]); if (change > bestChange) { bestChange = change; bestIndex = index; } }
  }
  const medianHeight = [...heights].sort((a, b) => a - b)[Math.floor(count / 2)] || 1, transitionConfidence = clamp(bestChange / Math.max(1, medianHeight * .55), 0, 1);
  const shoulderX = transitionConfidence > .16 ? topEdge[bestIndex].x : (tipSide === "right" ? topEdge[0].x : topEdge[count - 1].x);
  return { shoulderX, tipX, tipSide, confidence: Math.round(100 * (transitionConfidence * .7 + clamp(Math.abs(leftMean - rightMean) / Math.max(1, medianHeight), 0, 1) * .3)) };
}

export function fitLine(points) {
  if (!Array.isArray(points) || points.length < 2) throw new Error("At least two points are required to fit a line.");
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length, meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let numerator = 0, denominator = 0;
  points.forEach((point) => { numerator += (point.x - meanX) * (point.y - meanY); denominator += (point.x - meanX) ** 2; });
  const slope = denominator ? numerator / denominator : 0, intercept = meanY - slope * meanX;
  return { slope, intercept, start: { x: points[0].x, y: slope * points[0].x + intercept }, end: { x: points.at(-1).x, y: slope * points.at(-1).x + intercept } };
}

export function segmentBlade(gray, width, height, options = {}) {
  const baseThreshold = otsuThreshold(gray), offset = clamp(Number(options.thresholdOffset || 0), -80, 80), minimumArea = Math.max(12, Math.round(width * height * Number(options.minimumAreaRatio || 0.002)));
  const polarities = options.polarity && options.polarity !== "auto" ? [options.polarity] : ["dark", "light"];
  let best = null;
  for (const polarity of polarities) {
    const threshold = clamp(baseThreshold + (polarity === "dark" ? offset : -offset), 1, 254);
    const rawMask = binaryMask(gray, threshold, polarity), cleaned = cleanupBinaryMask(rawMask, width, height, Number(options.cleanupPasses ?? 1));
    for (const component of connectedComponents(cleaned, width, height, minimumArea).slice(0, 12)) {
      const score = componentScore(component, width * height);
      if (!best || score > best.score) best = { polarity, threshold, sourceMask: cleaned, component, score };
    }
  }
  if (!best) return { found: false, confidence: 0, reason: "No sufficiently large blade-shaped region was found." };
  const mask = new Uint8Array(width * height), queue = new Int32Array(width * height); let head = 0, tail = 0; queue[tail++] = best.component.seed; mask[best.component.seed] = 1;
  while (head < tail) {
    const index = queue[head++], row = Math.floor(index / width);
    for (const neighbor of [index - 1, index + 1, index - width, index + width]) {
      if (neighbor < 0 || neighbor >= mask.length || mask[neighbor] || !best.sourceMask[neighbor]) continue;
      if ((neighbor === index - 1 || neighbor === index + 1) && Math.floor(neighbor / width) !== row) continue;
      mask[neighbor] = 1; queue[tail++] = neighbor;
    }
  }
  const edges = scanMaskEdges(mask, width, height, best.component), topRoughness = edgeRoughness(edges.top), bottomRoughness = edgeRoughness(edges.bottom), likelyBittedEdge = topRoughness >= bottomRoughness ? "top" : "bottom", references = detectBladeReferences(edges.top, edges.bottom);
  const aspect = best.component.width / Math.max(1, best.component.height), fill = best.component.area / Math.max(1, best.component.width * best.component.height);
  const confidence = Math.round(100 * clamp((Math.min(aspect, 6) / 6) * 0.45 + clamp(fill / 0.55, 0, 1) * 0.35 + clamp(best.score * 12, 0, 1) * 0.2, 0, 1));
  return { found: true, mask, component: best.component, topEdge: edges.top, bottomEdge: edges.bottom, topRoughness, bottomRoughness, likelyBittedEdge, references, polarity: best.polarity, threshold: best.threshold, confidence };
}

function regionDensity(mask, width, height, center, radius) {
  let dark = 0, total = 0;
  for (let y = Math.max(0, center.y - radius); y <= Math.min(height - 1, center.y + radius); y += 1) for (let x = Math.max(0, center.x - radius); x <= Math.min(width - 1, center.x + radius); x += 1) { dark += mask[y * width + x]; total += 1; }
  return dark / Math.max(1, total);
}

export function detectCalibrationMarker(gray, width, height, options = {}) {
  const targetAspect = Number(options.aspectRatio || 100 / 60), threshold = clamp(otsuThreshold(gray) + Number(options.thresholdOffset || 0), 1, 254), mask = cleanupBinaryMask(binaryMask(gray, threshold, "dark"), width, height, 1);
  const minimumArea = Math.max(24, Math.round(width * height * 0.0005));
  let best = null;
  for (const component of connectedComponents(mask, width, height, minimumArea).slice(0, 30)) {
    if (component.width < width * 0.08 || component.height < height * 0.05) continue;
    const corners = component.corners, measuredWidth = (distance(corners[0], corners[1]) + distance(corners[3], corners[2])) / 2, measuredHeight = (distance(corners[0], corners[3]) + distance(corners[1], corners[2])) / 2, aspect = measuredWidth / Math.max(1, measuredHeight);
    const aspectConfidence = Math.exp(-Math.abs(Math.log(aspect / targetAspect)) * 3.5);
    const borderFill = component.area / Math.max(1, component.width * component.height), borderConfidence = clamp(1 - Math.abs(borderFill - 0.12) / 0.22, 0, 1);
    const sizeConfidence = clamp(component.width * component.height / (width * height * 0.18), 0, 1);
    const score = aspectConfidence * 0.55 + borderConfidence * 0.25 + sizeConfidence * 0.2;
    if (!best || score > best.score) best = { component, corners, aspect, aspectConfidence, borderConfidence, sizeConfidence, score };
  }
  if (!best || best.score < 0.38) return { found: false, confidence: Math.round((best?.score || 0) * 100), threshold, reason: "No marker-like 100 × 60 rectangle passed the local shape checks." };
  const radius = Math.max(2, Math.round(Math.min(best.component.width, best.component.height) * 0.055));
  const cornerConfidence = best.corners.map((corner) => Math.round(100 * clamp(regionDensity(mask, width, height, corner, radius) * 2.5 * best.aspectConfidence, 0, 1)));
  const centerX = Math.round(best.component.centroid.x), topY = Math.round(best.component.minY + best.component.height * 0.22), bottomY = Math.round(best.component.maxY - best.component.height * 0.22), orientationTopDensity = regionDensity(mask, width, height, { x: centerX, y: topY }, radius * 2), orientationBottomDensity = regionDensity(mask, width, height, { x: centerX, y: bottomY }, radius * 2);
  const orientation = orientationTopDensity >= orientationBottomDensity ? "top" : "bottom", orientationConfidence = Math.round(100 * clamp(Math.abs(orientationTopDensity - orientationBottomDensity) * 4, 0, 1));
  const rotationDegrees = Math.atan2(best.corners[1].y - best.corners[0].y, best.corners[1].x - best.corners[0].x) * 180 / Math.PI;
  return { found: true, corners: best.corners, confidence: Math.round(best.score * 100), cornerConfidence, orientation, orientationConfidence, rotationDegrees, perspective: perspectiveMagnitude(best.corners), measuredAspect: best.aspect, dimensionMatch: best.aspectConfidence, threshold };
}

export function sampleEdgeAt(edge, x, radius = 2) {
  const samples = (edge || []).filter((point) => Math.abs(point.x - x) <= radius).map((point) => point.y).sort((a, b) => a - b);
  if (!samples.length) return Number.NaN;
  const middle = Math.floor(samples.length / 2); return samples.length % 2 ? samples[middle] : (samples[middle - 1] + samples[middle]) / 2;
}

export function depthCandidates(depth, depthMap, limit = 2) {
  return Object.entries(depthMap || {}).map(([code, value]) => ({ code: String(code), depth: Number(value), difference: Number(depth) - Number(value), absolute: Math.abs(Number(depth) - Number(value)) })).filter((candidate) => Number.isFinite(candidate.depth)).sort((a, b) => a.absolute - b.absolute).slice(0, Math.max(1, limit));
}

export function estimateCutSamples({ edge, baseline, referenceX, positions, pixelsPerMm, direction = 1, side = "top", depthMap, calibrated = true, smoothingRadius = 2 }) {
  if (!Array.isArray(baseline) || baseline.length !== 2) throw new Error("A two-point blade baseline is required.");
  const line = fitLine(baseline), scale = Math.max(0.001, Number(pixelsPerMm)), sign = side === "top" ? 1 : -1;
  return positions.map((position, index) => {
    const x = Number(referenceX) + Number(direction) * Number(position) * scale, y = sampleEdgeAt(edge, x, smoothingRadius), baseY = line.slope * x + line.intercept;
    if (!Number.isFinite(y)) return { position: index + 1, x, y: baseY, depth: 0, code: "?", difference: 0, candidates: [], status: "unreadable" };
    const depth = Math.max(0, (baseY - y) * sign / (calibrated ? scale : 18)), candidates = depthCandidates(depth, depthMap, 3), nearest = candidates[0];
    return { position: index + 1, x, y, depth, code: nearest?.code ?? "?", difference: nearest?.difference ?? 0, candidates, ambiguity: candidates[1] ? clamp(1 - Math.abs(candidates[1].absolute - nearest.absolute) / Math.max(0.001, Math.abs(candidates[1].depth - nearest.depth)), 0, 1) : 0, status: "estimated" };
  });
}

export function measurementConfidence({ calibrated, delta, tolerance, resolution, contrast, perspective, confirmed, readable = true }) {
  if (!readable) return { score: 0, label: "Unreadable" };
  if (!calibrated) return { score: 15, label: "Uncalibrated" };
  const tol = Math.max(0.01, Number(tolerance || 0.15));
  let score = 100;
  score -= clamp(Math.abs(Number(delta || 0)) / tol, 0, 2) * 24;
  score -= (1 - clamp(Number(resolution || 0.75), 0, 1)) * 18;
  score -= (1 - clamp(Number(contrast || 0.75), 0, 1)) * 14;
  score -= clamp(Number(perspective || 0), 0, 1) * 20;
  if (confirmed) score += 8;
  score = Math.round(clamp(score, 0, 100));
  const label = score >= 82 ? "High confidence" : score >= 58 ? "Review recommended" : "Ambiguous";
  return { score, label };
}

export function adjacentViolations(codes, maxAdjacent = Infinity, minAdjacent = 0) {
  const output = [];
  for (let index = 1; index < codes.length; index += 1) {
    const delta = Math.abs(Number(codes[index]) - Number(codes[index - 1]));
    if (delta > maxAdjacent || (delta > 0 && delta < minAdjacent)) {
      output.push({ positions: [index, index + 1], delta });
    }
  }
  return output;
}

export function stripImageMetadata(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    throw new Error("Expected an image data URL.");
  }
  return dataUrl;
}

export function withoutImageData(photoState = {}) {
  const clean = { ...photoState };
  delete clean.image;
  delete clean.sourceData;
  delete clean.objectUrl;
  return clean;
}

export function serializeProject(project) {
  return JSON.stringify({ schema: "keygauge.project", version: 1, exportedAt: new Date().toISOString(), ...project }, null, 2);
}

export function parseProject(text) {
  const parsed = JSON.parse(text);
  if (parsed.schema !== "keygauge.project" || Number(parsed.version) !== 1) {
    throw new Error("This is not a supported KEYGAUGE project file.");
  }
  return parsed;
}

export function csvEscape(value) {
  const string = String(value ?? "");
  return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

export function measurementsToCsv(record) {
  const rows = [["Position", "Raw depth (mm)", "Nearest code", "Difference (mm)", "Confidence", "Status"]];
  (record.cuts || []).forEach((cut, index) => rows.push([
    index + 1,
    Number(cut.depth || 0).toFixed(3),
    cut.code,
    Number(cut.difference || 0).toFixed(3),
    cut.confidence?.label || cut.confidence || "",
    cut.status || "estimated",
  ]));
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}
