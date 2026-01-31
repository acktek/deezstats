"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  TrendingUp,
} from "lucide-react";
import { cn, getEdgeClass, getEdgeLabel } from "@/lib/utils";

interface PlayerLine {
  statType: string;
  pregameLine: number;
  currentValue: number;
  projectedPace: number;
  edgeScore: number;
  mateoScore: number;
  seasonAverage: number | null;
}

interface MonitoringPlayer {
  id: string;
  name: string;
  team: string;
  position: string;
  lines: PlayerLine[];
}

interface MonitoringTableProps {
  players: MonitoringPlayer[];
  homeTeam: string;
  awayTeam: string;
}

type SortField = "name" | "team" | "statType" | "line" | "current" | "pace" | "edge" | "mateo" | "seasonAvg";
type SortDirection = "asc" | "desc";

const statLabels: Record<string, string> = {
  passing_yards: "Pass Yds",
  rushing_yards: "Rush Yds",
  receiving_yards: "Rec Yds",
  receptions: "Rec",
  touchdowns: "TDs",
  points: "Points",
  rebounds: "Rebounds",
  assists: "Assists",
  three_pointers: "3PM",
  steals: "Steals",
  blocks: "Blocks",
};

// Flatten player data into rows for the table
interface TableRow {
  playerId: string;
  playerName: string;
  team: string;
  position: string;
  statType: string;
  pregameLine: number;
  currentValue: number;
  projectedPace: number;
  edgeScore: number;
  mateoScore: number;
  seasonAverage: number | null;
}

