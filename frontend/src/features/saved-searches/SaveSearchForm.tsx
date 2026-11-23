import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  SectionCard,
  SectionHeading,
} from "@/components/shared/workspace/WorkspaceUI";
import { toApiError } from "@/lib/api-error";
import {
  createSavedSearch,
  frequencies,
  savedSearchKey,
  updateSavedSearch,
  type SavedFilters,
  type SavedSearch,
} from "./api";
import { savedCriteria } from "./search-filters";

export function SaveSearchForm({
  filters,
  saved,
  cancel,
  onSaved,
}: {
  filters: SavedFilters;
  saved?: SavedSearch;
  cancel: () => void;
  onSaved: () => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState(saved?.name ?? "");
  const [frequency, setFrequency] = useState(saved?.frequency ?? "off");
  const [alerts, setAlerts] = useState(
    saved?.alertsEnabled ?? filters.availability !== "sold",
  );
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const empty = savedCriteria(filters).length === 0;
  const mutation = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        filters,
        alertsEnabled: alerts,
        frequency,
        confirmEmpty,
      };
      return saved
        ? updateSavedSearch(saved.id, input)
        : createSavedSearch(input);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: savedSearchKey });
      onSaved();
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate();
  };
  return (
    <SectionCard className="mt-4">
      <SectionHeading
        title={saved ? "Edit saved search" : "Save this search"}
        description="The search uses the filters currently applied to the marketplace."
      />
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-navy-950">
            Search name
            <input
              className="mt-1 block w-full rounded-lg border border-line px-3 py-2 focus-visible:outline-2 focus-visible:outline-emerald-700"
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="text-sm font-semibold text-navy-950">
            Email frequency
            <select
              className="mt-1 block w-full rounded-lg border border-line px-3 py-2 focus-visible:outline-2 focus-visible:outline-emerald-700"
              value={frequency}
              onChange={(event) =>
                setFrequency(event.target.value as SavedSearch["frequency"])
              }
            >
              {frequencies.map((option) => (
                <option key={option} value={option}>
                  {option[0].toUpperCase() + option.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-sm text-ink-soft">
          Email Off keeps in-app alerts enabled. The listing status email
          setting in your account also controls delivery.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={alerts}
            onChange={(event) => setAlerts(event.target.checked)}
          />
          Enable alerts for this search
        </label>
        {filters.availability === "sold" && (
          <p className="text-sm text-ink-soft">
            Sold-only searches can be reopened. Alerts cover newly published
            businesses.
          </p>
        )}
        {empty && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              required
              checked={confirmEmpty}
              onChange={(event) => setConfirmEmpty(event.target.checked)}
            />
            Save this search without keyword, location, industry, or financial
            filters
          </label>
        )}
        {mutation.isError && (
          <p role="alert" className="text-sm text-rose-900">
            {toApiError(mutation.error).message}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={
              mutation.isPending || !name.trim() || (empty && !confirmEmpty)
            }
            variant="accent"
          >
            {mutation.isPending
              ? "Saving…"
              : saved
                ? "Save changes"
                : "Save search"}
          </Button>
          <Button
            variant="outline"
            type="button"
            onClick={cancel}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
