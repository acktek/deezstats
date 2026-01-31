import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
        gold: "border-gold-400/50 bg-gold-100 text-gold-700 dark:bg-gold-900/50 dark:text-gold-300",
        forest:
          "border-forest-400/50 bg-forest-100 text-forest-700 dark:bg-forest-900/50 dark:text-forest-300",
        whiskey:
          "border-whiskey-400/50 bg-whiskey-100 text-whiskey-700 dark:bg-whiskey-900/50 dark:text-whiskey-300",
        live: "border-red-400/50 bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 animate-pulse",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
