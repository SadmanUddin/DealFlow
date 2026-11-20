import { createBrowserRouter, RouterProvider } from 'react-router';
import { MarketingLayout } from '@/components/shared/MarketingLayout';
import { LandingPage } from '@/features/landing/LandingPage';
import { PlaceholderPage } from '@/features/landing/PlaceholderPage';
import { NotFoundPage } from '@/features/landing/NotFoundPage';
import { RouteErrorPage } from '@/features/landing/RouteErrorPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <MarketingLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <LandingPage /> },
      {
        path: 'buyers',
        element: <PlaceholderPage audience="buyers" />,
      },
      {
        path: 'sellers',
        element: <PlaceholderPage audience="sellers" />,
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
