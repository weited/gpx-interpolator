/**
 * 测试长距离场景：墨尔本 → 北京 (约 9000 km)
 * 对比 Haversine 的误差
 */

// 墨尔本到北京的坐标
const melbourne = {
  lat: -37.8136,
  lon: 144.9631,
  name: '墨尔本',
};

const beijing = {
  lat: 39.9042,
  lon: 116.4074,
  name: '北京',
};

// 我们的 Haversine 实现
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const EARTH_RADIUS = 6371e3; // 米

  const lat1Rad = (lat1 * Math.PI) / 180;
  const lon1Rad = (lon1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const lon2Rad = (lon2 * Math.PI) / 180;

  const deltaLat = lat2Rad - lat1Rad;
  const deltaLon = lon2Rad - lon1Rad;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.asin(Math.sqrt(a));

  return EARTH_RADIUS * c;
}

// Vincenty 公式（高精度实现）
function vincentyDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const a = 6378137; // 赤道半径（米）
  const b = 6356752.314245; // 极半径（米）
  const f = 1 / 298.257223563; // 扁率

  const L = ((lon2 - lon1) * Math.PI) / 180;
  const U1 = Math.atan((1 - f) * Math.tan((lat1 * Math.PI) / 180));
  const U2 = Math.atan((1 - f) * Math.tan((lat2 * Math.PI) / 180));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let lambda = L;
  let lambdaP;
  let iterLimit = 100;
  let cosSqAlpha, sinSigma, cos2SigmaM, cosSigma, sigma;

  do {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt(
      cosU2 * sinLambda * (cosU2 * sinLambda) +
        (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) *
          (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda)
    );

    if (sinSigma === 0) return 0; // 重合点

    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;

    if (isNaN(cos2SigmaM)) cos2SigmaM = 0; // 赤道线

    const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    lambdaP = lambda;
    lambda =
      L +
      (1 - C) *
        f *
        sinAlpha *
        (sigma +
          C *
            sinSigma *
            (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  } while (Math.abs(lambda - lambdaP) > 1e-12 && --iterLimit > 0);

  if (iterLimit === 0) return NaN; // 公式未收敛

  const uSq = (cosSqAlpha * (a * a - b * b)) / (b * b);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) *
            cos2SigmaM *
            (-3 + 4 * sinSigma * sinSigma) *
            (-3 + 4 * cos2SigmaM * cos2SigmaM)));

  return b * A * (sigma - deltaSigma);
}

// 执行测试
console.log('='.repeat(60));
console.log('长距离测试：墨尔本 → 北京');
console.log('='.repeat(60));
console.log();

const haversineDist = haversineDistance(
  melbourne.lat,
  melbourne.lon,
  beijing.lat,
  beijing.lon
);

const vincentyDist = vincentyDistance(
  melbourne.lat,
  melbourne.lon,
  beijing.lat,
  beijing.lon
);

const difference = Math.abs(haversineDist - vincentyDist);
const percentageError = (difference / vincentyDist) * 100;

console.log(`${melbourne.name} 坐标: ${melbourne.lat}°N, ${melbourne.lon}°E`);
console.log(`${beijing.name} 坐标: ${beijing.lat}°N, ${beijing.lon}°E`);
console.log();

console.log('📏 距离计算结果:');
console.log('-'.repeat(60));
console.log(`Haversine (我们的实现): ${(haversineDist / 1000).toFixed(3)} km`);
console.log(`Vincenty  (高精度算法): ${(vincentyDist / 1000).toFixed(3)} km`);
console.log();

console.log('📊 误差分析:');
console.log('-'.repeat(60));
console.log(`绝对误差: ${(difference / 1000).toFixed(3)} km`);
console.log(`相对误差: ${percentageError.toFixed(4)}%`);
console.log();

console.log('🎯 实际影响评估:');
console.log('-'.repeat(60));

// GPS 精度
const gpsAccuracy = 10; // 米
console.log(`GPS 定位精度: ±${gpsAccuracy} 米`);

// 插值分辨率
const interpolationResolutions = [1, 5, 10, 50, 100];
console.log();
console.log('在不同插值分辨率下的影响:');
for (const res of interpolationResolutions) {
  const pointCount = Math.floor(haversineDist / res);
  const errorPerPoint = difference / pointCount;
  console.log(
    `  分辨率 ${res}m: 总点数 ${pointCount.toLocaleString()}, 每点误差 ${errorPerPoint.toFixed(4)}m`
  );
}

console.log();
console.log('💡 结论:');
console.log('-'.repeat(60));

if (percentageError < 1.0) {
  console.log('✅ Haversine 误差 < 1%，对于 GPX 插值完全可接受');
  console.log('✅ 每个插值点的误差远小于 GPS 精度');
  console.log('✅ 不需要使用更复杂的 Vincenty 算法');
} else {
  console.log('⚠️  Haversine 误差 > 1%，考虑使用 Vincenty');
  console.log('⚠️  对于高精度应用可能需要更精确的算法');
}

console.log();
console.log('='.repeat(60));

// 额外测试：不同距离的误差曲线
console.log();
console.log('📈 不同距离下的误差对比:');
console.log('='.repeat(60));

const testPoints = [
  { name: '北京 → 上海', lat1: 39.9042, lon1: 116.4074, lat2: 31.2304, lon2: 121.4737 },
  { name: '北京 → 广州', lat1: 39.9042, lon1: 116.4074, lat2: 23.1291, lon2: 113.2644 },
  { name: '北京 → 新加坡', lat1: 39.9042, lon1: 116.4074, lat2: 1.3521, lon2: 103.8198 },
  { name: '北京 → 悉尼', lat1: 39.9042, lon1: 116.4074, lat2: -33.8688, lon2: 151.2093 },
  { name: '北京 → 伦敦', lat1: 39.9042, lon1: 116.4074, lat2: 51.5074, lon2: -0.1278 },
  { name: '北京 → 纽约', lat1: 39.9042, lon1: 116.4074, lat2: 40.7128, lon2: -74.0060 },
];

console.log();
console.log('路线                    | Haversine  | Vincenty   | 误差      | 误差%');
console.log('-'.repeat(80));

for (const test of testPoints) {
  const h = haversineDistance(test.lat1, test.lon1, test.lat2, test.lon2);
  const v = vincentyDistance(test.lat1, test.lon1, test.lat2, test.lon2);
  const diff = Math.abs(h - v);
  const err = (diff / v) * 100;

  console.log(
    `${test.name.padEnd(20)} | ${(h / 1000).toFixed(0).padStart(8)} km | ${(v / 1000)
      .toFixed(0)
      .padStart(8)} km | ${diff.toFixed(0).padStart(7)} m | ${err.toFixed(3)}%`
  );
}

console.log();
