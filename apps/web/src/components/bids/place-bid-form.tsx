"use client";

import { EnergyType, createBidSchema, type BidPublic, type CreateBidInput, type ListingPublic, type MatchPublic } from "@enermesh/shared";
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
import { defaultBidWindow, fromDatetimeLocal, toDatetimeLocal } from "@/lib/datetime";
import { loginHref } from "@/lib/routes";

const ENERGY_TYPES = Object.values(EnergyType);

interface BidFormValues {
  requestedKwh: number;
  maxPricePerKwh: number;
  energyType: CreateBidInput["energyType"];
  marketZone: string;
  requiredFrom: string;
  requiredUntil: string;
}

export function PlaceBidForm({ listing }: { listing?: ListingPublic }) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.accessToken);
  const status = useAuthStore((state) => state.status);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const windowDefaults = defaultBidWindow();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<BidFormValues>({
    defaultValues: {
      requestedKwh: listing ? Math.min(listing.availableQuantityKwh, listing.maxTradeKwh) : 10,
      maxPricePerKwh: listing?.pricePerKwh ?? 0.1,
      energyType: listing?.energyType ?? EnergyType.SOLAR,
      marketZone: listing?.marketZone ?? user?.defaultMarketZone ?? "",
      requiredFrom: listing ? toDatetimeLocal(listing.availableFrom) : windowDefaults.requiredFrom,
      requiredUntil: listing ? toDatetimeLocal(listing.availableUntil) : windowDefaults.requiredUntil,
    },
  });

  const energyType = watch("energyType");
  const marketZone = watch("marketZone");
  const requiredFrom = watch("requiredFrom");
  const requiredUntil = watch("requiredUntil");

  if (status !== "authenticated") {
    return (
      <Alert tone="info">
        <Link href={loginHref(listing ? `/marketplace/${listing.id}` : "/bids/new")} className="underline">
          Sign in as a buyer
        </Link>{" "}
        to place a bid. Matching uses live remaining energy only.
      </Alert>
    );
  }

  if (user?.role !== "BUYER" && user?.role !== "ADMIN") {
    return (
      <Alert tone="info">
        Bidding is limited to buyer accounts. Sellers manage remaining energy from Offers.
      </Alert>
    );
  }

  if (listing && user?.id === listing.sellerId) {
    return <Alert tone="info">You cannot bid on your own listing.</Alert>;
  }

  if (listing && listing.status !== "ACTIVE" && listing.status !== "PARTIALLY_FILLED") {
    return <Alert tone="info">This listing is not accepting bids.</Alert>;
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setFieldErrors({});
    try {
      const payload = createBidSchema.parse({
        listingId: listing?.id,
        requestedKwh: Number(values.requestedKwh),
        maxPricePerKwh: Number(values.maxPricePerKwh),
        energyType: values.energyType,
        marketZone: values.marketZone,
        requiredFrom: fromDatetimeLocal(values.requiredFrom),
        requiredUntil: fromDatetimeLocal(values.requiredUntil),
      });
      const result = await apiRequest<{ bid: BidPublic; matches: MatchPublic[] }>("/bids", {
        method: "POST",
        token,
        body: payload,
      });
      router.replace(`/bids/${result.bid.id}`);
    } catch (error) {
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
      setFormError(error instanceof ApiError ? error.message : "Unable to place this bid.");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? (
        <Alert tone="error" role="alert" title="Could not place bid">
          {formError}
        </Alert>
      ) : null}
      <Alert tone="info">
        Matching is deterministic and may fill only part of this request. Sold volume is never invented.
      </Alert>

      <Field label="Requested kWh" htmlFor="requestedKwh" error={fieldErrors.requestedKwh}>
        <Input id="requestedKwh" type="number" min="0.001" step="0.001" {...register("requestedKwh", { valueAsNumber: true })} />
      </Field>
      <Field label="Max price per kWh" htmlFor="maxPricePerKwh" error={fieldErrors.maxPricePerKwh}>
        <Input id="maxPricePerKwh" type="number" min="0" step="0.0001" {...register("maxPricePerKwh", { valueAsNumber: true })} />
      </Field>
      <PriceRecommendationPanel
        energyType={energyType}
        marketZone={marketZone}
        availableFrom={requiredFrom ? fromDatetimeLocal(requiredFrom).toISOString() : undefined}
        availableUntil={requiredUntil ? fromDatetimeLocal(requiredUntil).toISOString() : undefined}
        applyLabel="Use recommended max price"
        onApply={(price) => setValue("maxPricePerKwh", price, { shouldDirty: true })}
      />
      <Field label="Energy type" htmlFor="energyType" error={fieldErrors.energyType}>
        <Select id="energyType" {...register("energyType")} disabled={Boolean(listing)}>
          {ENERGY_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Market zone" htmlFor="marketZone" error={fieldErrors.marketZone}>
        <Input id="marketZone" {...register("marketZone")} readOnly={Boolean(listing)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Needed from" htmlFor="requiredFrom" error={fieldErrors.requiredFrom}>
          <Input id="requiredFrom" type="datetime-local" {...register("requiredFrom")} />
        </Field>
        <Field label="Needed until" htmlFor="requiredUntil" error={fieldErrors.requiredUntil}>
          <Input id="requiredUntil" type="datetime-local" {...register("requiredUntil")} />
        </Field>
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Matching..." : "Place bid"}
      </Button>
    </form>
  );
}
