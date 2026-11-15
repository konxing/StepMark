/**
 * OFFLINE RESEARCH ONLY. This module is deliberately NOT exported from core's
 * public barrel. No remote fetch, database access, or production-score writes.
 * It is a fail-closed policy gate, not a substitute for legal review.
 */
export type Permission = "allowed" | "prohibited" | "unverified";
export type EvidenceLevel = "metadata_only" | "checksum_verified";

export interface ResearchDatasetManifest {
  datasetId: string;
  sourceUrl: string;
  sourceVersion: string;
  retrievedOn: string; // ISO calendar date of source/permission review
  licenseId: string; // upstream license, NOT inferred from downstream mirrors
  licenseUrl: string;
  rightsVerified: boolean;
  access: "open" | "terms_required" | "restricted" | "unknown";
  evidence: EvidenceLevel;
  sha256: string | null;
  participantLevel: boolean;
  itemLevel: boolean;
  longitudinal: boolean;
  population: string;
  language: string;
  permissions: {
    localNoncommercialResearch: Permission;
    commercialProduct: Permission;
    rawRedistribution: Permission;
    aggregatePublication: Permission;
  };
  notes: string;
}
export type ResearchUse =
  | {kind: "inspect_metadata"}
  | {kind: "local_analysis"; actualSha256: string; isolated: boolean; termsAccepted: boolean}
  | {kind: "publish_aggregates"; minCellSize: number; containsParticipantRows: boolean}
  | {kind: "redistribute_raw"}
  | {kind: "commercial_product"};
export interface RightsDecision {allowed: boolean; reasons: string[];}
const shaRe = /^[0-9a-f]{64}$/;
const isoDay = /^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/;
const idRe = /^[a-z0-9][a-z0-9._-]{1,95}$/;

