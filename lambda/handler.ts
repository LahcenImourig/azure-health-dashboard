/**
 * AWS Lambda handler for the daily report cron trigger.
 * Deploy this function and trigger it via EventBridge Scheduler at 7am (your timezone).
 *
 * EventBridge schedule expression: cron(0 7 * * ? *)
 * Set DASHBOARD_URL and CRON_SECRET env vars in Lambda configuration.
 */

export const handler = async () => {
  const dashboardUrl = process.env.DASHBOARD_URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!dashboardUrl || !cronSecret) {
    throw new Error('Missing DASHBOARD_URL or CRON_SECRET environment variables');
  }

  console.log('Triggering daily report at', new Date().toISOString());

  const response = await fetch(`${dashboardUrl}/api/report/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cronSecret}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Report API returned ${response.status}: ${body}`);
  }

  const result = await response.json() as { success: boolean; narrative: string };
  console.log('Report sent successfully:', result.narrative?.slice(0, 100));

  return { statusCode: 200, body: JSON.stringify(result) };
};
