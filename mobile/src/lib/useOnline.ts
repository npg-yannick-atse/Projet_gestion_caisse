import { useEffect, useState } from 'react';

/**
 * Indique si l'appareil est en ligne. Utilise `@react-native-community/netinfo`
 * s'il est installé (import paresseux protégé) ; sinon considère toujours en ligne.
 * Installer pour l'activer :
 *   npx expo install @react-native-community/netinfo
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let NetInfo: any = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      NetInfo = require('@react-native-community/netinfo').default;
    } catch {
      NetInfo = null;
    }
    if (!NetInfo?.addEventListener) return;

    const unsubscribe = NetInfo.addEventListener((state: any) => {
      setOnline(state?.isConnected !== false);
    });
    return () => {
      try {
        unsubscribe?.();
      } catch {
        /* no-op */
      }
    };
  }, []);

  return online;
}
