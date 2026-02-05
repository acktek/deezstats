"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { GameScoreboard } from "@/components/dashboard/game-scoreboard";
import { MonitoringTable } from "@/components/dashboard/monitoring-table";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface VendorLine {
  vendor: string;
  line: number;
}

interface MonitoringData {
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
  players: {
    id: string;
    name: string;
    team: string;
    position: string;
    lines: {
      statType: string;
      pregameLine: number;
      vendorLines?: VendorLine[];
      currentValue: number;
      projectedPace: number;
      edgeScore: number;
      mateoScore: number;
      seasonAverage: number | null;
    }[];
  }[];
  alerts: {
    id: string;
    playerName: string;
    statType: string;
    edgeScore: number;
    message: string;
    createdAt: string;
  }[];
}

export default function GameMonitoringPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const gameId = params.gameId as string;

  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchMonitoringData = useCallback(async () => {
    try {
      const response = await fetch(`/api/games/${gameId}/monitor`);
      if (response.ok) {
        const newData: MonitoringData = await response.json();
        setData(newData);
        setLastUpdated(new Date());
      } else if (response.status === 404) {
        toast({
          title: "Game not found",
          description: "This game doesn't exist or has been removed.",
          variant: "destructive",
        });
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Failed to fetch monitoring data:", error);
      toast({
        title: "Error",
        description: "Failed to load game data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [gameId, router, toast]);

  const syncGame = async () => {
    setSyncing(true);
    try {
      await fetch(`/api/games/${gameId}/sync`, { method: "POST" });
      await fetchMonitoringData();
      toast({
        title: "Synced",
        description: "Game data has been refreshed.",
      });
    } catch (error) {
      console.error("Failed to sync game:", error);
      toast({
        title: "Sync failed",
        description: "Could not refresh game data.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchMonitoringData();
  }, [fetchMonitoringData]);

  // Auto-refresh for live games
  useEffect(() => {
    // Clear any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    // Set up auto-refresh only for live games
    if (data?.game.status === "in_progress") {
      refreshIntervalRef.current = setInterval(() => {
        fetchMonitoringData();
      }, 10000); // 10 second refresh
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [data?.game.status, fetchMonitoringData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground text-lg mb-4">Game not found</p>
        <Button onClick={() => router.push("/dashboard")}>
          Back to Games
        </Button>
      </div>
    );
  }

  const isLive = data.game.status === "in_progress";
  const isScheduled = data.game.status === "scheduled";
  const totalEdges = data.players.reduce(
    (sum, p) => sum + p.lines.filter((l) => l.edgeScore >= 1.5).length,
    0
  );
  const strongEdges = data.players.reduce(
    (sum, p) => sum + p.lines.filter((l) => l.edgeScore >= 2.0).length,
    0
  );
  const totalLines = data.players.reduce((sum, p) => sum + p.lines.length, 0);
  const uniqueVendors = new Set(
    data.players.flatMap(p => p.lines.flatMap(l => (l.vendorLines || []).map(vl => vl.vendor)))
  );

  return (
    <div className="space-y-6">
      {/* Scoreboard Header */}
      <GameScoreboard
        game={data.game}
        onSync={syncGame}
        syncing={syncing}
      />

      {/* Stats Summary */}
      {isLive && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
          <span>
            {data.players.length} players
          </span>
          <span className="text-muted-foreground/50">|</span>
          <span className={totalEdges > 0 ? "text-yellow-500" : ""}>
            {totalEdges} edges
          </span>
          {strongEdges > 0 && (
            <>
              <span className="text-muted-foreground/50">|</span>
              <span className="text-green-500 font-medium">
                {strongEdges} strong
              </span>
            </>
          )}
          {uniqueVendors.size > 0 && (
            <>
              <span className="text-muted-foreground/50">|</span>
              <span>{uniqueVendors.size} sportsbooks</span>
            </>
          )}
          {lastUpdated && (
            <>
              <span className="hidden sm:inline text-muted-foreground/50">|</span>
              <span className="hidden sm:inline">
                Updated: {lastUpdated.toLocaleTimeString()}
              </span>
            </>
          )}
          <span className="text-muted-foreground/50">|</span>
          <span className="text-primary">
            <span className="hidden sm:inline">Auto-refresh </span>10s
          </span>
        </div>
      )}

      {/* Pre-game Summary */}
      {isScheduled && data.players.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
          <span>{data.players.length} players</span>
          <span className="text-muted-foreground/50">|</span>
          <span>{totalLines} lines</span>
          {uniqueVendors.size > 0 && (
            <>
              <span className="text-muted-foreground/50">|</span>
              <span>{uniqueVendors.size} sportsbooks</span>
            </>
          )}
        </div>
      )}

      {/* Main Content: Table and Alerts */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr,300px] xl:grid-cols-[1fr,350px]">
        {/* Monitoring Table */}
        <div className="min-w-0 order-2 lg:order-1">
          <MonitoringTable
            players={data.players}
            homeTeam={data.game.homeTeam.name}
            awayTeam={data.game.awayTeam.name}
            gameStatus={data.game.status}
          />
        </div>

        {/* Alerts Panel */}
        <div className="order-1 lg:order-2 lg:sticky lg:top-6 lg:self-start">
          <AlertsPanel alerts={data.alerts} />
        </div>
      </div>

      {/* Empty State for Scheduled Games */}
      {data.game.status === "scheduled" && data.players.length === 0 && (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <p className="text-muted-foreground text-lg mb-2">
            No player props available yet
          </p>
          <p className="text-muted-foreground text-sm">
            Props and season averages will appear once sportsbooks publish lines
          </p>
        </div>
      )}

      {/* No Lines Warning */}
      {data.players.length === 0 && data.game.status !== "scheduled" && (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <p className="text-muted-foreground text-lg mb-2">
            No player lines configured
          </p>
          <p className="text-muted-foreground text-sm mb-4">
            Add betting lines to track player performance
          </p>
          <Button variant="outline" onClick={syncGame}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync Game Data
          </Button>
        </div>
      )}
    </div>
  );
}
