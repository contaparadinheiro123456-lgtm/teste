import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';

import {
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  increment,
  addDoc
} from 'firebase/firestore';

import { auth, db } from '../firebase/firebase';

// Interface do Usuário completa
interface User {
  id: string;
  name: string;
  email: string;
  balance: number;
  inviteCode: string;
  referredBy?: string | null; 
  totalEarned: number;
  totalWithdrawn: number;
  spinsAvailable: number;
  role: string;
  createdAt: any;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, inviteCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  processDepositCommissions: (userId: string, depositAmount: number) => Promise<void>; // Nova função essencial
  updateBalance: (amount: number) => Promise<void>;
  completeSpin: (prizeAmount: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/* =========================
   AUXILIARES DE CONVITE
========================= */

const generateInviteCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const generateUniqueInviteCode = async (): Promise<string> => {
  let code = generateInviteCode();
  const usersRef = collection(db, 'users');
  for (let i = 0; i < 5; i++) {
    const q = query(usersRef, where('inviteCode', '==', code));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return code;
    code = generateInviteCode();
  }
  return code;
};

/* =========================
   PROVIDER PRINCIPAL
========================= */

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribeUser: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (!firebaseUser) {
        setUser(null);
        setToken(null);
        if (unsubscribeUser) unsubscribeUser();
        return;
      }

      const userDocRef = doc(db, 'users', firebaseUser.uid);
      unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        setUser({
          id: firebaseUser.uid,
          ...data
        } as User);
      });

      const idToken = await firebaseUser.getIdToken();
      setToken(idToken);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
    };
  }, []);

  /* =========================
     REGISTO (SEM PAGAMENTO IMEDIATO)
  ========================= */

  const register = async (email: string, password: string, name: string, inviteCodeInput?: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      let inviterUid: string | null = null;

      // 1. Verifica se o código de convite existe
      if (inviteCodeInput?.trim()) {
        const q = query(collection(db, 'users'), where('inviteCode', '==', inviteCodeInput.trim().toUpperCase()));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          inviterUid = snapshot.docs[0].id;
          
          // Cria o convite como PENDENTE (não gera dinheiro ainda)
          await addDoc(collection(db, 'invites'), {
            createdAt: serverTimestamp(),
            invitedId: uid,
            inviterId: inviterUid,
            status: "pending", // Importante para a aba Equipe filtrar
            level: 1
          });
        }
      }

      const myInviteCode = await generateUniqueInviteCode();

      // 2. Salva o perfil do novo usuário
      await setDoc(doc(db, 'users', uid), {
        name,
        email,
        balance: 0,
        inviteCode: myInviteCode,
        referredBy: inviterUid || null,
        totalEarned: 0,
        totalWithdrawn: 0,
        spinsAvailable: 1,
        role: 'user',
        createdAt: serverTimestamp()
      });

    } catch (error) {
      console.error("Erro no registro:", error);
      throw error;
    }
  };

/* =========================
     LÓGICA DE 3 NÍVEIS (PAGAMENTO REAL + HISTÓRICO)
  ========================= */

  const processDepositCommissions = async (userId: string, depositAmount: number) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      const userData = userDoc.data();
      if (!userData?.referredBy) return;

      const inviterL1Id = userData.referredBy;

      // --- PAGAMENTO NÍVEL 1 (20%) ---
      const bonusL1 = depositAmount * 0.20;
      await updateDoc(doc(db, 'users', inviterL1Id), {
        balance: increment(bonusL1),
        totalEarned: increment(bonusL1)
      });
      // NOVO: Cria o recibo para a aba Equipe somar
      await addDoc(collection(db, 'users', inviterL1Id, 'transactions'), {
        type: 'commission',
        level: 1,
        amount: bonusL1,
        fromUser: userId,
        createdAt: serverTimestamp()
      });

      // Atualiza o convite pendente para concluído
      const qInv = query(collection(db, 'invites'), where('invitedId', '==', userId), where('status', '==', 'pending'));
      const invSnap = await getDocs(qInv);
      if (!invSnap.empty) {
        await updateDoc(doc(db, 'invites', invSnap.docs[0].id), { status: 'completed', commission: bonusL1 });
      }

      // --- PAGAMENTO NÍVEL 2 (5%) ---
      const invL1Doc = await getDoc(doc(db, 'users', inviterL1Id));
      if (invL1Doc.data()?.referredBy) {
        const inviterL2Id = invL1Doc.data()?.referredBy;
        const bonusL2 = depositAmount * 0.05;
        await updateDoc(doc(db, 'users', inviterL2Id), {
          balance: increment(bonusL2),
          totalEarned: increment(bonusL2)
        });
        await addDoc(collection(db, 'users', inviterL2Id, 'transactions'), {
          type: 'commission',
          level: 2,
          amount: bonusL2,
          fromUser: userId,
          createdAt: serverTimestamp()
        });

        // --- PAGAMENTO NÍVEL 3 (1%) ---
        const invL2Doc = await getDoc(doc(db, 'users', inviterL2Id));
        if (invL2Doc.data()?.referredBy) {
          const inviterL3Id = invL2Doc.data()?.referredBy;
          const bonusL3 = depositAmount * 0.01;
          await updateDoc(doc(db, 'users', inviterL3Id), {
            balance: increment(bonusL3),
            totalEarned: increment(bonusL3)
          });
          await addDoc(collection(db, 'users', inviterL3Id, 'transactions'), {
            type: 'commission',
            level: 3,
            amount: bonusL3,
            fromUser: userId,
            createdAt: serverTimestamp()
          });
        }
      }
    } catch (err) {
      console.error("Erro ao processar comissões:", err);
    }
  };
  /* =========================
     OUTRAS FUNÇÕES
  ========================= */

  const login = async (email: string, password: string) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await userCredential.user.getIdToken();
    setToken(idToken);
  };

  const logout = () => firebaseSignOut(auth);

  const updateBalance = async (amount: number) => {
    if (!auth.currentUser) return;
    const userRef = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(userRef, {
      balance: increment(amount),
      totalEarned: increment(amount > 0 ? amount : 0)
    });
  };

  const completeSpin = async (prizeAmount: number) => {
    if (!auth.currentUser) return;
    const userRef = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(userRef, {
      spinsAvailable: increment(-1),
      balance: increment(prizeAmount),
      totalEarned: increment(prizeAmount)
    });
  };

  return (
    <AuthContext.Provider value={{ 
      user, token, login, register, logout, 
      processDepositCommissions, updateBalance, completeSpin 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
};
