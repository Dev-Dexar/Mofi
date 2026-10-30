import { Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes, Navigate, useLocation } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import { AppLayout } from './layout/AppLayout'
import { ToastProvider } from '@/context/ToastContext'
import PageTransition from './PageTransition'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { syncThemeToPath } from '@/lib/theme'

import LandingPage from '@/features/landing/LandingPage'
import LoginPage from '@/features/auth/LoginPage'
import SuspendedPage from '@/features/auth/SuspendedPage'
import DashboardPage from '@/features/dashboard/DashboardPage'
import WalletPage from '@/features/wallet/WalletPage'
import ReferralsPage from '@/features/referrals/ReferralsPage'
import HistoryPage from '@/features/history/HistoryPage'
import PayRedirect from '@/features/wallet/PayRedirect'
import AdminGuard from './AdminGuard'
import AdminOverviewPage from '@/features/admin/AdminPage'
import AdminUsersPage from '@/features/admin/AdminUsersPage'
import AdminMoneyPage from '@/features/admin/AdminMoneyPage'
import AdminAppealsPage from '@/features/admin/AdminAppealsPage'
import AdminAnalyticsPage from '@/features/admin/AdminAnalyticsPage'
import AdminSettingsPage from '@/features/admin/AdminSettingsPage'
import NotFoundPage from '@/features/misc/NotFoundPage'

// The page we are arriving from. Updated after each navigation commits, so a page rendering for the
// navigation still sees where it came from.
let previousPath = ''
function PathTracker() {
  const { pathname } = useLocation()
  useEffect(() => void (previousPath = pathname), [pathname])
  // the admin panel is dark whatever was chosen: the theme follows the page, before it is painted
  useLayoutEffect(() => syncThemeToPath(pathname), [pathname])
  return null
}

// Leaving the app: login slides in over it from the right, so the app eases back underneath; the landing page
// comes in from the left (the logo link marks that navigation 'to-landing'), so the app slides off to the right.
const APP_EXIT = { 'to-landing': 'slide-to-right', default: 'slide-to-left' }

/**
 * A signed-in page. They all share one key, so moving between them keeps the layout mounted and does not
 * replay the page slide. From the landing page the app slides in from the right, over it, the way login does;
 * from login, which slides away to the right, the app comes back from the left underneath it instead.
 */
function AppPage({ children }: { children: ReactNode }) {
  // back from login or the admin panel (which slide away to the right), the app comes in from the left underneath
  const [side] = useState<'left' | 'right'>(() => (previousPath === '/login' || previousPath.startsWith('/admin') ? 'left' : 'right'))
  return (
    <ErrorBoundary>
      <PageTransition key="app" side={side} exit={APP_EXIT}>
        <ProtectedRoute>
          <AppLayout>{children}</AppLayout>
        </ProtectedRoute>
      </PageTransition>
    </ErrorBoundary>
  )
}

/**
 * An admin panel page: the same frame as the app with the panel's menu. Its pages share one key, so moving between them
 * keeps the layout mounted; arriving from the app it slides in over it from the right, and leaving it slides off that way.
 */
function AdminPage({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <PageTransition key="admin" side="right" exit={{ 'to-landing': 'slide-to-right', default: 'slide-to-right' }}>
        <ProtectedRoute>
          <AdminGuard>
            <AppLayout mode="admin">{children}</AppLayout>
          </AdminGuard>
        </ProtectedRoute>
      </PageTransition>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <PathTracker />
          {/* nothing suspends today; kept so a page that does keeps the old one up during a navigation */}
          <Suspense fallback={null}>
            <Routes>
              {/* Public landing page. It takes no part in the slide itself: the page is thousands of pixels tall, and a named page is captured
                  whole for the browser's transition (tens of megapixels on a phone), which is what made switching pages stutter. It simply sits
                  in the screen's own picture while the login page slides over it and away. */}
              <Route path="/" element={<LandingPage />} />

              {/* Public login/signup */}
              <Route
                path="/login"
                element={
                  <PageTransition key="login" side="right">
                    <LoginPage />
                  </PageTransition>
                }
              />

              {/* Protected routes wrapped in AppLayout */}
              <Route path="/dashboard" element={<AppPage><DashboardPage /></AppPage>} />

              <Route path="/wallet" element={<AppPage><WalletPage /></AppPage>} />
              {/* the old pages, kept as links into the one wallet page */}
              <Route path="/deposit" element={<Navigate to="/wallet" replace />} />
              <Route path="/withdraw" element={<Navigate to="/wallet?tab=withdraw" replace />} />

              <Route path="/referrals" element={<AppPage><ReferralsPage /></AppPage>} />

              <Route path="/history" element={<AppPage><HistoryPage /></AppPage>} />

              <Route path="/pay/:reference" element={<PayRedirect />} />

              {/* A suspended account's one page: every protected route sends it here */}
              <Route
                path="/suspended"
                element={
                  <PageTransition key="suspended" side="right">
                    <SuspendedPage />
                  </PageTransition>
                }
              />

              {/* The admin panel: its own menu in the same frame, admins only */}
              <Route path="/admin" element={<AdminPage><AdminOverviewPage /></AdminPage>} />
              {/* one page: /admin/users/:id is the list with that account's window open over it, so the list is not reloaded behind it */}
              <Route path="/admin/users/:id?" element={<AdminPage><AdminUsersPage /></AdminPage>} />
              {/* /admin/money/<deposits|withdrawals>/<id> is that list with the one deposit or withdrawal open in a popup over it */}
              <Route path="/admin/money/:tab?/:id?" element={<AdminPage><AdminMoneyPage /></AdminPage>} />
              {/* like the users: /admin/appeals/:id is the list with that appeal open in a panel over it */}
              <Route path="/admin/appeals/:id?" element={<AdminPage><AdminAppealsPage /></AdminPage>} />
              <Route path="/admin/analytics" element={<AdminPage><AdminAnalyticsPage /></AdminPage>} />
              <Route path="/admin/settings" element={<AdminPage><AdminSettingsPage /></AdminPage>} />

              {/* Fallback route: show friendly 404 page */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  )
}

