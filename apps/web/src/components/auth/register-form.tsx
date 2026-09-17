"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, UserRole, type RegisterInput } from "@enermesh/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

export function RegisterForm() {
  const router = useRouter();
  const registerUser = useAuthStore((state) => state.register);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", displayName: "", role: UserRole.BUYER },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await registerUser(values);
      router.replace("/profile");
    } catch (error) {
      if (error instanceof ApiError && error.code === "EMAIL_IN_USE") {
        setFormError("An account with this email already exists. Try signing in instead.");
      } else {
        setFormError(error instanceof Error ? error.message : "Unable to create your account right now.");
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? (
        <Alert tone="error" role="alert" title="Registration failed">
          {formError}
        </Alert>
      ) : null}

      <Field label="Display name" htmlFor="displayName" error={errors.displayName?.message}>
        <Input
          id="displayName"
          autoComplete="name"
          aria-invalid={Boolean(errors.displayName)}
          {...register("displayName")}
        />
      </Field>

      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          {...register("email")}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        error={errors.password?.message}
        hint="At least 10 characters with an uppercase letter, a lowercase letter and a number."
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          {...register("password")}
        />
      </Field>

      <Field
        label="I want to"
        htmlFor="role"
        error={errors.role?.message}
        hint="Admin accounts are provisioned out-of-band and cannot be self-selected."
      >
        <Select id="role" aria-invalid={Boolean(errors.role)} {...register("role")}>
          <option value={UserRole.BUYER}>Buy energy as a buyer</option>
          <option value={UserRole.SELLER}>Sell surplus energy as a seller</option>
        </Select>
      </Field>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Creating account..." : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted">
        Already registered?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
