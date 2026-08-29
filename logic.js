// A .js module is used intentionally so shared hosts serve the correct JavaScript MIME type.
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

export function localEdgeDefinition(edge, x, radius = 6) {
  const center = sampleEdgeAt(edge, x, 0), left = sampleEdgeAt(edge, Number(x) - radius, 1), right = sampleEdgeAt(edge, Number(x) + radius, 1);
  if (![center, left, right].every(Number.isFinite)) return 0;
  const curvature = Math.abs(left - 2 * center + right) / Math.max(1, radius), support = [left, center, right].filter(Number.isFinite).length / 3;
  return clamp(support * (0.35 + clamp(curvature / 1.8, 0, 1) * 0.65), 0, 1);
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

export function photoCutConfidence({ calibrated, readable = true, confirmed = false, rejected = false, delta = 0, tolerance = 0.15, resolution = 0.5, focus = 0.5, contrast = 0.5, perspective = 0, calibrationQuality = 0.5, referenceVisibility = 0.5, edgeDefinition = 0.5, ambiguity = 0.5 }) {
  const factors = {
    resolution: clamp(Number(resolution), 0, 1),
    focus: clamp(Number(focus), 0, 1),
    edgeContrast: clamp(Number(contrast), 0, 1),
    perspective: 1 - clamp(Number(perspective), 0, 1),
    calibrationReference: clamp(Number(calibrationQuality), 0, 1),
    depthProximity: 1 - clamp(Math.abs(Number(delta)) / Math.max(0.01, Number(tolerance || 0.15)) / 1.5, 0, 1),
    referenceVisibility: clamp(Number(referenceVisibility), 0, 1),
    edgeDefinition: clamp(Number(edgeDefinition), 0, 1),
    ambiguityClarity: 1 - clamp(Number(ambiguity), 0, 1),
  };
  if (!readable) return { score: 0, label: "Unreadable", factors };
  if (!calibrated) return { score: 15, label: "Uncalibrated", factors };
  const weights = { resolution: 0.11, focus: 0.11, edgeContrast: 0.13, perspective: 0.11, calibrationReference: 0.12, depthProximity: 0.16, referenceVisibility: 0.08, edgeDefinition: 0.09, ambiguityClarity: 0.09 };
  let score = Object.entries(weights).reduce((sum, [key, weight]) => sum + factors[key] * weight, 0) * 92;
  if (confirmed) score += 8;
  if (rejected) score -= 22;
  score = Math.round(clamp(score, 0, 100));
  const label = score >= 82 ? "High confidence" : score >= 58 ? "Review recommended" : "Ambiguous";
  return { score, label, factors };
}

export function verificationSummary(cuts = []) {
  const summary = { total: cuts.length, accepted: 0, rejected: 0, unreadable: 0, unreviewed: 0, complete: false, percent: 0 };
  cuts.forEach((cut) => {
    if (cut.status === "accepted") summary.accepted += 1;
    else if (cut.status === "rejected") summary.rejected += 1;
    else if (cut.status === "unreadable") summary.unreadable += 1;
    else summary.unreviewed += 1;
  });
  summary.complete = summary.total > 0 && summary.unreviewed === 0;
  summary.percent = summary.total ? Math.round((summary.total - summary.unreviewed) / summary.total * 100) : 0;
  return summary;
}

export function compareMeasurements(first = [], second = [], tolerance = 0.15) {
  const count = Math.max(first.length, second.length), rows = [];
  for (let index = 0; index < count; index += 1) {
    const a = first[index], b = second[index], usable = Number.isFinite(a?.depth) && Number.isFinite(b?.depth) && a?.status !== "unreadable" && b?.status !== "unreadable";
    const delta = usable ? Number(b.depth) - Number(a.depth) : null;
    rows.push({ position: index + 1, first: a || null, second: b || null, delta, absolute: delta === null ? null : Math.abs(delta), agreement: delta === null ? "unavailable" : Math.abs(delta) <= tolerance ? "within tolerance" : Math.abs(delta) <= tolerance * 2 ? "review" : "disagreement" });
  }
  const comparable = rows.filter((row) => row.delta !== null), squareSum = comparable.reduce((sum, row) => sum + row.delta ** 2, 0), maximum = comparable.reduce((max, row) => Math.max(max, row.absolute), 0), within = comparable.filter((row) => row.agreement === "within tolerance").length;
  return { rows, compared: comparable.length, withinTolerance: within, rmsDifference: comparable.length ? Math.sqrt(squareSum / comparable.length) : null, maximumDifference: comparable.length ? maximum : null, agreementPercent: comparable.length ? Math.round(within / comparable.length * 100) : 0 };
}

export function combineMeasurements(first = [], second = [], depthMap = {}) {
  const count = Math.max(first.length, second.length);
  return Array.from({ length: count }, (_, index) => {
    const candidates = [first[index], second[index]].filter((cut) => cut && Number.isFinite(cut.depth) && cut.status !== "unreadable");
    if (!candidates.length) return { position: index + 1, depth: 0, code: "?", difference: 0, ambiguity: 1, status: "unreadable", confidence: { score: 0, label: "Unreadable" }, sources: 0 };
    const weighted = candidates.reduce((result, cut) => { const weight = Math.max(1, Number(cut.confidence?.score || 50)); result.sum += Number(cut.depth) * weight; result.weight += weight; return result; }, { sum: 0, weight: 0 });
    const depth = weighted.sum / weighted.weight, match = nearestDepth(depth, depthMap), score = Math.round(candidates.reduce((sum, cut) => sum + Number(cut.confidence?.score || 50), 0) / candidates.length);
    return { position: index + 1, depth, code: match.code, difference: match.difference, ambiguity: match.ambiguity, outOfRange: match.outOfRange, status: candidates.length === 2 && candidates.every((cut) => cut.status === "accepted") ? "accepted" : "estimated", confidence: { score, label: score >= 82 ? "High confidence" : score >= 58 ? "Review recommended" : "Ambiguous" }, sources: candidates.length };
  });
}

export function transformMeasurementGrid(model, options = {}) {
  const output = structuredClone(model || {}), radians = Number(options.rotationDegrees || 0) * Math.PI / 180, dx = Number(options.dx || 0), dy = Number(options.dy || 0);
  const all = [...(output.baseline || []), ...(output.cuts || []), ...(output.reference ? [output.reference] : [])], origin = options.origin || (all.length ? { x: all.reduce((sum, point) => sum + Number(point.x), 0) / all.length, y: all.reduce((sum, point) => sum + Number(point.y), 0) / all.length } : { x: 0, y: 0 });
  const mapPoint = (point) => { if (!point) return point; const x = Number(point.x) - origin.x, y = Number(point.y) - origin.y; return { ...point, x: origin.x + x * Math.cos(radians) - y * Math.sin(radians) + dx, y: origin.y + x * Math.sin(radians) + y * Math.cos(radians) + dy }; };
  if (Array.isArray(output.baseline)) output.baseline = output.baseline.map(mapPoint);
  if (Array.isArray(output.cuts)) output.cuts = output.cuts.map(mapPoint);
  output.reference = mapPoint(output.reference);
  return output;
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

const IMAGE_REFERENCE_KEYS = new Set(["image", "imageData", "sourceData", "objectUrl", "photoBlob", "originalPhoto", "originalPhotograph", "thumbnail", "exif"]);
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
export const PROJECT_SCHEMA_VERSION = 3;
export const RECORD_SCHEMA_VERSION = 2;

export function createLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function removeImageReferences(value) {
  if (Array.isArray(value)) return value.map(removeImageReferences);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => !UNSAFE_OBJECT_KEYS.has(key) && !IMAGE_REFERENCE_KEYS.has(key) && !(typeof item === "string" && (item.startsWith("data:image/") || item.startsWith("blob:")))).map(([key, item]) => [key, removeImageReferences(item)]));
}

