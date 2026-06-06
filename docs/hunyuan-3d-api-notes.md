# Hunyuan 3D API Notes

整理日期：2026-06-06

本文档面向“学校足球场 H5 3D 游戏”原型：场景里有一个可操作人物和一个足球，人物可以踢球。混元 3D API 主要用于生成或处理 3D 资产，不建议在浏览器端直接调用。

## 1. 接入结论

- API 是异步任务模式：提交任务得到 `JobId`，再轮询查询接口，状态为 `DONE` 后读取模型文件 URL。
- 接口域名：`https://ai3d.tencentcloudapi.com/`
- API 版本：`2025-05-13`
- 产品服务名：`ai3d`
- 官方推荐请求：`POST` + `application/json` + 签名方法 v3 `TC3-HMAC-SHA256`
- 公共地域目前文档列出为 `ap-guangzhou`
- 生成结果 URL 通常有有效期，查询得到后应尽快下载到本地或转存到自己的 COS/CDN。
- 前端 H5 不能暴露腾讯云密钥，应由后端或本地 Node 服务调用腾讯云 API。

## 2. 与游戏资产的关系

建议拆分资产来源：

| 资产 | 推荐做法 | 备注 |
| --- | --- | --- |
| 足球场 | Three.js 代码建模 | 足球场规则形状简单，用代码做更稳定、加载更快。 |
| 足球 | Three.js 球体 + 贴图 | 也可用混元生成，但没必要。 |
| 人物静态模型 | 混元生 3D / 3D 人物生成 | 可先生成 GLB/FBX，再导入 Three.js。 |
| 人物骨骼/动画 | 绑骨蒙皮 + 文生动作，或使用现成 Mixamo 动作 | 原型期建议先用现成动作；混元动作可后续增强。 |
| 踢球动作 | 动画片段 + 物理触发 | 动画和足球物理分开：角色播放踢腿，球按方向施加冲量。 |

## 3. 通用请求结构

公共 Header：

```http
POST / HTTP/1.1
Host: ai3d.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: <Action>
X-TC-Version: 2025-05-13
X-TC-Region: ap-guangzhou
X-TC-Timestamp: <unix timestamp>
Authorization: TC3-HMAC-SHA256 Credential=...
```

关键点：

- `Action` 放在 `X-TC-Action`。
- `Version` 放在 `X-TC-Version`，本产品接口为 `2025-05-13`。
- `Region` 放在 `X-TC-Region`，优先用 `ap-guangzhou`。
- 使用长期密钥时不要带 `X-TC-Token`。
- 如果使用临时密钥，再补 `X-TC-Token`。

## 4. 核心接口清单

### 4.1 提交混元生 3D 极速版任务

Action：`SubmitHunyuanTo3DRapidJob`

适合快速生成简单模型，默认并发 1。

常用入参：

```json
{
  "Prompt": "一个低面数卡通风格的足球运动员，T pose，适合网页3D游戏",
  "ResultFormat": "GLB",
  "EnablePBR": false,
  "EnableGeometry": false
}
```

参数要点：

- `Prompt`、`ImageBase64`、`ImageUrl` 三选一。
- `Prompt` 最多 200 个 UTF-8 字符。
- `ResultFormat` 可选 `OBJ`、`GLB`、`STL`、`USDZ`、`FBX`、`MP4`。
- `EnableGeometry=true` 会生成无纹理白模，且不支持 OBJ，默认 GLB。

### 4.2 查询混元生 3D 极速版任务

Action：`QueryHunyuanTo3DRapidJob`

入参：

```json
{
  "JobId": "1336255233494892544"
}
```

返回重点：

```json
{
  "Response": {
    "Status": "DONE",
    "ResultFile3Ds": [
      {
        "Type": "GLB",
        "Url": "https://...",
        "PreviewImageUrl": "https://..."
      }
    ]
  }
}
```

状态值：

- `WAIT`：等待中
- `RUN`：执行中
- `FAIL`：失败
- `DONE`：成功

### 4.3 提交混元生 3D 专业版任务

Action：`SubmitHunyuanTo3DProJob`

适合质量更高、参数更完整的生成，默认并发 3。

常用入参：

```json
{
  "Model": "3.1",
  "Prompt": "一个卡通风格足球运动员角色，T pose，运动服，适合H5游戏，干净拓扑",
  "EnablePBR": true,
  "FaceCount": 100000,
  "GenerateType": "Normal"
}
```

参数要点：

- `Model` 可选 `3.0`、`3.1`，默认 `3.0`。
- `Prompt` 最多 1024 个 UTF-8 字符。
- `Prompt` 与 `ImageBase64` / `ImageUrl` 通常不能同时传，`Sketch` 模式除外。
- `GenerateType`：
  - `Normal`：带纹理几何模型。
  - `LowPoly`：智能拓扑后模型，`FaceCount` 不生效，且 `Model=3.1` 时不可用。
  - `Geometry`：无纹理白模，`EnablePBR` 不生效。
  - `Sketch`：草图/线稿生成，可同时输入 prompt 和图片。
- `ResultFormat` 文档列出可选 `STL`、`USDZ`、`FBX`；默认文件组返回 `OBJ`、`GLB`。

### 4.4 查询混元生 3D 专业版任务

Action：`QueryHunyuanTo3DProJob`

返回字段比极速版多积分消耗：

