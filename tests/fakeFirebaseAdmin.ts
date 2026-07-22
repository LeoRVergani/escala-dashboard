type CollectionName = 'user_links' | 'system_admins' | string;
type Collections = Record<CollectionName, Record<string, Record<string, unknown>>>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createFakeFirebaseAdmin(options: {
  tokens?: Record<string, { uid: string; email?: string }>;
  data?: Collections;
} = {}) {
  const data: Collections = clone(options.data ?? {});
  const tokens = options.tokens ?? {};

  const db = {
    data,
    collection(name: string) {
      data[name] ??= {};
      return {
        doc(id: string) {
          return {
            async get() {
              const value = data[name][id];
              return {
                id,
                exists: value !== undefined,
                data: () => (value === undefined ? undefined : clone(value)),
              };
            },
            async set(value: Record<string, unknown>, options?: { merge?: boolean }) {
              data[name][id] = options?.merge ? { ...(data[name][id] ?? {}), ...clone(value) } : clone(value);
            },
          };
        },
        async get() {
          return {
            docs: Object.entries(data[name]).map(([id, value]) => ({
              id,
              data: () => clone(value),
            })),
          };
        },
      };
    },
  };

  return {
    data,
    getFirebaseAdmin: () => ({
      configured: true,
      auth: {
        async verifyIdToken(token: string) {
          const decoded = tokens[token];
          if (!decoded) throw new Error('invalid token');
          return decoded;
        },
      },
      db,
    }),
  };
}
