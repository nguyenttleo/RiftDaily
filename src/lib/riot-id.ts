export interface RiotIdFields {
  riotIdGameName?: string;
  riotIdTagline?: string;
  summonerName?: string;
}

export function formatRiotIdFromFields(fields?: RiotIdFields) {
  const gameName = (fields?.riotIdGameName ?? fields?.summonerName ?? "").trim();

  if (!gameName) {
    return undefined;
  }

  if (gameName.includes("#")) {
    return gameName;
  }

  const tagLine = fields?.riotIdTagline?.trim();

  return tagLine ? `${gameName}#${tagLine}` : gameName;
}

export function splitRiotId(value: string) {
  const separatorIndex = value.lastIndexOf("#");

  if (separatorIndex <= 0 || separatorIndex >= value.length - 1) {
    return null;
  }

  const gameName = value.slice(0, separatorIndex).trim();
  const tagLine = value.slice(separatorIndex + 1).trim();

  return gameName && tagLine ? { gameName, tagLine } : null;
}
