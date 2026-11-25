import { useEffect, useRef, useState } from "react";
import { withCsrfRetry } from "@/features/auth/api";
import { apiClient } from "@/lib/api-client";

export function ListingViewPreference({
  accountId,
  listingId,
}: {
  accountId: number;
  listingId: number;
}) {
  const key = `dealflow:listing-view-consent:${accountId}`;
  const [allowed, setAllowed] = useState(() => {
    try {
      return window.localStorage.getItem(key) === "allow";
    } catch {
      return false;
    }
  });
  const preference = useRef<HTMLElement>(null);
  const sent = useRef<number | null>(null);

  useEffect(() => {
    const browser = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (!allowed || browser.globalPrivacyControl || browser.doNotTrack === "1")
      return;

    const record = (event: Event) => {
      if (
        event.target instanceof Node &&
        preference.current?.contains(event.target)
      )
        return;
      if (
        !event.isTrusted ||
        document.visibilityState !== "visible" ||
        sent.current === listingId
      )
        return;
      sent.current = listingId;
      void withCsrfRetry(() =>
        apiClient.post(`/listings/${listingId}/views`, { consent: true }),
      ).catch(() => undefined);
    };

    const interactions = ["pointerdown", "keydown", "wheel"];
    for (const name of interactions)
      window.addEventListener(name, record, { passive: true });
    return () => {
      for (const name of interactions) window.removeEventListener(name, record);
    };
  }, [allowed, listingId]);

  function changePreference() {
    try {
      if (allowed) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, "allow");
    } catch {
      // An unavailable preference store leaves the choice in memory for this page.
    }
    setAllowed(!allowed);
  }

  return (
    <aside ref={preference} className="py-4">
      <details className="text-sm text-ink-soft">
        <summary className="w-fit cursor-pointer font-medium text-emerald-800">
          Listing analytics preferences
        </summary>
        <p className="my-2 max-w-xl">
          You can share your signed-in listing activity with DealFlow. Sellers
          see aggregate counts. This browser remembers your choice for this
          account. You can turn sharing off here at any time.
        </p>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={allowed}
            onChange={changePreference}
          />
          Share listing activity
        </label>
      </details>
    </aside>
  );
}
