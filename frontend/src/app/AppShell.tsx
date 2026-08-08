import {
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { Outlet } from "react-router-dom";

import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";
import { NetworkBanner, useOnlineStatus } from "./NetworkBanner";

const WRITE_CONTROL_SELECTOR = [
  'button[type="submit"]',
  'button[data-write="true"]',
  'select[data-write="true"]',
  'input[type="file"][data-write="true"]',
].join(", ");

function syncWriteControls(root: HTMLElement, online: boolean) {
  const controls = root.querySelectorAll<
    HTMLButtonElement | HTMLSelectElement | HTMLInputElement
  >(WRITE_CONTROL_SELECTOR);
  for (const control of controls) {
    if (!online) {
      if (control.dataset.offlineWasDisabled === undefined) {
        control.dataset.offlineWasDisabled = control.disabled ? "1" : "0";
      }
      control.disabled = true;
    } else if (control.dataset.offlineWasDisabled !== undefined) {
      control.disabled = control.dataset.offlineWasDisabled === "1";
      delete control.dataset.offlineWasDisabled;
    }
  }
}

interface AppShellProps {
  children?: ReactNode;
  headerActions?: ReactNode;
}

export function AppShell({
  children,
  headerActions,
}: AppShellProps) {
  const online = useOnlineStatus();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) {
      return;
    }

    const apply = () => syncWriteControls(root, online);
    apply();

    const observer = new MutationObserver(apply);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "type", "data-write"],
    });

    return () => observer.disconnect();
  }, [online]);

  return (
    <div className="app-viewport">
      <div className="app-shell" data-online={online ? "true" : "false"}>
        <NetworkBanner online={online} />
        <AppHeader actions={headerActions} />
        <div className="app-shell__content" ref={contentRef}>
          {children ?? <Outlet />}
        </div>
        <BottomNav />
      </div>
    </div>
  );
}
