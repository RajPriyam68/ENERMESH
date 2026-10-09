"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@enermesh/shared";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";

export function ForgotPasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setSuccessMessage(null);
    try {
      const result = await apiRequest<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: values,
      });
      setSuccessMessage(result.message);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to send a reset link right now.");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? (
        <Alert tone="error" role="alert" title="Reset request failed">
          {formError}
        </Alert>
      ) : null}
      {successMessage ? (
        <Alert tone="success" role="status" title="Check your email">
          {successMessage}
        </Alert>
      ) : null}

      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          disabled={isSubmitting}
          {...register("email")}
        />
      </Field>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Sending reset link..." : "Send reset link"}
      </Button>

      <p className="text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