- `ResultCreditDetails`
- `ResultCreditConsumed`
- `ResultFile3Ds`

### 4.5 提交 3D 人物生成任务

Action：`SubmitProfileTo3DJob`

适合从人物相关输入生成 3D 人物模型。后续如果我们希望角色更像“真人/头像/特定人物设定”，优先研究这个接口。

### 4.6 绑骨蒙皮

Action：`SubmitAutoRiggingJob`

用途：给人物或动物模型绑定骨骼并蒙皮，输出带骨骼信息的 3D 模型。

入参示例：

```json
{
  "File3D": {
    "Url": "https://example.com/player.glb",
    "Type": "GLB"
  },
  "MotionType": 18
}
```

限制和建议：

- 支持输入 `FBX` 或 `GLB`，文件大小不超过 60 MB。
- 人形角色尽量是 `A Pose` 或 `T Pose`。
- 模型不要包含武器、翅膀、坐骑等额外组件。
- 可选预设动作里和足球原型最相关的有：
  - `18`：踢腿
  - `23`、`24`、`25`：走路
  - `32`、`33`：慢跑
  - `34`：奔跑
  - `35`、`36`、`37`：冲刺跑
  - `26`、`27`：待机

### 4.7 文生动作

Action：`SubmitHunyuanTo3DMotionJob`

用途：根据文本生成 3D 人物动作数据，输出带动画数据的 FBX 文件。

入参示例：

```json
{
  "Prompt": "A soccer player kicks a ball forward",
  "Model": "HY-Motion-1.0",
  "Duration": 3,
  "EnableMesh": true,
  "EnableRewrite": true,
  "EnableDurationEst": true
}
```

参数要点：

- `Prompt` 必填，最多 128 字符。
- `Duration` 默认 5 秒，范围 1 到 12 秒。
- `EnableMesh` 默认 `true`。
- `RetargetFile` 只能支持混元生 3D 动画生成的模型。

### 4.8 格式转换

Action：`Convert3DFormat`

用途：把生成结果转换成游戏更好加载的格式。Three.js 原型优先使用 `GLB/GLTF`，因为加载方便、材质和动画支持较好。

## 5. H5 游戏接入方案

建议工程结构：

```text
server/
  hunyuanClient.js        # 腾讯云签名/SDK 调用封装
  routes/assets.js        # 提交生成、查询、下载/转存
public/
  assets/models/          # 已下载的 GLB/FBX
src/
  game/
    scene.js              # 学校足球场
    playerController.js   # WASD/方向键控制人物
    ballPhysics.js        # 足球碰撞、冲量、滚动
    assetLoader.js        # GLB/FBX 加载
```

推荐调用流：

1. 后端读取 `.env` 密钥。
2. 后端调用 `SubmitHunyuanTo3DRapidJob` 或 `SubmitHunyuanTo3DProJob`。
3. 后端保存 `JobId`。
4. 前端或后端轮询查询接口。
5. 状态 `DONE` 后下载 `ResultFile3Ds[0].Url`。
6. 保存到 `public/assets/models/`。
7. 前端用 Three.js `GLTFLoader` 加载 GLB。

## 6. 当前项目 env 备注

当前 `.env` 里检测到：

```env
API_KEY=<set>
```

后续接腾讯云官方 SDK 时，通常建议改为更明确的命名：

```env
TENCENT_SECRET_ID=...
TENCENT_SECRET_KEY=...
TENCENT_REGION=ap-guangzhou
```

如果你的 `API_KEY` 不是腾讯云 `SecretId + SecretKey` 形式，而是某个单独 token，需要再确认它对应哪种鉴权方式。

## 7. 原型阶段建议

- 第一版不要依赖在线生成：先把场景、控制、踢球、碰撞做出来。
- 人物模型可以先用占位胶囊体或简单 GLB，确认手感后再接混元生成。
- 足球场和足球用代码/贴图做，省调用成本。
- 混元 3D 主要用于生成最终角色模型，或者后续生成踢腿、跑步等动画。
- 下载后的模型要本地化保存，避免结果 URL 过期导致游戏加载失败。

## 8. 关于 3D 世界模型生成

混元官网的 `https://3d.hunyuan.tencent.com/sceneTo3D` 是“3D 世界/场景生成”在线能力入口，但截至 2026-06-06，腾讯云混元生 3D 的公开 API 概览里没有列出对应的 SceneTo3D / WorldTo3D / HunyuanWorld 任务接口。

当前公开云 API 支持的是单体 3D 资产和资产处理能力：

- 混元生 3D 专业版 / 极速版
- 纹理生成
- 智能拓扑
- 组件生成
- UV 展开
- 文生动作
- 绑骨蒙皮
- 3D 人物生成
- 模型格式转换

另有大模型服务平台 TokenHub 的 3D 生成接口，但它公开支持的模型也是 `hy-3d-3.0`、`hy-3d-3.1` 和 `HY-3D-Express`，参数仍对应专业版 / 极速版生 3D 任务，不是完整 3D 世界生成。

对本项目来说，学校足球场建议先用 Three.js 程序化搭建；如果后续一定要用混元世界模型，可以尝试官网手动生成并导出素材，或者研究开源的 HunyuanWorld / HY-World 本地部署路线，但这不是当前腾讯云 API 文档里的标准托管接口。
