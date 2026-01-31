import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db, players } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { playerId } = await params;
    const body = await request.json();
    const { name, team, position, sport, gamesPlayed, seasonAvg, isRookie } = body;

    const [updated] = await db
      .update(players)
      .set({
        name,
        team,
        position,
        sport,
        gamesPlayed: gamesPlayed || 0,
        seasonAvg: seasonAvg || null,
        isRookie: isRookie || false,
        updatedAt: new Date(),
      })
      .where(eq(players.id, playerId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    return NextResponse.json({ player: updated });
  } catch (error) {
    console.error("Error updating player:", error);
    return NextResponse.json(
      { error: "Failed to update player" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { playerId } = await params;

    const [deleted] = await db
      .delete(players)
      .where(eq(players.id, playerId))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting player:", error);
    return NextResponse.json(
      { error: "Failed to delete player" },
      { status: 500 }
    );
  }
}
