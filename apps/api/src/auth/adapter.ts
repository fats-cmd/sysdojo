/**
 * Auth provider boundary. Business logic never touches the provider directly:
 * an adapter exchanges provider credentials for a stable external identity,
 * and the API then issues its own JWT keyed to our user id.
 *
 * Implementations: FakeAuthAdapter (dev mode, below) and a Supabase adapter
 * (next phase) that verifies a Supabase access token.
 */
export interface AuthAdapter {
  authenticate(input: {
    credential?: string;
    displayName?: string;
  }): Promise<{ externalId: string; displayName: string }>;
}

/** Dev-mode adapter: trusts the request and derives identity from the name. */
export class FakeAuthAdapter implements AuthAdapter {
  async authenticate(input: { credential?: string; displayName?: string }) {
    const displayName = input.displayName?.trim() || "Dev Learner";
    return {
      externalId: `dev:${displayName.toLowerCase().replace(/\s+/g, "-")}`,
      displayName,
    };
  }
}