export function MonitoringTable({ players, homeTeam, awayTeam }: MonitoringTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState<"all" | "home" | "away">("all");
  const [statFilter, setStatFilter] = useState<string>("all");
  const [edgeFilter, setEdgeFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("edge");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Flatten players into rows
  const rows: TableRow[] = useMemo(() => {
    const result: TableRow[] = [];
    for (const player of players) {
      for (const line of player.lines) {
        result.push({
          playerId: player.id,
          playerName: player.name,
          team: player.team,
          position: player.position,
          statType: line.statType,
          pregameLine: line.pregameLine,
          currentValue: line.currentValue,
          projectedPace: line.projectedPace,
          edgeScore: line.edgeScore,
          mateoScore: line.mateoScore,
          seasonAverage: line.seasonAverage,
        });
      }
    }
    return result;
  }, [players]);

  // Get unique stat types for filter
  const statTypes = useMemo(() => {
    const types = new Set(rows.map((r) => r.statType));
    return Array.from(types);
  }, [rows]);

  // Filter and sort rows
  const filteredRows = useMemo(() => {
    let result = [...rows];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.playerName.toLowerCase().includes(query) ||
          r.team.toLowerCase().includes(query)
      );
    }

    // Team filter
    if (teamFilter === "home") {
      result = result.filter((r) =>
        r.team.toLowerCase().includes(homeTeam.toLowerCase().split(" ").pop() || "")
      );
    } else if (teamFilter === "away") {
      result = result.filter((r) =>
        r.team.toLowerCase().includes(awayTeam.toLowerCase().split(" ").pop() || "")
      );
    }

    // Stat filter
    if (statFilter !== "all") {
      result = result.filter((r) => r.statType === statFilter);
    }

    // Edge filter
    if (edgeFilter === "monitor") {
      result = result.filter((r) => r.edgeScore >= 1.5);
    } else if (edgeFilter === "good") {
      result = result.filter((r) => r.edgeScore >= 2.0);
    } else if (edgeFilter === "strong") {
      result = result.filter((r) => r.edgeScore >= 3.0);
    }

    // Sort
    result.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case "name":
          aVal = a.playerName;
          bVal = b.playerName;
          break;
        case "team":
          aVal = a.team;
          bVal = b.team;
          break;
        case "statType":
          aVal = a.statType;
          bVal = b.statType;
          break;
        case "line":
          aVal = a.pregameLine;
          bVal = b.pregameLine;
          break;
        case "current":
          aVal = a.currentValue;
          bVal = b.currentValue;
          break;
        case "pace":
          aVal = a.projectedPace;
          bVal = b.projectedPace;
          break;
        case "edge":
          aVal = a.edgeScore;
          bVal = b.edgeScore;
          break;
        case "mateo":
          aVal = a.mateoScore;
          bVal = b.mateoScore;
          break;
        case "seasonAvg":
          aVal = a.seasonAverage ?? -1;
          bVal = b.seasonAverage ?? -1;
          break;
        default:
          aVal = a.edgeScore;
          bVal = b.edgeScore;
      }

      if (typeof aVal === "string") {
        const comparison = aVal.localeCompare(bVal);
        return sortDirection === "asc" ? comparison : -comparison;
      }

      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });

    return result;
  }, [rows, searchQuery, teamFilter, statFilter, edgeFilter, sortField, sortDirection, homeTeam, awayTeam]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2 font-semibold -ml-2"
      onClick={() => handleSort(field)}
    >
      {children}
      {sortField === field ? (
        sortDirection === "asc" ? (
          <ArrowUp className="ml-1 h-3 w-3" />
        ) : (
          <ArrowDown className="ml-1 h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
      )}
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="space-y-3">
        {/* Search - full width on mobile */}
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search players..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Team Filter */}
          <Select value={teamFilter} onValueChange={(v) => setTeamFilter(v as any)}>
            <SelectTrigger className="w-[110px] sm:w-[140px]">
              <SelectValue placeholder="Team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              <SelectItem value="away">{awayTeam}</SelectItem>
              <SelectItem value="home">{homeTeam}</SelectItem>
            </SelectContent>
          </Select>

          {/* Stat Filter */}
          <Select value={statFilter} onValueChange={setStatFilter}>
            <SelectTrigger className="w-[100px] sm:w-[140px]">
              <SelectValue placeholder="Stat" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stats</SelectItem>
              {statTypes.map((stat) => (
                <SelectItem key={stat} value={stat}>
                  {statLabels[stat] || stat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Edge Filter */}
          <Select value={edgeFilter} onValueChange={setEdgeFilter}>
            <SelectTrigger className="w-[100px] sm:w-[140px]">
              <SelectValue placeholder="Edge" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="monitor">1.5+</SelectItem>
              <SelectItem value="good">2.0+</SelectItem>
              <SelectItem value="strong">3.0+</SelectItem>
            </SelectContent>
          </Select>

          {/* Results Count */}
          <span className="text-sm text-muted-foreground ml-auto">
            {filteredRows.length} {filteredRows.length === 1 ? "line" : "lines"}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px] sm:w-[200px] sticky left-0 bg-background z-10">
                  <SortHeader field="name">Player</SortHeader>
                </TableHead>
                <TableHead className="hidden sm:table-cell w-[120px]">
                  <SortHeader field="team">Team</SortHeader>
                </TableHead>
                <TableHead className="min-w-[70px] sm:w-[100px]">
                  <SortHeader field="statType">Stat</SortHeader>
                </TableHead>
                <TableHead className="min-w-[60px] sm:w-[80px] text-right">
                  <SortHeader field="line">Line</SortHeader>
                </TableHead>
                <TableHead className="min-w-[60px] sm:w-[80px] text-right">
                  <SortHeader field="current">Cur</SortHeader>
                </TableHead>
                <TableHead className="hidden md:table-cell w-[80px] text-right">
                  <SortHeader field="pace">Pace</SortHeader>
                </TableHead>
                <TableHead className="min-w-[70px] sm:w-[100px] text-right">
                  <SortHeader field="edge">Edge</SortHeader>
                </TableHead>
                <TableHead className="min-w-[70px] sm:w-[100px] text-right">
                  <SortHeader field="mateo">Mateo</SortHeader>
                </TableHead>
                <TableHead className="hidden lg:table-cell w-[80px] text-right">
                  <SortHeader field="seasonAvg">Avg</SortHeader>
                </TableHead>
              </TableRow>
            </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No player lines found matching your filters
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row, idx) => (
                <TableRow
                  key={`${row.playerId}-${row.statType}-${idx}`}
                  className={cn(row.edgeScore >= 2.0 && "bg-primary/5")}
                >
                  <TableCell className="sticky left-0 bg-background z-10">
                    <div>
                      <span className="font-medium text-sm sm:text-base">{row.playerName}</span>
                      <div className="text-xs text-muted-foreground">
                        <span>{row.position}</span>
                        <span className="sm:hidden"> - {row.team}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">{row.team}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {statLabels[row.statType] || row.statType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {row.pregameLine}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-sm">
                    {row.currentValue}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-right font-mono">
                    <span
                      className={cn(
                        row.projectedPace > row.pregameLine
                          ? "text-green-600 dark:text-green-400"
                          : row.projectedPace < row.pregameLine
                            ? "text-red-600 dark:text-red-400"
                            : ""
                      )}
                    >
                      {row.projectedPace > 0 ? row.projectedPace.toFixed(1) : "-"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.edgeScore > 0 ? (
                      <div className="flex items-center justify-end gap-1">
                        <TrendingUp
                          className={cn(
                            "h-3 w-3 hidden sm:block",
                            row.edgeScore >= 3.0
                              ? "text-green-500"
                              : row.edgeScore >= 2.0
                                ? "text-yellow-500"
                                : row.edgeScore >= 1.5
                                  ? "text-orange-500"
                                  : "text-muted-foreground"
                          )}
                        />
                        <Badge
                          className={cn("font-mono text-xs", getEdgeClass(row.edgeScore))}
                        >
                          {row.edgeScore.toFixed(1)}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.mateoScore > 0 ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-mono text-xs",
                          row.mateoScore >= 1.5
                            ? "border-green-500 text-green-600 dark:text-green-400"
                            : row.mateoScore >= 1.1
                              ? "border-yellow-500 text-yellow-600 dark:text-yellow-400"
                              : row.mateoScore < 0.9
                                ? "border-red-500 text-red-600 dark:text-red-400"
                                : ""
                        )}
                      >
                        {row.mateoScore.toFixed(2)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-right font-mono text-muted-foreground">
                    {row.seasonAverage != null ? row.seasonAverage.toFixed(1) : "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </div>
    </div>
  );
}
