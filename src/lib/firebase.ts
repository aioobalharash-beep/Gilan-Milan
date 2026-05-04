import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { BookingData } from '@/src/types';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

const BOOKINGS_COLLECTION = 'bookings';

export async function saveBooking(data: BookingData): Promise<string> {
  const docRef = await addDoc(collection(db, BOOKINGS_COLLECTION), {
    guestName: data.guestName,
    phone: data.phone,
    checkIn: Timestamp.fromDate(data.checkIn),
    checkOut: Timestamp.fromDate(data.checkOut),
    nights: data.nights,
    nightlyRate: data.nightlyRate,
    deposit: data.deposit,
    total: data.total,
    createdAt: Timestamp.now(),
    status: 'confirmed',
  });
  return docRef.id;
}

export interface StoredBooking {
  id: string;
  guestName: string;
  phone: string;
  checkIn: Date;
  checkOut: Date;
  nights: number;
  total: number;
  status: string;
  createdAt: Date;
}

export async function getBookings(): Promise<StoredBooking[]> {
  const q = query(
    collection(db, BOOKINGS_COLLECTION),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      guestName: d.guestName,
      phone: d.phone,
      checkIn: d.checkIn.toDate(),
      checkOut: d.checkOut.toDate(),
      nights: d.nights,
      total: d.total,
      status: d.status,
      createdAt: d.createdAt.toDate(),
    };
  });
}
