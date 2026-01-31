import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db, games } from "@/lib/db";
import { desc } from "drizzle-orm";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const allGames = await db.query.games.findMany({
      orderBy: [desc(games.updatedAt)],
    });

    return NextResponse.json({
      games: allGames.map((g) => ({
        id: g.id,
        name: `${g.awayTeam} @ ${g.homeTeam}`,
        sport: g.sport,
        status: g.status,
      })),
    });
  } catch (error) {
    console.error("Error fetching games:", error);
    return NextResponse.json(
      { error: "Failed to fetch games" },
      { status: 500 }
    );
  }
}
