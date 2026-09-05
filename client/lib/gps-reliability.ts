let installed = false;

/**
 * Makes browser/WebView geolocation more resilient for field verification.
 *
 * Veritas requests high-accuracy GPS first. Some Android WebViews and desktop
 * browsers can time out before a satellite fix is available even though
 * location permission has been granted. For temporary/unavailable fixes we
 * retry once with coarse/network-assisted positioning. Permission denials are
 * never bypassed or retried.
 */
export function installGpsReliabilityFallback() {
  if (installed || typeof navigator === "undefined" || !navigator.geolocation) {
    return;
  }

  const geolocation = navigator.geolocation;
  const nativeGetCurrentPosition = geolocation.getCurrentPosition.bind(geolocation);

  try {
    geolocation.getCurrentPosition = (
      success: PositionCallback,
      error?: PositionErrorCallback | null,
      options?: PositionOptions,
    ) => {
      const requested = options ?? {};
      const primaryOptions: PositionOptions = {
        ...requested,
        enableHighAccuracy: requested.enableHighAccuracy ?? true,
        timeout: Math.max(requested.timeout ?? 20_000, 20_000),
        maximumAge: requested.maximumAge ?? 0,
      };

      nativeGetCurrentPosition(
        success,
        (primaryError) => {
          if (primaryError.code === primaryError.PERMISSION_DENIED) {
            error?.(primaryError);
            return;
          }

          const fallbackOptions: PositionOptions = {
            enableHighAccuracy: false,
            timeout: 20_000,
            maximumAge: 30_000,
          };

          nativeGetCurrentPosition(success, error ?? undefined, fallbackOptions);
        },
        primaryOptions,
      );
    };

    installed = true;
  } catch {
    // Some browser engines expose geolocation methods as non-writable.
    // In that case Veritas continues using the native implementation.
  }
}

installGpsReliabilityFallback();
