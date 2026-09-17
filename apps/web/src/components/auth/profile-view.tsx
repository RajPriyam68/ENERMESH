"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { updateProfileSchema, type UpdateProfileInput } from "@enermesh/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import type { PublicUser } from "@enermesh/shared";

export function ProfileView() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.accessToken);
  const setUser = useAuthStore((state) => state.setUser);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    values: {
      displayName: user?.displayName ?? "",
      phone: user?.phone ?? "",
      bio: user?.bio ?? "",
    },
  });

  if (!user) return null;

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false);
    setFormError(null);
    try {
      const result = await apiRequest<{ user: PublicUser }>("/users/me", {
        method: "PATCH",
        token,
        body: {
          displayName: values.displayName,
          phone: values.phone ?? "",
          bio: values.bio ?? "",
        },
      });
      setUser(result.user);
      setSaved(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save your profile.");
    }
  });

  return (
    <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError ? (
          <Alert tone="error" role="alert" title="Could not save profile">
            {formError}
          </Alert>
        ) : null}
        {saved ? (
          <Alert tone="success" role="status">
            Profile updated.
          </Alert>
        ) : null}

        <Field label="Display name" htmlFor="displayName" error={errors.displayName?.message}>
          <Input
            id="displayName"
            aria-invalid={Boolean(errors.displayName)}
            {...register("displayName")}
          />
        </Field>

        <Field
          label="Phone"
          htmlFor="phone"
          error={errors.phone?.message}
          hint="Optional. Used for settlement coordination only."
        >
          <Input id="phone" aria-invalid={Boolean(errors.phone)} {...register("phone")} />
        </Field>

        <Field label="Bio" htmlFor="bio" error={errors.bio?.message} hint="Up to 500 characters.">
          <Textarea id="bio" aria-invalid={Boolean(errors.bio)} {...register("bio")} />
        </Field>

        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Saving..." : "Save changes"}
        </Button>
      </form>

      <aside className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
        <h2 className="font-semibold">Account</h2>
        <dl className="space-y-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Email</dt>
            <dd className="break-all">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Role</dt>
            <dd>{user.role}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Member since</dt>
            <dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Last login</dt>
            <dd>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Not recorded"}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted">
          Email address and role cannot be changed here. Contact an administrator for account changes.
        </p>
      </aside>
    </div>
  );
}
