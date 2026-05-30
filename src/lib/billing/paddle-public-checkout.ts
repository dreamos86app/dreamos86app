/**
 * Gate public pricing checkout until owner live test passes.
 */
export function paddlePublicCheckoutEnabled(): boolean {
  const raw = process.env.PADDLE_PUBLIC_CHECKOUT_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function paddleOwnerTestCheckoutEnabled(): boolean {
  const raw = process.env.PADDLE_OWNER_TEST_CHECKOUT_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function publicCheckoutBlockedMessage(): string {
  if (!paddlePublicCheckoutEnabled()) {
    return "Billing is being activated. Owner test checkout is available for admins.";
  }
  return "Billing checkout is not available yet.";
}
