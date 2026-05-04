import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { propertiesApi } from '../services/api';
import type { Property } from '../types';

const ACTIVE_PROPERTY_STORAGE_KEY = 'activePropertyId';

// Local fallback so the toggle still has the two chalets even if Firestore
// reads fail (rules out of date, network blip, etc). Mirrors the Firestore
// seed in `services/firestore.ts → ensureSeedData`.
const FALLBACK_PROPERTIES: Property[] = [
  {
    id: 'gilan',
    name: { en: 'Gilan Chalet', ar: 'شاليه جيلان' },
    type: 'Luxury Chalet',
    capacity: 10,
    area_sqm: 750,
    nightly_rate: 120,
    security_deposit: 50,
    description: 'A serene retreat where modern luxury meets Omani heritage.',
    images: [],
    amenities: [],
    calendarSyncId: 'gilan-cal-001',
    status: 'active',
  },
  {
    id: 'milan',
    name: { en: 'Milan Chalet', ar: 'شاليه ميلان' },
    type: 'Luxury Chalet',
    capacity: 12,
    area_sqm: 900,
    nightly_rate: 140,
    security_deposit: 60,
    description: 'A spacious chalet designed for gatherings.',
    images: [],
    amenities: [],
    calendarSyncId: 'milan-cal-001',
    status: 'active',
  },
];

interface PropertyContextValue {
  /** Active properties available for selection. Empty until first load. */
  properties: Property[];
  /** Currently selected property id, or null while loading or if no active properties exist. */
  activePropertyId: string | null;
  /** Selected property record, derived from `activePropertyId`. */
  activeProperty: Property | null;
  /** Switch the active property. No-op if `id` is not in `properties`. */
  setActivePropertyId: (id: string) => void;
  /** True until the first properties snapshot resolves. */
  loading: boolean;
  /**
   * Create a new property record and switch to it. Returns the new property id.
   * Used by the admin "Add New Property" flow — the new property immediately
   * appears in the toggle for guests once the snapshot listener picks it up.
   */
  addProperty: (data: {
    /** Optional override id; defaults to a slugified name or timestamp. */
    id?: string;
    name: string | { en: string; ar: string };
    type?: string;
    capacity?: number;
    area_sqm?: number;
    nightly_rate?: number;
    security_deposit?: number;
    description?: string;
    images?: { url: string; label?: string }[];
    amenities?: string[];
    calendarSyncId?: string;
  }) => Promise<string>;
}

const PropertyContext = createContext<PropertyContextValue | null>(null);

export const PropertyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [activePropertyId, setActivePropertyIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACTIVE_PROPERTY_STORAGE_KEY);
  });
  const [loading, setLoading] = useState(true);

  // Real-time subscription so that an admin adding a new property in another
  // tab (or even the same session) propagates to all clients without a reload.
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    // Trigger seeding once before subscribing so the first snapshot is populated.
    propertiesApi.list().catch(() => undefined).finally(() => {
      if (cancelled) return;
      const q = query(collection(db, 'properties'), where('status', '==', 'active'));
      cleanup = onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Property[];
          // Stable order: by created_at if available, else by id.
          list.sort((a: any, b: any) =>
            (a.created_at || '').localeCompare(b.created_at || '') || a.id.localeCompare(b.id),
          );
          // If Firestore returned nothing (collection empty or rules denied
          // before the seed could run), fall back to the local seed so the
          // toggle and booking flow still work.
          setProperties(list.length > 0 ? list : FALLBACK_PROPERTIES);
          setLoading(false);
        },
        (err) => {
          console.warn('Properties listener failed, using fallback list:', err);
          setProperties(FALLBACK_PROPERTIES);
          setLoading(false);
        },
      );
    });

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, []);

  // Reconcile the active id whenever the property list changes.
  useEffect(() => {
    if (properties.length === 0) return;
    const stillExists = activePropertyId && properties.some(p => p.id === activePropertyId);
    if (!stillExists) {
      setActivePropertyIdState(properties[0].id);
    }
  }, [properties, activePropertyId]);

  // Persist the selection.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activePropertyId) {
      localStorage.setItem(ACTIVE_PROPERTY_STORAGE_KEY, activePropertyId);
    }
  }, [activePropertyId]);

  const setActivePropertyId = useCallback((id: string) => {
    setActivePropertyIdState(prev => {
      if (prev === id) return prev;
      // Defensive: only switch to a known property id.
      const known = properties.some(p => p.id === id);
      return known ? id : prev;
    });
  }, [properties]);

  const addProperty = useCallback<PropertyContextValue['addProperty']>(async (data) => {
    const created = await propertiesApi.create(data);
    // Optimistically switch — the snapshot listener will fill in the rest.
    setActivePropertyIdState(created.id);
    return created.id;
  }, []);

  const activeProperty = useMemo<Property | null>(() => {
    if (!activePropertyId) return null;
    return properties.find(p => p.id === activePropertyId) || null;
  }, [activePropertyId, properties]);

  const value = useMemo<PropertyContextValue>(() => ({
    properties,
    activePropertyId,
    activeProperty,
    setActivePropertyId,
    loading,
    addProperty,
  }), [properties, activePropertyId, activeProperty, setActivePropertyId, loading, addProperty]);

  return (
    <PropertyContext.Provider value={value}>
      {children}
    </PropertyContext.Provider>
  );
};

export function useProperty(): PropertyContextValue {
  const ctx = useContext(PropertyContext);
  if (!ctx) throw new Error('useProperty must be used within PropertyProvider');
  return ctx;
}
