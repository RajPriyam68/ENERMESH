"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordFormSchema, type ResetPasswordFormInput } from "@enermesh/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormInput>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    if (!token) {
      setFormError("This reset link is missing a token. Request a new one from the login page.");
      return;
    }
    try {
      await apiRequest("/auth/reset-password", {
        method: "POST",
        body: { token, password: values.password },
      });
      router.replace("/login?reset=1");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to reset your password right now.");
    }
  });

  if (!token) {
    return (
      <div className="space-y-4">
        <Alert tone="error" role="alert" title="Reset link is incomplete">
          This page needs a valid token from your email. Request a new reset link to continue.
        </Alert>
        <Button variant="outline" className="w-full" asChild>
          <Link href="/forgot-password">Request a new reset link</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? (
        <Alert tone="error" role="alert" title="Password reset failed">
          {formError}
        </Alert>
      ) : null}

      <Field
        label="New password"
        htmlFor="password"
        error={errors.password?.message}
        hint="At least 10 characters with an uppercase letter, a lowercase letter and a number."
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          disabled={isSubmitting}
          {...register("password")}
        />
      </Field>

      <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirmPassword)}
          disabled={isSubmitting}
          {...register("confirmPassword")}
        />
      </Field>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Updating password..." : "Update password"}
      </Button>

      <p className="text-center text-sm text-muted">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
