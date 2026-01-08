export async function isHealthConnectAvailable(): Promise<boolean> {
  return false;
}

export async function initHealthConnect(): Promise<boolean> {
  return false;
}

export async function requestHealthConnectStepsPermissions(): Promise<boolean> {
  return false;
}

export async function ensureHealthConnectStepsPermissionOnce(): Promise<void> {
  return;
}

export async function readTodayStepsFromHealthConnect(): Promise<number | null> {
  return null;
}

export async function getTodayStepsOriginsDebug(): Promise<Record<string, number>> {
  return {};
}
