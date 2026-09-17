import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AlertTone = "error" | "success" | "info" | "warning";

const tones: Record<AlertTone, string> = {
  error: "border-danger/40 bg-danger/10 text-danger",
  success: "border-success/40 bg-success/10 text-success",
  info: "border-border bg-card text-muted",
  warning: "border-border bg-card text-muted",
};

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  role?: "alert" | "status";
}

export function Alert({ tone = "info", title, children, role = "status" }: AlertProps) {
  return (
    <div role={role} className={cn("rounded-md border px-3 py-2 text-sm", tones[tone])}>
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={cn(title && "mt-1")}>{children}</div> : null}
    </div>
  );
}