export function imageReferencePaths(value, path = "$", output = []) {
  if (Array.isArray(value)) { value.forEach((item, index) => imageReferencePaths(item, `${path}[${index}]`, output)); return output; }
  if (!value || typeof value !== "object") return output;
  for (const [key, item] of Object.entries(value)) {
    const itemPath = `${path}.${key}`;
    if (IMAGE_REFERENCE_KEYS.has(key) || (typeof item === "string" && (item.startsWith("data:image/") || item.startsWith("blob:")))) output.push(itemPath);
    else imageReferencePaths(item, itemPath, output);
  }
  return output;
}

export function privacyAudit(value) {
  const sourceReferences = imageReferencePaths(value), sanitized = removeImageReferences(value), remainingReferences = imageReferencePaths(sanitized);
  return { passed: remainingReferences.length === 0, sourceReferenceCount: sourceReferences.length, removedReferenceCount: Math.max(0, sourceReferences.length - remainingReferences.length), remainingReferences, sanitized };
}

function utf8Bytes(text) { return new TextEncoder().encode(String(text ?? "")).byteLength; }
function assertArrayLimit(value, name, limit) { if (value !== undefined && !Array.isArray(value)) throw new Error(`${name} must be an array.`); if ((value || []).length > limit) throw new Error(`${name} exceeds the supported limit of ${limit}.`); }

export function validateImportedProject(parsed, options = {}) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The project root must be an object.");
  assertArrayLimit(parsed.records, "Records", Number(options.maxRecords || 5000)); assertArrayLimit(parsed.profiles, "Profiles", Number(options.maxProfiles || 500)); assertArrayLimit(parsed.recoveryPoints, "Recovery checkpoints", Number(options.maxRecoveryPoints || 50)); assertArrayLimit(parsed.validationStudies, "Validation studies", Number(options.maxValidationStudies || 500));
  for (const [index, record] of (parsed.records || []).entries()) {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`Record ${index + 1} is invalid.`);
    assertArrayLimit(record.cuts, `Record ${index + 1} cut positions`, Number(options.maxCutsPerRecord || 32)); assertArrayLimit(record.revisions, `Record ${index + 1} revisions`, Number(options.maxRevisionsPerRecord || 50));
  }
  for (const [index, study] of (parsed.validationStudies || []).entries()) {
    if (!study || typeof study !== "object" || Array.isArray(study)) throw new Error(`Validation study ${index + 1} is invalid.`);
    assertArrayLimit(study.result?.rows, `Validation study ${index + 1} cut positions`, Number(options.maxCutsPerRecord || 32));
    assertArrayLimit(study.recordSnapshot?.cuts, `Validation study ${index + 1} record cut positions`, Number(options.maxCutsPerRecord || 32));
  }
  return parsed;
}

export function evaluateGoldenMeasurementFixture(fixture = {}) {
  const tolerance = Number(fixture.tolerance || 1e-6), checks = [];
  for (const item of fixture.scaleCases || []) {
    const actual = pixelsPerMillimeter(item.first, item.second, item.distanceMillimeters), error = Math.abs(actual - item.expectedPixelsPerMillimeter); checks.push({ category: "scale", name: item.name, passed: error <= Number(item.tolerance ?? tolerance), expected: item.expectedPixelsPerMillimeter, actual, error });
  }
  for (const item of fixture.homographyCases || []) {
    const matrix = computeHomography(item.source, item.destination);
    for (const [index, probe] of (item.probes || []).entries()) { const actual = applyHomography(matrix, probe.source), error = Math.hypot(actual.x - probe.expected.x, actual.y - probe.expected.y); checks.push({ category: "perspective", name: `${item.name} · probe ${index + 1}`, passed: error <= Number(item.tolerance ?? tolerance), expected: probe.expected, actual, error }); }
  }
  for (const item of fixture.depthCases || []) {
    for (const [index, sample] of (item.samples || []).entries()) { const actual = nearestDepth(sample.depth, item.depthMap), passed = String(actual.code) === String(sample.expectedCode) && Math.abs(actual.difference - Number(sample.expectedDifference || 0)) <= Number(sample.tolerance ?? tolerance); checks.push({ category: "depth-code", name: `${item.name} · sample ${index + 1}`, passed, expected: { code: String(sample.expectedCode), difference: Number(sample.expectedDifference || 0) }, actual: { code: String(actual.code), difference: actual.difference }, error: Math.abs(actual.difference - Number(sample.expectedDifference || 0)) }); }
  }
  for (const item of fixture.coordinateCases || []) {
    const actual = convertPoint(item.point, item.transform), error = Math.hypot(actual.x - item.expected.x, actual.y - item.expected.y); checks.push({ category: "coordinates", name: item.name, passed: error <= Number(item.tolerance ?? tolerance), expected: item.expected, actual, error });
  }
  const passed = checks.filter((check) => check.passed).length; return { schema: String(fixture.schema || "unversioned"), version: Number(fixture.version || 0), passed: passed === checks.length, passedChecks: passed, totalChecks: checks.length, failedChecks: checks.length - passed, checks };
}

export function performanceAssessment({ pixels = 0, elapsedMilliseconds = 0, budgetMilliseconds = 1200 } = {}) {
  const pixelCount = Math.max(0, Number(pixels)), elapsed = Math.max(0, Number(elapsedMilliseconds)), budget = Math.max(1, Number(budgetMilliseconds)), megapixelsPerSecond = elapsed > 0 ? pixelCount / 1_000_000 / (elapsed / 1000) : null;
  return { pixels: pixelCount, elapsedMilliseconds: elapsed, budgetMilliseconds: budget, megapixelsPerSecond, level: elapsed <= budget ? "within budget" : elapsed <= budget * 2 ? "review" : "over budget", passed: elapsed <= budget };
}

function sequenceValues(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  return String(value ?? "").split(/[\s,;|/-]+/).map((item) => item.trim()).filter(Boolean);
}

function depthValues(value) {
  if (Array.isArray(value)) return value.map(Number);
  return String(value ?? "").split(/[\s,;|]+/).map((item) => Number(item.trim())).filter(Number.isFinite);
}

