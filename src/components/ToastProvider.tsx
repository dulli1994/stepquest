import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

type ToastType = "success" | "info" | "error";
type ToastPosition = "top" | "bottom";

type ToastPayload = {
  title?: string;
  message: string;
  type?: ToastType;
  durationMs?: number;
  position?: ToastPosition; // ✅ optional
};

type ToastContextValue = {
  showToast: (t: ToastPayload) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<(ToastPayload & { id: number }) | null>(null);

  const opacity = useRef(new Animated.Value(0)).current;
  // ✅ kommt von oben rein (negativ) und slidet nach 0
  const translateY = useRef(new Animated.Value(-30)).current;

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -30, duration: 180, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [opacity, translateY]);

  const showToast = useCallback(
    ({ title, message, type = "info", durationMs = 5000, position = "top" }: ToastPayload) => {
      const id = Date.now();
      setToast({ id, title, message, type, durationMs, position });

      opacity.setValue(0);
      translateY.setValue(-30);

      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();

      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => hide(), durationMs);
    },
    [hide, opacity, translateY]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  const bg = toast?.type === "success" ? "#16a34a" : toast?.type === "error" ? "#dc2626" : "#0f172a";
  const wrapStyle = toast?.position === "bottom" ? styles.toastWrapBottom : styles.toastWrapTop;

  return (
    <ToastContext.Provider value={value}>
      {children}

      {toast && (
        <Animated.View pointerEvents="none" style={[wrapStyle, { opacity, transform: [{ translateY }] }]}>
          <View style={[styles.toast, { backgroundColor: bg }]}>
            {!!toast.title && <Text style={styles.title}>{toast.title}</Text>}
            <Text style={styles.msg}>{toast.message}</Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider />");
  return ctx;
}

const styles = StyleSheet.create({
  toastWrapTop: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 56, 
    alignItems: "center",
  },
  toastWrapBottom: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 28,
    alignItems: "center",
  },
  toast: {
    width: "100%",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
  },
  title: { color: "white", fontWeight: "900", fontSize: 16, marginBottom: 3 },
  msg: { color: "white", fontWeight: "700", fontSize: 14, opacity: 0.95 },
});
