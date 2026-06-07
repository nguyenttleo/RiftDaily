export const BUILD_SHARE_PARAM = "build";
const BUILD_SHARE_PREFIX = "RB-";

export function encodeBuildShareCode(roundId: string) {
  if (!roundId) {
    return "";
  }

  const encoded = encodeBase64Url(roundId);
  return encoded ? `${BUILD_SHARE_PREFIX}${encoded}` : roundId;
}

export function decodeBuildShareValue(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "";
  }

  const decodedValue = safeDecodeURIComponent(trimmed);

  if (!decodedValue.startsWith(BUILD_SHARE_PREFIX)) {
    return decodedValue;
  }

  return decodeBase64Url(decodedValue.slice(BUILD_SHARE_PREFIX.length)) ?? "";
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodeBase64Url(value: string) {
  try {
    const base64 =
      typeof btoa === "function"
        ? btoa(value)
        : typeof Buffer !== "undefined"
          ? Buffer.from(value, "utf8").toString("base64")
          : "";

    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } catch {
    return "";
  }
}

function decodeBase64Url(value: string) {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");

    if (typeof atob === "function") {
      return atob(padded);
    }

    if (typeof Buffer !== "undefined") {
      return Buffer.from(padded, "base64").toString("utf8");
    }
  } catch {
    return null;
  }

  return null;
}
