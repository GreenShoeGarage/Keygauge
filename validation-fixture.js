export const GOLDEN_MEASUREMENT_FIXTURE = Object.freeze({
  schema: "keygauge.golden-measurements",
  version: 1,
  tolerance: 1e-6,
  scaleCases: [
    { name: "Identification card width", first: { x: 100, y: 240 }, second: { x: 956, y: 240 }, distanceMillimeters: 85.6, expectedPixelsPerMillimeter: 10 },
    { name: "United States quarter diameter", first: { x: 25, y: 25 }, second: { x: 510.2, y: 25 }, distanceMillimeters: 24.26, expectedPixelsPerMillimeter: 20 },
    { name: "Custom diagonal reference", first: { x: 0, y: 0 }, second: { x: 300, y: 400 }, distanceMillimeters: 100, expectedPixelsPerMillimeter: 5 },
  ],
  homographyCases: [
    {
      name: "Trapezoid reference rectification",
      source: [{ x: 20, y: 10 }, { x: 180, y: 0 }, { x: 200, y: 110 }, { x: 0, y: 100 }],
      destination: [{ x: 0, y: 0 }, { x: 160, y: 0 }, { x: 160, y: 100 }, { x: 0, y: 100 }],
      tolerance: 1e-8,
      probes: [
        { source: { x: 100, y: 50 }, expected: { x: 88.11218385845604, y: 50.676881025333905 } },
        { source: { x: 50, y: 75 }, expected: { x: 44.06797465784832, y: 75.33178884190114 } },
        { source: { x: 150, y: 25 }, expected: { x: 132.13264682138254, y: 26.035265791642964 } },
      ],
    },
  ],
  depthCases: [
    {
      name: "Demonstration depth matching",
      depthMap: { 0: 0, 1: 0.32, 2: 0.64, 3: 0.96, 4: 1.28, 5: 1.6 },
      tolerance: 1e-9,
      samples: [
        { depth: 0.64, expectedCode: "2", expectedDifference: 0 },
        { depth: 0.67, expectedCode: "2", expectedDifference: 0.03 },
        { depth: 1.25, expectedCode: "4", expectedDifference: -0.03 },
      ],
    },
  ],
  coordinateCases: [
    { name: "Rotation, scale, and offset", point: { x: 2, y: 0 }, transform: { rotation: 90, scaleX: 2, scaleY: 1, offsetX: 4, offsetY: 3 }, expected: { x: 4, y: 7 }, tolerance: 1e-9 },
    { name: "Mirror and nonuniform scale", point: { x: 12, y: 8 }, transform: { rotation: -30, scaleX: 1.2, scaleY: 0.8, mirror: true, offsetX: 5, offsetY: -3 }, expected: { x: -4.270765814495917, y: 9.742562584220407 }, tolerance: 1e-9 },
  ],
});
