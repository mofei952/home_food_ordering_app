import { useEffect, useState } from "react";

export function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}

interface NetworkBannerProps {
  /** Shared online status from AppShell; avoids a second listener. */
  online: boolean;
}

export function NetworkBanner({ online }: NetworkBannerProps) {
  if (online) {
    return null;
  }

  return (
    <div className="network-banner" role="status">
      当前离线，可查看已缓存页面，恢复网络后再提交
    </div>
  );
}
