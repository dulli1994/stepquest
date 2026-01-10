import { collection, doc, getCountFromServer, getDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { getLeaderboard } from "../../src/services/db";
import { auth, db } from "../../src/services/firebase";

type Row = { 
  uid: string; 
  bestDailySteps?: number; 
};

export default function Highscore() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Für die Statistik
  const [totalUsers, setTotalUsers] = useState(0); 
  const [myRank, setMyRank] = useState<number | null>(null);
  
  // Eigene Daten extra speichern für die Leiste unten
  const [myData, setMyData] = useState<Row | null>(null);

  const myUid = useMemo(() => auth.currentUser?.uid ?? null, []);

  async function load() {
    try {
      setLoading(true);

      // 1. Leaderboard laden (Top 50 für die Liste)
      const topData = await getLeaderboard(50);
      setRows(topData);

      // 2. Gesamtanzahl User zählen (für die Anzeige "von 980")
      const coll = collection(db, "scores");
      const snapshot = await getCountFromServer(coll);
      setTotalUsers(snapshot.data().count);

      // 3. Meinen Rang in der Top-Liste suchen
      const myIndex = topData.findIndex(r => r.uid === myUid);
      if (myIndex !== -1) {
        setMyRank(myIndex + 1);
        setMyData(topData[myIndex]); // Daten direkt aus der Liste nehmen
      } else {
        // Wenn ich NICHT in der Top Liste bin, muss ich meine Daten einzeln laden
        // damit die Leiste unten trotzdem etwas anzeigt!
        setMyRank(null); 
        if (myUid) {
            const myDocRef = doc(db, "scores", myUid);
            const mySnap = await getDoc(myDocRef);
            if (mySnap.exists()) {
                setMyData({ uid: myUid, ...mySnap.data() } as Row);
            }
        }
      }

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // --- HELPER ---
  const formatId = (uid: string, isMe: boolean) => {
    if (isMe) return "Du";
    return "User " + uid.substring(0, 4); 
  };

  const getInitials = (uid: string) => {
    return uid.substring(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F8EF7" />
        <Text style={styles.loadingText}>Lade Rangliste...</Text>
      </View>
    );
  }

  // Daten aufteilen
  const first = rows[0] || null;
  const second = rows[1] || null;
  const third = rows[2] || null;
  const listData = rows.slice(3); // Liste beginnt ab Platz 4

  // --- PODIUM COMPONENT ---
  const PodiumItem = ({ item, rank, color, height }: { item: Row | null, rank: number, color: string, height: number }) => {
    if (!item) return <View style={{ width: 90 }} />; 
    const isMe = myUid && item.uid === myUid;
    
    return (
      <View style={styles.podiumColumn}>
        <View style={[styles.avatarBox, { backgroundColor: color }]}>
             <Text style={styles.avatarText}>{getInitials(item.uid)}</Text>
        </View>
        <Text style={styles.podiumName} numberOfLines={1}>
            {formatId(item.uid, isMe || false)}
        </Text>
        <Text style={styles.podiumSteps}>{item.bestDailySteps ?? 0}</Text>
        <View style={[styles.podiumBar, { backgroundColor: color, height: height }]}>
          <Text style={styles.podiumRank}>#{rank}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 1. HEADER (Fixiert oben) */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>StepQuest</Text>
      </View>

      {/* 2. SCROLLBARE LISTE */}
      <FlatList
        data={listData}
        keyExtractor={(item) => item.uid}
        // WICHTIG: Genug Platz unten lassen, damit die Liste nicht hinter der Footer-Bar verschwindet
        contentContainerStyle={{ paddingBottom: 100 }} 
        showsVerticalScrollIndicator={false}
        
        ListHeaderComponent={() => (
          <View>
            <View style={styles.subHeader}>
              <Text style={styles.subHeaderTitle}>Rangliste</Text>
              <Text style={styles.subHeaderSubtitle}>Diese Woche</Text>
            </View>

            {/* PODIUM */}
            <View style={styles.podiumContainer}>
              <PodiumItem item={second} rank={2} color="#A0A0A0" height={100} />
              <PodiumItem item={first} rank={1} color="#FFD700" height={130} />
              <PodiumItem item={third} rank={3} color="#CD7F32" height={80} />
            </View>

            {/* INFO ZEILE */}
            <View style={styles.listHeaderRow}>
                <Text style={styles.listTitle}>Top 50</Text>
                <View style={styles.myRankContainer}>
                    <Text style={styles.myRankText}>
                        (Du: {myRank ? `#${myRank}` : "-"} / {totalUsers})
                    </Text>
                </View>
            </View>
          </View>
        )}

        renderItem={({ item, index }) => {
          const realRank = index + 4; 
          const isMe = myUid && item.uid === myUid;

          return (
            <View style={[styles.cardItem, isMe && styles.cardItemMe]}>
              <View style={styles.rankCircle}>
                 <Text style={styles.rankText}>{realRank}</Text>
              </View>
              <View style={styles.avatarSmall}>
                  <Text style={styles.avatarSmallText}>{getInitials(item.uid)}</Text>
              </View>
              <View style={styles.infoCol}>
                <Text style={styles.nameText}>{formatId(item.uid, isMe || false)}</Text>
                <Text style={styles.stepsLabel}>Schritte</Text>
              </View>
              <View style={{alignItems: 'flex-end'}}>
                 <Text style={styles.scoreText}>{item.bestDailySteps ?? 0}</Text>
              </View>
            </View>
          );
        }}
      />

      {/* 3. STICKY FOOTER (DEINE LEISTE) */}
      {/* Wird nur angezeigt, wenn Daten geladen sind */}
      {myData && (
        <View style={styles.stickyFooter}>
            <View style={styles.footerContent}>
                {/* Dein Rang */}
                <View style={styles.rankCircleFooter}>
                    <Text style={styles.rankTextFooter}>
                        {myRank ? `#${myRank}` : "-"}
                    </Text>
                </View>

                {/* Deine Info */}
                <View style={styles.footerInfo}>
                    <Text style={styles.footerLabel}>Dein aktueller Stand</Text>
                    <Text style={styles.footerName}>Du (Platz {myRank ? myRank : "?"} von {totalUsers})</Text>
                </View>

                {/* Deine Schritte */}
                <Text style={styles.footerScore}>{myData.bestDailySteps ?? 0}</Text>
            </View>
        </View>
      )}

    </View>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9F9F9" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#666" },

  // Header
  header: {
    height: 90, 
    backgroundColor: "#4F8EF7", 
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 15,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, elevation: 5,
    zIndex: 10 // Damit der Header über der Liste liegt beim "bouncen"
  },
  headerTitle: { color: "#fff", fontSize: 24, fontWeight: "900", letterSpacing: 1 },

  // Subheader & Podium
  subHeader: { alignItems: "center", marginTop: 20, marginBottom: 10 },
  subHeaderTitle: { fontSize: 20, fontWeight: "700", color: "#333" },
  subHeaderSubtitle: { fontSize: 14, color: "#888" },

  podiumContainer: {
    flexDirection: "row", justifyContent: "center", alignItems: "flex-end",
    height: 280, marginBottom: 20, gap: 10,
  },
  podiumColumn: { alignItems: "center", width: 90, justifyContent: 'flex-end' },
  avatarBox: {
    width: 50, height: 50, borderRadius: 12, 
    justifyContent: "center", alignItems: "center", marginBottom: 8,
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, elevation: 3
  },
  avatarText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  podiumName: { fontSize: 13, fontWeight: "bold", color: "#555", marginBottom: 2 },
  podiumSteps: { fontSize: 12, color: "#888", marginBottom: 6 },
  podiumBar: {
    width: "100%", borderTopLeftRadius: 10, borderTopRightRadius: 10,
    justifyContent: "flex-start", alignItems: "center", paddingTop: 10,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 3, elevation: 4
  },
  podiumRank: { color: "#fff", fontWeight: "900", fontSize: 28, opacity: 0.9 },

  // Listen Header
  listHeaderRow: { 
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', 
      paddingHorizontal: 24, marginBottom: 10 
  },
  listTitle: { fontSize: 18, fontWeight: "700", color: "#333" },
  myRankContainer: { backgroundColor: "#E0E0E0", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  myRankText: { fontSize: 12, fontWeight: "600", color: "#555" },

  // List Items
  cardItem: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    marginHorizontal: 20, marginBottom: 10, padding: 16, borderRadius: 16,
    shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 4, elevation: 2,
    borderWidth: 1, borderColor: "#f0f0f0"
  },
  cardItemMe: {
    borderColor: "#4F8EF7", borderWidth: 2, backgroundColor: "#F4F9FF"
  },
  rankCircle: { width: 30, marginRight: 8, alignItems: 'center' },
  rankText: { fontSize: 16, fontWeight: "bold", color: "#888" },
  avatarSmall: { 
      width: 42, height: 42, borderRadius: 21, backgroundColor: "#F2F4F8", 
      justifyContent: 'center', alignItems: 'center', marginRight: 14 
  },
  avatarSmallText: { fontWeight: 'bold', color: "#666", fontSize: 14 },
  infoCol: { flex: 1 },
  nameText: { fontSize: 15, fontWeight: "700", color: "#333" },
  stepsLabel: { fontSize: 12, color: "#999" },
  scoreText: { fontSize: 18, fontWeight: "900", color: "#333" },

  // --- STICKY FOOTER STYLES ---
  stickyFooter: {
    position: 'absolute',
    bottom: 20, // Abstand vom unteren Rand
    left: 20,
    right: 20,
    backgroundColor: '#222', // Dunkles Design für den Kontrast
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10, elevation: 10, shadowOffset: {width: 0, height: 5}
  },
  footerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankCircleFooter: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#444',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12
  },
  rankTextFooter: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  footerInfo: { flex: 1 },
  footerLabel: { color: '#aaa', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  footerName: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  footerScore: { color: '#4F8EF7', fontSize: 22, fontWeight: '900' }
});