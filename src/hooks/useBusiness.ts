import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Business, getBusiness } from '../db/businesses';

// Loads the active business; refreshes whenever the screen comes into view.
export function useBusiness(): Business | null {
  const db = useSQLiteContext();
  const { businessId } = useApp();
  const [business, setBusiness] = useState<Business | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (businessId) {
        getBusiness(db, businessId).then((b) => {
          if (active) setBusiness(b);
        });
      }
      return () => {
        active = false;
      };
    }, [db, businessId]),
  );

  return business;
}
