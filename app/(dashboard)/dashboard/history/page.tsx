"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp, TrendingDown, Target, Percent } from "lucide-react";

interface HistoricalAlert {
  id: string;
  playerName: string;
  statType: string;
  edgeScore: number;
  pregameLine: number;
  finalValue: number | null;
  status: "hit" | "missed" | "push";
  gameName: string;
  createdAt: string;
  resolvedAt: string | null;
}

interface Stats {
  totalAlerts: number;
  hits: number;
  misses: number;
  pushes: number;
  hitRate: number;
  avgEdgeScore: number;
}

export default function HistoryPage() {
  const [alerts, setAlerts] = useState<HistoricalAlert[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("7d");

  useEffect(() => {
    fetchHistory();
  }, [timeRange]);

  const fetchHistory = async () => {
    try {
      const response = await fetch(`/api/alerts/history?range=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts || []);
        setStats(data.stats || null);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Alert History</h1>
          <p className="text-muted-foreground">
            Track performance of past edge alerts
          </p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="card-leather">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{stats.totalAlerts}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="card-leather">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Hit Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Percent className="h-5 w-5 text-forest-500" />
                <span className="text-2xl font-bold">
                  {stats.hitRate.toFixed(1)}%
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="card-leather">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Hits / Misses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-forest-500" />
                <span className="text-2xl font-bold text-forest-600">
                  {stats.hits}
                </span>
                <span className="text-muted-foreground">/</span>
                <TrendingDown className="h-5 w-5 text-destructive" />
                <span className="text-2xl font-bold text-destructive">
                  {stats.misses}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="card-leather">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Edge Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">
                  {stats.avgEdgeScore.toFixed(2)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* History Table */}
      <Card className="card-leather">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Stat</TableHead>
                <TableHead>Edge</TableHead>
                <TableHead>Line</TableHead>
                <TableHead>Final</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Game</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : alerts.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No historical alerts found for this time range.
                  </TableCell>
                </TableRow>
              ) : (
                alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell className="font-medium">
                      {alert.playerName}
                    </TableCell>
                    <TableCell>{formatStatType(alert.statType)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          alert.edgeScore >= 3
                            ? "gold"
                            : alert.edgeScore >= 2
                              ? "forest"
                              : "whiskey"
                        }
                      >
                        {alert.edgeScore.toFixed(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>{alert.pregameLine}</TableCell>
                    <TableCell>
                      {alert.finalValue !== null ? alert.finalValue : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          alert.status === "hit"
                            ? "forest"
                            : alert.status === "missed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {alert.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {alert.gameName}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(alert.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
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
