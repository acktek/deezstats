"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface GameScoreboardProps {
  game: {
    id: string;
    sport: "nba" | "nfl";
    homeTeam: { name: string; logo?: string; score: number };
    awayTeam: { name: string; logo?: string; score: number };
    status: "scheduled" | "in_progress" | "final" | "postponed";
    period: number;
    timeRemaining: string;
    gameElapsedPercent: number;
  };
  onSync: () => void;
  syncing?: boolean;
  onSettingsClick?: () => void;
}

export function GameScoreboard({ game, onSync, syncing, onSettingsClick }: GameScoreboardProps) {
  const router = useRouter();
  const isLive = game.status === "in_progress";
  const isScheduled = game.status === "scheduled";

  const getPeriodLabel = () => {
    if (game.sport === "nba") {
      if (game.period <= 4) return `Q${game.period}`;
      return `OT${game.period - 4}`;
    } else {
      if (game.period <= 4) return `Q${game.period}`;
      return `OT`;
    }
  };

  return (
    <Card className="card-leather">
      <CardContent className="py-4">
        {/* Top Bar: Navigation and Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard")}
            className="gap-2 w-fit"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Games</span>
            <span className="sm:hidden">Back</span>
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Badge */}
            {isLive ? (
              <Badge variant="live" className="animate-pulse">
                LIVE
              </Badge>
            ) : isScheduled ? (
              <Badge variant="outline">UPCOMING</Badge>
            ) : game.status === "postponed" ? (
              <Badge variant="destructive">POSTPONED</Badge>
            ) : (
              <Badge variant="secondary">FINAL</Badge>
            )}

            {/* Period/Time */}
            {isLive && (
              <span className="text-sm text-muted-foreground">
                {getPeriodLabel()} {game.timeRemaining}
              </span>
            )}

            {/* Sport Badge */}
            <Badge variant="outline" className="uppercase">
              {game.sport}
            </Badge>

            {/* Actions */}
            <Button
              variant="outline"
              size="sm"
              onClick={onSync}
              disabled={syncing}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              <span className="hidden sm:inline">{syncing ? "Syncing..." : "Sync Now"}</span>
              <span className="sm:hidden">{syncing ? "..." : "Sync"}</span>
            </Button>

            {onSettingsClick && (
              <Button variant="ghost" size="icon" onClick={onSettingsClick}>
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Scoreboard */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 py-4">
          {/* Away Team */}
          <div className="flex items-center gap-3 sm:gap-4 sm:flex-1 sm:justify-end">
            <div className="text-center sm:text-right order-2 sm:order-1">
              <p className="text-base sm:text-lg font-semibold">{game.awayTeam.name}</p>
              {!isScheduled && (
                <p className="text-3xl sm:text-4xl font-bold tabular-nums">{game.awayTeam.score}</p>
              )}
            </div>
            {game.awayTeam.logo && (
              <Image
                src={game.awayTeam.logo}
                alt={game.awayTeam.name}
                width={64}
                height={64}
                className="h-12 w-12 sm:h-16 sm:w-16 object-contain order-1 sm:order-2"
                unoptimized
              />
            )}
          </div>

          {/* Divider */}
          <div className="flex flex-col items-center px-2 sm:px-4">
            <span className="text-xl sm:text-2xl text-muted-foreground font-light">@</span>
          </div>

          {/* Home Team */}
          <div className="flex items-center gap-3 sm:gap-4 sm:flex-1">
            {game.homeTeam.logo && (
              <Image
                src={game.homeTeam.logo}
                alt={game.homeTeam.name}
                width={64}
                height={64}
                className="h-12 w-12 sm:h-16 sm:w-16 object-contain"
                unoptimized
              />
            )}
            <div className="text-center sm:text-left">
              <p className="text-base sm:text-lg font-semibold">{game.homeTeam.name}</p>
              {!isScheduled && (
                <p className="text-3xl sm:text-4xl font-bold tabular-nums">{game.homeTeam.score}</p>
              )}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        {isLive && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Game Progress</span>
              <span>{Math.round(game.gameElapsedPercent)}% elapsed</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${game.gameElapsedPercent}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
