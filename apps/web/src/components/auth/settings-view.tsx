"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  EnergyType,
  changePasswordSchema,
  updateSettingsSchema,
  type ChangePasswordInput,
  type PublicUser,
  type UpdateSettingsInput,
} from "@enermesh/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { WalletPanel } from "@/components/wallet/wallet-panel";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

const ENERGY_TYPES = Object.values(EnergyType);

export function SettingsView() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.accessToken);
  const setUser = useAuthStore((state) => state.setUser);

  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const settingsForm = useForm<UpdateSettingsInput>({
    resolver: zodResolver(updateSettingsSchema),
    values: {
      defaultMarketZone: user?.defaultMarketZone ?? "",
      energyTypesOfInterest: user?.energyTypesOfInterest ?? [],
      notificationEmail: user?.notificationEmail ?? true,
      notificationInApp: user?.notificationInApp ?? true,
    },
  });

  const passwordForm = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  if (!user) return null;

  const onSaveSettings = settingsForm.handleSubmit(async (values) => {
    setSettingsSaved(false);
    setSettingsError(null);
    try {
      const result = await apiRequest<{ user: PublicUser }>("/users/me/settings", {
        method: "PATCH",
        token,
        body: {
          defaultMarketZone: values.defaultMarketZone ?? "",
          energyTypesOfInterest: values.energyTypesOfInterest ?? [],
          notificationEmail: values.notificationEmail,
          notificationInApp: values.notificationInApp,
        },
      });
      setUser(result.user);
      setSettingsSaved(true);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Unable to save settings.");
    }
  });

  const onChangePassword = passwordForm.handleSubmit(async (values) => {
    setPasswordSaved(false);
    setPasswordError(null);
    try {
      await apiRequest("/users/me/password", { method: "POST", token, body: values });
      passwordForm.reset();
      setPasswordSaved(true);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Unable to change password.");
    }
  });

  return (
    <div className="space-y-10">
      <form onSubmit={onSaveSettings} className="space-y-4" noValidate>
        <div>
          <h2 className="text-lg font-semibold">Marketplace preferences</h2>
          <p className="text-sm text-muted">
            These defaults pre-fill listing and bid forms. They are never used to fabricate market data.
          </p>
        </div>

        {settingsError ? (
          <Alert tone="error" role="alert" title="Could not save settings">
            {settingsError}
          </Alert>
        ) : null}
        {settingsSaved ? (
          <Alert tone="success" role="status">
            Settings updated.
          </Alert>
        ) : null}

        <Field
          label="Default market zone"
          htmlFor="defaultMarketZone"
          error={settingsForm.formState.errors.defaultMarketZone?.message}
        >
          <Input id="defaultMarketZone" {...settingsForm.register("defaultMarketZone")} />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Energy types of interest</legend>
          <div className="flex flex-wrap gap-3">
            {ENERGY_TYPES.map((energyType) => (
              <label key={energyType} className="flex items-center gap-2 text-sm">
                <input type="checkbox" value={energyType} {...settingsForm.register("energyTypesOfInterest")} />
                {energyType}
              </label>
            ))}
          </div>
          {settingsForm.formState.errors.energyTypesOfInterest ? (
            <p role="alert" className="text-xs text-danger">
              {settingsForm.formState.errors.energyTypesOfInterest.message}
            </p>
          ) : null}
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...settingsForm.register("notificationEmail")} />
          Email notifications
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...settingsForm.register("notificationInApp")} />
          In-app notifications
        </label>

        <Button type="submit" disabled={settingsForm.formState.isSubmitting}>
          {settingsForm.formState.isSubmitting ? "Saving..." : "Save preferences"}
        </Button>
      </form>

      <WalletPanel />

      <form onSubmit={onChangePassword} className="space-y-4" noValidate>
        <div>
          <h2 className="text-lg font-semibold">Password</h2>
          <p className="text-sm text-muted">
            Changing your password signs out every other session and revokes all refresh tokens.
          </p>
        </div>

        {passwordError ? (
          <Alert tone="error" role="alert" title="Could not change password">
            {passwordError}
          </Alert>
        ) : null}
        {passwordSaved ? (
          <Alert tone="success" role="status">
            Password changed. Other sessions were signed out.
          </Alert>
        ) : null}

        <Field
          label="Current password"
          htmlFor="currentPassword"
          error={passwordForm.formState.errors.currentPassword?.message}
        >
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            {...passwordForm.register("currentPassword")}
          />
        </Field>

        <Field
          label="New password"
          htmlFor="newPassword"
          error={passwordForm.formState.errors.newPassword?.message}
          hint="At least 10 characters with an uppercase letter, a lowercase letter and a number."
        >
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            {...passwordForm.register("newPassword")}
          />
        </Field>

        <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
          {passwordForm.formState.isSubmitting ? "Updating..." : "Change password"}
        </Button>
      </form>
    </div>
  );
}
