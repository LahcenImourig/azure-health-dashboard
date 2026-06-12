import { getServerSession } from 'next-auth';

export async function requireAuth(): Promise<{ authorized: boolean }> {
  // In local dev, bypass auth so Azure data can be tested without SSO configured
  if (process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true') {
    return { authorized: true };
  }
  const session = await getServerSession();
  return { authorized: !!session };
}
