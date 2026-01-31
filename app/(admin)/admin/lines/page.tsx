"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Search, Plus, Trash2, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface PlayerLine {
  id: string;
  playerName: string;
  team: string;
  gameName: string;
  statType: string;
  pregameLine: number;
  currentLine: number | null;
  source: string | null;
  createdAt: string;
}

interface Game {
  id: string;
  name: string;
  sport: string;
}

interface Player {
  id: string;
  name: string;
  team: string;
}

const statTypes = [
  { value: "receiving_yards", label: "Receiving Yards" },
  { value: "rushing_yards", label: "Rushing Yards" },
  { value: "receptions", label: "Receptions" },
  { value: "passing_yards", label: "Passing Yards" },
  { value: "touchdowns", label: "Touchdowns" },
  { value: "points", label: "Points" },
  { value: "rebounds", label: "Rebounds" },
  { value: "assists", label: "Assists" },
  { value: "three_pointers", label: "3-Pointers Made" },
  { value: "steals", label: "Steals" },
  { value: "blocks", label: "Blocks" },
];

export default function LinesPage() {
  const [lines, setLines] = useState<PlayerLine[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // New line form
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [selectedStatType, setSelectedStatType] = useState("");
  const [lineValue, setLineValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Odds API sync
  const [isSyncing, setIsSyncing] = useState(false);
  const [quotaRemaining, setQuotaRemaining] = useState<number | null>(null);

  useEffect(() => {
    fetchLines();
    fetchGames();
    fetchPlayers();
  }, []);

  const fetchLines = async () => {
    try {
      const response = await fetch("/api/admin/lines");
      if (response.ok) {
        const data = await response.json();
        setLines(data.lines || []);
      }
    } catch (error) {
      console.error("Failed to fetch lines:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGames = async () => {
    try {
      const response = await fetch("/api/admin/games");
      if (response.ok) {
        const data = await response.json();
        setGames(data.games || []);
      }
    } catch (error) {
      console.error("Failed to fetch games:", error);
    }
  };

  const fetchPlayers = async () => {
    try {
      const response = await fetch("/api/admin/players");
      if (response.ok) {
        const data = await response.json();
        setPlayers(data.players || []);
      }
    } catch (error) {
      console.error("Failed to fetch players:", error);
    }
  };

  const addLine = async () => {
    if (!selectedGame || !selectedPlayer || !selectedStatType || !lineValue) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    setIsAdding(true);
    try {
      const response = await fetch("/api/admin/lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: selectedGame,
          playerId: selectedPlayer,
          statType: selectedStatType,
          pregameLine: parseFloat(lineValue),
        }),
      });

      if (response.ok) {
        toast({ title: "Line added successfully" });
        setIsAddOpen(false);
        resetForm();
        fetchLines();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to add line",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to add line",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const deleteLine = async (lineId: string) => {
    try {
      const response = await fetch(`/api/admin/lines/${lineId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast({ title: "Line deleted" });
        fetchLines();
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete line",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setSelectedGame("");
    setSelectedPlayer("");
    setSelectedStatType("");
    setLineValue("");
  };

  const syncFromOddsApi = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/admin/lines/sync", {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Lines synced",
          description: `Added ${data.linesAdded}, updated ${data.linesUpdated}`,
        });
        if (data.quota) {
          setQuotaRemaining(data.quota.remaining);
        }
        fetchLines();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to sync lines",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to sync lines",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredLines = lines.filter(
    (l) =>
      l.playerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.gameName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Line Management</h1>
          <p className="text-muted-foreground">
            Add and manage pregame player lines
          </p>
        </div>
        <div className="flex items-center gap-2">
          {quotaRemaining !== null && (
            <Badge variant="secondary" className="text-xs">
              {quotaRemaining} API calls left
            </Badge>
          )}
          <Button
            variant="outline"
            onClick={syncFromOddsApi}
            disabled={isSyncing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync Lines"}
          </Button>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Line
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Player Line</DialogTitle>
                <DialogDescription>
                  Enter a pregame line for a player prop.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Game</Label>
                  <Select value={selectedGame} onValueChange={setSelectedGame}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select game" />
                    </SelectTrigger>
                    <SelectContent>
                      {games.map((game) => (
                        <SelectItem key={game.id} value={game.id}>
                          {game.name} ({game.sport.toUpperCase()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Player</Label>
                  <Select
                    value={selectedPlayer}
                    onValueChange={setSelectedPlayer}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select player" />
                    </SelectTrigger>
                    <SelectContent>
                      {players.map((player) => (
                        <SelectItem key={player.id} value={player.id}>
                          {player.name} ({player.team})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Stat Type</Label>
                  <Select
                    value={selectedStatType}
                    onValueChange={setSelectedStatType}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select stat" />
                    </SelectTrigger>
                    <SelectContent>
                      {statTypes.map((stat) => (
                        <SelectItem key={stat.value} value={stat.value}>
                          {stat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Line Value</Label>
                  <Input
                    type="number"
                    step="0.5"
                    placeholder="e.g., 45.5"
                    value={lineValue}
                    onChange={(e) => setLineValue(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={addLine} disabled={isAdding}>
                  {isAdding ? "Adding..." : "Add Line"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search lines..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Lines Table */}
      <Card className="card-leather">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Game</TableHead>
                <TableHead>Stat</TableHead>
                <TableHead>Pregame Line</TableHead>
                <TableHead>Current Line</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredLines.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-muted-foreground"
                  >
                    {searchQuery
                      ? "No lines match your search"
                      : "No lines entered yet. Add some to get started."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{line.playerName}</p>
                        <p className="text-xs text-muted-foreground">
                          {line.team}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {line.gameName}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{formatStatType(line.statType)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {line.pregameLine}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {line.currentLine || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {line.source || "Manual"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteLine(line.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
