import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { games, players, playerLines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { bdlClient } from "@/lib/balldontlie";
import { calculateEdgeScore } from "@/lib/algorithm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  try {
    // Get game (try by ID first, then by ESPN ID)
    let game = await db.query.games.findFirst({
      where: eq(games.id, gameId),
    });

    if (!game) {
      game = await db.query.games.findFirst({
        where: eq(games.espnId, gameId),
      });
    }

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Fetch live player stats from BALLDONTLIE
    const playerStatsMap = new Map<string, any>();

    try {
      if (game.status !== "scheduled") {
        const bdlGameId = game.sport === "nfl"
          ? parseInt(game.espnId.replace("nfl-", ""))
          : parseInt(game.espnId);

        if (game.sport === "nba") {
          const boxScore = await bdlClient.getNBAGameBoxScore(bdlGameId);
          const allPlayerStats = [
            ...boxScore.data.home_team.players,
            ...boxScore.data.visitor_team.players,
          ];

          for (const ps of allPlayerStats) {
            if (!ps.min || ps.min === "00:00") continue;

            playerStatsMap.set(String(ps.player.id), {
              playerId: String(ps.player.id),
              playerName: `${ps.player.first_name} ${ps.player.last_name}`,
              team: ps.team.full_name,
              position: ps.player.position || "Unknown",
              stats: {
                points: ps.pts,
                rebounds: ps.reb,
                assists: ps.ast,
                three_pointers: ps.fg3m,
                steals: ps.stl,
                blocks: ps.blk,
              },
            });
          }
        } else if (game.sport === "nfl") {
          const stats = await bdlClient.getNFLStats({ game_ids: [bdlGameId] });

          for (const ps of stats.data) {
            playerStatsMap.set(`nfl-${ps.player.id}`, {
              playerId: `nfl-${ps.player.id}`,
              playerName: `${ps.player.first_name} ${ps.player.last_name}`,
              team: ps.team.full_name,
              position: ps.player.position_abbreviation || "Unknown",
              stats: {
                passing_yards: ps.passing_yards,
                rushing_yards: ps.rushing_yards,
                receiving_yards: ps.receiving_yards,
                receptions: ps.receptions,
                touchdowns: ps.passing_tds + ps.rushing_tds + ps.receiving_tds,
              },
            });
          }
        }
      }
    } catch (error) {
      console.error("Error fetching BALLDONTLIE stats:", error);
    }

    // Get all player lines for this game
    const lines = await db.query.playerLines.findMany({
      where: eq(playerLines.gameId, game.id),
    });

    // Get players from lines
    const linePlayerIds = [...new Set(lines.map((l) => l.playerId))];
    const dbPlayers = linePlayerIds.length > 0
      ? await db.query.players.findMany({
          where: (players, { inArray }) => inArray(players.id, linePlayerIds),
        })
      : [];

    // Build player data combining BDL stats and DB lines
    const playerDataMap = new Map<string, any>();

    // First, add BDL players with their live stats
    for (const [bdlPlayerId, bdlPlayer] of playerStatsMap) {
      // Find DB player by ESPN ID (which is actually BDL ID now)
      let dbPlayer = await db.query.players.findFirst({
        where: eq(players.espnId, bdlPlayerId),
      });

      const playerId = dbPlayer?.id || `bdl-${bdlPlayerId}`;
      const playerLinesList = dbPlayer
        ? lines.filter((l) => l.playerId === dbPlayer!.id)
        : [];

      // Calculate edges for lines
      const edges: any[] = [];
      for (const line of playerLinesList) {
        const currentValue = bdlPlayer.stats[line.statType] || 0;
        if (currentValue > 0 && game.gameElapsedPercent > 0) {
          const result = calculateEdgeScore({
            currentValue,
            gameElapsedPercent: game.gameElapsedPercent,
            pregameLine: line.pregameLine,
            gamesPlayed: dbPlayer?.gamesPlayed || 1,
            historicalStddev: dbPlayer?.historicalStddev || 0,
            isRookie: dbPlayer?.isRookie || false,
          });

          edges.push({
            statType: line.statType,
            currentValue,
            pace: result.pace,
            edgeScore: result.edgeScore,
          });
        }
      }

      playerDataMap.set(playerId, {
        id: playerId,
        espnId: bdlPlayerId,
        name: bdlPlayer.playerName,
        team: bdlPlayer.team,
        position: bdlPlayer.position,
        imageUrl: dbPlayer?.imageUrl,
        stats: bdlPlayer.stats,
        lines: playerLinesList.map((l) => ({
          id: l.id,
          statType: l.statType,
          pregameLine: l.pregameLine,
          source: l.source,
        })),
        edges,
      });
    }

    // Add any DB players with lines that weren't in BDL stats
    for (const dbPlayer of dbPlayers) {
      if (!playerDataMap.has(dbPlayer.id)) {
        const playerLinesList = lines.filter((l) => l.playerId === dbPlayer.id);

        playerDataMap.set(dbPlayer.id, {
          id: dbPlayer.id,
          espnId: dbPlayer.espnId,
          name: dbPlayer.name,
          team: dbPlayer.team,
          position: dbPlayer.position,
          imageUrl: dbPlayer.imageUrl,
          stats: {},
          lines: playerLinesList.map((l) => ({
            id: l.id,
            statType: l.statType,
            pregameLine: l.pregameLine,
            source: l.source,
          })),
          edges: [],
        });
      }
    }

    // Sort players by edge score (highest first), then by total stats
    const playerData = Array.from(playerDataMap.values()).sort((a, b) => {
      const aMaxEdge = Math.max(0, ...a.edges.map((e: any) => e.edgeScore));
      const bMaxEdge = Math.max(0, ...b.edges.map((e: any) => e.edgeScore));
      if (aMaxEdge !== bMaxEdge) return bMaxEdge - aMaxEdge;

      const aStats = Object.values(a.stats as Record<string, number>).reduce((s, v) => s + v, 0);
      const bStats = Object.values(b.stats as Record<string, number>).reduce((s, v) => s + v, 0);
      return bStats - aStats;
    });

    return NextResponse.json({
      game: {
        id: game.id,
        espnId: game.espnId,
        sport: game.sport,
        homeTeam: game.homeTeam,
        homeTeamLogo: game.homeTeamLogo,
        homeScore: game.homeScore,
        awayTeam: game.awayTeam,
        awayTeamLogo: game.awayTeamLogo,
        awayScore: game.awayScore,
        status: game.status,
        period: game.period,
        timeRemaining: game.timeRemaining,
        startTime: game.startedAt || new Date().toISOString(),
        gameElapsedPercent: game.gameElapsedPercent,
        players: playerData,
      },
    });
  } catch (error) {
    console.error("Error fetching game:", error);
    return NextResponse.json(
      { error: "Failed to fetch game" },
      { status: 500 }
    );
  }
}
