"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, getEdgeClass, getEdgeLabel } from "@/lib/utils";

interface LiveGame {
  espnId: string;
  sport: "nba" | "nfl";
  status: "scheduled" | "in_progress" | "final";
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  startTime: string;
  period: number;
  timeRemaining?: string;
  gameElapsedPercent: number;
}

interface PlayerEdge {
  playerId: string;
  playerName: string;
  team: string;
  statType: string;
  currentValue: number;
  pace: number;
  pregameLine: number;
  edgeScore: number;
}

interface GameCardProps {
  game: LiveGame;
  playerEdges?: PlayerEdge[];
  onPlayerClick?: (playerId: string) => void;
}

function formatGameTime(dateStr: string, status: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (status === "final") {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  if (isToday) {
    return timeStr;
  } else if (isTomorrow) {
    return `Tomorrow ${timeStr}`;
  } else {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
}

export function GameCard({ game, playerEdges = [], onPlayerClick }: GameCardProps) {
  const router = useRouter();
  const isLive = game.status === "in_progress";
  const isScheduled = game.status === "scheduled";
  const topEdges = playerEdges
    .filter((e) => e.edgeScore >= 1.5)
    .slice(0, 3);

  const handleClick = () => {
    router.push(`/dashboard/game/${game.espnId}`);
  };

  return (
    <Card
      className="card-leather overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
      onClick={handleClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isLive ? (
              <>
                <Badge variant="live">LIVE</Badge>
                <span className="text-sm text-muted-foreground">
                  {game.period > 0 ? `Q${game.period}` : ""} {game.timeRemaining}
                </span>
              </>
            ) : isScheduled ? (
              <span className="text-sm font-medium">
                {formatGameTime(game.startTime, game.status)}
              </span>
            ) : (
              <>
                <Badge variant="secondary">FINAL</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatGameTime(game.startTime, game.status)}
                </span>
              </>
            )}
          </div>
          <span className="text-xs text-muted-foreground uppercase">
            {game.sport}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Scoreboard */}
        <div className="flex items-center justify-between">
          {/* Away Team */}
          <div className="flex items-center gap-3 flex-1">
            {game.awayTeamLogo && (
              <Image
                src={game.awayTeamLogo}
                alt={game.awayTeam}
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
                unoptimized
              />
            )}
            <div>
              <p className="font-medium truncate max-w-[120px]">
                {game.awayTeam}
              </p>
              {!isScheduled && (
                <p className="text-2xl font-bold">{game.awayScore}</p>
              )}
            </div>
          </div>

          {/* VS / @ */}
          <div className="px-4">
            <span className="text-muted-foreground text-sm">
              {isScheduled ? "vs" : "@"}
            </span>
          </div>

          {/* Home Team */}
          <div className="flex items-center gap-3 flex-1 justify-end text-right">
            <div>
              <p className="font-medium truncate max-w-[120px]">
                {game.homeTeam}
              </p>
              {!isScheduled && (
                <p className="text-2xl font-bold">{game.homeScore}</p>
              )}
            </div>
            {game.homeTeamLogo && (
              <Image
                src={game.homeTeamLogo}
                alt={game.homeTeam}
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
                unoptimized
              />
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {isLive && (
          <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-primary/60 rounded-full transition-all"
              style={{ width: `${game.gameElapsedPercent}%` }}
            />
          </div>
        )}

        {/* Player Edges */}
        {topEdges.length > 0 && (
          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Active Edges
            </p>
            {topEdges.map((edge) => (
              <button
                key={`${edge.playerId}-${edge.statType}`}
                onClick={() => onPlayerClick?.(edge.playerId)}
                className="w-full flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{edge.playerName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatStatType(edge.statType)}: {edge.currentValue} (pace:{" "}
                    {edge.pace.toFixed(1)})
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Line: {edge.pregameLine}
                  </span>
                  <Badge
                    className={cn(
                      "text-xs",
                      getEdgeClass(edge.edgeScore)
                    )}
                  >
                    {getEdgeLabel(edge.edgeScore)} ({edge.edgeScore.toFixed(1)})
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatStatType(statType: string): string {
  const labels: Record<string, string> = {
    receiving_yards: "Rec Yds",
    rushing_yards: "Rush Yds",
    receptions: "Rec",
    passing_yards: "Pass Yds",
    touchdowns: "TD",
    points: "Pts",
    rebounds: "Reb",
    assists: "Ast",
    three_pointers: "3PM",
    steals: "Stl",
    blocks: "Blk",
  };
  return labels[statType] || statType;
}
