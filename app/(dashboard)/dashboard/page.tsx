"use client";

import { useEffect, useState, useCallback } from "react";
import { GamePicker } from "@/components/dashboard/game-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

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

interface GameWithEdges {
  game: GameInfo;
  edges: any[];
}

export default function DashboardPage() {
  const [sport, setSport] = useState<Sport>("all");
  const [games, setGames] = useState<GameInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchGames = useCallback(async () => {
    try {
      const response = await fetch(`/api/games/live?sport=${sport}`);
      if (response.ok) {
        const data = await response.json();
        // Extract just the game info from the response
        const gamesList: GameInfo[] = (data.games || []).map((g: GameWithEdges) => ({
          id: g.game.id,
          espnId: g.game.espnId,
          sport: g.game.sport,
          homeTeam: g.game.homeTeam,
          homeTeamLogo: g.game.homeTeamLogo,
          homeScore: g.game.homeScore,
          awayTeam: g.game.awayTeam,
          awayTeamLogo: g.game.awayTeamLogo,
          awayScore: g.game.awayScore,
          status: g.game.status,
          period: g.game.period,
          timeRemaining: g.game.timeRemaining,
          startTime: g.game.startTime,
          gameElapsedPercent: g.game.gameElapsedPercent,
        }));
        setGames(gamesList);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch games:", error);
    } finally {
      setLoading(false);
    }
  }, [sport]);

  useEffect(() => {
    setLoading(true);
    fetchGames();

    // Set up SSE connection for real-time updates
    let eventSource: EventSource | null = null;
    let pollInterval: NodeJS.Timeout | null = null;

    try {
      eventSource = new EventSource(`/api/games/live/stream?sport=${sport}`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.games) {
            const gamesList: GameInfo[] = data.games.map((g: GameWithEdges) => ({
              id: g.game.id,
              espnId: g.game.espnId,
              sport: g.game.sport,
              homeTeam: g.game.homeTeam,
              homeTeamLogo: g.game.homeTeamLogo,
              homeScore: g.game.homeScore,
              awayTeam: g.game.awayTeam,
              awayTeamLogo: g.game.awayTeamLogo,
              awayScore: g.game.awayScore,
              status: g.game.status,
              period: g.game.period,
              timeRemaining: g.game.timeRemaining,
              startTime: g.game.startTime,
              gameElapsedPercent: g.game.gameElapsedPercent,
            }));
            setGames(gamesList);
            setLastUpdated(new Date());
          }
        } catch (e) {
          console.error("Error parsing SSE data:", e);
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        // Fall back to polling
        pollInterval = setInterval(fetchGames, 30000);
      };
    } catch (error) {
      // SSE not supported, fall back to polling
      pollInterval = setInterval(fetchGames, 30000);
    }

    return () => {
      eventSource?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [sport, fetchGames]);

  const liveCount = games.filter((g) => g.status === "in_progress").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Select a Game</h1>
          <p className="text-muted-foreground">
            Choose a game to monitor player stats and edges in real-time
          </p>
        </div>

        <div className="flex items-center gap-3">
          {liveCount > 0 && (
            <Badge variant="live" className="gap-1.5">
              <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
              {liveCount} Live
            </Badge>
          )}
          {lastUpdated && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              fetchGames();
            }}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Game Picker */}
      <GamePicker
        games={games}
        loading={loading}
        selectedSport={sport}
        onSportChange={setSport}
      />
    </div>
  );
}
