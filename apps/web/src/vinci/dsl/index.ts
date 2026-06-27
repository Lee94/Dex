// @vinci/dsl
//
// Phase 1 ✅：Canonical 层（snapshot ↔ Canonical 双向无损）
// Phase 2 ✅：Surface 糖衣层（fields 表 / axes 表 / 紧凑字段 / $metric / 默认折叠 / geoms 重组）
// Phase 3 ✅：复杂子结构
//   - filter：37+ 种 FilterType 递归判别联合 → 字符串别名（registry/filter + canonical/filter）
//   - conditionFormat：textIcon / icon / text / dataBar 内嵌 FilterItemValue 翻译
//     + surface `when` 表达式糖衣（"this >= 8000000"）
//   - fieldConfigs / fieldGroupConfigs 结构化
//   - filter.fieldId / sort.id 等 groupId 引用统一翻译（整数指纹 → 别名 → 紧凑 alias:agg）
//   - settings.chart.lines（网格线/坐标轴线）结构化为可读形态
//     （gridLine/axisLine.{horizontal,vertical}: bool）
//   - geom options 扁平化（去掉冗余 geom-type 嵌套 {line:{...}} → {...}）+ 各属性
//     GeomAttributesOptions 的 per-geom 校验（属性归属/options 子键/枚举/数值值域）
//     —— 见 docs/plan/dsl-geom-options-coverage-v0.1（R3：不做默认折叠）
//
// 顶层便捷 API（编译 / 反编译语义）：
//   snapshotToDsl(snap) → SurfaceDoc        反编译：snapshot → DSL
//   dslToSnapshot(surf) → VinciSnapshotLike 编译：  DSL → snapshot
//   （别名 snapshotToSurface / surfaceToSnapshot 与之等价）
//
// 分层 API（适合诊断、单元测试）：
//   snapshotToCanonical / canonicalToSnapshot
//   canonicalToSurface  / surfaceToCanonical

export * from "./canonical";
export * from "./registry";
export * from "./surface";
