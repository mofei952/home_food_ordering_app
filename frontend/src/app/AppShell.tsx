import {
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { Outlet } from "react-router-dom";

import { BottomNav } from "./BottomNav";
import { NetworkBanner, useOnlineStatus } from "./NetworkBanner";

const WRITE_BUTTON_SELECTOR =
  'button[type="submit"], button[data-write="true"]';

function syncWriteButtons(root: HTMLElement, online: boolean) {
  const buttons = root.querySelectorAll<HTMLButtonElement>(WRITE_BUTTON_SELECTOR);
  for (const button of buttons) {
    if (!online) {
      if (button.dataset.offlineWasDisabled === undefined) {
        button.dataset.offlineWasDisabled = button.disabled ? "1" : "0";
      }
      button.disabled = true;
    } else if (button.dataset.offlineWasDisabled !== undefined) {
      button.disabled = button.dataset.offlineWasDisabled === "1";
      delete button.dataset.offlineWasDisabled;
    }
  }
}

interface AppShellProps {
  children?: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const online = useOnlineStatus();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) {
      return;
    }

    const apply = () => syncWriteButtons(root, online);
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
    <div className="app-shell" data-online={online ? "true" : "false"}>
      <NetworkBanner online={online} />
      <div className="app-shell__content" ref={contentRef}>
        {children ?? <Outlet />}
      </div>
      <BottomNav />
    </div>
  );
}
