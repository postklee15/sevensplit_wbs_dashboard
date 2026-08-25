"use client";

import { useEffect } from "react";
import { WBS_DATA_REFRESH_EVENT } from "@/lib/wbsRefresh";

export function useWbsDataRefresh(load: () => void): void {
  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener(WBS_DATA_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(WBS_DATA_REFRESH_EVENT, onRefresh);
  }, [load]);
}
