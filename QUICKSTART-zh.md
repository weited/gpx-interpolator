# 快速开始指南

## 安装

```bash
npm install
```

## 编译

```bash
npm run build
```

## 使用

### 基本用法

处理单个 GPX 文件（默认每 1 米一个点）：

```bash
node dist/cli.js 你的文件.gpx
```

输出文件会自动命名为 `你的文件_interpolated.gpx`

### 常用选项

**指定分辨率**（每 5 米一个点）：
```bash
node dist/cli.js -r 5 你的文件.gpx
```

**固定输出点数**（输出 1000 个点）：
```bash
node dist/cli.js -n 1000 你的文件.gpx
```

**保存速度信息**：
```bash
node dist/cli.js -s 你的文件.gpx
```

**批量处理**：
```bash
node dist/cli.js -r 10 *.gpx
```

### 使用场景示例

#### 场景 1: GPX 点太稀疏
如果你的 GPX 文件每隔 1 公里才有一个点，想要补充更多中间点：

```bash
# 每 50 米插入一个点
node dist/cli.js -r 50 稀疏路径.gpx
```

#### 场景 2: 制作平滑动画
需要固定数量的点来制作平滑的路径动画：

```bash
# 固定输出 500 个点
node dist/cli.js -n 500 动画路径.gpx
```

#### 场景 3: 分析速度变化
需要详细的速度数据来分析行程：

```bash
# 每 10 米一个点，并保存速度
node dist/cli.js -r 10 -s 骑行记录.gpx
```

## 作为 Node.js 模块使用

创建一个 TypeScript 文件 `my-script.ts`：

```typescript
import { gpxRead, gpxInterpolate, gpxWrite } from './src';

// 读取
const gpxData = gpxRead('input.gpx');

// 插值（每 2 米一个点）
const interpolated = gpxInterpolate(gpxData, 2.0);

// 保存
gpxWrite('output.gpx', interpolated);

console.log(`完成！从 ${gpxData.lat.length} 个点插值到 ${interpolated.lat.length} 个点`);
```

运行：
```bash
npx ts-node my-script.ts
```

## 工作原理

1. **读取** GPX 文件，提取经纬度、海拔、时间戳
2. **去重** 自动移除重复的点
3. **计算距离** 使用 Haversine 公式（考虑地球曲率）
4. **插值** 使用 PCHIP 算法在点之间平滑插值
5. **输出** 生成新的 GPX 文件

## 性能参考

- 小文件（< 100 点）：几乎瞬间完成
- 中等文件（100-1000 点）：< 1 秒
- 大文件（> 1000 点）：通常 < 5 秒

## 故障排除

### 错误：找不到文件
确保 GPX 文件路径正确，使用绝对路径或相对于当前目录的路径。

### 点数没有增加
检查原始文件的点间距，可能已经很密集了。使用更小的 `-r` 值。

### 时间戳丢失
如果原始 GPX 文件没有时间戳，插值后也不会有。使用 `-s` 选项需要原始文件包含时间戳。

## 更多帮助

查看完整文档：[README-zh.md](README-zh.md)

查看命令行帮助：
```bash
node dist/cli.js --help
```
