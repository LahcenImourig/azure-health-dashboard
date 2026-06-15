export type HealthEventType = 'Incident' | 'PlannedMaintenance' | 'Informational' | 'Security';
export type Severity = 'Critical' | 'Error' | 'Warning' | 'Informational';
export type AdvisorCategory = 'Cost' | 'Security' | 'Reliability' | 'OperationalExcellence' | 'Performance';

export interface AzureSubscription {
  id: string;
  displayName: string;
  state: string;
}

export interface AffectedResource {
  id: string;
  name: string;
  type: string;
  resourceGroup: string;
  subscriptionId?: string;
  subscriptionName?: string;
  portalUrl: string;
}

export interface ServiceHealthEvent {
  id: string;
  title: string;
  type: HealthEventType;
  status: 'Active' | 'Resolved';
  severity: Severity;
  impactedServices: string[];
  impactedRegions: string[];
  startTime: string;
  lastUpdateTime: string;
  description: string;
  subscriptionId?: string;
  subscriptionName?: string;
  // Subscriptions affected (when same event spans multiple subs)
  affectedSubscriptions?: Array<{ id: string; name: string }>;
}

export interface RetirementNotice {
  id: string;
  title: string;
  service: string;
  retirementDate: string;
  daysUntilRetirement: number;
  impactedResources: number;
  description: string;
  migrationGuideUrl?: string;
  // Link to the Microsoft announcement / Service Health advisory for this retirement
  articleUrl?: string;
  // Actual Azure resources impacted (only populated for some event types)
  affectedResources?: AffectedResource[];
  // True when affectedResources are inferred from the concerned resource type (not provided by Azure directly)
  resourcesInferred?: boolean;
  // Subscriptions flagged by Azure for this advisory (always available)
  affectedSubscriptions?: Array<{ id: string; name: string }>;
  // Impacted regions from the advisory
  regions?: string[];
}

export interface AdvisorRecommendation {
  id: string;
  category: AdvisorCategory;
  impact: 'High' | 'Medium' | 'Low';
  title: string;
  description: string;
  resourceGroup: string;
  resourceType: string;
  resourceName: string;
  resourceId?: string;
  portalUrl?: string;
  potentialSavingsUsd?: number;
  lastUpdated: string;
  subscriptionId?: string;
  subscriptionName?: string;
}

export interface CostByService {
  service: string;
  cost: number;
  currency: string;
  trend: number;
}

export interface CostByResourceGroup {
  resourceGroup: string;
  cost: number;
  currency: string;
  budget?: number;
}

export interface CostBySubscription {
  subscriptionId: string;
  subscriptionName: string;
  cost: number;
  currency: string;
}

export interface CostSummary {
  currentMonthSpend: number;
  forecastedMonthSpend: number;
  monthlyBudget: number;
  currency: string;
  budgetUtilizationPct: number;
  dailyCosts: Array<{ date: string; cost: number }>;
  byService: CostByService[];
  byResourceGroup: CostByResourceGroup[];
  bySubscription: CostBySubscription[];
  reservations?: ReservationSummary[];
}

export interface ReservationSummary {
  reservationId: string;
  reservationName: string;
  skuName: string;
  location: string;
  term: string;
  utilizationPct: number;
  usedHours: number;
  totalHours: number;
  monthlyCost: number;
  currency: string;
  subscriptionName?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  severity: Severity;
  status: 'Fired' | 'Resolved';
  firedTime: string;
  resourceGroup: string;
  resourceName: string;
  resourceType?: string;
  resourceId?: string;
  portalUrl?: string;
  description: string;
  monitorService: string;
  subscriptionId?: string;
  subscriptionName?: string;
}

export interface DashboardSummary {
  health: {
    activeIncidents: number;
    criticalIncidents: number;
    plannedMaintenance: number;
  };
  retirements: {
    within30Days: number;
    within90Days: number;
    total: number;
  };
  advisor: {
    highImpact: number;
    potentialSavingsUsd: number;
    total: number;
  };
  cost: {
    currentMonthSpend: number;
    budgetUtilizationPct: number;
    currency: string;
  };
  alerts: {
    critical: number;
    error: number;
    warning: number;
  };
}
