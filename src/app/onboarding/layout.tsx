/**
 * Full-screen onboarding — no PlatformShell sidebar or top bar.
 * Route: /onboarding (outside the (app) route group).
 */
export default function OnboardingRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="relative min-h-[100dvh] overflow-x-hidden bg-background">{children}</div>;
}
