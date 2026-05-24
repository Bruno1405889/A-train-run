import { 
  collection, 
  doc,
  setDoc,
  getDoc,
  query, 
  orderBy, 
  limit, 
  getDocs, 
  where,
  serverTimestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Score } from './types';
import firebaseConfig from '../firebase-applet-config.json';

const SCORES_COLLECTION = 'scores';

/**
 * Detect if Firebase has default remixed configuration.
 * If true, we seamlessly fall back to local storage and offline play simulation.
 */
export function isFirebaseDummy(): boolean {
  return !firebaseConfig.apiKey || 
         firebaseConfig.apiKey === 'remixed-api-key' || 
         firebaseConfig.apiKey.includes('YOUR_') || 
         firebaseConfig.apiKey.includes('remixed');
}

/**
 * Fetch top high scores from Firestore or LocalStorage fallback
 */
export async function fetchTopScores(limitNumber: number = 20): Promise<Score[]> {
  if (isFirebaseDummy()) {
    const saved = localStorage.getItem('atrain_local_scores');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as any[];
        return parsed.map(s => ({
          ...s,
          createdAt: new Date(s.createdAt)
        }));
      } catch (e) {
        console.error('Error parsing local fallback scores', e);
      }
    }

    // High fidelity Portuguese/Vought theme supe defaults for the retro leaderboard
    const defaults: Score[] = [
      {
        id: 'mock_1',
        userId: 'mock_atrain',
        username: '⚡ A-Train (Oficial)',
        photoURL: '',
        score: 1680,
        isGuest: false,
        createdAt: new Date('2026-05-20')
      },
      {
        id: 'mock_2',
        userId: 'mock_homelander',
        username: '👑 Capitão Pátria',
        photoURL: '',
        score: 1420,
        isGuest: false,
        createdAt: new Date('2026-05-21')
      },
      {
        id: 'mock_3',
        userId: 'mock_maeve',
        username: '🛡️ Rainha Maeve',
        photoURL: '',
        score: 1150,
        isGuest: false,
        createdAt: new Date('2026-05-22')
      },
      {
        id: 'mock_4',
        userId: 'mock_starlight',
        username: '✨ Starlight',
        photoURL: '',
        score: 940,
        isGuest: false,
        createdAt: new Date('2026-05-23')
      },
      {
        id: 'mock_5',
        userId: 'mock_blacknoir',
        username: '🥷 Black Noir',
        photoURL: '',
        score: 820,
        isGuest: false,
        createdAt: new Date('2026-05-23')
      },
      {
        id: 'mock_6',
        userId: 'mock_butcher',
        username: '🇬🇧 Billy Butcher',
        photoURL: '',
        score: 510,
        isGuest: true,
        createdAt: new Date('2026-05-24')
      },
      {
        id: 'mock_7',
        userId: 'mock_hughie',
        username: '🧢 Hughie Campbell',
        photoURL: '',
        score: 240,
        isGuest: true,
        createdAt: new Date('2026-05-24')
      }
    ];
    localStorage.setItem('atrain_local_scores', JSON.stringify(defaults));
    return defaults;
  }

  try {
    const scoresRef = collection(db, SCORES_COLLECTION);
    const q = query(
      scoresRef, 
      orderBy('score', 'desc'), 
      limit(limitNumber)
    );
    const querySnapshot = await getDocs(q);
    const scores: Score[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (Boolean(data.isGuest)) return; // Exclude legacy or accidental guest rows
      scores.push({
        id: doc.id,
        userId: data.userId,
        username: data.username,
        photoURL: data.photoURL || '',
        score: Number(data.score),
        isGuest: Boolean(data.isGuest),
        createdAt: data.createdAt?.toDate() || new Date(),
      });
    });
    
    return scores;
  } catch (error) {
    console.error('Failed to fetch top scores from Firestore, falling back to local list:', error);
    return [];
  }
}

/**
 * Add or update a score in the database (or LocalStorage fallback)
 */
export async function submitScore(scoreData: Omit<Score, 'createdAt'>): Promise<string | null> {
  if (isFirebaseDummy()) {
    const topScores = await fetchTopScores(100);
    
    // Check if player already has a score. Overwrite only if new score is higher
    const existingIndex = topScores.findIndex(s => s.userId === scoreData.userId);
    if (existingIndex !== -1) {
      if (scoreData.score <= topScores[existingIndex].score) {
        return scoreData.userId;
      }
      topScores.splice(existingIndex, 1);
    }
    
    const newScore: Score = {
      ...scoreData,
      id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date()
    };
    
    topScores.push(newScore);
    topScores.sort((a, b) => b.score - a.score);
    
    localStorage.setItem('atrain_local_scores', JSON.stringify(topScores.slice(0, 100)));
    return scoreData.userId;
  }

  const path = SCORES_COLLECTION;
  try {
    if (scoreData.isGuest) {
      // Guests cannot appear on the cloud leaderboard
      return null;
    }

    const scoreDocRef = doc(db, SCORES_COLLECTION, scoreData.userId);
    const docSnap = await getDoc(scoreDocRef);

    if (docSnap.exists()) {
      const existingData = docSnap.data();
      if (Number(scoreData.score) <= Number(existingData.score || 0)) {
        // If the new score is not greater than the existing record, do not overwrite it
        return scoreData.userId;
      }
    }

    await setDoc(scoreDocRef, {
      ...scoreData,
      createdAt: serverTimestamp()
    });
    return scoreData.userId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    return null;
  }
}

/**
 * Fetch the personal best score for a specific user
 */
export async function fetchUserPersonalBest(userId: string): Promise<number> {
  if (isFirebaseDummy()) {
    const scores = await fetchTopScores(100);
    const userScore = scores.find(s => s.userId === userId);
    if (userScore) {
      return userScore.score;
    }
    const savedPb = localStorage.getItem(`atrain_pb_${userId}`);
    if (savedPb) {
      return parseInt(savedPb, 10);
    }
    return 0;
  }

  try {
    const scoresRef = collection(db, SCORES_COLLECTION);
    const q = query(
      scoresRef,
      where('userId', '==', userId),
      orderBy('score', 'desc'),
      limit(1)
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return Number(doc.data().score || 0);
    }
    return 0;
  } catch (error) {
    console.error('Failed to fetch personal best from cloud:', error);
    return 0;
  }
}
