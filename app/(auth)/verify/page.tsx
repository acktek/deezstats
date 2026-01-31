import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Mail, CheckCircle } from "lucide-react";

export default function VerifyPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background pattern-overlay p-4">
      <Card className="w-full max-w-md card-leather">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="font-display text-2xl">
            Check Your Email
          </CardTitle>
          <CardDescription>
            A magic link has been sent to your inbox
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 text-center text-sm text-muted-foreground">
            <div className="flex items-start gap-3 text-left">
              <CheckCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <p>Click the link in your email to sign in securely</p>
            </div>
            <div className="flex items-start gap-3 text-left">
              <CheckCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <p>The link will expire in 24 hours</p>
            </div>
            <div className="flex items-start gap-3 text-left">
              <CheckCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <p>Check your spam folder if you don&apos;t see it</p>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-sm text-center text-muted-foreground">
              Didn&apos;t receive the email?{" "}
              <a href="/login" className="text-primary hover:underline">
                Try again
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
