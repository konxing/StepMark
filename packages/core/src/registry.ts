/**
 * Versioned construct registry. Codes are stable external IDs; do not rename
 * without migration. New constructs enter through registry configuration.
 */
export type EvidenceKind = "objective" | "rubric" | "self_report" | "ai_assisted";
export type Construct = {
  code: string;
  version: string;
  title: string;
  description: string;
  evidenceKinds: readonly EvidenceKind[];
  readyForPopulationNorms: boolean;
};
export const initialConstructs: readonly Construct[] = [
  { code: "reasoning.logic", version: "0.1.0", title: "逻辑推理", description: "结构化推理任务；尚无规范分", evidenceKinds: ["objective"], readyForPopulationNorms: false },
  { code: "expression.structure", version: "0.1.0", title: "表达结构", description: "有锚点的多维开放式任务量规", evidenceKinds: ["rubric", "ai_assisted"], readyForPopulationNorms: false },
  { code: "attention.control", version: "0.1.0", title: "注意控制", description: "实验性任务；跨设备反应时不直接可比", evidenceKinds: ["objective"], readyForPopulationNorms: false },
  { code: "prediction.calibration", version: "0.1.0", title: "预测与校准", description: "对已解决事件使用事前锁定的概率及基准；尚无常模", evidenceKinds: ["objective"], readyForPopulationNorms: false }
];
export function getConstruct(code: string): Construct | undefined {
  return initialConstructs.find(c => c.code === code);
}
