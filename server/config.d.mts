export type DashboardApiConfig = {
  host: string;
  port: number;
  allowedOrigins: string[];
  maxJsonBodyBytes: number;
  firebaseProjectId: string | undefined;
  allowDemoFirestoreWrite: boolean;
};

export function loadConfig(env?: Record<string, string | undefined>): DashboardApiConfig;
