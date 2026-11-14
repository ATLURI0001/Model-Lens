export function getIsCharOrUnderscore(value: string): boolean {
  const charOrUnderscore = /^[\p{L}\p{N}_]+$/u;

  return charOrUnderscore.test(value);
}

// Regex for valid variable names (unicode letters, underscores, starting with letter)
export const VARIABLE_REGEX = /^\p{L}[\p{L}\p{N}_]*$/u;

// Regex to find variables in mustache syntax. Extra surrounding braces are
// treated as literals by SDK/compiler behavior, e.g. {{{name}}} -> {value}.
export const MUSTACHE_REGEX = /{{([^{}]*)}}/g;

// Regex to find multiline variables
export const MULTILINE_VARIABLE_REGEX = /{{[^{}\n]*\n[^{}]*}}/g;

// Regex to find unclosed variables
export const UNCLOSED_VARIABLE_REGEX = /{{(?!{)(?![^{]*}})/g;

// Smithy host-label check used by S3-compatible clients. AWS, GCS XML/S3,
// Cloudflare R2, MinIO, Azure location IDs (eastus), and OCI region ids all
// fit this pattern. Spaces, underscores, and GCP dual-region `+` syntax are
// rejected because they throw inside the AWS SDK and can terminate the process.
export const BLOB_STORAGE_REGION_REGEX = /^(?!.*-$)(?!-)[a-zA-Z0-9-]{1,63}$/;

export const BLOB_STORAGE_REGION_INVALID_MESSAGE =
  "Region must be 1-63 letters, numbers, or hyphens, and cannot start or end with a hyphen";

export function normalizeBlobStorageRegion(region: string): string {
  if (typeof region !== "string") {
    throw new Error(BLOB_STORAGE_REGION_INVALID_MESSAGE);
  }
  const normalizedRegion = region.trim();
  if (!BLOB_STORAGE_REGION_REGEX.test(normalizedRegion)) {
    throw new Error(BLOB_STORAGE_REGION_INVALID_MESSAGE);
  }
  return normalizedRegion;
}

export function isValidVariableName(variable: string): boolean {
  if (typeof variable !== "string") return false;
  return VARIABLE_REGEX.test(variable);
}

export function extractVariables(mustacheString: string): string[] {
  if (typeof mustacheString !== "string") {
    return [];
  }
  const matches = Array.from(mustacheString.matchAll(MUSTACHE_REGEX))
    .map((match) => match[1].trim())
    .filter(isValidVariableName);

  return [...new Set(matches)];
}

export function stringifyValue(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "string":
      return value;
    case "number":
    case "boolean":
    case "bigint":
      return value.toString();
    case "symbol":
      return value.description ?? "";
    default:
      if (value instanceof Error) {
        return value.message || String(value);
      }
      try {
        const json = JSON.stringify(value, (_k, v) =>
          typeof v === "bigint" ? v.toString() : v,
        );
        return json !== undefined ? json : "";
      } catch {
        return String(value);
      }
  }
}

export function truncate(str: string, n = 16): string {
  if (typeof str !== "string") {
    return "";
  }
  const limit = typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  const codePoints = Array.from(str);
  if (codePoints.length > limit) {
    return codePoints.slice(0, limit).join("") + "...";
  }
  return str;
}
