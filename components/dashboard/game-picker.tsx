"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Sport = "nba" | "nfl" | "all";

interface GameInfo {
  id: string;
  espnId: string;
  sport: "nba" | "nfl";
  homeTeam: string;
  homeTeamLogo?: string;
  homeScore: number;
  awayTeam: string;
  awayTeamLogo?: string;
  awayScore: number;
  status: "scheduled" | "in_progress" | "final" | "postponed";
  period: number;
  timeRemaining: string;
  startTime: string;
  gameElapsedPercent: number;
}

interface GamePickerProps {
  games: GameInfo[];
  loading?: boolean;
  selectedSport: Sport;
  onSportChange: (sport: Sport) => void;
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
    return "Final";
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

function getStatusBadge(status: string, period: number, timeRemaining: string, sport: string) {
  if (status === "in_progress") {
    const periodLabel = sport === "nfl" ? `Q${period}` : `Q${period}`;
    return (
      <Badge variant="live" className="animate-pulse">
        LIVE {periodLabel} {timeRemaining}
      </Badge>
    );
  }
  if (status === "final") {
    return <Badge variant="secondary">FINAL</Badge>;
  }
  if (status === "postponed") {
    return <Badge variant="destructive">PPD</Badge>;
  }
  return null;
}

export function GamePicker({ games, loading, selectedSport, onSportChange }: GamePickerProps) {
  const router = useRouter();

  const filteredGames = selectedSport === "all"
    ? games
    : games.filter((g) => g.sport === selectedSport);

  const liveGames = filteredGames.filter((g) => g.status === "in_progress");
  const scheduledGames = filteredGames.filter((g) => g.status === "scheduled");
  const completedGames = filteredGames.filter((g) => g.status === "final");

  const handleGameClick = (game: GameInfo) => {
    router.push(`/dashboard/game/${game.espnId}`);
  };

  return (
    <div className="space-y-6">
      {/* Sport Filter */}
      <Tabs value={selectedSport} onValueChange={(v) => onSportChange(v as Sport)}>
        <TabsList>
          <TabsTrigger value="all">All Games</TabsTrigger>
          <TabsTrigger value="nba">NBA</TabsTrigger>
          <TabsTrigger value="nfl">NFL</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Loading State */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="h-36 animate-pulse bg-muted" />
          ))}
        </div>
      )}

      {/* Live Games */}
      {!loading && liveGames.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <h2 className="font-semibold text-lg">Live Now</h2>
            <span className="text-muted-foreground text-sm">({liveGames.length})</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {liveGames.map((game) => (
              <GamePickerCard key={game.id} game={game} onClick={() => handleGameClick(game)} />
            ))}
          </div>
        </section>
      )}

      {/* Scheduled Games */}
      {!loading && scheduledGames.length > 0 && (
        <section>
          <h2 className="font-semibold text-lg mb-4">
            Upcoming <span className="text-muted-foreground text-sm">({scheduledGames.length})</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {scheduledGames.map((game) => (
              <GamePickerCard key={game.id} game={game} onClick={() => handleGameClick(game)} />
            ))}
          </div>
        </section>
      )}

      {/* Completed Games */}
      {!loading && completedGames.length > 0 && (
        <section>
          <h2 className="font-semibold text-lg mb-4 text-muted-foreground">
            Completed <span className="text-sm">({completedGames.length})</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {completedGames.map((game) => (
              <GamePickerCard key={game.id} game={game} onClick={() => handleGameClick(game)} />
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {!loading && filteredGames.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-lg">No games scheduled for today</p>
          <p className="text-muted-foreground text-sm mt-2">Check back later for upcoming games</p>
        </div>
      )}
    </div>
  );
}

interface GamePickerCardProps {
  game: GameInfo;
  onClick: () => void;
}

function GamePickerCard({ game, onClick }: GamePickerCardProps) {
  const isLive = game.status === "in_progress";
  const isScheduled = game.status === "scheduled";

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:border-primary/50 hover:shadow-md",
        isLive && "ring-2 ring-red-500/20 border-red-500/30"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Status Row */}
        <div className="flex items-center justify-between mb-3">
          {isScheduled ? (
            <span className="text-sm font-medium text-muted-foreground">
              {formatGameTime(game.startTime, game.status)}
            </span>
          ) : (
            getStatusBadge(game.status, game.period, game.timeRemaining, game.sport)
          )}
          <span className="text-xs text-muted-foreground uppercase font-medium">
            {game.sport}
          </span>
        </div>

        {/* Teams */}
        <div className="space-y-2">
          {/* Away Team */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {game.awayTeamLogo && (
                <img
                  src={game.awayTeamLogo}
                  alt=""
                  className="h-6 w-6 object-contain flex-shrink-0"
                />
              )}
              <span className="font-medium truncate">{game.awayTeam}</span>
            </div>
            {!isScheduled && (
              <span className="text-lg font-bold ml-2">{game.awayScore}</span>
            )}
          </div>

          {/* Home Team */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {game.homeTeamLogo && (
                <img
                  src={game.homeTeamLogo}
                  alt=""
                  className="h-6 w-6 object-contain flex-shrink-0"
                />
              )}
              <span className="font-medium truncate">{game.homeTeam}</span>
            </div>
            {!isScheduled && (
              <span className="text-lg font-bold ml-2">{game.homeScore}</span>
            )}
          </div>
        </div>

        {/* Progress Bar for Live Games */}
        {isLive && (
          <div className="mt-3">
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all"
                style={{ width: `${game.gameElapsedPercent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1 text-center">
              {Math.round(game.gameElapsedPercent)}% complete
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
