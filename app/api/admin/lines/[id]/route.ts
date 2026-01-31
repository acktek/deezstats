import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db, playerLines } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await db.delete(playerLines).where(eq(playerLines.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting line:", error);
    return NextResponse.json(
      { error: "Failed to delete line" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { pregameLine, currentLine } = await request.json();

    const updates: Partial<typeof playerLines.$inferInsert> = {};
    if (pregameLine !== undefined) updates.pregameLine = pregameLine;
    if (currentLine !== undefined) updates.currentLine = currentLine;

    const [updatedLine] = await db
      .update(playerLines)
      .set(updates)
      .where(eq(playerLines.id, id))
      .returning();

    return NextResponse.json({ line: updatedLine });
  } catch (error) {
    console.error("Error updating line:", error);
    return NextResponse.json(
      { error: "Failed to update line" },
      { status: 500 }
    );
  }
}
