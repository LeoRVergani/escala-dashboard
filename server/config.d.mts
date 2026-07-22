export type DashboardApiConfig = {
  nodeEnv: string;
  host: string;
  port: number;
  allowedOrigins: string[];
  maxJsonBodyBytes: number;
  firebaseProjectId: string | undefined;
  allowDemoFirestoreWrite: boolean;
  allowOfficialFirestoreWrite: boolean;
  devLocalAuthEnabled: boolean;
  devLocalAdminLogins: string[];
  devSessionSecret: string | undefined;
};

export function loadConfig(env?: Record<string, string | undefined>): DashboardApiConfig;
