export const WBS_DATA_REFRESH_EVENT = "wbs-data-refresh";

export function emitWbsDataRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WBS_DATA_REFRESH_EVENT));
}
