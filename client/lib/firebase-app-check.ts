type AppCheckModule = {
  initializeAppCheck: (app: unknown, options: unknown) => unknown;
  ReCaptchaEnterpriseProvider: new (siteKey: string) => unknown;
  getToken: (
    appCheck: unknown,
    forceRefresh?: boolean,
  ) => Promise<{ token: string }>;
};

let tokenProvider: Promise<() => Promise<string | undefined>> | undefined;

async function createTokenProvider() {
  const siteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY?.trim();
  const appId = import.meta.env.VITE_FIREBASE_APP_ID?.trim();
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!siteKey || !appId || !apiKey || !projectId) return async () => undefined;

  const version = "12.2.1";
  const appUrl = `https://www.gstatic.com/firebasejs/${version}/firebase-app.js`;
  const appCheckUrl = `https://www.gstatic.com/firebasejs/${version}/firebase-app-check.js`;
  const appModule = (await import(/* @vite-ignore */ appUrl)) as {
    initializeApp: (config: Record<string, string>) => unknown;
  };
  const appCheckModule = (await import(
    /* @vite-ignore */ appCheckUrl
  )) as AppCheckModule;
  const app = appModule.initializeApp({ apiKey, projectId, appId });
  const appCheck = appCheckModule.initializeAppCheck(app, {
    provider: new appCheckModule.ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return async () => (await appCheckModule.getToken(appCheck, false)).token;
}

export async function getAppCheckHeader() {
  tokenProvider ??= createTokenProvider();
  try {
    const token = await (await tokenProvider)();
    return token ? { "X-Firebase-AppCheck": token } : {};
  } catch {
    return {};
  }
}