function validManifest(m: ResearchDatasetManifest): string[] {
  const errors: string[] = [];
  if (!m || !idRe.test(m.datasetId ?? "")) errors.push("invalid datasetId");
  for (const [field, value] of [["sourceUrl", m?.sourceUrl], ["licenseUrl", m?.licenseUrl]]) {
    if (typeof value !== "string" || !/^https:\/\//.test(value) || value.length > 500) errors.push(`invalid ${field}`);
  }
  if (typeof m?.sourceVersion !== "string" || !m.sourceVersion.trim() || m.sourceVersion.length > 200) errors.push("sourceVersion required");
  if (!isoDay.test(m?.retrievedOn ?? "") || Number.isNaN(Date.parse(`${m?.retrievedOn}T00:00:00Z`))) errors.push("invalid review date");
  if (typeof m?.licenseId !== "string" || !m.licenseId.trim()) errors.push("source license required");
  if (!(["open", "terms_required", "restricted", "unknown"] as unknown[]).includes(m?.access)) errors.push("invalid access");
  if (!(["metadata_only", "checksum_verified"] as unknown[]).includes(m?.evidence)) errors.push("invalid evidence");
  if (m?.sha256 !== null && !shaRe.test(m?.sha256 ?? "")) errors.push("invalid sha256");
  if (m?.evidence === "checksum_verified" && !shaRe.test(m.sha256 ?? "")) errors.push("verified evidence needs sha256");
  if (typeof m?.rightsVerified !== "boolean") errors.push("rightsVerified required");
  for (const f of ["participantLevel", "itemLevel", "longitudinal"] as const) {
    if (typeof m?.[f] !== "boolean") errors.push(`${f} required`);
  }
  for (const f of ["population", "language", "notes"] as const) {
    if (typeof m?.[f] !== "string") errors.push(`${f} required`);
  }
  for (const f of ["localNoncommercialResearch", "commercialProduct", "rawRedistribution", "aggregatePublication"] as const) {
    if (!(["allowed", "prohibited", "unverified"] as unknown[]).includes(m?.permissions?.[f])) errors.push(`invalid permission: ${f}`);
  }
  return errors;
}

export function evaluateResearchDatasetRights(m: ResearchDatasetManifest, request: ResearchUse): RightsDecision {
  const errors = validManifest(m);
  if (errors.length) return {allowed: false, reasons: errors};
  if (request.kind === "inspect_metadata") return {allowed: true, reasons: ["metadata catalogue only; no source data use authorized"]};
  if (!m.rightsVerified) errors.push("underlying source permissions unverified");
  if (m.access === "unknown" || m.access === "restricted") errors.push("source access needs independent approval");
  // No non-catalogue operation may silently pass a source seen only on a web page.
  if (m.evidence !== "checksum_verified" || !m.sha256) errors.push("byte-verified dataset required for non-metadata use");
  if (m.access === "terms_required" && request.kind !== "local_analysis")
    errors.push("terms-required source use needs separate documented authorization for this operation");
  if (request.kind === "local_analysis") {
    if (m.permissions.localNoncommercialResearch !== "allowed") errors.push("local research permission not established");
    if (m.access === "terms_required" && !request.termsAccepted) errors.push("source terms not accepted");
    if (!request.isolated) errors.push("analysis must use isolated research environment");
    if (m.evidence !== "checksum_verified" || !m.sha256 || !shaRe.test(request.actualSha256) || m.sha256 !== request.actualSha256)
      errors.push("byte-exact SHA256 verification missing or mismatched");
  } else if (request.kind === "publish_aggregates") {
    if (m.permissions.aggregatePublication !== "allowed") errors.push("aggregate publication rights unverified");
    if (request.containsParticipantRows) errors.push("participant-level data cannot be published as aggregates");
    if (!Number.isInteger(request.minCellSize) || request.minCellSize < 10) errors.push("small-cell suppression required (>=10); check complements too");
  } else if (request.kind === "redistribute_raw") {
    if (m.permissions.rawRedistribution !== "allowed") errors.push("raw redistribution forbidden or unverified");
  } else if (request.kind === "commercial_product") {
    if (m.permissions.commercialProduct !== "allowed") errors.push("commercial product rights not established");
  }
  return {allowed: errors.length === 0, reasons: errors.length ? errors : ["permission gate satisfied; context-specific ethics and legal review still required"]};
}

/** Verified web metadata, NOT verified downloads or licenses of all stimuli. */
export const researchSourceCandidates: ReadonlyArray<Pick<ResearchDatasetManifest,
  "datasetId" | "sourceUrl" | "licenseId" | "access" | "evidence" | "notes">> = [
  {datasetId:"icar-sapa-irw",sourceUrl:"https://itemresponsewarehouse.org/data.html",licenseId:"CC0-1.0 (IRW entry; confirm upstream)",access:"open",evidence:"metadata_only",notes:"95,236 respondents/60 items per catalogue; item responses, not StepMark norms"},
  {datasetId:"mars-ib",sourceUrl:"https://github.com/ndawlab/mars-irt",licenseId:"MIT (repository; stimuli separate)",access:"open",evidence:"metadata_only",notes:"Calibration and validation datasets; never transfer item parameters to StepMark"},
  {datasetId:"omib",sourceUrl:"https://pmc.ncbi.nlm.nih.gov/articles/PMC9326670/",licenseId:"GPL-3.0 (item bank; check media)",access:"open",evidence:"metadata_only",notes:"Do not embed item images in closed-source product without rights review"},
  {datasetId:"pisa-2022",sourceUrl:"https://www.oecd.org/en/data/datasets/pisa-2022-database.html",licenseId:"OECD-PUF-TERMS",access:"terms_required",evidence:"metadata_only",notes:"No redistributing PUF; 15-year-old population mismatch"},
  {datasetId:"piaac-cycle2",sourceUrl:"https://www.oecd.org/en/data/datasets/piaac-2nd-cycle-database.html",licenseId:"OECD-PUF-TERMS",access:"terms_required",evidence:"metadata_only",notes:"Adult public use files; no raw redistribution; RUF requires separate permission"},
  {datasetId:"dlbs",sourceUrl:"https://openneuro.org/",licenseId:"CC0-1.0 (dataset; third-party tests separate)",access:"open",evidence:"metadata_only",notes:"Longitudinal scores; third-party test content may be restricted"},
  {datasetId:"openesm-beck",sourceUrl:"https://zenodo.org/",licenseId:"CC-BY-NC-4.0",access:"open",evidence:"metadata_only",notes:"Noncommercial research only, source version and byte hash required"},
  {datasetId:"attention-control-2026",sourceUrl:"https://doi.org/10.5281/zenodo.22224365",licenseId:"UNKNOWN",access:"unknown",evidence:"metadata_only",notes:"46.6GB data; no verified file-level license, blocked"},
  {datasetId:"ccab",sourceUrl:"https://osf.io/",licenseId:"DATA-LICENSE-UNVERIFIED",access:"unknown",evidence:"metadata_only",notes:"Article license does not establish dataset rights"}
];
