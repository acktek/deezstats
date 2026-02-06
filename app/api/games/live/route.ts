import { NextRequest, NextResponse } from "next/server";
import { bdlClient } from "@/lib/balldontlie";
import { db, players, playerLines, games } from "@/lib/db";
import { calculateEdgeScore } from "@/lib/algorithm";
import { getTeamLogoUrl } from "@/lib/utils";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Sport = "nba" | "nfl";

interface LiveGame {
  id: string;
  espnId: string;
  sport: Sport;
  homeTeam: string;
  homeTeamLogo?: string;
  homeScore: number;
  awayTeam: string;
  awayTeamLogo?: string;
  awayScore: number;
  status: "scheduled" | "in_progress" | "final" | "postponed";
  period: number;
  timeRemaining: string;
  gameElapsedPercent: number;
  startTime: string;
}

interface PlayerEdge {
  playerId: string;
  playerName: string;
  team: string;
  statType: string;
  currentValue: number;
  pace: number;
  pregameLine: number;
  edgeScore: number;
}

interface GameWithEdges {
  game: LiveGame;
  edges: PlayerEdge[];
}

function getDateRange(): string[] {
  // Fetch yesterday, today, and tomorrow (UTC) to handle timezone differences
  // This ensures we catch games regardless of the user's timezone
  const now = new Date();
  const dates: string[] = [];

  for (let offset = -1; offset <= 1; offset++) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() + offset);
    dates.push(date.toISOString().split('T')[0]); // YYYY-MM-DD format
  }

  return dates;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sportParam = searchParams.get("sport") || "all";
  const threshold = parseFloat(searchParams.get("threshold") || "0");

  try {
    const sports: Sport[] =
      sportParam === "all"
        ? ["nba", "nfl"]
        : sportParam === "nba" || sportParam === "nfl"
          ? [sportParam]
          : ["nba", "nfl"];

    const allGames: GameWithEdges[] = [];
    const dates = getDateRange();
    const seenGameIds = new Set<string>(); // Prevent duplicates

    for (const sport of sports) {
      try {
        if (sport === "nba") {
          // Fetch NBA games from BALLDONTLIE for date range
          const nbaGames = await bdlClient.getNBAGames({ dates, per_page: 100 });

          for (const bdlGame of nbaGames.data) {
            // Skip duplicates
            if (seenGameIds.has(String(bdlGame.id))) continue;
            seenGameIds.add(String(bdlGame.id));

            // Check status - BallDontLie may return various formats
            const statusLower = (bdlGame.status || "").toLowerCase();
            const isInProgress = statusLower.includes("progress") ||
              statusLower === "in progress" ||
              (bdlGame.period > 0 && !statusLower.includes("final"));
            const isFinal = statusLower.includes("final");

            const gameStatus = isFinal ? "final" : isInProgress ? "in_progress" : "scheduled";

            // Parse time remaining - format can be "11:41", "Q3 11:41", ":28.8", etc.
            let minutesRemaining = 12;
            if (bdlGame.time) {
              const timeMatch = bdlGame.time.match(/(\d+):(\d+)/);
              if (timeMatch) {
                minutesRemaining = parseInt(timeMatch[1]) + parseInt(timeMatch[2]) / 60;
              } else {
                // Try parsing just seconds like ":28.8"
                const secMatch = bdlGame.time.match(/:(\d+\.?\d*)/);
                if (secMatch) {
                  minutesRemaining = parseFloat(secMatch[1]) / 60;
                }
              }
            }

            const gameElapsed = gameStatus === "final" ? 100 :
              gameStatus === "in_progress" ? ((bdlGame.period - 1) * 25 + (12 - minutesRemaining) / 12 * 25) : 0;

            const liveGame: LiveGame = {
              id: String(bdlGame.id),
              espnId: String(bdlGame.id),
              sport: "nba",
              homeTeam: bdlGame.home_team.full_name,
              homeTeamLogo: getTeamLogoUrl("nba", bdlGame.home_team.abbreviation),
              homeScore: bdlGame.home_team_score,
              awayTeam: bdlGame.visitor_team.full_name,
              awayTeamLogo: getTeamLogoUrl("nba", bdlGame.visitor_team.abbreviation),
              awayScore: bdlGame.visitor_team_score,
              status: gameStatus,
              period: bdlGame.period,
              timeRemaining: bdlGame.time || "",
              gameElapsedPercent: Math.min(100, Math.max(0, gameElapsed)),
              startTime: bdlGame.date,
            };

            const edges: PlayerEdge[] = [];

            // Only calculate edges for in-progress games
            if (gameStatus === "in_progress") {
              try {
                const boxScore = await bdlClient.getNBAGameBoxScore(bdlGame.id);
                const allPlayerStats = [
                  ...boxScore.data.home_team.players,
                  ...boxScore.data.visitor_team.players,
                ];

                for (const ps of allPlayerStats) {
                  if (!ps.min || ps.min === "00:00") continue;

                  const dbPlayer = await db.query.players.findFirst({
                    where: eq(players.espnId, String(ps.player.id)),
                  });

                  if (!dbPlayer) continue;

                  const dbGame = await db.query.games.findFirst({
                    where: eq(games.espnId, String(bdlGame.id)),
                  });

                  if (!dbGame) continue;

                  const lines = await db.query.playerLines.findMany({
                    where: and(
                      eq(playerLines.playerId, dbPlayer.id),
                      eq(playerLines.gameId, dbGame.id)
                    ),
                  });

                  const statValues: Record<string, number> = {
                    points: ps.pts,
                    rebounds: ps.reb,
                    assists: ps.ast,
                    three_pointers: ps.fg3m,
                    steals: ps.stl,
                    blocks: ps.blk,
                  };

                  for (const line of lines) {
                    const currentValue = statValues[line.statType] || 0;
                    if (currentValue === 0) continue;

                    const result = calculateEdgeScore({
                      currentValue,
                      gameElapsedPercent: gameElapsed,
                      pregameLine: line.pregameLine,
                      gamesPlayed: dbPlayer.gamesPlayed,
                      historicalStddev: dbPlayer.historicalStddev || 0,
                      isRookie: dbPlayer.isRookie,
                      statType: line.statType,
                      scoreDifferential: Math.abs(bdlGame.home_team_score - bdlGame.visitor_team_score),
                      period: bdlGame.period,
                      personalFouls: ps.pf || 0,
                      sport: "nba",
                    });

                    if (result.edgeScore >= threshold) {
                      edges.push({
                        playerId: dbPlayer.id,
                        playerName: dbPlayer.name,
                        team: ps.team.full_name,
                        statType: line.statType,
                        currentValue,
                        pace: result.pace,
                        pregameLine: line.pregameLine,
                        edgeScore: result.edgeScore,
                      });
                    }
                  }
                }
              } catch (error) {
                console.error(`Error fetching NBA box score:`, error);
              }
            }

            edges.sort((a, b) => b.edgeScore - a.edgeScore);
            allGames.push({ game: liveGame, edges });
          }
        } else if (sport === "nfl") {
          // Fetch NFL games from BALLDONTLIE for date range
          const nflGames = await bdlClient.getNFLGames({ dates, per_page: 100 });

          for (const bdlGame of nflGames.data) {
            // Skip duplicates
            const nflGameId = `nfl-${bdlGame.id}`;
            if (seenGameIds.has(nflGameId)) continue;
            seenGameIds.add(nflGameId);

            // Check status - BallDontLie may return various formats
            const statusLower = (bdlGame.status || "").toLowerCase();
            const isInProgress = statusLower.includes("progress") ||
              statusLower === "in progress" ||
              (bdlGame.quarter > 0 && !statusLower.includes("final"));
            const isFinal = statusLower.includes("final");

            const gameStatus = isFinal ? "final" : isInProgress ? "in_progress" : "scheduled";

            // Parse time remaining for NFL (15 min quarters)
            let nflMinutesRemaining = 15;
            if (bdlGame.time) {
              const timeMatch = bdlGame.time.match(/(\d+):(\d+)/);
              if (timeMatch) {
                nflMinutesRemaining = parseInt(timeMatch[1]) + parseInt(timeMatch[2]) / 60;
              }
            }

            const gameElapsed = gameStatus === "final" ? 100 :
              gameStatus === "in_progress" ? ((bdlGame.quarter - 1) * 25 + (15 - nflMinutesRemaining) / 15 * 25) : 0;

            const liveGame: LiveGame = {
              id: `nfl-${bdlGame.id}`,
              espnId: `nfl-${bdlGame.id}`,
              sport: "nfl",
              homeTeam: bdlGame.home_team.full_name,
              homeTeamLogo: getTeamLogoUrl("nfl", bdlGame.home_team.abbreviation),
              homeScore: bdlGame.home_team_score,
              awayTeam: bdlGame.visitor_team.full_name,
              awayTeamLogo: getTeamLogoUrl("nfl", bdlGame.visitor_team.abbreviation),
              awayScore: bdlGame.visitor_team_score,
              status: gameStatus,
              period: bdlGame.quarter,
              timeRemaining: bdlGame.time || "",
              gameElapsedPercent: Math.min(100, Math.max(0, gameElapsed)),
              startTime: bdlGame.date,
            };

            const edges: PlayerEdge[] = [];

            // Only calculate edges for in-progress games
            if (gameStatus === "in_progress") {
              try {
                const stats = await bdlClient.getNFLStats({ game_ids: [bdlGame.id] });

                for (const ps of stats.data) {
                  const dbPlayer = await db.query.players.findFirst({
                    where: eq(players.espnId, `nfl-${ps.player.id}`),
                  });

                  if (!dbPlayer) continue;

                  const dbGame = await db.query.games.findFirst({
                    where: eq(games.espnId, `nfl-${bdlGame.id}`),
                  });

                  if (!dbGame) continue;

                  const lines = await db.query.playerLines.findMany({
                    where: and(
                      eq(playerLines.playerId, dbPlayer.id),
                      eq(playerLines.gameId, dbGame.id)
                    ),
                  });

                  const statValues: Record<string, number> = {
                    passing_yards: ps.passing_yards,
                    rushing_yards: ps.rushing_yards,
                    receiving_yards: ps.receiving_yards,
                    receptions: ps.receptions,
                    touchdowns: ps.passing_tds + ps.rushing_tds + ps.receiving_tds,
                  };

                  for (const line of lines) {
                    const currentValue = statValues[line.statType] || 0;
                    if (currentValue === 0) continue;

                    const result = calculateEdgeScore({
                      currentValue,
                      gameElapsedPercent: gameElapsed,
                      pregameLine: line.pregameLine,
                      gamesPlayed: dbPlayer.gamesPlayed,
                      historicalStddev: dbPlayer.historicalStddev || 0,
                      isRookie: dbPlayer.isRookie,
                      statType: line.statType,
                      scoreDifferential: Math.abs(bdlGame.home_team_score - bdlGame.visitor_team_score),
                      period: bdlGame.quarter,
                      sport: "nfl",
                    });

                    if (result.edgeScore >= threshold) {
                      edges.push({
                        playerId: dbPlayer.id,
                        playerName: dbPlayer.name,
                        team: ps.team.full_name,
                        statType: line.statType,
                        currentValue,
                        pace: result.pace,
                        pregameLine: line.pregameLine,
                        edgeScore: result.edgeScore,
                      });
                    }
                  }
                }
              } catch (error) {
                console.error(`Error fetching NFL stats:`, error);
              }
            }

            edges.sort((a, b) => b.edgeScore - a.edgeScore);
            allGames.push({ game: liveGame, edges });
          }
        }
      } catch (error) {
        console.error(`Error fetching ${sport} games:`, error);
      }
    }

    // Sort games: live first, then scheduled, then final
    // Within each group, sort by start time (most recent first for final, soonest for scheduled)
    allGames.sort((a, b) => {
      const statusOrder = { in_progress: 0, scheduled: 1, final: 2, postponed: 3 };
      const aOrder = statusOrder[a.game.status] ?? 4;
      const bOrder = statusOrder[b.game.status] ?? 4;

      if (aOrder !== bOrder) return aOrder - bOrder;

      // Within same status, sort by start time
      const aTime = new Date(a.game.startTime).getTime();
      const bTime = new Date(b.game.startTime).getTime();

      if (a.game.status === "scheduled") {
        return aTime - bTime; // Soonest first for scheduled
      }
      return bTime - aTime; // Most recent first for final
    });

    return NextResponse.json({ games: allGames });
  } catch (error) {
    console.error("Error in live games API:", error);
    return NextResponse.json(
      { error: "Failed to fetch live games" },
      { status: 500 }
    );
  }
}
