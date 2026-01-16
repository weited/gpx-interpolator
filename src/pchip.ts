/**
 * Piecewise Cubic Hermite Interpolating Polynomial (PCHIP)
 * This is a simplified implementation for 1D interpolation
 */

/**
 * Calculate slopes for PCHIP interpolation
 */
function pchipSlopes(x: number[], y: number[]): number[] {
  const n = x.length;
  const d = new Array(n);
  const h = new Array(n - 1);
  const delta = new Array(n - 1);

  // Calculate differences
  for (let i = 0; i < n - 1; i++) {
    h[i] = x[i + 1] - x[i];
    delta[i] = (y[i + 1] - y[i]) / h[i];
  }

  // Calculate slopes
  d[0] = delta[0];
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) {
      d[i] = 0;
    } else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
    }
  }
  d[n - 1] = delta[n - 2];

  return d;
}

/**
 * Evaluate PCHIP polynomial at given points
 */
export function pchipInterpolate(
  xi: number[],
  yi: number[],
  x: number[]
): number[] {
  const n = xi.length;
  const slopes = pchipSlopes(xi, yi);
  const result: number[] = [];

  for (const xVal of x) {
    // Find the interval
    let k = 0;
    if (xVal >= xi[n - 1]) {
      k = n - 2;
    } else {
      for (let i = 0; i < n - 1; i++) {
        if (xVal >= xi[i] && xVal <= xi[i + 1]) {
          k = i;
          break;
        }
      }
    }

    // Hermite basis functions
    const h = xi[k + 1] - xi[k];
    const t = (xVal - xi[k]) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    const yVal =
      h00 * yi[k] +
      h10 * h * slopes[k] +
      h01 * yi[k + 1] +
      h11 * h * slopes[k + 1];

    result.push(yVal);
  }

  return result;
}

/**
 * Interpolate multiple arrays of y values
 */
export function pchipInterpolateMulti(
  xi: number[],
  yi: number[][],
  x: number[]
): number[][] {
  const results: number[][] = [];

  for (const yRow of yi) {
    results.push(pchipInterpolate(xi, yRow, x));
  }

  return results;
}
