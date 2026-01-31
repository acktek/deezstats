import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";

const CRONJOB_API_URL = "https://api.cron-job.org";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.CRONJOB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "CRONJOB_API_KEY not configured" },
      { status: 500 }
    );
  }

  const siteUrl = process.env.NEXTAUTH_URL || "https://stats.deezboxes.com";

  try {
    // Create cron job on cron-job.org
    const response = await fetch(`${CRONJOB_API_URL}/jobs`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        job: {
          url: `${siteUrl}/api/cron/sync-espn`,
          title: "DeezStats ESPN Sync",
          enabled: true,
          saveResponses: true,
          schedule: {
            timezone: "America/New_York",
            expiresAt: 0,
            hours: [-1], // Every hour
            mdays: [-1], // Every day of month
            minutes: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55], // Every 5 minutes
            months: [-1], // Every month
            wdays: [-1], // Every day of week
          },
          requestMethod: 0, // GET
          extendedData: {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          },
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Cron-job.org error:", data);
      return NextResponse.json(
        { error: data.message || "Failed to create cron job" },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      jobId: data.jobId,
      message: "Cron job created successfully! ESPN sync will run every 5 minutes.",
    });
  } catch (error) {
    console.error("Error creating cron job:", error);
    return NextResponse.json(
      { error: "Failed to connect to cron-job.org" },
      { status: 500 }
    );
  }
}

// Get existing cron jobs
export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.CRONJOB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "CRONJOB_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${CRONJOB_API_URL}/jobs`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.message || "Failed to fetch cron jobs" },
        { status: response.status }
      );
    }

    return NextResponse.json({ jobs: data.jobs || [] });
  } catch (error) {
    console.error("Error fetching cron jobs:", error);
    return NextResponse.json(
      { error: "Failed to connect to cron-job.org" },
      { status: 500 }
    );
  }
}
