import { getChampionByName } from "@/game/data/champions";
import type { EsportsDraftChallenge } from "@/types";

interface CargoDraftRow {
  title: Record<string, string>;
}

interface CargoPlayerRow {
  title: Record<string, string>;
}

const laneOrder = ["Top", "Jungle", "Mid", "Bot", "Supp"];

export async function getLeaguepediaDraftChallenge(date: string): Promise<EsportsDraftChallenge | null> {
  const params = new URLSearchParams({
    action: "cargoquery",
    format: "json",
    limit: "25",
    tables: "PicksAndBansS7",
    fields: [
      "OverviewPage",
      "Team1",
      "Team2",
      "Team1Pick1",
      "Team1Pick2",
      "Team1Pick3",
      "Team1Pick4",
      "Team1Pick5",
      "Team2Pick1",
      "Team2Pick2",
      "Team2Pick3",
      "Team2Pick4",
      "Team2Pick5",
      "Team1Ban1",
      "Team1Ban2",
      "Team1Ban3",
      "Team1Ban4",
      "Team1Ban5",
      "Team2Ban1",
      "Team2Ban2",
      "Team2Ban3",
      "Team2Ban4",
      "Team2Ban5",
      "Winner",
      "GameId"
    ].join(","),
    where: "IsComplete=1 AND Team1Pick5 IS NOT NULL AND Team2Pick5 IS NOT NULL",
    order_by: "GameId DESC"
  });

  try {
    const response = await fetch(`https://lol.fandom.com/api.php?${params}`, {
      headers: {
        "User-Agent": "RiftDaily/0.1 daily puzzle generator"
      },
      next: { revalidate: 60 * 60 * 6 }
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { cargoquery?: CargoDraftRow[] };
    const rows = payload.cargoquery ?? [];
    const row = rows.find((candidate) => isUsableDraft(candidate.title))?.title;

    if (!row) {
      return null;
    }

    const bluePicks = [row.Team1Pick1, row.Team1Pick2, row.Team1Pick3, row.Team1Pick4, row.Team1Pick5];
    const redPicks = [row.Team2Pick1, row.Team2Pick2, row.Team2Pick3, row.Team2Pick4, row.Team2Pick5];
    const laneAssignments = await getScoreboardLaneAssignments(row);
    const bluePickLanes = laneAssignments
      ? lanesForPickOrder(bluePicks, laneAssignments.blueByChampion)
      : undefined;
    const redPickLanes = laneAssignments
      ? lanesForPickOrder(redPicks, laneAssignments.redByChampion)
      : undefined;

    return {
      id: `${date}:esports-draft`,
      type: "esports-draft",
      date,
      source: "Leaguepedia Cargo PicksAndBansS7",
      event: row.OverviewPage,
      patch: "Live Leaguepedia data",
      blueTeam: row.Team1,
      redTeam: row.Team2,
      bluePicks,
      redPicks: redPicks.slice(0, 4),
      blueBans: [row.Team1Ban1, row.Team1Ban2, row.Team1Ban3, row.Team1Ban4, row.Team1Ban5].filter(Boolean),
      redBans: [row.Team2Ban1, row.Team2Ban2, row.Team2Ban3, row.Team2Ban4, row.Team2Ban5].filter(Boolean),
      bluePickLanes,
      redPickLanes: redPickLanes?.slice(0, 4),
      answerLane: redPickLanes?.[4],
      answerChampionName: row.Team2Pick5,
      answerSide: "red"
    };
  } catch {
    return null;
  }
}

function isUsableDraft(row: Record<string, string>): boolean {
  const picks = [
    row.Team1Pick1,
    row.Team1Pick2,
    row.Team1Pick3,
    row.Team1Pick4,
    row.Team1Pick5,
    row.Team2Pick1,
    row.Team2Pick2,
    row.Team2Pick3,
    row.Team2Pick4,
    row.Team2Pick5
  ];

  return picks.every((pick) => Boolean(pick && getChampionByName(pick)));
}

async function getScoreboardLaneAssignments(row: Record<string, string>) {
  if (!row.GameId && !row.OverviewPage) {
    return null;
  }

  const where = row.GameId
    ? `GameId="${escapeCargoValue(row.GameId)}"`
    : `OverviewPage="${escapeCargoValue(row.OverviewPage)}"`;
  const params = new URLSearchParams({
    action: "cargoquery",
    format: "json",
    limit: "20",
    tables: "ScoreboardPlayers",
    fields: ["OverviewPage", "GameId", "Team", "Role", "Champion", "Side"].join(","),
    where,
    order_by: "Role"
  });

  try {
    const response = await fetch(`https://lol.fandom.com/api.php?${params}`, {
      headers: {
        "User-Agent": "RiftDaily/0.1 daily puzzle generator"
      },
      next: { revalidate: 60 * 60 * 6 }
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { cargoquery?: CargoPlayerRow[] };
    const players = (payload.cargoquery ?? []).map((entry) => entry.title);
    const blueRows = players.filter((player) => isTeamOrSide(player, row.Team1, "Blue"));
    const redRows = players.filter((player) => isTeamOrSide(player, row.Team2, "Red"));
    const blueByChampion = championLaneMap(blueRows);
    const redByChampion = championLaneMap(redRows);

    if (blueByChampion.size < 4 || redByChampion.size < 4) {
      return null;
    }

    return { blueByChampion, redByChampion };
  } catch {
    return null;
  }
}

function lanesForPickOrder(picks: string[], lanesByChampion: Map<string, string>) {
  const usedLanes = new Set<string>();

  return picks.map((pick, index) => {
    const lane = lanesByChampion.get(normalize(pick));

    if (lane) {
      usedLanes.add(lane);
      return lane;
    }

    const fallbackLane = laneOrder.find((candidate) => !usedLanes.has(candidate)) ?? laneOrder[index] ?? "Lane";
    usedLanes.add(fallbackLane);
    return fallbackLane;
  });
}

function championLaneMap(rows: Record<string, string>[]) {
  const map = new Map<string, string>();

  for (const row of rows) {
    const champion = row.Champion;
    const lane = normalizeLane(row.Role);

    if (champion && lane) {
      map.set(normalize(champion), lane);
    }
  }

  return map;
}

function isTeamOrSide(row: Record<string, string>, team: string, side: string) {
  return normalize(row.Team ?? "") === normalize(team) || normalize(row.Side ?? "") === normalize(side);
}

function normalizeLane(role: string | undefined) {
  if (!role) {
    return null;
  }

  const normalized = normalize(role);
  if (normalized === "top") return "Top";
  if (normalized === "jungle") return "Jungle";
  if (normalized === "mid" || normalized === "middle") return "Mid";
  if (normalized === "bot" || normalized === "bottom" || normalized === "adc") return "Bot";
  if (normalized === "support" || normalized === "supp") return "Supp";
  return null;
}

function escapeCargoValue(value: string) {
  return value.replace(/"/g, '\\"');
}

function normalize(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}
