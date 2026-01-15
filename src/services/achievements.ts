import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  arrayUnion,
  orderBy,
} from "firebase/firestore";
import { db } from "./firebase";

type AchievementDef = {
  title: string;
  stepsRequired: number;
  unlockItemIds: string[];
  order?: number;
};

export async function getEligibleAchievements(steps: number) {
  const q = query(
    collection(db, "achievements"),
    where("stepsRequired", "<=", steps),
    orderBy("stepsRequired", "asc")
  );

  const snap = await getDocs(q);

  const list = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as AchievementDef),
  }));

  // optional: falls "order" verwendet wird
  list.sort((a, b) => {
    const ao = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
    const bo = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (a.stepsRequired ?? 0) - (b.stepsRequired ?? 0);
  });

  return list;
}

export async function unlockAchievementsIfNeeded(uid: string, steps: number) {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return { unlocked: [] as string[], unlockedItems: [] as string[] };

  const user = userSnap.data() as {
    unlockedAchievementIds?: string[];
    unlockedItemIds?: string[];
  };

  const already = new Set(user.unlockedAchievementIds ?? []);
  const eligible = await getEligibleAchievements(steps);

  const newly = eligible.filter((a) => !already.has(a.id));
  if (newly.length === 0) return { unlocked: [], unlockedItems: [] };

  const unlockedAchievementIds = newly.map((a) => a.id);
  const unlockedItemIds = newly.flatMap((a) => a.unlockItemIds ?? []);

  await updateDoc(userRef, {
    unlockedAchievementIds: arrayUnion(...unlockedAchievementIds),
    unlockedItemIds: arrayUnion(...unlockedItemIds),
  });

  return { unlocked: unlockedAchievementIds, unlockedItems: unlockedItemIds };
}
