import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [
    Credentials({
      id: "code",
      name: "Verification Code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.code) {
          return null;
        }

        const email = credentials.email as string;
        const code = credentials.code as string;

        // Find the verification token
        const token = await db.query.verificationTokens.findFirst({
          where: and(
            eq(verificationTokens.identifier, email.toLowerCase()),
            eq(verificationTokens.token, code)
          ),
        });

        if (!token) {
          return null;
        }

        // Check if expired
        if (new Date() > token.expires) {
          // Delete expired token
          await db
            .delete(verificationTokens)
            .where(
              and(
                eq(verificationTokens.identifier, email.toLowerCase()),
                eq(verificationTokens.token, code)
              )
            );
          return null;
        }

        // Delete the used token
        await db
          .delete(verificationTokens)
          .where(
            and(
              eq(verificationTokens.identifier, email.toLowerCase()),
              eq(verificationTokens.token, code)
            )
          );

        // Get or create user
        let user = await db.query.users.findFirst({
          where: eq(users.email, email.toLowerCase()),
        });

        if (!user) {
          // Create new user
          const adminEmails = (
            process.env.ADMIN_EMAILS || "alex@acktek.net,matthew.amato26@gmail.com"
          )
            .split(",")
            .map((e) => e.trim().toLowerCase());

          const isAdmin = adminEmails.includes(email.toLowerCase());

          const [newUser] = await db
            .insert(users)
            .values({
              email: email.toLowerCase(),
              role: isAdmin ? "admin" : "user",
            })
            .returning();
          user = newUser;
        }

        // Update last login
        await db
          .update(users)
          .set({ lastLogin: new Date() })
          .where(eq(users.id, user.id));

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "admin" | "user";
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
  debug: process.env.NODE_ENV === "development",
});

// Helper function to generate and send verification code
export async function sendVerificationCode(email: string): Promise<boolean> {
  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Store the code (expires in 10 minutes)
  const expires = new Date(Date.now() + 10 * 60 * 1000);

  // Delete any existing tokens for this email
  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.identifier, email.toLowerCase()));

  // Insert new token
  await db.insert(verificationTokens).values({
    identifier: email.toLowerCase(),
    token: code,
    expires,
  });

  // Send email via SMTP2GO
  const response = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: process.env.SMTP2GO_API_KEY,
      to: [email],
      sender: process.env.EMAIL_FROM || "noreply@deezboxes.com",
      subject: "Your DeezStats Login Code",
      html_body: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #3D7A4F; margin-bottom: 24px;">DeezStats</h1>
          <p style="font-size: 16px; color: #333; margin-bottom: 16px;">
            Your login code is:
          </p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${code}</span>
          </div>
          <p style="font-size: 14px; color: #666;">
            This code expires in 10 minutes.
          </p>
          <p style="font-size: 12px; color: #999; margin-top: 24px;">
            If you didn't request this code, you can safely ignore this email.
          </p>
        </div>
      `,
      text_body: `Your DeezStats login code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this code, you can safely ignore this email.`,
    }),
  });

  return response.ok;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: "admin" | "user";
    };
  }
}
