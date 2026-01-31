import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db, watchlist } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { playerId } = await params;

  try {
    await db
      .delete(watchlist)
      .where(
        and(
          eq(watchlist.userId, session.user.id),
          eq(watchlist.playerId, playerId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing from watchlist:", error);
    return NextResponse.json(
      { error: "Failed to remove from watchlist" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { playerId } = await params;

  try {
    const { customThreshold } = await request.json();

    await db
      .update(watchlist)
      .set({ customThreshold })
      .where(
        and(
          eq(watchlist.userId, session.user.id),
          eq(watchlist.playerId, playerId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating watchlist:", error);
    return NextResponse.json(
      { error: "Failed to update watchlist" },
      { status: 500 }
    );
  }
}
