import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { ErrorState } from "@/components/shared/ErrorState";

export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Try opening the page again, or return to the homepage.";

  return (
    <main className="page-container grid min-h-screen place-items-center py-16">
      <div className="w-full max-w-lg">
        <ErrorState
          description={message}
          title="This page couldn’t be opened"
        />
        <Link
          className="mt-4 inline-flex text-sm font-medium text-emerald-800 hover:underline"
          to="/"
        >
          Return to the homepage
        </Link>
      </div>
    </main>
  );
}
