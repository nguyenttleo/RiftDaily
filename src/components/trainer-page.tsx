"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { SkillshotDodgeChallenge } from "@/types";

interface TrainerPageProps {
  dodge: SkillshotDodgeChallenge;
}

interface Projectile {
  id: number;
  ability: AbilityTemplate;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  width: number;
  length: number;
  speed: number;
  hit: boolean;
  nearMissed: boolean;
}

interface AbilityTemplate {
  id: string;
  champion: string;
  name: string;
  slot: string;
  speed: number;
  width: number;
  length: number;
  range: number;
  color: string;
  model: "beam" | "bolt" | "hook" | "rocket" | "fan-arrow" | "orb" | "spear" | "wave";
  iconUrl: string;
  projectiles?: number;
  fanDegrees?: number;
}

interface PlayerState {
  x: number;
  y: number;
}

export function TrainerPage({ dodge }: TrainerPageProps) {
  return <SkillshotDodgeTrainer challenge={dodge} />;
}

function SkillshotDodgeTrainer({ challenge }: { challenge: SkillshotDodgeChallenge }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const kennenRef = useRef<HTMLImageElement | null>(null);
  const [runId, setRunId] = useState(0);
  const abilityRotation = useMemo(() => createDailyAbilityRotation(challenge.date), [challenge.date]);
  const [hud, setHud] = useState({
    time: challenge.durationSeconds,
    hits: 0,
    dodges: 0,
    near: 0,
    score: 0,
    state: "ready",
    lastAbilities: [] as string[]
  });

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = KENNEN_MODEL_URL;
    kennenRef.current = image;
  }, []);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "r") {
        setRunId((id) => id + 1);
      }
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", keyDown);
    return () => {
      window.removeEventListener("keydown", keyDown);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const activeCanvas = canvas;
    const ctx = context;
    let projectileId = 0;
    let spawnIndex = 0;
    let nextSpawnMs = 350;
    let animation = 0;
    let last = performance.now();
    const start = last;
    const player: PlayerState = { x: challenge.arena.width / 2, y: challenge.arena.height / 2 };
    let moveTarget = { x: player.x, y: player.y };
    const projectiles: Projectile[] = [];
    const abilityLog: string[] = [];
    let hits = 0;
    let dodges = 0;
    let near = 0;

    setHud({ time: challenge.durationSeconds, hits: 0, dodges: 0, near: 0, score: 0, state: "running", lastAbilities: [] });

    function setTargetFromEvent(event: MouseEvent) {
      event.preventDefault();
      const rect = activeCanvas.getBoundingClientRect();
      moveTarget = {
        x: ((event.clientX - rect.left) / rect.width) * challenge.arena.width,
        y: ((event.clientY - rect.top) / rect.height) * challenge.arena.height
      };
    }

    function mouseDown(event: MouseEvent) {
      if (event.button === 2) {
        setTargetFromEvent(event);
      }
    }

    activeCanvas.addEventListener("contextmenu", setTargetFromEvent);
    activeCanvas.addEventListener("mousedown", mouseDown);

    function spawn(now: number) {
      const ability = abilityRotation[spawnIndex % abilityRotation.length];
      const side = spawnIndex % 4;
      const origin = spawnOrigin(side, spawnIndex, now, challenge.arena.width, challenge.arena.height);
      const driftX = Math.sin((now + spawnIndex * 379) / 900) * 70;
      const driftY = Math.cos((now + spawnIndex * 421) / 1100) * 55;
      const targetX = player.x + driftX;
      const targetY = player.y + driftY;
      const baseAngle = Math.atan2(targetY - origin.y, targetX - origin.x);
      const count = ability.projectiles ?? 1;
      const spread = ((ability.fanDegrees ?? 0) * Math.PI) / 180;

      for (let index = 0; index < count; index += 1) {
        const fanOffset = count === 1 ? 0 : -spread / 2 + (spread * index) / (count - 1);
        const angle = baseAngle + fanOffset;

        projectiles.push({
          id: projectileId,
          ability,
          x: origin.x,
          y: origin.y,
          vx: Math.cos(angle) * toArenaUnits(ability.speed),
          vy: Math.sin(angle) * toArenaUnits(ability.speed),
          angle,
          width: toArenaUnits(ability.width),
          length: toArenaUnits(ability.length),
          speed: toArenaUnits(ability.speed),
          hit: false,
          nearMissed: false
        });
        projectileId += 1;
      }

      abilityLog.unshift(`${ability.champion} ${ability.slot} - ${ability.name}`);
      abilityLog.splice(4);
      spawnIndex += 1;
    }

    function tick(now: number) {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const elapsed = now - start;
      const remaining = Math.max(0, challenge.durationSeconds - elapsed / 1000);

      if (remaining <= 0 || hits >= challenge.player.health) {
        const score = Math.max(0, Math.round((elapsed / 1000) * 100 + dodges * 50 + near * 25 - hits * 300 + (hits === 0 ? 500 : 0)));
        setHud({ time: remaining, hits, dodges, near, score, state: remaining <= 0 ? "survived" : "down", lastAbilities: abilityLog });
        draw(ctx, challenge, player, moveTarget, projectiles, true, kennenRef.current);
        return;
      }

      const dx = moveTarget.x - player.x;
      const dy = moveTarget.y - player.y;
      const distance = Math.hypot(dx, dy);
      const travel = Math.min(challenge.player.moveSpeed * dt, distance);

      if (distance > 1) {
        player.x += (dx / distance) * travel;
        player.y += (dy / distance) * travel;
      }

      player.x = Math.max(challenge.player.radius, Math.min(challenge.arena.width - challenge.player.radius, player.x));
      player.y = Math.max(challenge.player.radius, Math.min(challenge.arena.height - challenge.player.radius, player.y));

      while (elapsed >= nextSpawnMs) {
        spawn(now);
        nextSpawnMs += Math.max(520, 980 - spawnIndex * 12);
      }

      for (const projectile of projectiles) {
        projectile.x += projectile.vx * dt;
        projectile.y += projectile.vy * dt;

        const distance = distanceToProjectile(player, projectile);
        const hitRadius = projectile.width / 2 + challenge.player.radius;

        if (!projectile.hit && distance <= hitRadius) {
          projectile.hit = true;
          hits += 1;
        } else if (!projectile.hit && !projectile.nearMissed && distance <= hitRadius + 13) {
          near += 1;
          projectile.nearMissed = true;
        }
      }

      for (let index = projectiles.length - 1; index >= 0; index -= 1) {
        const projectile = projectiles[index];
        const retirementMargin = Math.max(900, projectile.length * 5);
        if (
          projectile.x < -retirementMargin ||
          projectile.x > challenge.arena.width + retirementMargin ||
          projectile.y < -retirementMargin ||
          projectile.y > challenge.arena.height + retirementMargin
        ) {
          if (!projectile.hit) {
            dodges += 1;
          }
          projectiles.splice(index, 1);
        }
      }

      const score = Math.max(0, Math.round((elapsed / 1000) * 100 + dodges * 50 + near * 25 - hits * 300));
      setHud({ time: remaining, hits, dodges, near, score, state: "running", lastAbilities: abilityLog });
      draw(ctx, challenge, player, moveTarget, projectiles, false, kennenRef.current);
      animation = requestAnimationFrame(tick);
    }

    animation = requestAnimationFrame(tick);
    return () => {
      activeCanvas.removeEventListener("contextmenu", setTargetFromEvent);
      activeCanvas.removeEventListener("mousedown", mouseDown);
      cancelAnimationFrame(animation);
    };
  }, [abilityRotation, challenge, runId]);

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 rounded-sm border border-[#3c3421] bg-[#071018] p-4">
      <TrainerHeader title={challenge.title} subtitle={`Kennen practice - Difficulty: ${challenge.difficulty}`} onRestart={() => setRunId((id) => id + 1)} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Hud label="Time" value={`${hud.time.toFixed(1)}s`} />
        <Hud label="Hits" value={`${hud.hits}/${challenge.player.health}`} />
        <Hud label="Dodges" value={String(hud.dodges)} />
        <Hud label="Near miss" value={String(hud.near)} />
        <Hud label="Score" value={String(hud.score)} />
      </div>
      <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="min-h-0 overflow-hidden rounded-sm border border-[#3c3421] bg-[#050607]">
          <canvas ref={canvasRef} width={challenge.arena.width} height={challenge.arena.height} className="h-full w-full" />
        </div>
        <aside className="hidden min-h-0 rounded-sm border border-[#2b2f38] bg-[#0b111b] p-3 xl:grid xl:grid-rows-[auto_auto_minmax(0,1fr)] xl:gap-3">
          <div>
            <div className="text-sm uppercase text-[#c89b3c]">Ability Pool</div>
            <div className="mt-1 text-xs text-[color:var(--muted)]">League-unit missile widths and speeds. Casts keep traveling until they leave the arena.</div>
          </div>
          <div className="rounded-sm border border-[#26313f] bg-[#111722] p-2">
            <div className="text-xs uppercase text-[color:var(--muted)]">Recent casts</div>
            <div className="mt-1 grid gap-1 text-xs">
              {hud.lastAbilities.length > 0 ? hud.lastAbilities.map((ability) => <span key={ability}>{ability}</span>) : <span>Entering lane...</span>}
            </div>
          </div>
          <div className="grid content-start gap-2 overflow-hidden">
            {abilityRotation.slice(0, 9).map((ability) => (
              <div key={ability.id} className="grid grid-cols-[2rem_1fr] items-center gap-2 rounded-sm border border-[#26313f] bg-[#111722] p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ability.iconUrl} alt="" className="h-8 w-8 rounded-sm border border-[#3c3421] object-contain" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{ability.champion} {ability.slot}</div>
                  <div className="truncate text-xs text-[color:var(--muted)]">{ability.name} - {ability.speed} speed</div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
      <div className="text-sm text-[color:var(--muted)]">Right-click inside the arena to move Kennen. Press R or Restart for another run.</div>
    </div>
  );
}

function TrainerHeader({ title, subtitle, onRestart }: { title: string; subtitle: string; onRestart: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="text-sm text-[color:var(--muted)]">{subtitle}</div>
      </div>
      <Button type="button" variant="secondary" onClick={onRestart} icon={<RotateCcw size={16} />}>
        Restart
      </Button>
    </div>
  );
}

function Hud({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[color:var(--line)] bg-white/5 p-3">
      <div className="text-xs uppercase text-[color:var(--muted)]">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

const KENNEN_MODEL_URL = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/characters/kennen/skins/base/kennenloadscreen.jpg";
const GAME_UNIT_TO_ARENA_PX = 0.32;

const DODGE_ABILITY_POOL: AbilityTemplate[] = [
  { id: "ezreal_r", champion: "Ezreal", name: "Trueshot Barrage", slot: "R", speed: 2000, width: 320, length: 260, range: 2500, color: "#7cc7ff", model: "wave", iconUrl: spellIconUrl("EzrealR") },
  { id: "morgana_q", champion: "Morgana", name: "Dark Binding", slot: "Q", speed: 1200, width: 140, length: 140, range: 1300, color: "#8b5cf6", model: "orb", iconUrl: spellIconUrl("MorganaQ") },
  { id: "ashe_w", champion: "Ashe", name: "Volley", slot: "W", speed: 2000, width: 48, length: 150, range: 1200, color: "#9bd8ff", model: "fan-arrow", iconUrl: spellIconUrl("Volley"), projectiles: 7, fanDegrees: 50 },
  { id: "lux_q", champion: "Lux", name: "Light Binding", slot: "Q", speed: 1200, width: 140, length: 140, range: 1300, color: "#f8eaa2", model: "beam", iconUrl: spellIconUrl("LuxLightBinding") },
  { id: "nidalee_q", champion: "Nidalee", name: "Javelin Toss", slot: "Q", speed: 1300, width: 80, length: 170, range: 1500, color: "#f5d36f", model: "spear", iconUrl: spellIconUrl("JavelinToss") },
  { id: "blitzcrank_q", champion: "Blitzcrank", name: "Rocket Grab", slot: "Q", speed: 1800, width: 140, length: 150, range: 1150, color: "#f0c76a", model: "hook", iconUrl: spellIconUrl("RocketGrab") },
  { id: "jinx_r", champion: "Jinx", name: "Super Mega Death Rocket!", slot: "R", speed: 1700, width: 140, length: 240, range: 2500, color: "#ff7aa8", model: "rocket", iconUrl: spellIconUrl("JinxR") },
  { id: "varus_q", champion: "Varus", name: "Piercing Arrow", slot: "Q", speed: 1900, width: 140, length: 220, range: 1625, color: "#c084fc", model: "spear", iconUrl: spellIconUrl("VarusQ") },
  { id: "jhin_w", champion: "Jhin", name: "Deadly Flourish", slot: "W", speed: 5000, width: 80, length: 260, range: 2500, color: "#f0ead6", model: "beam", iconUrl: spellIconUrl("JhinW") },
  { id: "velkoz_q", champion: "Vel'Koz", name: "Plasma Fission", slot: "Q", speed: 1300, width: 100, length: 150, range: 1050, color: "#d68cff", model: "bolt", iconUrl: spellIconUrl("VelkozQ") },
  { id: "xerath_e", champion: "Xerath", name: "Shocking Orb", slot: "E", speed: 1400, width: 120, length: 140, range: 1050, color: "#7dd3fc", model: "orb", iconUrl: spellIconUrl("XerathMageSpear") },
  { id: "zoe_e", champion: "Zoe", name: "Sleepy Trouble Bubble", slot: "E", speed: 1850, width: 100, length: 140, range: 900, color: "#ff9bd6", model: "orb", iconUrl: spellIconUrl("ZoeE") },
  { id: "thresh_q", champion: "Thresh", name: "Death Sentence", slot: "Q", speed: 1900, width: 140, length: 150, range: 1100, color: "#8ee6b8", model: "hook", iconUrl: spellIconUrl("ThreshQ") },
  { id: "ahri_e", champion: "Ahri", name: "Charm", slot: "E", speed: 1550, width: 120, length: 140, range: 975, color: "#ff8fb5", model: "bolt", iconUrl: spellIconUrl("AhriE") },
  { id: "kaisa_w", champion: "Kai'Sa", name: "Void Seeker", slot: "W", speed: 1750, width: 100, length: 200, range: 2500, color: "#b794f4", model: "bolt", iconUrl: spellIconUrl("KaisaW") },
  { id: "sejuani_r", champion: "Sejuani", name: "Glacial Prison", slot: "R", speed: 1600, width: 120, length: 180, range: 1300, color: "#a7f3ff", model: "spear", iconUrl: spellIconUrl("SejuaniR") },
  { id: "sivir_q", champion: "Sivir", name: "Boomerang Blade", slot: "Q", speed: 1350, width: 180, length: 220, range: 1250, color: "#e8c67d", model: "bolt", iconUrl: spellIconUrl("SivirQ") }
];

function spellIconUrl(id: string) {
  return `https://ddragon.leagueoflegends.com/cdn/16.11.1/img/spell/${id}.png`;
}

function toArenaUnits(value: number) {
  return value * GAME_UNIT_TO_ARENA_PX;
}

function draw(
  context: CanvasRenderingContext2D,
  challenge: SkillshotDodgeChallenge,
  player: PlayerState,
  moveTarget: { x: number; y: number },
  projectiles: Projectile[],
  ended: boolean,
  kennenImage: HTMLImageElement | null
) {
  context.clearRect(0, 0, challenge.arena.width, challenge.arena.height);

  const gradient = context.createRadialGradient(
    challenge.arena.width / 2,
    challenge.arena.height / 2,
    80,
    challenge.arena.width / 2,
    challenge.arena.height / 2,
    challenge.arena.width
  );
  gradient.addColorStop(0, "#10202a");
  gradient.addColorStop(0.56, "#081018");
  gradient.addColorStop(1, "#030506");
  context.fillStyle = gradient;
  context.fillRect(0, 0, challenge.arena.width, challenge.arena.height);

  context.save();
  context.globalAlpha = 0.28;
  context.fillStyle = "#19351f";
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(170, 0);
  context.lineTo(0, 115);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(challenge.arena.width, challenge.arena.height);
  context.lineTo(challenge.arena.width - 190, challenge.arena.height);
  context.lineTo(challenge.arena.width, challenge.arena.height - 125);
  context.closePath();
  context.fill();
  context.restore();

  context.strokeStyle = "rgba(200,155,60,.16)";
  context.lineWidth = 1;
  for (let x = 0; x < challenge.arena.width; x += 60) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, challenge.arena.height);
    context.stroke();
  }
  for (let y = 0; y < challenge.arena.height; y += 60) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(challenge.arena.width, y);
    context.stroke();
  }

  context.save();
  context.strokeStyle = "rgba(200,155,60,.7)";
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(moveTarget.x, moveTarget.y, 9, 0, Math.PI * 2);
  context.moveTo(moveTarget.x - 14, moveTarget.y);
  context.lineTo(moveTarget.x + 14, moveTarget.y);
  context.moveTo(moveTarget.x, moveTarget.y - 14);
  context.lineTo(moveTarget.x, moveTarget.y + 14);
  context.stroke();
  context.restore();

  for (const projectile of projectiles) {
    drawProjectile(context, projectile);
  }

  drawKennen(context, player, challenge.player.radius, ended, kennenImage);
}

function createDailyAbilityRotation(date: string) {
  const offset = hashString(date) % DODGE_ABILITY_POOL.length;
  return [...DODGE_ABILITY_POOL.slice(offset), ...DODGE_ABILITY_POOL.slice(0, offset)];
}

function spawnOrigin(side: number, index: number, now: number, width: number, height: number) {
  const laneSeed = now + index * 997;

  if (side === 0) return { x: -70, y: seededWave(laneSeed, height) };
  if (side === 1) return { x: width + 70, y: seededWave(laneSeed, height) };
  if (side === 2) return { x: seededWave(laneSeed, width), y: -70 };
  return { x: seededWave(laneSeed, width), y: height + 70 };
}

function distanceToProjectile(player: PlayerState, projectile: Projectile) {
  const tailX = projectile.x - Math.cos(projectile.angle) * projectile.length;
  const tailY = projectile.y - Math.sin(projectile.angle) * projectile.length;
  return distanceToSegment(player.x, player.y, tailX, tailY, projectile.x, projectile.y);
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

function drawProjectile(context: CanvasRenderingContext2D, projectile: Projectile) {
  const half = projectile.width / 2;
  const tail = projectile.length;
  const color = projectile.hit ? "#ff6b6b" : projectile.ability.color;

  context.save();
  context.translate(projectile.x, projectile.y);
  context.rotate(projectile.angle);
  context.globalAlpha = projectile.hit ? 0.48 : 1;
  context.shadowColor = color;
  context.shadowBlur = projectile.hit ? 2 : 14;
  context.fillStyle = hexToRgba(color, 0.72);
  context.strokeStyle = hexToRgba(color, 0.96);
  context.lineWidth = 2;

  drawCollisionCapsule(context, half, tail, color, projectile.hit);

  if (projectile.ability.model === "hook") {
    drawHookModel(context, half, tail, color);
  } else if (projectile.ability.model === "rocket") {
    drawRocketModel(context, half, tail);
  } else if (projectile.ability.model === "wave") {
    drawWaveModel(context, half, tail);
  } else if (projectile.ability.model === "orb") {
    drawOrbModel(context, half, tail, color);
  } else if (projectile.ability.model === "beam") {
    drawBeamModel(context, half, tail, color);
  } else {
    drawArrowModel(context, half, tail, color, projectile.ability.model === "spear");
  }

  context.restore();
}

function drawCollisionCapsule(context: CanvasRenderingContext2D, half: number, tail: number, color: string, hit: boolean) {
  context.save();
  context.shadowBlur = 0;
  context.globalAlpha = hit ? 0.18 : 0.2;
  context.fillStyle = hit ? "rgba(239,68,68,.24)" : hexToRgba(color, 0.18);
  context.strokeStyle = hit ? "rgba(252,165,165,.72)" : hexToRgba(color, 0.62);
  context.lineWidth = 1.5;
  context.setLineDash([7, 5]);
  capsulePath(context, -tail, 0, 0, 0, half);
  context.fill();
  context.stroke();
  context.restore();
}

function capsulePath(context: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, radius: number) {
  const angle = Math.atan2(by - ay, bx - ax);
  const normalX = Math.cos(angle + Math.PI / 2) * radius;
  const normalY = Math.sin(angle + Math.PI / 2) * radius;

  context.beginPath();
  context.moveTo(ax + normalX, ay + normalY);
  context.lineTo(bx + normalX, by + normalY);
  context.arc(bx, by, radius, angle + Math.PI / 2, angle - Math.PI / 2, true);
  context.lineTo(ax - normalX, ay - normalY);
  context.arc(ax, ay, radius, angle - Math.PI / 2, angle + Math.PI / 2, true);
  context.closePath();
}

function drawWaveModel(context: CanvasRenderingContext2D, half: number, tail: number) {
  context.beginPath();
  context.moveTo(-tail, -half * 0.65);
  context.quadraticCurveTo(-tail * 0.45, -half * 1.35, half * 0.95, 0);
  context.quadraticCurveTo(-tail * 0.45, half * 1.35, -tail, half * 0.65);
  context.quadraticCurveTo(-tail * 0.74, 0, -tail, -half * 0.65);
  context.closePath();
  context.fill();
  context.stroke();

  context.shadowBlur = 0;
  context.strokeStyle = hexToRgba("#ffffff", 0.42);
  context.lineWidth = Math.max(2, half * 0.12);
  context.beginPath();
  context.moveTo(-tail * 0.8, 0);
  context.quadraticCurveTo(-tail * 0.35, -half * 0.45, half * 0.42, 0);
  context.quadraticCurveTo(-tail * 0.35, half * 0.45, -tail * 0.8, 0);
  context.stroke();
}

function drawHookModel(context: CanvasRenderingContext2D, half: number, tail: number, color: string) {
  context.lineCap = "round";
  context.strokeStyle = hexToRgba(color, 0.74);
  context.lineWidth = Math.max(4, half * 0.3);
  context.beginPath();
  context.moveTo(-tail, 0);
  context.lineTo(-half * 0.85, 0);
  context.stroke();

  context.shadowBlur = 10;
  context.fillStyle = hexToRgba(color, 0.82);
  context.beginPath();
  context.moveTo(-half * 0.9, -half * 0.65);
  context.lineTo(half * 0.8, -half * 0.25);
  context.lineTo(half * 0.45, half * 0.08);
  context.lineTo(half * 0.92, half * 0.58);
  context.lineTo(half * 0.15, half * 0.72);
  context.lineTo(-half * 0.62, half * 0.18);
  context.lineTo(-half * 0.9, -half * 0.65);
  context.closePath();
  context.fill();
  context.stroke();
}

function drawRocketModel(context: CanvasRenderingContext2D, half: number, tail: number) {
  context.beginPath();
  context.moveTo(half * 0.9, 0);
  context.lineTo(half * 0.2, -half * 0.7);
  context.lineTo(-tail * 0.72, -half * 0.48);
  context.lineTo(-tail, -half * 0.95);
  context.lineTo(-tail * 0.86, 0);
  context.lineTo(-tail, half * 0.95);
  context.lineTo(-tail * 0.72, half * 0.48);
  context.lineTo(half * 0.2, half * 0.7);
  context.closePath();
  context.fill();
  context.stroke();

  context.shadowBlur = 0;
  context.fillStyle = hexToRgba("#ffffff", 0.34);
  context.fillRect(-tail * 0.55, -half * 0.16, tail * 0.42, half * 0.32);
  context.fillStyle = hexToRgba("#ffdf70", 0.86);
  context.beginPath();
  context.moveTo(-tail * 0.9, 0);
  context.lineTo(-tail * 1.2, -half * 0.35);
  context.lineTo(-tail * 1.12, half * 0.35);
  context.closePath();
  context.fill();
}

function drawOrbModel(context: CanvasRenderingContext2D, half: number, tail: number, color: string) {
  context.lineCap = "round";
  context.strokeStyle = hexToRgba(color, 0.42);
  context.lineWidth = Math.max(3, half * 0.22);
  context.beginPath();
  context.moveTo(-tail, 0);
  context.bezierCurveTo(-tail * 0.65, -half * 0.7, -tail * 0.24, half * 0.7, -half * 0.1, 0);
  context.stroke();

  context.fillStyle = hexToRgba(color, 0.78);
  context.beginPath();
  context.ellipse(0, 0, half, half * 0.82, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.shadowBlur = 0;
  context.fillStyle = hexToRgba("#ffffff", 0.48);
  context.beginPath();
  context.ellipse(half * 0.22, -half * 0.18, half * 0.24, half * 0.18, 0, 0, Math.PI * 2);
  context.fill();
}

function drawBeamModel(context: CanvasRenderingContext2D, half: number, tail: number, color: string) {
  context.lineCap = "round";
  context.strokeStyle = hexToRgba(color, 0.82);
  context.lineWidth = Math.max(5, half * 1.22);
  context.beginPath();
  context.moveTo(-tail, 0);
  context.lineTo(0, 0);
  context.stroke();

  context.shadowBlur = 0;
  context.strokeStyle = hexToRgba("#ffffff", 0.52);
  context.lineWidth = Math.max(2, half * 0.28);
  context.beginPath();
  context.moveTo(-tail * 0.9, 0);
  context.lineTo(-half * 0.1, 0);
  context.stroke();
}

function drawArrowModel(context: CanvasRenderingContext2D, half: number, tail: number, color: string, spear: boolean) {
  const point = spear ? half * 1.15 : half * 0.9;
  context.beginPath();
  context.moveTo(point, 0);
  context.lineTo(-half * 0.16, -half);
  context.lineTo(-tail, -half * 0.34);
  context.lineTo(-tail, half * 0.34);
  context.lineTo(-half * 0.16, half);
  context.closePath();
  context.fill();
  context.stroke();

  context.shadowBlur = 0;
  context.strokeStyle = hexToRgba("#ffffff", 0.38);
  context.lineWidth = Math.max(1.5, half * 0.12);
  context.beginPath();
  context.moveTo(-tail * 0.84, 0);
  context.lineTo(-half * 0.1, 0);
  context.stroke();
}

function drawKennen(
  context: CanvasRenderingContext2D,
  player: PlayerState,
  radius: number,
  ended: boolean,
  kennenImage: HTMLImageElement | null
) {
  const avatarRadius = radius * 1.65;

  context.save();
  context.globalAlpha = ended ? 0.58 : 1;
  context.shadowColor = "#5eead4";
  context.shadowBlur = ended ? 0 : 16;
  context.beginPath();
  context.arc(player.x, player.y, avatarRadius, 0, Math.PI * 2);
  context.clip();

  if (kennenImage?.complete && kennenImage.naturalWidth > 0) {
    const sourceSize = Math.min(kennenImage.naturalWidth, kennenImage.naturalHeight * 0.62);
    const sourceX = (kennenImage.naturalWidth - sourceSize) / 2;
    const sourceY = Math.max(0, kennenImage.naturalHeight * 0.16);
    context.drawImage(
      kennenImage,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      player.x - avatarRadius,
      player.y - avatarRadius,
      avatarRadius * 2,
      avatarRadius * 2
    );
  } else {
    context.fillStyle = "#192b2f";
    context.fillRect(player.x - avatarRadius, player.y - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    context.fillStyle = "#c89b3c";
    context.font = "bold 16px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("K", player.x, player.y);
  }
  context.restore();

  context.save();
  context.strokeStyle = ended ? "#8c95a3" : "#c89b3c";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(player.x, player.y, avatarRadius, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([4, 5]);
  context.strokeStyle = "rgba(94,234,212,.7)";
  context.beginPath();
  context.arc(player.x, player.y, radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function seededWave(now: number, max: number) {
  return Math.max(36, Math.min(max - 36, ((Math.sin(now / 733) + 1) / 2) * max));
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const red = Number.parseInt(clean.slice(0, 2), 16);
  const green = Number.parseInt(clean.slice(2, 4), 16);
  const blue = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}