export function fieldValidationResult(recordOrCuts = [], reference = {}, criteria = {}) {
  const record = Array.isArray(recordOrCuts) ? {} : recordOrCuts || {}, measuredCuts = Array.isArray(recordOrCuts) ? recordOrCuts : Array.isArray(record.cuts) ? record.cuts : [], referenceCodes = sequenceValues(reference.bitting || reference.codes), referenceDepths = depthValues(reference.depths), depthTolerance = Math.max(0, Number(criteria.depthTolerance ?? .15)), maximumRmsError = Math.max(0, Number(criteria.maximumRmsError ?? depthTolerance)), minimumCodeAgreement = clamp(Number(criteria.minimumCodeAgreement ?? 100), 0, 100), requireAllReadable = criteria.requireAllReadable !== false, count = Math.max(measuredCuts.length, referenceCodes.length, referenceDepths.length);
  const rows = Array.from({ length: count }, (_, index) => {
    const cut = measuredCuts[index] || {}, readable = Boolean(measuredCuts[index]) && cut.status !== "unreadable" && Number.isFinite(Number(cut.depth)), measuredDepth = readable ? Number(cut.depth) : null, referenceDepth = Number.isFinite(referenceDepths[index]) ? referenceDepths[index] : null, measuredCode = readable ? String(cut.code ?? "?") : "?", referenceCode = String(referenceCodes[index] ?? "?"), depthComparable = measuredDepth !== null && referenceDepth !== null, signedError = depthComparable ? measuredDepth - referenceDepth : null, absoluteError = signedError === null ? null : Math.abs(signedError), codeComparable = measuredCode !== "?" && referenceCode !== "?";
    return { position: index + 1, measuredDepth, referenceDepth, signedError, absoluteError, withinTolerance: depthComparable ? absoluteError <= depthTolerance : false, measuredCode, referenceCode, codeMatch: codeComparable ? measuredCode === referenceCode : false, depthComparable, codeComparable, readable, measuredStatus: String(cut.status || (readable ? "recorded" : "unreadable")), confidence: cut.confidence?.label || String(cut.confidence || "Not assessed") };
  });
  const depthRows = rows.filter((row) => row.depthComparable), codeRows = rows.filter((row) => row.codeComparable), errors = depthRows.map((row) => row.signedError), absoluteErrors = depthRows.map((row) => row.absoluteError), withinTolerance = depthRows.filter((row) => row.withinTolerance).length, codeMatches = codeRows.filter((row) => row.codeMatch).length, unreadablePositions = rows.filter((row) => !row.readable).map((row) => row.position), meanError = errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : null, meanAbsoluteError = absoluteErrors.length ? absoluteErrors.reduce((sum, value) => sum + value, 0) / absoluteErrors.length : null, rmsError = errors.length ? Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / errors.length) : null, maximumAbsoluteError = absoluteErrors.length ? Math.max(...absoluteErrors) : null, toleranceAgreementPercent = depthRows.length ? Math.round(withinTolerance / depthRows.length * 1000) / 10 : 0, codeAgreementPercent = codeRows.length ? Math.round(codeMatches / codeRows.length * 1000) / 10 : 0, referenceComplete = count > 0 && measuredCuts.length === count && referenceDepths.length === count && referenceCodes.length === count;
  const gates = [
    { id: "reference", label: "Complete professional-tool reference", passed: referenceComplete, detail: `${referenceDepths.length}/${count} depths · ${referenceCodes.length}/${count} codes` },
    { id: "depth", label: "Every depth within tolerance", passed: depthRows.length === count && withinTolerance === count, detail: `${withinTolerance}/${count} within ±${depthTolerance.toFixed(3)} mm` },
    { id: "rms", label: "Root-mean-square error within limit", passed: rmsError !== null && rmsError <= maximumRmsError, detail: rmsError === null ? "No comparable depths" : `${rmsError.toFixed(3)} mm ≤ ${maximumRmsError.toFixed(3)} mm` },
    { id: "code", label: "Bitting-code agreement", passed: codeRows.length === count && codeAgreementPercent >= minimumCodeAgreement, detail: `${codeAgreementPercent.toFixed(1)}% ≥ ${minimumCodeAgreement.toFixed(1)}%` },
    { id: "readable", label: "All measured positions readable", passed: !requireAllReadable || unreadablePositions.length === 0, detail: unreadablePositions.length ? `Unreadable: ${unreadablePositions.join(", ")}` : "All positions readable" },
  ];
  if (criteria.requireFinalizedPhoto && /photo/i.test(String(record.method || ""))) gates.push({ id: "finalized", label: "Photo verification finalized", passed: Boolean(record.verification?.finalized), detail: record.verification?.finalized ? "Finalized" : "Photo record remains draft" });
  if (criteria.requireVerifiedProfile) gates.push({ id: "profile", label: "Verified profile source", passed: Boolean(record.profileSnapshot?.verified || record.profileVerified), detail: record.profileSnapshot?.verified || record.profileVerified ? "Verified" : "Profile is not verified" });
  const sufficient = count > 0 && referenceComplete && depthRows.length === count && codeRows.length === count, passed = sufficient && gates.every((gate) => gate.passed);
  return { count, sufficient, passed, status: !sufficient ? "Insufficient reference" : passed ? "Meets criteria" : "Review required", depthTolerance, maximumRmsError, minimumCodeAgreement, requireAllReadable, comparedDepths: depthRows.length, withinTolerance, toleranceAgreementPercent, comparedCodes: codeRows.length, codeMatches, codeAgreementPercent, meanError, meanAbsoluteError, rmsError, maximumAbsoluteError, unreadablePositions, gates, rows };
}

export function repeatabilityAssessment(studies = [], options = {}) {
  const usable = (studies || []).filter((study) => Array.isArray(study?.result?.rows) && study.result.rows.length), runCount = usable.length, minimumRuns = Math.max(2, Number(options.minimumRuns ?? 3)), spreadTolerance = Math.max(0, Number(options.spreadTolerance ?? .15)), profiles = new Set(usable.map((study) => study.profileId || study.profileName).filter(Boolean)), campaigns = new Set(usable.map((study) => study.campaign).filter(Boolean)), count = usable.length ? Math.max(...usable.map((study) => study.result.rows.length)) : 0;
  const rows = Array.from({ length: count }, (_, index) => { const values = usable.map((study) => study.result.rows[index]?.measuredDepth).filter(Number.isFinite), minimum = values.length ? Math.min(...values) : null, maximum = values.length ? Math.max(...values) : null, mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, spread = values.length ? maximum - minimum : null, standardDeviation = values.length ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) : null; return { position: index + 1, samples: values.length, minimum, maximum, mean, spread, standardDeviation, passed: values.length === runCount && spread <= spreadTolerance }; });
  const compatible = profiles.size <= 1 && campaigns.size <= 1, maximumSpread = rows.length && rows.every((row) => row.spread !== null) ? Math.max(...rows.map((row) => row.spread)) : null, passed = compatible && runCount >= minimumRuns && rows.length > 0 && rows.every((row) => row.passed);
  return { runCount, minimumRuns, spreadTolerance, compatible, passed, status: runCount < minimumRuns ? `Need ${minimumRuns - runCount} more run(s)` : !compatible ? "Mixed campaign or profile" : passed ? "Repeatability meets criterion" : "Repeatability review required", maximumSpread, rows };
}

export function validationProgramSummary(studies = [], options = {}) {
  const usable = (studies || []).filter((study) => study?.result), passed = usable.filter((study) => study.result.passed).length, errors = usable.map((study) => study.result.meanAbsoluteError).filter(Number.isFinite), maximumErrors = usable.map((study) => study.result.maximumAbsoluteError).filter(Number.isFinite), methods = [...new Set(usable.map((study) => study.recordMethod).filter(Boolean))], profiles = [...new Set(usable.map((study) => study.profileName || study.profileId).filter(Boolean))], grouped = new Map();
  usable.forEach((study) => { const key = `${study.campaign || "Ungrouped"}::${study.profileId || study.profileName || "Unknown"}`; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(study); });
  const campaigns = [...grouped.entries()].map(([key, items]) => ({ key, campaign: items[0].campaign || "Ungrouped", profileName: items[0].profileName || "Unknown profile", repeatability: repeatabilityAssessment(items, options) }));
  return { totalStudies: usable.length, passedStudies: passed, passPercent: usable.length ? Math.round(passed / usable.length * 1000) / 10 : 0, methods, profiles, meanAbsoluteError: errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : null, maximumAbsoluteError: maximumErrors.length ? Math.max(...maximumErrors) : null, campaigns };
}

