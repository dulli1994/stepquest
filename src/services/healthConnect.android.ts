import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  requestPermission,
  readRecords,
  SdkAvailabilityStatus,
} from "react-native-health-connect";

/**
 * Optionaler Storage-Key, um Permission-Dialog nicht bei jedem Start aufzurufen.
 */
const HC_ASKED_KEY = "stepquest.hc.permissionsAsked";

/**
 * YYYY-MM-DD
 */
function getDayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDayISO(now: Date) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Prüft, ob Health Connect auf dem Gerät verfügbar ist.
 * - Android 14+: im Framework
 * - Android 13 und tiefer: Health Connect App muss installiert/aktuell sein
 */
export async function isHealthConnectAvailable(): Promise<boolean> {
  const status = await getSdkStatus();
  return status === SdkAvailabilityStatus.SDK_AVAILABLE;
}

/**
 * Initialisiert Health Connect. Muss vor readRecords/requestPermission passieren.
 */
export async function initHealthConnect(): Promise<boolean> {
  const status = await getSdkStatus();

  if (status === SdkAvailabilityStatus.SDK_AVAILABLE) {
    return initialize();
  }

  // Optional: Bei "Update required" oder "Unavailable" kannst du den Nutzer in die Settings schicken.
  // Achtung: auf manchen ROMs ist die UX hier unterschiedlich.
  try {
    await openHealthConnectSettings();
  } catch {
    // Ignorieren
  }

  return false;
}

/**
 * Fordert Permissions für Steps + Background-Reads an.
 * BackgroundAccessPermission ist eine "Special Permission" in Health Connect. :contentReference[oaicite:4]{index=4}
 */
export async function requestHealthConnectStepsPermissions(opts?: { includeBackground?: boolean }): Promise<boolean> {
  const ok = await initHealthConnect();
  if (!ok) return false;

  const includeBackground = opts?.includeBackground ?? true;

  const permissions = [
    ...(includeBackground
      ? [
          {
            accessType: "read" as const,
            recordType: "BackgroundAccessPermission" as const,
          },
        ]
      : []),
    {
      accessType: "read" as const,
      recordType: "Steps" as const,
    },
  ];

  const granted = await requestPermission(permissions);
  const hasStepsRead = granted.some((p) => p.recordType === "Steps" && p.accessType === "read");
  return hasStepsRead;
}

/**
 * Einmalige Permission-Anfrage (damit Home nicht jedes Mal das Permissions UI aufreißt).
 */
export async function ensureHealthConnectStepsPermissionOnce(): Promise<void> {
  const available = await isHealthConnectAvailable();
  if (!available) return;

  const asked = await AsyncStorage.getItem(HC_ASKED_KEY);
  if (asked === "1") return;

  // Erst markieren, wenn HC grundsätzlich verfügbar ist.
  await AsyncStorage.setItem(HC_ASKED_KEY, "1");

  // Permissions UI wird nur dann geöffnet, wenn noch nicht granted.
  await requestHealthConnectStepsPermissions({ includeBackground: true });
}

/**
 * Liest "heute" Steps über Health Connect.
 *
 * WICHTIG: Health Connect kann mehrere Data Origins haben (Samsung Health + Google Fit + …).
 * Viele Implementierungen "summieren alles" und overcounten dann. Siehe bekannte Reports. :contentReference[oaicite:5]{index=5}
 *
 * Strategie hier:
 * - Wir summieren pro dataOrigin und nehmen dann den MAX-Wert.
 *   (Damit vermeidest du meistens Double-Counting über mehrere Apps.)
 */
export async function readTodayStepsFromHealthConnect(): Promise<number | null> {
  const ok = await initHealthConnect();
  if (!ok) return null;

  const now = new Date();
  const startTime = startOfDayISO(now);
  const endTime = now.toISOString();

  const res = await readRecords("Steps", {
    timeRangeFilter: {
      operator: "between",
      startTime,
      endTime,
    },
  });

  const records = res?.records ?? [];
  if (records.length === 0) return 0;

  const totalsByOrigin = new Map<string, number>();

  for (const r of records as any[]) {
    const origin: string | undefined = r?.metadata?.dataOrigin;
    const count: number | undefined = r?.count;

    if (!origin || typeof count !== "number") continue;

    // Optional: manche Geräte liefern "__platform" / "unknown" Origins -> rausfiltern.
    // Siehe reale Fälle, wo das zu falschen Daten führt. :contentReference[oaicite:6]{index=6}
    if (origin.includes("__platform")) continue;

    totalsByOrigin.set(origin, (totalsByOrigin.get(origin) ?? 0) + count);
  }

  if (totalsByOrigin.size === 0) return 0;

  let best = 0;
  for (const v of totalsByOrigin.values()) best = Math.max(best, v);

  return best;
}

/**
 * Debug-Helfer (optional): zeigt dir, welche Origins heute Daten liefern.
 */
export async function getTodayStepsOriginsDebug(): Promise<Record<string, number>> {
  const ok = await initHealthConnect();
  if (!ok) return {};

  const now = new Date();
  const res = await readRecords("Steps", {
    timeRangeFilter: {
      operator: "between",
      startTime: startOfDayISO(now),
      endTime: now.toISOString(),
    },
  });

  const out: Record<string, number> = {};
  for (const r of (res?.records ?? []) as any[]) {
    const origin: string | undefined = r?.metadata?.dataOrigin;
    const count: number | undefined = r?.count;
    if (!origin || typeof count !== "number") continue;
    out[origin] = (out[origin] ?? 0) + count;
  }
  return out;
}
