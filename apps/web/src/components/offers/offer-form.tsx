"use client";

import { EnergyType, createListingSchema, type CreateListingInput, type ListingPublic } from "@enermesh/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { PriceRecommendationPanel } from "@/components/pricing/price-recommendation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { defaultOfferWindow, fromDatetimeLocal, toDatetimeLocal } from "@/lib/datetime";

const ENERGY_TYPES = Object.values(EnergyType);

interface OfferFormValues {
  energyType: CreateListingInput["energyType"];
  availableKwh: number;
  minTradeKwh: number;
  maxTradeKwh: number;
  pricePerKwh: number;
  location: string;
  marketZone: string;
  availableFrom: string;
  availableUntil: string;
}

function toPayload(values: OfferFormValues): CreateListingInput {
  return createListingSchema.parse({
    energyType: values.energyType,
    availableKwh: Number(values.availableKwh),
    minTradeKwh: Number(values.minTradeKwh),
    maxTradeKwh: Number(values.maxTradeKwh),
    pricePerKwh: Number(values.pricePerKwh),
    location: values.location,
    marketZone: values.marketZone,
    availableFrom: fromDatetimeLocal(values.availableFrom),
    availableUntil: fromDatetimeLocal(values.availableUntil),
  });
}

export function OfferForm({ listing }: { listing?: ListingPublic }) {
  const router = useRouter();
  const token = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [walletHint, setWalletHint] = useState(false);
  const windowDefaults = defaultOfferWindow();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<OfferFormValues>({
    defaultValues: listing
      ? {
          energyType: listing.energyType,
          availableKwh: listing.availableQuantityKwh,
          minTradeKwh: listing.minTradeKwh,
          maxTradeKwh: listing.maxTradeKwh,
          pricePerKwh: listing.pricePerKwh,
          location: listing.location,
          marketZone: listing.marketZone,
          availableFrom: toDatetimeLocal(listing.availableFrom),
          availableUntil: toDatetimeLocal(listing.availableUntil),
        }
      : {
          energyType: EnergyType.SOLAR,
          availableKwh: 10,
          minTradeKwh: 1,
          maxTradeKwh: 10,
          pricePerKwh: 0.1,
          location: "",
          marketZone: user?.defaultMarketZone ?? "",
          availableFrom: windowDefaults.availableFrom,
          availableUntil: windowDefaults.availableUntil,
        },
  });

  const energyType = watch("energyType");
  const marketZone = watch("marketZone");
  const availableFrom = watch("availableFrom");
  const availableUntil = watch("availableUntil");

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setFieldErrors({});
    setWalletHint(false);
    try {
      const payload = toPayload(values);
      if (listing) {
        const result = await apiRequest<{ listing: ListingPublic }>(`/listings/${listing.id}`, {
          method: "PATCH",
          token,
          body: payload,
        });
        router.replace(`/marketplace/${result.listing.id}`);
      } else {
        const result = await apiRequest<{ listing: ListingPublic }>("/listings", {
          method: "POST",
          token,
          body: payload,
        });
        router.replace(`/marketplace/${result.listing.id}`);
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "WALLET_REQUIRED") {
        setWalletHint(true);
        setFormError(error.message);
        return;
      }
      if (error && typeof error === "object" && "issues" in error) {
        const next: Record<string, string> = {};
        for (const issue of (error as { issues: Array<{ path: (string | number)[]; message: string }> }).issues) {
          const key = String(issue.path[0] ?? "");
          if (key && !next[key]) next[key] = issue.message;
        }
        setFieldErrors(next);
        setFormError("Check the highlighted fields.");
        return;
      }
      setFormError(error instanceof Error ? error.message : "Unable to save this offer.");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? (
        <Alert tone="error" role="alert" title="Could not save offer">
          {formError}
        </Alert>
      ) : null}
      {walletHint ? (
        <Alert tone="warning" role="alert">
          Verify a wallet in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>{" "}
          before publishing.
        </Alert>
      ) : null}

      <Field label="Energy type" htmlFor="energyType" error={fieldErrors.energyType}>
        <Select id="energyType" {...register("energyType")}>
          {ENERGY_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Available kWh"
        htmlFor="availableKwh"
        error={fieldErrors.availableKwh}
        hint="Remaining energy only. Sold volume is recorded by the marketplace, never typed here."
      >
        <Input id="availableKwh" type="number" min="0.001" step="0.001" {...register("availableKwh", { valueAsNumber: true })} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Minimum trade kWh" htmlFor="minTradeKwh" error={fieldErrors.minTradeKwh}>
          <Input id="minTradeKwh" type="number" min="0.001" step="0.001" {...register("minTradeKwh", { valueAsNumber: true })} />
        </Field>
        <Field label="Maximum trade kWh" htmlFor="maxTradeKwh" error={fieldErrors.maxTradeKwh}>
          <Input id="maxTradeKwh" type="number" min="0.001" step="0.001" {...register("maxTradeKwh", { valueAsNumber: true })} />
        </Field>
      </div>

      <Field label="Price per kWh" htmlFor="pricePerKwh" error={fieldErrors.pricePerKwh}>
        <Input id="pricePerKwh" type="number" min="0" step="0.0001" {...register("pricePerKwh", { valueAsNumber: true })} />
      </Field>
      <PriceRecommendationPanel
        energyType={energyType}
        marketZone={marketZone}
        availableFrom={availableFrom ? fromDatetimeLocal(availableFrom).toISOString() : undefined}
        availableUntil={availableUntil ? fromDatetimeLocal(availableUntil).toISOString() : undefined}
        onApply={(price) => setValue("pricePerKwh", price, { shouldDirty: true })}
      />

      <Field label="Location" htmlFor="location" error={fieldErrors.location}>
        <Input id="location" {...register("location")} />
      </Field>

      <Field label="Market zone" htmlFor="marketZone" error={fieldErrors.marketZone}>
        <Input id="marketZone" {...register("marketZone")} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Available from" htmlFor="availableFrom" error={fieldErrors.availableFrom}>
          <Input id="availableFrom" type="datetime-local" {...register("availableFrom")} />
        </Field>
        <Field label="Available until" htmlFor="availableUntil" error={fieldErrors.availableUntil}>
          <Input id="availableUntil" type="datetime-local" {...register("availableUntil")} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : listing ? "Save changes" : "Publish offer"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/offers">Back to my offers</Link>
        </Button>
      </div>
    </form>
  );
}
