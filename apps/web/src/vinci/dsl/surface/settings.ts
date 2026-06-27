import { deepClone } from "../canonical/clone";
import { MODEL_TYPES, stripModelIds } from "./modelType";

/**
 * settings.chart 的 surface 重塑。
 *
 * 目前只结构化最容易踩坑的 **坐标系网格线/坐标轴线**（ChartLinesModel）：
 *
 *   snapshot/canonical（原始）:
 *     lines: { $modelType, axisLine:{h?,v?}, gridLine:{h?,v?}, sectionLine:{h?,v?} }
 *     其中每个方向是 Partial<LineOptions> = { enabled?: boolean }
 *
 *   surface（可读）:
 *     lines: { axisLine?:{horizontal?,vertical?}, gridLine?:{...}, sectionLine?:{...} }
 *     方向用全称 horizontal/vertical；{enabled:bool} 压成 bool；默认整体折叠省略；丢 $modelType
 *
 * 关 X 方向（垂直）网格线：`settings.chart.lines.gridLine.vertical = false`
 * 关 Y 方向（水平）坐标轴线：`settings.chart.lines.axisLine.horizontal = false`
 *
 * 其余 settings（coord / cartesian / polar / geo / legend / table）暂为透传。
 */

const LINE_KEYS = ["axisLine", "gridLine", "sectionLine"] as const;
const DIR_SURFACE_TO_RAW = { horizontal: "h", vertical: "v" } as const;
const DIR_RAW_TO_SURFACE = { h: "horizontal", v: "vertical" } as const;

type RawDir = Record<string, unknown>; // { h?: {enabled?}, v?: {enabled?} }
type SurfaceDir = Record<string, unknown>; // { horizontal?: bool|obj, vertical?: bool|obj }

/** {enabled:bool}（仅此一键）压成 bool；否则保留对象（防御额外键）。 */
function lineOptToSurface(opt: unknown): unknown {
	if (opt && typeof opt === "object" && !Array.isArray(opt)) {
		const keys = Object.keys(opt);
		if (
			keys.length === 1 &&
			keys[0] === "enabled" &&
			typeof (opt as { enabled: unknown }).enabled === "boolean"
		) {
			return (opt as { enabled: boolean }).enabled;
		}
	}
	return deepClone(opt);
}

function lineOptFromSurface(v: unknown): unknown {
	if (typeof v === "boolean") return { enabled: v };
	return deepClone(v);
}

/** 原始 lines → surface lines（可读、折叠、去 $modelType）。 */
function linesToSurface(raw: Record<string, unknown>): Record<string, SurfaceDir> {
	const out: Record<string, SurfaceDir> = {};
	for (const key of LINE_KEYS) {
		const dir = raw[key] as RawDir | undefined;
		if (!dir || typeof dir !== "object") continue;
		const surfDir: SurfaceDir = {};
		if ("h" in dir) surfDir[DIR_RAW_TO_SURFACE.h] = lineOptToSurface(dir.h);
		if ("v" in dir) surfDir[DIR_RAW_TO_SURFACE.v] = lineOptToSurface(dir.v);
		if (Object.keys(surfDir).length > 0) out[key] = surfDir;
	}
	return out;
}

/** surface lines → 原始 lines（重建 $modelType + 三个方向默认空对象）。 */
function linesFromSurface(
	surf: Record<string, SurfaceDir>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {
		$modelType: MODEL_TYPES.chartLines,
		axisLine: {},
		gridLine: {},
		sectionLine: {},
	};
	for (const key of LINE_KEYS) {
		const surfDir = surf[key];
		if (!surfDir || typeof surfDir !== "object") continue;
		const rawDir = out[key] as RawDir;
		if ("horizontal" in surfDir) {
			rawDir[DIR_SURFACE_TO_RAW.horizontal] = lineOptFromSurface(
				surfDir.horizontal,
			);
		}
		if ("vertical" in surfDir) {
			rawDir[DIR_SURFACE_TO_RAW.vertical] = lineOptFromSurface(
				surfDir.vertical,
			);
		}
	}
	return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function settingsToSurface(settings: unknown): unknown {
	if (!isObject(settings)) return deepClone(settings);
	// 去 $modelId（nonce）；chart/table 的 $modelType 按已知位置剥离（expand 时重建）。
	// 更深层未建模的子模型（若有）保留其 $modelType 以维持无损。
	const out = stripModelIds(settings) as Record<string, unknown>;
	const chart = out.chart;
	if (isObject(chart)) {
		delete chart.$modelType; // vinci/chartSettings
		if (isObject(chart.lines)) {
			const surfaceLines = linesToSurface(chart.lines);
			if (Object.keys(surfaceLines).length > 0) {
				chart.lines = surfaceLines;
			} else {
				// 全默认 → 折叠
				delete chart.lines;
			}
		}
	}
	if (isObject(out.table)) {
		delete (out.table as Record<string, unknown>).$modelType; // vinci/tableSettings
	}
	return out;
}

export function settingsFromSurface(settings: unknown): unknown {
	if (!isObject(settings)) return deepClone(settings);
	const out = deepClone(settings);
	const chart = out.chart;
	if (isObject(chart)) {
		// 重建 chart 的 $modelType（surface 已剥离）；含 $modelType 则视为原始形态不动
		if (!("$modelType" in chart)) chart.$modelType = MODEL_TYPES.chartSettings;
		if (isObject(chart.lines) && !("$modelType" in chart.lines)) {
			chart.lines = linesFromSurface(chart.lines as Record<string, SurfaceDir>);
		}
	}
	if (isObject(out.table) && !("$modelType" in out.table)) {
		(out.table as Record<string, unknown>).$modelType = MODEL_TYPES.tableSettings;
	}
	return out;
}