export function normalizeValidationStudy(study = {}) {
  const clean = removeImageReferences(structuredClone(study || {}));
  const reference = { source: String(clean.reference?.source || ""), instrument: String(clean.reference?.instrument || ""), calibrationDate: clean.reference?.calibrationDate || null, bitting: sequenceValues(clean.reference?.bitting), depths: depthValues(clean.reference?.depths) }, criteria = { depthTolerance: Math.max(0, Number(clean.criteria?.depthTolerance ?? .15)), maximumRmsError: Math.max(0, Number(clean.criteria?.maximumRmsError ?? clean.criteria?.depthTolerance ?? .15)), minimumCodeAgreement: clamp(Number(clean.criteria?.minimumCodeAgreement ?? 100), 0, 100), requireAllReadable: clean.criteria?.requireAllReadable !== false, requireFinalizedPhoto: Boolean(clean.criteria?.requireFinalizedPhoto), requireVerifiedProfile: Boolean(clean.criteria?.requireVerifiedProfile) };
  const recalculated = Array.isArray(clean.recordSnapshot?.cuts) ? fieldValidationResult(clean.recordSnapshot, reference, criteria) : clean.result && typeof clean.result === "object" && !Array.isArray(clean.result) ? { ...clean.result, gates: Array.isArray(clean.result.gates) ? clean.result.gates : [], rows: Array.isArray(clean.result.rows) ? clean.result.rows : [] } : null;
  return { ...clean, id: clean.id || createLocalId(), schemaVersion: 1, name: String(clean.name || "Untitled field validation"), campaign: String(clean.campaign || "Ungrouped"), disposition: ["draft", "reviewed", "accepted", "rejected"].includes(clean.disposition) ? clean.disposition : "draft", recordSnapshot: clean.recordSnapshot ? recordSnapshot(clean.recordSnapshot) : undefined, reference, criteria, result: recalculated, reportNotice: "This field validation compares a KEYGAUGE estimate with user-supplied professional-tool reference values. It characterizes the recorded test conditions only and does not certify future measurements, a key-system profile, or fitness for cutting a key." };
}

function recordSnapshot(record = {}) {
  const clean = removeImageReferences(structuredClone(record));
  delete clean.revisions; delete clean.recovery; delete clean.snapshot;
  return clean;
}

function compactRecoveryRecord(record = {}, options = {}) {
  const revisionLimit = Math.max(0, Number(options.revisionLimit ?? 3)), verificationLogLimit = Math.max(0, Number(options.verificationLogLimit ?? 60));
  const compact = migrateRecord(record);
  compact.revisions = compact.revisions.slice(-revisionLimit);
  if (compact.verification?.log) compact.verification.log = compact.verification.log.slice(-verificationLogLimit);
  return compact;
}

function recoveryFingerprint(checkpoint = {}) {
  const comparable = structuredClone(checkpoint);
  delete comparable.id; delete comparable.label; delete comparable.createdAt; delete comparable.storageBytes;
  return JSON.stringify(comparable);
}

