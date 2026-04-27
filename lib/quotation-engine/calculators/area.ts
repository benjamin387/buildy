export function calculateFrontageArea(lengthFt: number, heightFt: number): number {
  return round(lengthFt * heightFt);
}

export function calculateCountertopArea(lengthFt: number, depthFt: number): number {
  return round(lengthFt * depthFt);
}

export function calculateCarcassArea(lengthFt: number, heightFt: number): number {
  return round(lengthFt * heightFt * 1.18);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}