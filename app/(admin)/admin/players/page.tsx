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
import { Search, Plus, Trash2, Edit2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

interface Player {
  id: string;
  espnId: string | null;
  name: string;
  team: string;
  position: string;
  sport: string;
  gamesPlayed: number;
  seasonAvg: number | null;
  historicalStddev: number | null;
  isRookie: boolean;
  updatedAt: string;
}

const sports = [
  { value: "nfl", label: "NFL" },
  { value: "nba", label: "NBA" },
  { value: "ncaaf", label: "College Football" },
  { value: "ncaab", label: "College Basketball" },
];

const positions = {
  nfl: ["QB", "RB", "WR", "TE", "K"],
  nba: ["PG", "SG", "SF", "PF", "C"],
  ncaaf: ["QB", "RB", "WR", "TE", "K"],
  ncaab: ["PG", "SG", "SF", "PF", "C"],
};

export default function PlayersAdminPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Add form
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    team: "",
    position: "",
    sport: "nfl",
    gamesPlayed: "0",
    seasonAvg: "",
    isRookie: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit form
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  useEffect(() => {
    fetchPlayers();
  }, []);

  const fetchPlayers = async () => {
    try {
      const response = await fetch("/api/admin/players");
      if (response.ok) {
        const data = await response.json();
        setPlayers(data.players || []);
      }
    } catch (error) {
      console.error("Failed to fetch players:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.team || !formData.position || !formData.sport) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const url = editingPlayer
        ? `/api/admin/players/${editingPlayer.id}`
        : "/api/admin/players";
      const method = editingPlayer ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          team: formData.team,
          position: formData.position,
          sport: formData.sport,
          gamesPlayed: parseInt(formData.gamesPlayed) || 0,
          seasonAvg: formData.seasonAvg ? parseFloat(formData.seasonAvg) : null,
          isRookie: formData.isRookie,
        }),
      });

      if (response.ok) {
        toast({ title: editingPlayer ? "Player updated" : "Player added" });
        setIsAddOpen(false);
        setEditingPlayer(null);
        resetForm();
        fetchPlayers();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to save player",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to save player",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const deletePlayer = async (playerId: string) => {
    if (!confirm("Are you sure you want to delete this player?")) return;

    try {
      const response = await fetch(`/api/admin/players/${playerId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast({ title: "Player deleted" });
        fetchPlayers();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete player",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (player: Player) => {
    setEditingPlayer(player);
    setFormData({
      name: player.name,
      team: player.team,
      position: player.position,
      sport: player.sport,
      gamesPlayed: player.gamesPlayed.toString(),
      seasonAvg: player.seasonAvg?.toString() || "",
      isRookie: player.isRookie,
    });
    setIsAddOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      team: "",
      position: "",
      sport: "nfl",
      gamesPlayed: "0",
      seasonAvg: "",
      isRookie: false,
    });
  };

  const closeDialog = () => {
    setIsAddOpen(false);
    setEditingPlayer(null);
    resetForm();
  };

  const filteredPlayers = players.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.team.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentPositions = positions[formData.sport as keyof typeof positions] || positions.nfl;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Player Database</h1>
          <p className="text-muted-foreground">
            Manage players and their stats
          </p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={(open) => open ? setIsAddOpen(true) : closeDialog()}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setEditingPlayer(null); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Player
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingPlayer ? "Edit Player" : "Add Player"}</DialogTitle>
              <DialogDescription>
                {editingPlayer ? "Update player information." : "Add a new player to track."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sport</Label>
                  <Select
                    value={formData.sport}
                    onValueChange={(v) => setFormData({ ...formData, sport: v, position: "" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sports.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Position</Label>
                  <Select
                    value={formData.position}
                    onValueChange={(v) => setFormData({ ...formData, position: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentPositions.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="e.g., Ja'Marr Chase"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Team</Label>
                <Input
                  placeholder="e.g., CIN"
                  value={formData.team}
                  onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Games Played</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.gamesPlayed}
                    onChange={(e) => setFormData({ ...formData, gamesPlayed: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Season Avg (optional)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="e.g., 85.5"
                    value={formData.seasonAvg}
                    onChange={(e) => setFormData({ ...formData, seasonAvg: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isRookie"
                  checked={formData.isRookie}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isRookie: checked as boolean })
                  }
                />
                <Label htmlFor="isRookie" className="text-sm font-normal">
                  Rookie (20% edge bonus)
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editingPlayer ? "Update" : "Add Player"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search players..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Players Table */}
      <Card className="card-leather">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Sport</TableHead>
                <TableHead>Games</TableHead>
                <TableHead>Avg</TableHead>
                <TableHead>Std Dev</TableHead>
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
              ) : filteredPlayers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-muted-foreground"
                  >
                    {searchQuery
                      ? "No players match your search"
                      : "No players yet. Add some or sync from ESPN."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredPlayers.map((player) => (
                  <TableRow key={player.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{player.name}</span>
                        {player.isRookie && (
                          <Badge variant="whiskey" className="text-xs">
                            Rookie
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {player.position}
                        {player.espnId && ` | ESPN: ${player.espnId}`}
                      </span>
                    </TableCell>
                    <TableCell>{player.team}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {player.sport.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>{player.gamesPlayed}</TableCell>
                    <TableCell className="font-mono">
                      {player.seasonAvg?.toFixed(1) || "-"}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {player.historicalStddev?.toFixed(1) || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(player)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deletePlayer(player.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