export function migrateRecord(record = {}) {
  const migrated = recordSnapshot(record), cuts = Array.isArray(migrated.cuts) ? migrated.cuts : [];
  migrated.recordSchemaVersion = RECORD_SCHEMA_VERSION;
  migrated.lineageId ||= migrated.id || createLocalId();
  migrated.revisionNumber = Math.max(1, Number(migrated.revisionNumber || 1));
  migrated.tags = Array.isArray(migrated.tags) ? migrated.tags.map(String).filter(Boolean) : String(migrated.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
  migrated.anonymousId ||= migrated.reference || "";
  migrated.sourceMeasurements ||= cuts.map((cut, index) => ({ position: Number(cut.position || index + 1), depth: Number(cut.sourceDepth ?? cut.detectedDepth ?? cut.depth ?? 0), code: String(cut.sourceCode ?? cut.detectedCode ?? cut.code ?? "?"), method: migrated.method || "Not recorded" }));
  migrated.acceptedMeasurements ||= cuts.map((cut, index) => ({ position: Number(cut.position || index + 1), depth: Number(cut.depth || 0), code: String(cut.status === "unreadable" ? "?" : cut.code ?? "?"), status: String(cut.status || "estimated") }));
  migrated.revisions = Array.isArray(record.revisions) ? removeImageReferences(structuredClone(record.revisions)).map((revision) => recordSnapshot(revision)) : [];
  return migrated;
}

export function createRecordRevision(previous, next, options = {}) {
  const before = migrateRecord(previous), after = migrateRecord(next), timestamp = options.timestamp || new Date().toISOString();
  const archived = recordSnapshot({ ...before, revisions: undefined, snapshotAt: timestamp });
  return { ...after, id: before.id, lineageId: before.lineageId, createdAt: before.createdAt, updatedAt: timestamp, revisionNumber: before.revisionNumber + 1, revisions: [...before.revisions, archived].slice(-25) };
}

export function filterSortRecords(records = [], view = {}) {
  const query = String(view.search || "").trim().toLowerCase(), method = String(view.method || "all"), status = String(view.status || "all"), requiredTags = String(view.tags || "").split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  const filtered = records.map(migrateRecord).filter((record) => {
    const haystack = [record.name, record.reference, record.anonymousId, record.method, record.profileName, record.notes, ...(record.tags || []), ...(record.bitting || [])].join(" ").toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (method !== "all" && !String(record.method || "").toLowerCase().includes(method)) return false;
    if (status === "finalized" && !record.verification?.finalized) return false;
    if (status === "draft" && record.verification?.finalized) return false;
    if (requiredTags.length && !requiredTags.every((tag) => record.tags.map((item) => item.toLowerCase()).includes(tag))) return false;
    return true;
  });
  const sort = String(view.sort || "updated-desc"), direction = sort.endsWith("-asc") ? 1 : -1, key = sort.replace(/-(asc|desc)$/, "");
  return filtered.sort((a, b) => { const av = key === "name" ? String(a.name || "").toLowerCase() : key === "profile" ? String(a.profileName || "").toLowerCase() : new Date(a.updatedAt || a.createdAt || 0).getTime(), bv = key === "name" ? String(b.name || "").toLowerCase() : key === "profile" ? String(b.profileName || "").toLowerCase() : new Date(b.updatedAt || b.createdAt || 0).getTime(); return av < bv ? -direction : av > bv ? direction : 0; });
}

export function compareRecordSet(records = [], tolerance = .15) {
  if (records.length < 2) return { records: [], rows: [], compared: 0, agreementPercent: 0 };
  const normalized = records.map(migrateRecord), count = Math.max(...normalized.map((record) => record.cuts.length)), rows = Array.from({ length: count }, (_, index) => {
    const values = normalized.map((record) => record.cuts[index] && record.cuts[index].status !== "unreadable" ? Number(record.cuts[index].depth) : null), available = values.filter(Number.isFinite), minimum = available.length ? Math.min(...available) : null, maximum = available.length ? Math.max(...available) : null, spread = minimum === null ? null : maximum - minimum;
    return { position: index + 1, values, spread, agreement: spread === null ? "unavailable" : spread <= tolerance ? "within tolerance" : spread <= tolerance * 2 ? "review" : "disagreement" };
  }), comparedRows = rows.filter((row) => row.spread !== null), within = comparedRows.filter((row) => row.spread <= tolerance).length;
  return { records: normalized.map((record) => ({ id: record.id, name: record.name, bitting: record.bitting })), rows, compared: comparedRows.length, agreementPercent: comparedRows.length ? Math.round(within / comparedRows.length * 100) : 0, maximumSpread: comparedRows.length ? Math.max(...comparedRows.map((row) => row.spread)) : null };
}

export function createRecoveryCheckpoint(project = {}, label = "Manual checkpoint", options = {}) {
  const timestamp = options.timestamp || new Date().toISOString(), id = options.id || `${timestamp}-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const checkpoint = removeImageReferences({ id, label: String(label || "Manual checkpoint"), createdAt: timestamp, format: "compact-v1", revisionHistoryLimit: Math.max(0, Number(options.revisionLimit ?? 3)), calibration: project.calibration || null, profiles: project.profiles || [], records: (project.records || []).map((record) => compactRecoveryRecord(record, options)), currentRecord: project.currentRecord ? compactRecoveryRecord(project.currentRecord, options) : null, validationStudies: (project.validationStudies || []).map(normalizeValidationStudy) });
  checkpoint.storageBytes = new TextEncoder().encode(JSON.stringify(checkpoint)).byteLength;
  return checkpoint;
}

export function compactRecoveryPoints(points = [], options = {}) {
  const maxCount = Math.max(1, Number(options.maxCount ?? 5)), maxBytes = Math.max(1024, Number(options.maxBytes ?? 1_250_000)), output = [], fingerprints = new Set();
  let usedBytes = 0;
  for (const source of points) {
    if (!source || typeof source !== "object") continue;
    const checkpoint = createRecoveryCheckpoint(source, source.label, { id: source.id, timestamp: source.createdAt, revisionLimit: options.revisionLimit, verificationLogLimit: options.verificationLogLimit });
    const fingerprint = recoveryFingerprint(checkpoint), bytes = new TextEncoder().encode(JSON.stringify(checkpoint)).byteLength;
    if (fingerprints.has(fingerprint)) continue;
    if (output.length && usedBytes + bytes > maxBytes) continue;
    checkpoint.storageBytes = bytes; output.push(checkpoint); fingerprints.add(fingerprint); usedBytes += bytes;
    if (output.length >= maxCount) break;
  }
  return output;
}

export function projectStorageHealth(value, options = {}) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value).byteLength : new TextEncoder().encode(JSON.stringify(value || {})).byteLength;
  const softLimit = Math.max(1, Number(options.softLimit ?? 3_500_000)), quota = Number(options.quota || 0), ratio = quota > 0 ? bytes / quota : bytes / softLimit;
  const level = bytes >= softLimit || ratio >= .8 ? "critical" : bytes >= softLimit * .65 || ratio >= .55 ? "warning" : "healthy";
  return { bytes, softLimit, quota: quota > 0 ? quota : null, ratio, level };
}

export function recordsArchive(records = [], options = {}) {
  return JSON.stringify(removeImageReferences({ schema: "keygauge.records", version: 1, exportedAt: options.timestamp || new Date().toISOString(), records: records.map(migrateRecord) }), null, 2);
}

export function parseRecordsArchive(text, options = {}) {
  const maxBytes = Number(options.maxBytes || 12_000_000); if (utf8Bytes(text) > maxBytes) throw new Error("The records archive is larger than the supported import limit.");
  const parsed = JSON.parse(text); if (parsed.schema !== "keygauge.records" || Number(parsed.version) !== 1 || !Array.isArray(parsed.records)) throw new Error("This is not a supported KEYGAUGE records archive.");
  validateImportedProject({ records: parsed.records }, options);
  return parsed.records.map(migrateRecord);
}

export function validationStudiesArchive(studies = [], options = {}) {
  return JSON.stringify(removeImageReferences({ schema: "keygauge.validation-studies", version: 1, exportedAt: options.timestamp || new Date().toISOString(), studies: studies.map(normalizeValidationStudy) }), null, 2);
}

export function parseValidationStudiesArchive(text, options = {}) {
  const maxBytes = Number(options.maxBytes || 4_000_000); if (utf8Bytes(text) > maxBytes) throw new Error("The validation archive is larger than the supported import limit.");
  const parsed = JSON.parse(text); if (parsed.schema !== "keygauge.validation-studies" || Number(parsed.version) !== 1 || !Array.isArray(parsed.studies)) throw new Error("This is not a supported KEYGAUGE validation archive.");
  validateImportedProject({ validationStudies: parsed.studies }, options);
  return removeImageReferences(parsed.studies).map(normalizeValidationStudy);
}

export function validationStudiesCsv(studies = []) {
  const rows = [["Study", "Campaign", "Disposition", "Record", "Method", "Profile", "Reference source", "Reference instrument", "Reference calibration date", "Position", "Measured depth (mm)", "Reference depth (mm)", "Signed error (mm)", "Absolute error (mm)", "Within tolerance", "Measured bitting code", "Reference bitting code", "Code match", "Confidence", "Study result"]];
  studies.map(normalizeValidationStudy).forEach((study) => (study.result?.rows || []).forEach((row) => rows.push([study.name, study.campaign, study.disposition, study.recordName, study.recordMethod, study.profileName, study.reference.source, study.reference.instrument, study.reference.calibrationDate || "", row.position, Number.isFinite(row.measuredDepth) ? row.measuredDepth.toFixed(3) : "", Number.isFinite(row.referenceDepth) ? row.referenceDepth.toFixed(3) : "", Number.isFinite(row.signedError) ? row.signedError.toFixed(3) : "", Number.isFinite(row.absoluteError) ? row.absoluteError.toFixed(3) : "", row.withinTolerance ? "yes" : "no", row.measuredCode, row.referenceCode, row.codeMatch ? "yes" : "no", row.confidence, study.result.status])));
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function sanitizedImageExportPlan(width, height, crop = null) {
  const sourceWidth = Math.max(1, Math.round(Number(width))), sourceHeight = Math.max(1, Math.round(Number(height)));
  const requested = crop?.accepted ? crop : { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  const x = clamp(Math.round(Number(requested.x || 0)), 0, sourceWidth - 1), y = clamp(Math.round(Number(requested.y || 0)), 0, sourceHeight - 1);
  const exportWidth = clamp(Math.round(Number(requested.width || sourceWidth)), 1, sourceWidth - x), exportHeight = clamp(Math.round(Number(requested.height || sourceHeight)), 1, sourceHeight - y);
  return { source: { x, y, width: exportWidth, height: exportHeight }, output: { width: exportWidth, height: exportHeight }, mimeType: "image/png", metadataPolicy: "re-encode-pixels-only" };
}

export function appendVerificationEvent(log = [], event = {}, options = {}) {
  const limit = Math.max(1, Number(options.limit || 200)), timestamp = options.timestamp || new Date().toISOString();
  const next = [...log, { id: `${timestamp}-${log.length + 1}`, timestamp, position: event.position ?? null, edge: event.edge || null, field: String(event.field || "verification"), before: event.before ?? null, after: event.after ?? null, reason: event.reason || null }];
  return next.slice(-limit);
}

export function verificationReadiness(cuts = [], options = {}) {
  const summary = verificationSummary(cuts), missingReasons = cuts.filter((cut) => ["rejected", "unreadable"].includes(cut.status) && !String(cut.reason || "").trim()).map((cut, index) => Number(cut.position || index + 1)), ambiguous = cuts.filter((cut) => Number(cut.ambiguity || 0) >= 0.72).map((cut, index) => Number(cut.position || index + 1)), outOfRange = cuts.filter((cut) => cut.outOfRange).map((cut, index) => Number(cut.position || index + 1));
  const blockers = [];
  if (!cuts.length) blockers.push("No cut positions are available for verification.");
  if (!options.calibrated) blockers.push("The photograph must be calibrated before verification can be finalized.");
  if (summary.unreviewed) blockers.push(`${summary.unreviewed} cut position(s) still require a decision.`);
  if (missingReasons.length) blockers.push(`Reason codes are required for rejected or unreadable positions: ${missingReasons.join(", ")}.`);
  const warnings = [];
  if (!options.profileVerified) warnings.push("The selected key profile is not verified manufacturer data.");
  if (summary.rejected) warnings.push(`${summary.rejected} cut position(s) are rejected.`);
  if (summary.unreadable) warnings.push(`${summary.unreadable} cut position(s) are unreadable.`);
  if (ambiguous.length) warnings.push(`Ambiguous positions: ${ambiguous.join(", ")}.`);
  if (outOfRange.length) warnings.push(`Out-of-range positions: ${outOfRange.join(", ")}.`);
  if (warnings.length && !options.warningsAcknowledged) blockers.push("Acknowledge the unresolved verification warnings before finalizing.");
  return { ...summary, missingReasons, ambiguous, outOfRange, warnings, blockers, canFinalize: blockers.length === 0 };
}

export function cutIsEditable(cut, protectAccepted = true) {
  return !(protectAccepted && cut?.status === "accepted");
}

function escapeMarkup(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function validationStudyReportHtml(source = {}) {
  const study = normalizeValidationStudy(source), result = study.result || { rows: [], gates: [], status: "Not analyzed" }, number = (value) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(3)} mm` : "—", percent = (value) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : "—";
  const notice = "This field validation compares a KEYGAUGE estimate with user-supplied professional-tool reference values. It characterizes the recorded test conditions only and does not certify future measurements, a key-system profile, or fitness for cutting a key.";
  const gates = (result.gates || []).map((gate) => `<li class="${gate.passed ? "pass" : "fail"}"><b>${gate.passed ? "PASS" : "REVIEW"}</b> ${escapeMarkup(gate.label)} — ${escapeMarkup(gate.detail)}</li>`).join("");
  const rows = (result.rows || []).map((row) => `<tr><td>${row.position}</td><td>${number(row.measuredDepth)}</td><td>${number(row.referenceDepth)}</td><td>${number(row.signedError)}</td><td>${escapeMarkup(row.measuredCode)}</td><td>${escapeMarkup(row.referenceCode)}</td><td>${row.codeMatch ? "Yes" : "No"}</td><td>${row.withinTolerance ? "Yes" : "No"}</td><td>${escapeMarkup(row.confidence)}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeMarkup(study.name)} · KEYGAUGE field validation</title><style>@page{margin:15mm}*{box-sizing:border-box}body{max-width:1100px;margin:0 auto;padding:24px;color:#202018;font:12px system-ui,sans-serif}h1,h2{font-family:Georgia,serif}h1{margin-bottom:4px}.meta,.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0}.meta div,.metrics div{padding:10px;border:1px solid #b8aa86}.meta b,.metrics b{display:block;margin-bottom:4px;font-size:10px;text-transform:uppercase;color:#655a40}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:7px;border:1px solid #aaa;text-align:left}th{background:#eee8d7}li{margin:6px 0}.pass b{color:#28603e}.fail b{color:#8a3328}.notice{margin-top:18px;padding:12px;border:2px solid #8a6b2f;background:#fff8e5}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:32px}.line{padding-top:28px;border-bottom:1px solid #444}@media print{body{padding:0}}</style></head><body><header><small>KEYGAUGE · FIELD VALIDATION REPORT</small><h1>${escapeMarkup(study.name)}</h1><p>${escapeMarkup(study.campaign)} · ${escapeMarkup(study.disposition.toUpperCase())}</p></header><div class="meta"><div><b>Record</b>${escapeMarkup(study.recordName || "—")}</div><div><b>Measurement method</b>${escapeMarkup(study.recordMethod || "—")}</div><div><b>Profile</b>${escapeMarkup(study.profileName || "—")}</div><div><b>Reference source</b>${escapeMarkup(study.reference.source || "—")}</div><div><b>Reference instrument</b>${escapeMarkup(study.reference.instrument || "—")}</div><div><b>Reference calibration date</b>${escapeMarkup(study.reference.calibrationDate || "—")}</div><div><b>Reviewer</b>${escapeMarkup(study.reviewer || "—")}</div><div><b>Analyzed</b>${escapeMarkup(study.updatedAt || study.createdAt || "—")}</div><div><b>Result</b>${escapeMarkup(result.status)}</div></div><div class="metrics"><div><b>Mean absolute error</b>${number(result.meanAbsoluteError)}</div><div><b>RMS error</b>${number(result.rmsError)}</div><div><b>Maximum absolute error</b>${number(result.maximumAbsoluteError)}</div><div><b>Depth agreement</b>${percent(result.toleranceAgreementPercent)}</div><div><b>Bitting-code agreement</b>${percent(result.codeAgreementPercent)}</div><div><b>Depth tolerance</b>±${number(result.depthTolerance)}</div></div><h2>Acceptance gates</h2><ul>${gates || "<li>No analysis gates recorded.</li>"}</ul><h2>Per-cut comparison</h2><table><thead><tr><th>Cut</th><th>Measured</th><th>Reference</th><th>Signed error</th><th>Measured code</th><th>Reference code</th><th>Code match</th><th>In tolerance</th><th>Confidence</th></tr></thead><tbody>${rows || '<tr><td colspan="9">No cut comparisons recorded.</td></tr>'}</tbody></table><h2>Study notes</h2><p>${escapeMarkup(study.notes || "No notes recorded.")}</p><div class="notice"><b>Scope limitation</b><p>${notice}</p><p>The source photograph is excluded. EXIF metadata is excluded. Processing and report generation occur locally in the browser.</p></div><div class="signatures"><div class="line">Reviewer signature / date</div><div class="line">Independent witness / date</div></div></body></html>`;
}

export function measurementReportModel(record, profile = {}) {
  if (!record || !Array.isArray(record.cuts)) throw new Error("A measurement record with cut data is required.");
  const normalizedRecord = migrateRecord(record), cuts = normalizedRecord.cuts.map((cut, index) => { const source = normalizedRecord.sourceMeasurements[index] || {}; return { position: Number(cut.position || index + 1), sourceDepth: Number(source.depth ?? cut.depth ?? 0), sourceCode: String(source.code ?? cut.code ?? "?"), depth: Number(cut.depth || 0), code: String(cut.code ?? "?"), difference: Number(cut.difference || 0), confidence: cut.confidence?.label || String(cut.confidence || "Not assessed"), confidenceScore: Number.isFinite(Number(cut.confidence?.score)) ? Number(cut.confidence.score) : null, status: String(cut.status || "estimated"), reason: String(cut.reason || ""), reviewNote: String(cut.reviewNote || ""), reviewedAt: cut.reviewedAt || null, ambiguity: Number(cut.ambiguity || 0), outOfRange: Boolean(cut.outOfRange) }; });
  const photoDerived = /photo|combination/i.test(String(record.method || "")), photoCalibration = record.calibration?.photo, calibrated = photoDerived ? Number(photoCalibration?.pixelsPerMillimeter) > 0 : Boolean(record.calibration?.mmPerCssX && record.calibration?.mmPerCssY), violations = adjacentViolations(cuts.map((cut) => cut.code), profile.maxAdjacent ?? Infinity, profile.minAdjacent ?? 0);
  const unreadable = cuts.filter((cut) => cut.status === "unreadable").map((cut) => cut.position), ambiguous = cuts.filter((cut) => cut.ambiguity >= .72 || /ambiguous/i.test(cut.confidence)).map((cut) => cut.position), outOfRange = cuts.filter((cut) => cut.outOfRange).map((cut) => cut.position), unreviewed = cuts.filter((cut) => cut.status === "estimated").map((cut) => cut.position), issues = [];
  if (!calibrated) issues.push("The measurement is uncalibrated and does not support precise physical depths.");
  if (record.profileKind === "demonstration" || profile.kind === "demonstration") issues.push("The selected profile contains demonstration data and is not a manufacturer specification.");
  if (unreadable.length) issues.push(`Unreadable cut positions: ${unreadable.join(", ")}.`); if (ambiguous.length) issues.push(`Ambiguous cut positions: ${ambiguous.join(", ")}.`); if (outOfRange.length) issues.push(`Out-of-range cut positions: ${outOfRange.join(", ")}.`); if (unreviewed.length && photoDerived) issues.push(`Unreviewed photo-derived positions: ${unreviewed.join(", ")}.`); if (violations.length) issues.push(`Profile adjacent-cut rule warnings: ${violations.map((item) => item.positions.join("–")).join(", ")}.`);
  const scores = cuts.map((cut) => cut.confidenceScore).filter(Number.isFinite), averageConfidence = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null, finalized = Boolean(record.verification?.finalized);
  return { title: String(record.name || "Untitled key measurement"), reference: String(record.reference || ""), anonymousId: String(normalizedRecord.anonymousId || ""), tags: normalizedRecord.tags, revisionNumber: normalizedRecord.revisionNumber, priorRevisionCount: normalizedRecord.revisions.length, notes: String(record.notes || ""), createdAt: record.createdAt || null, updatedAt: record.updatedAt || null, method: String(record.method || "Not recorded"), bitting: cuts.map((cut) => cut.status === "unreadable" ? "?" : cut.code).join("-"), profileName: String(record.profileName || profile.name || "Not recorded"), profileStatus: record.profileKind === "demonstration" || profile.kind === "demonstration" ? "Demonstration / unverified" : profile.verified ? "Verified" : "User-defined", profileRevision: String(record.profileSnapshot?.revision || profile.revision || "Not recorded"), profileSource: String(record.profileSnapshot?.source || profile.source || "Not recorded"), alignment: String(record.alignment || photoCalibration?.alignment || profile.stop || "Not recorded"), calibrated, calibrationMethod: photoDerived ? String(photoCalibration?.method || "Not recorded") : String(record.calibration?.method || "Not recorded"), pixelsPerMillimeter: photoDerived && calibrated ? Number(photoCalibration.pixelsPerMillimeter) : null, perspectiveStatus: photoDerived ? photoCalibration?.perspectiveCorrected ? `Corrected${Number.isFinite(Number(photoCalibration.correctionResidualPixels)) ? ` · ${Number(photoCalibration.correctionResidualPixels).toFixed(3)} px residual` : ""}` : "Not corrected" : "Not applicable", photoQuality: photoDerived ? record.photoQuality?.label || "Not recorded" : "Not applicable", confidence: String(record.confidence || "Not assessed"), confidenceExplanation: "Confidence summarizes image or alignment quality, calibration, depth proximity, edge visibility, ambiguity, and user verification. It is not a guarantee of correctness.", averageConfidence, cuts, violations, issues, unreadable, ambiguous, outOfRange, unreviewed, finalized, finalizedAt: record.verification?.finalizedAt || null, verificationNote: String(record.verification?.sessionNote || ""), verificationEventCount: Number(record.verification?.log?.length || 0), reportNotice: String(record.reportNotice || (photoDerived ? "This bitting was estimated from a photograph using user-supplied scale and alignment references. Verify all measurements using appropriate professional locksmith tools before cutting a key or servicing a lock." : "Estimated using a screen-based visual alignment method. Verify all measurements with appropriate professional locksmith tools before cutting or servicing a lock.")), privacy: { photographIncluded: false, exifIncluded: false, processing: "Local browser only" } };
}

export function measurementReportHtml(record, profile = {}) {
  const report = measurementReportModel(record, profile), rows = report.cuts.map((cut) => `<tr><td>${cut.position}</td><td>${cut.sourceDepth.toFixed(3)} mm · ${escapeMarkup(cut.sourceCode)}</td><td>${cut.depth.toFixed(3)} mm · ${escapeMarkup(cut.code)}</td><td>${cut.difference >= 0 ? "+" : ""}${cut.difference.toFixed(3)} mm</td><td>${escapeMarkup(cut.confidence)}${cut.confidenceScore === null ? "" : ` · ${cut.confidenceScore}%`}</td><td>${escapeMarkup(cut.status)}</td><td>${escapeMarkup(cut.reason || "—")}${cut.reviewNote ? `<br><small>${escapeMarkup(cut.reviewNote)}</small>` : ""}</td></tr>`).join(""), issues = report.issues.length ? `<ul>${report.issues.map((issue) => `<li>${escapeMarkup(issue)}</li>`).join("")}</ul>` : "<p>No unresolved measurement warnings were recorded.</p>";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>KEYGAUGE Report — ${escapeMarkup(report.title)}</title><style>body{margin:0;padding:36px;color:#1e211d;background:#fff;font:14px/1.45 system-ui,sans-serif}main{max-width:980px;margin:auto}header{border-bottom:4px solid #9a6b1e;padding-bottom:18px}.eyebrow{color:#805710;font:700 11px ui-monospace;letter-spacing:.14em}h1{margin:7px 0 5px;font:600 30px Georgia,serif}.bitting{margin:22px 0;padding:16px;border:1px solid #9d9b91;background:#f3f0e7;font:800 28px ui-monospace;letter-spacing:.18em}.meta{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #bbb9b0}.meta div{padding:10px;border-right:1px solid #bbb9b0;border-bottom:1px solid #bbb9b0}.meta small{display:block;color:#65675f;font:700 9px ui-monospace;letter-spacing:.08em}.meta strong{display:block;margin-top:4px}table{width:100%;margin:22px 0;border-collapse:collapse}th,td{padding:8px;border:1px solid #aaa;text-align:left}th{background:#e9e5d9;font:700 10px ui-monospace;text-transform:uppercase}.warning{margin:18px 0;padding:14px;border-left:4px solid #a96e19;background:#fff3d7}.notice{margin-top:24px;padding:14px;border:2px solid #222;font-weight:700}.privacy,.explanation{color:#565850;font-size:11px}@media print{body{padding:0}}</style></head><body><main><header><div class="eyebrow">KEYGAUGE · ${report.finalized ? "FINALIZED VERIFICATION" : "DRAFT MEASUREMENT"} · REVISION ${report.revisionNumber}</div><h1>${escapeMarkup(report.title)}</h1><div>${escapeMarkup(report.anonymousId || report.reference || "No anonymized asset or job reference")} · ${escapeMarkup(report.tags.join(", ") || "No tags")}</div></header><div class="bitting">${escapeMarkup(report.bitting)}</div><section class="meta"><div><small>VERIFICATION</small><strong>${report.finalized ? `Finalized · ${escapeMarkup(report.finalizedAt || "time not recorded")}` : "Draft / not finalized"}</strong></div><div><small>METHOD</small><strong>${escapeMarkup(report.method)}</strong></div><div><small>PROFILE / REVISION</small><strong>${escapeMarkup(report.profileName)} · ${escapeMarkup(report.profileRevision)}</strong></div><div><small>PROFILE SOURCE</small><strong>${escapeMarkup(report.profileSource)}</strong></div><div><small>CALIBRATION</small><strong>${escapeMarkup(report.calibrated ? report.calibrationMethod : "Uncalibrated")}</strong></div><div><small>ALIGNMENT</small><strong>${escapeMarkup(report.alignment)}</strong></div><div><small>CONFIDENCE</small><strong>${escapeMarkup(report.confidence)}${report.averageConfidence === null ? "" : ` · ${report.averageConfidence}%`}</strong></div><div><small>PHOTO QUALITY</small><strong>${escapeMarkup(report.photoQuality)}</strong></div><div><small>PERSPECTIVE</small><strong>${escapeMarkup(report.perspectiveStatus)}</strong></div><div><small>DECISION EVENTS</small><strong>${report.verificationEventCount}</strong></div><div><small>RECORD HISTORY</small><strong>${report.priorRevisionCount} prior snapshot(s)</strong></div></section><p class="explanation">${escapeMarkup(report.confidenceExplanation)}</p><table><thead><tr><th>Position</th><th>Source estimate</th><th>Accepted value</th><th>Difference</th><th>Confidence</th><th>Decision</th><th>Reason / note</th></tr></thead><tbody>${rows}</tbody></table><section class="warning"><strong>Warnings and profile rules</strong>${issues}</section>${report.verificationNote ? `<section><h2>Verification note</h2><p>${escapeMarkup(report.verificationNote)}</p></section>` : ""}${report.notes ? `<section><h2>Record notes</h2><p>${escapeMarkup(report.notes)}</p></section>` : ""}<div class="notice">${escapeMarkup(report.reportNotice)}</div><p class="privacy">LOCAL BROWSER PROCESSING · Photograph excluded from this report · Exchangeable Image File Format (EXIF) metadata excluded.</p></main></body></html>`;
}

export function worksheetHtml(profile = {}, options = {}) {
  const cutCount = Math.max(1, Number(profile.cutCount || 5)), name = escapeMarkup(profile.name || "Selected profile"), notice = "Verify all measurements using appropriate professional locksmith tools before cutting a key or servicing a lock.", sections = new Set(options.sections || ["calibration", "photo", "measurement", "rulers"]), rows = Array.from({ length: cutCount }, (_, index) => `<tr><td>${index + 1}</td><td></td><td></td><td></td><td></td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KEYGAUGE Printable Worksheets</title><style>@page{size:letter;margin:.5in}*{box-sizing:border-box}body{margin:0;color:#111;font:12px/1.4 system-ui,sans-serif}section{break-after:page;min-height:9.5in;padding:.1in}section:last-child{break-after:auto}h1{margin:0;border-bottom:4px solid #111;padding-bottom:8px;font:700 25px Georgia,serif}h2{margin:18px 0 8px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0}.line{min-height:28px;border-bottom:1px solid #555}.box{border:1px solid #333;padding:12px;margin:12px 0}table{width:100%;border-collapse:collapse}th,td{height:34px;border:1px solid #444;padding:6px;text-align:left}.checklist{display:grid;gap:10px}.ruler{height:42px;margin:20px 0;border-top:2px solid #111;background:repeating-linear-gradient(90deg,#111 0 1px,transparent 1px 10mm)}.ruler.major{height:64px;background:repeating-linear-gradient(90deg,#111 0 1px,transparent 1px 10mm),repeating-linear-gradient(90deg,#111 0 1px,transparent 1px 1mm)}.notice{border:2px solid #111;padding:10px;font-weight:700}.print-warning{font:700 11px ui-monospace}@media screen{body{max-width:8.5in;margin:20px auto;background:#eee}section{margin:15px 0;padding:.5in;background:#fff;box-shadow:0 3px 15px #0003}}</style></head><body>${sections.has("calibration") ? `<section><h1>KEYGAUGE · Screen Calibration Worksheet</h1><div class="meta"><div>Profile<div class="line">${name}</div></div><div>Date / time<div class="line"></div></div><div>Reference object<div class="line"></div></div><div>Verified physical dimension<div class="line">__________ mm</div></div></div><div class="box"><b>Horizontal calibration</b><p>Displayed pixels: ______ · physical millimeters: ______ · millimeters per Cascading Style Sheets (CSS) pixel: ______</p></div><div class="box"><b>Vertical calibration</b><p>Displayed pixels: ______ · physical millimeters: ______ · millimeters per CSS pixel: ______</p></div><h2>Verification</h2><p>Browser zoom 100%: ☐ · Full screen: ☐ · Reference rechecked: ☐ · 10 mm ruler verified: ☐</p><div class="ruler"></div><p class="print-warning">PRINT AT 100 PERCENT. Disable “Fit to page,” then verify the ruler above with a physical ruler.</p><div class="notice">${notice}</div></section>` : ""}${sections.has("photo") ? `<section><h1>KEYGAUGE · Photo Capture Checklist</h1><div class="checklist"><p>☐ Key is on a flat, contrasting surface.</p><p>☐ Scale reference is beside the key in the same plane.</p><p>☐ Camera is directly above the key.</p><p>☐ Complete blade, shoulder, and tip are visible.</p><p>☐ Image is free of glare, strong shadows, blur, and obstruction.</p><p>☐ Scale points and marker corners were manually verified.</p><p>☐ Rotation and perspective correction were reviewed.</p><p>☐ Every cut received an explicit verification decision.</p></div><div class="box"><b>Calibration reference and printed dimension verification</b><div class="line"></div><div class="line"></div></div><div class="notice">Photo measurements are estimates. ${notice}</div></section>` : ""}${sections.has("measurement") ? `<section><h1>KEYGAUGE · Blank Bitting Measurement Form</h1><div class="meta"><div>Record name<div class="line"></div></div><div>Anonymized asset / job identifier<div class="line"></div></div><div>Profile<div class="line">${name}</div></div><div>Method<div class="line"></div></div></div><table><thead><tr><th>Cut</th><th>Source depth</th><th>Accepted depth</th><th>Code</th><th>Confidence / note</th></tr></thead><tbody>${rows}</tbody></table><div class="box"><b>Estimated bitting</b><div class="line"></div><b>Calibration and alignment</b><div class="line"></div><b>Warnings / profile-rule violations</b><div class="line"></div><div class="line"></div></div><div class="notice">${notice}</div></section>` : ""}${sections.has("rulers") ? `<section><h1>KEYGAUGE · Verification Rulers</h1><h2>100 millimeter ruler</h2><div class="ruler major"></div><p>0 mm　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　100 mm</p><h2>10 millimeter verification segments</h2>${Array.from({ length: 6 }, () => `<div class="ruler"></div>`).join("")}<p class="print-warning">PRINT AT 100 PERCENT. Measure every ruler before use. Printer scaling invalidates these references.</p><div class="notice">${notice}</div></section>` : ""}</body></html>`;
}

export function withoutImageData(photoState = {}) {
  const clean = { ...photoState };
  delete clean.image;
  delete clean.sourceData;
  delete clean.objectUrl;
  return clean;
}

export function serializeProject(project) {
  return JSON.stringify(removeImageReferences({ ...project, records: (project.records || []).map(migrateRecord), schema: "keygauge.project", version: PROJECT_SCHEMA_VERSION, exportedAt: new Date().toISOString() }), null, 2);
}

export function parseProject(text, options = {}) {
  const maxBytes = Number(options.maxBytes || 12_000_000); if (utf8Bytes(text) > maxBytes) throw new Error("The project file is larger than the supported import limit.");
  const parsed = validateImportedProject(JSON.parse(text), options);
  if (parsed.schema !== "keygauge.project" || ![1, 2, PROJECT_SCHEMA_VERSION].includes(Number(parsed.version))) {
    throw new Error("This is not a supported KEYGAUGE project file.");
  }
  const clean = removeImageReferences(parsed); return { ...clean, version: PROJECT_SCHEMA_VERSION, records: (clean.records || []).map(migrateRecord), validationStudies: (clean.validationStudies || []).map(normalizeValidationStudy), migratedFromVersion: Number(parsed.version) < PROJECT_SCHEMA_VERSION ? Number(parsed.version) : null };
}

export function csvEscape(value) {
  const string = String(value ?? "");
  return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

export function measurementsToCsv(record) {
  const migrated = migrateRecord(record), rows = [["Position", "Source depth (mm)", "Source code", "Accepted depth (mm)", "Accepted code", "Difference (mm)", "Confidence", "Status", "Reason", "Review note"]];
  (migrated.cuts || []).forEach((cut, index) => rows.push([
    index + 1,
    Number(migrated.sourceMeasurements[index]?.depth ?? cut.depth ?? 0).toFixed(3),
    migrated.sourceMeasurements[index]?.code ?? cut.code,
    Number(cut.depth || 0).toFixed(3),
    cut.code,
    Number(cut.difference || 0).toFixed(3),
    cut.confidence?.label || cut.confidence || "",
    cut.status || "estimated",
    cut.reason || "",
    cut.reviewNote || "",
  ]));
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}
