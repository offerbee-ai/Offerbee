import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import {
  DEFAULT_NOTIFICATION_CATEGORIES,
  ONBOARDING_CARDS_BY_ID,
  type NotificationCategories,
} from "@packages/backend/convex/onboardingCatalog";

// Mirrors the web wizard's persistence contract: every change saves (debounced)
// via onboarding.updateOnboarding so a user can resume on any device; finish is
// an atomic onboarding.completeOnboarding.

const SAVE_DEBOUNCE_MS = 500;

interface OnboardingState {
  cards: string[]; // curated catalog ids (NOT cardKeys)
  categories: string[];
  notificationCategories: NotificationCategories;
  hydrated: boolean;
  creditsInPlay: number; // live counter for the glass action bar
  toggleCard: (id: string) => void;
  toggleCategory: (key: string) => void;
  setNotificationCategory: (key: keyof NotificationCategories, value: boolean) => void;
  setStep: (step: number) => void;
  complete: () => Promise<void>;
  completing: boolean;
}

const Ctx = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.getMe);
  const updateOnboarding = useMutation(api.onboarding.updateOnboarding);
  const completeOnboarding = useMutation(api.onboarding.completeOnboarding);

  const [cards, setCards] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [notificationCategories, setNotificationCategories] = useState<NotificationCategories>(
    DEFAULT_NOTIFICATION_CATEGORIES,
  );
  const [hydrated, setHydrated] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Hydrate once from saved progress (resume mid-flow, cross-device).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || me === undefined) return;
    hydratedRef.current = true;
    if (me?.onboardingCards) setCards(me.onboardingCards);
    if (me?.spendingCategories) setCategories(me.spendingCategories);
    if (me?.notificationCategories) setNotificationCategories(me.notificationCategories);
    setHydrated(true);
  }, [me]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatch = useRef<{
    cards?: string[];
    categories?: string[];
    notificationCategories?: NotificationCategories;
    step?: number;
  }>({});

  const saveSoon = useCallback(
    (patch: typeof pendingPatch.current) => {
      pendingPatch.current = { ...pendingPatch.current, ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const toSave = pendingPatch.current;
        pendingPatch.current = {};
        updateOnboarding(toSave).catch((e) =>
          console.error("updateOnboarding failed", e),
        );
      }, SAVE_DEBOUNCE_MS);
    },
    [updateOnboarding],
  );

  const toggleCard = useCallback(
    (id: string) => {
      setCards((prev) => {
        const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id];
        saveSoon({ cards: next });
        return next;
      });
    },
    [saveSoon],
  );

  const toggleCategory = useCallback(
    (key: string) => {
      setCategories((prev) => {
        const next = prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key];
        saveSoon({ categories: next });
        return next;
      });
    },
    [saveSoon],
  );

  const setNotificationCategory = useCallback(
    (key: keyof NotificationCategories, value: boolean) => {
      setNotificationCategories((prev) => {
        const next = { ...prev, [key]: value };
        saveSoon({ notificationCategories: next });
        return next;
      });
    },
    [saveSoon],
  );

  const setStep = useCallback((step: number) => saveSoon({ step }), [saveSoon]);

  const complete = useCallback(async () => {
    if (completing) return;
    setCompleting(true);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await completeOnboarding({ cards, categories, notificationCategories });
      // The root Stack.Protected gate flips to (tabs) once getMe updates.
    } catch (e) {
      console.error("completeOnboarding failed", e);
      setCompleting(false);
    }
  }, [completing, completeOnboarding, cards, categories, notificationCategories]);

  const creditsInPlay = useMemo(
    () =>
      cards.reduce((sum, id) => sum + (ONBOARDING_CARDS_BY_ID.get(id)?.credits ?? 0), 0),
    [cards],
  );

  const value = useMemo<OnboardingState>(
    () => ({
      cards,
      categories,
      notificationCategories,
      hydrated,
      creditsInPlay,
      toggleCard,
      toggleCategory,
      setNotificationCategory,
      setStep,
      complete,
      completing,
    }),
    [
      cards,
      categories,
      notificationCategories,
      hydrated,
      creditsInPlay,
      toggleCard,
      toggleCategory,
      setNotificationCategory,
      setStep,
      complete,
      completing,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding(): OnboardingState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOnboarding must be used within <OnboardingProvider>");
  return ctx;
}
