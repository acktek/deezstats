import { NextRequest, NextResponse } from "next/server";
import { bdlClient } from "@/lib/balldontlie";
import { getDateRangeUTC } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Sport = "nba" | "nfl";

interface PlayerStat {
  playerId: string;
  playerName: string;
  team: string;
  position: string;
  gameId: string;
  gameName: string;
  sport: string;
  stats: Record<string, number>;
  imageUrl?: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sportParam = searchParams.get("sport") || "all";

  try {
    const sports: Sport[] =
      sportParam === "all"
        ? ["nba", "nfl"]
        : sportParam === "nba" || sportParam === "nfl"
          ? [sportParam]
          : ["nba", "nfl"];

    const allPlayers: PlayerStat[] = [];
    // Use UTC date range to handle timezone differences between server and game schedules
    const dates = getDateRangeUTC();

    for (const sport of sports) {
      try {
        if (sport === "nba") {
          // Fetch NBA games from BALLDONTLIE
          const nbaGames = await bdlClient.getNBAGames({ dates, per_page: 100 });

          for (const bdlGame of nbaGames.data) {
            const gameStatus = bdlGame.status === "Final" ? "final" :
              bdlGame.status === "In Progress" ? "in_progress" : "scheduled";

            // Only get stats from live or completed games
            if (gameStatus === "scheduled") continue;

            try {
              const boxScore = await bdlClient.getNBAGameBoxScore(bdlGame.id);
              const allPlayerStats = [
                ...boxScore.data.home_team.players,
                ...boxScore.data.visitor_team.players,
              ];

              for (const ps of allPlayerStats) {
                if (!ps.min || ps.min === "00:00") continue;

                const stats: Record<string, number> = {
                  points: ps.pts,
                  rebounds: ps.reb,
                  assists: ps.ast,
                  three_pointers: ps.fg3m,
                  steals: ps.stl,
                  blocks: ps.blk,
                  minutes: parseFloat(ps.min.split(":")[0]) || 0,
                };

                // Only include players with actual stats
                const hasStats = Object.values(stats).some(v => v > 0);
                if (!hasStats) continue;

                allPlayers.push({
                  playerId: String(ps.player.id),
                  playerName: `${ps.player.first_name} ${ps.player.last_name}`,
                  team: ps.team.full_name,
                  position: ps.player.position || "Unknown",
                  gameId: String(bdlGame.id),
                  gameName: `${bdlGame.visitor_team.full_name} @ ${bdlGame.home_team.full_name}`,
                  sport: "nba",
                  stats,
                });
              }
            } catch (error) {
              console.error(`Error fetching box score for game ${bdlGame.id}:`, error);
            }
          }
        } else if (sport === "nfl") {
          // Fetch NFL games from BALLDONTLIE
          const nflGames = await bdlClient.getNFLGames({ dates, per_page: 100 });

          for (const bdlGame of nflGames.data) {
            const gameStatus = bdlGame.status === "Final" ? "final" :
              bdlGame.status === "In Progress" ? "in_progress" : "scheduled";

            // Only get stats from live or completed games
            if (gameStatus === "scheduled") continue;

            try {
              const statsResult = await bdlClient.getNFLStats({ game_ids: [bdlGame.id] });

              for (const ps of statsResult.data) {
                const stats: Record<string, number> = {
                  passing_yards: ps.passing_yards,
                  rushing_yards: ps.rushing_yards,
                  receiving_yards: ps.receiving_yards,
                  receptions: ps.receptions,
                  touchdowns: ps.passing_tds + ps.rushing_tds + ps.receiving_tds,
                };

                // Only include players with actual stats
                const hasStats = Object.values(stats).some(v => v > 0);
                if (!hasStats) continue;

                allPlayers.push({
                  playerId: `nfl-${ps.player.id}`,
                  playerName: `${ps.player.first_name} ${ps.player.last_name}`,
                  team: ps.team.full_name,
                  position: ps.player.position_abbreviation || "Unknown",
                  gameId: `nfl-${bdlGame.id}`,
                  gameName: `${bdlGame.visitor_team.full_name} @ ${bdlGame.home_team.full_name}`,
                  sport: "nfl",
                  stats,
                });
              }
            } catch (error) {
              console.error(`Error fetching NFL stats for game ${bdlGame.id}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching ${sport} games:`, error);
      }
    }

    // Sort by total stats activity (most active players first)
    allPlayers.sort((a, b) => {
      const aTotal = Object.values(a.stats).reduce((sum, v) => sum + v, 0);
      const bTotal = Object.values(b.stats).reduce((sum, v) => sum + v, 0);
      return bTotal - aTotal;
    });

    return NextResponse.json({ players: allPlayers });
  } catch (error) {
    console.error("Error in live stats API:", error);
    return NextResponse.json(
      { error: "Failed to fetch live stats" },
      { status: 500 }
    );
  }
}
