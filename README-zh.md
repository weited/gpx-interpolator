# GPX Interpolate - TypeScript 版本

使用分段三次埃尔米特样条对 GPX 文件进行插值的 TypeScript 实现。

可以在任意空间分辨率下插值纬度、经度、海拔和速度数据。

## 功能特点

- 📍 在 GPX 轨迹点之间插入中间点
- 🎯 使用 PCHIP（分段三次埃尔米特插值多项式）算法保证平滑插值
- 📏 支持基于距离的插值分辨率
- ⏱️ 保留时间戳信息并进行插值
- 📈 可选的速度计算和保存
- 🔄 自动移除重复的轨迹点

## 安装依赖

```bash
npm install
```

## 使用方法

### 1. 命令行工具

先编译 TypeScript 代码：

```bash
npm run build
```

然后使用命令行工具：

```bash
# 基本用法（默认 1 米分辨率）
node dist/cli.js your-track.gpx

# 指定插值分辨率（单位：米）
node dist/cli.js -r 5 your-track.gpx

# 指定输出点数
node dist/cli.js -n 1000 your-track.gpx

# 保存速度信息
node dist/cli.js -s your-track.gpx

# 批量处理多个文件
node dist/cli.js *.gpx
```

### 2. 作为模块使用

```typescript
import { gpxRead, gpxInterpolate, gpxWrite } from './src';

// 读取 GPX 文件
const gpxData = gpxRead('input.gpx');

// 进行插值（分辨率 1 米）
const interpolated = gpxInterpolate(gpxData, 1.0);

// 保存结果
gpxWrite('output.gpx', interpolated);
```

### 3. 开发模式

使用 ts-node 直接运行：

```bash
npm run dev -- your-track.gpx -r 2
```

## API 说明

### `gpxInterpolate(gpxData, res, num)`

对 GPX 数据进行插值。

参数：
- `gpxData`: GPX 数据对象，包含以下字段：
  - `lat`: 纬度数组（度）
  - `lon`: 经度数组（度）
  - `ele`: 海拔数组（米，可选）
  - `tstamp`: 时间戳数组（秒，可选）
  - `tzinfo`: 时区信息（可选）
- `res`: 插值分辨率（米），默认 1.0
- `num`: 强制指定输出点数（如果提供，则忽略 `res`）

返回：插值后的 GPX 数据对象

### `gpxRead(filename)`

从文件读取 GPX 数据。

### `gpxWrite(filename, gpxData, writeSpeed)`

将 GPX 数据写入文件。

参数：
- `filename`: 输出文件名
- `gpxData`: GPX 数据对象
- `writeSpeed`: 是否保存速度信息（默认 false）

## 工作原理

1. **读取 GPX 文件**：解析 XML 格式的 GPX 文件，提取轨迹点的经纬度、海拔、时间等信息

2. **去除重复点**：自动检测并移除距离为 0 的重复轨迹点

3. **计算距离**：
   - 使用 Haversine 公式计算大圆距离（考虑地球曲率）
   - 如果有海拔数据，结合海拔差计算 3D 距离

4. **PCHIP 插值**：
   - 计算累积距离作为插值的自变量
   - 对纬度、经度、海拔、时间戳分别进行插值
   - 保证曲线平滑且无过冲

5. **生成新点**：根据指定的分辨率或点数生成插值后的轨迹点

6. **保存结果**：将插值后的数据写入新的 GPX 文件

## 示例

假设你有一个 GPX 文件，点与点之间的间隔很大（例如每隔 1 公里才有一个点），你可以这样补全中间点：

```bash
# 每 5 米插入一个点
node dist/cli.js -r 5 sparse-track.gpx

# 输出固定 500 个点
node dist/cli.js -n 500 sparse-track.gpx
```

处理前：
```
点 A (0m) -------- 1000m -------- 点 B (1000m)
```

处理后（-r 5）：
```
点 A (0m) - 5m - 10m - 15m - ... - 995m - 点 B (1000m)
共约 200 个点
```

## 技术实现

### 核心算法

- **PCHIP (Piecewise Cubic Hermite Interpolating Polynomial)**：
  - 分段三次埃尔米特插值
  - 保证曲线通过所有原始数据点
  - 保持单调性，避免伪振荡
  - 一阶连续可导

### 距离计算

- **Haversine 公式**：计算球面上两点间的大圆距离
- **3D 距离**：当有海拔数据时，结合水平距离和垂直距离

### 速度计算

- 速度 = 距离 / 时间差
- 自动处理时间戳为 0 的情况

## 项目结构

```
src/
├── types.ts          # TypeScript 类型定义
├── pchip.ts          # PCHIP 插值算法实现
├── gpx-utils.ts      # GPX 工具函数（距离、速度计算等）
├── gpx-io.ts         # GPX 文件读写
├── interpolate.ts    # 主插值函数
├── index.ts          # 模块导出
└── cli.ts            # 命令行工具
```

## 依赖库

- `@xmldom/xmldom`: XML 解析和生成
- `commander`: 命令行参数解析
- `typescript`: TypeScript 编译器

## 与 Python 版本的对比

这个 TypeScript 实现完全复刻了原 Python 版本的功能：

| 功能 | Python | TypeScript |
|------|--------|------------|
| PCHIP 插值 | ✅ scipy | ✅ 自实现 |
| GPX 读写 | ✅ gpxpy | ✅ xmldom |
| Haversine 距离 | ✅ | ✅ |
| 速度计算 | ✅ | ✅ |
| 去重 | ✅ | ✅ |
| 命令行 | ✅ | ✅ |

## 许可证

MIT
