import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useAuth } from '../contexts/AuthContext';

interface TeamMember {
  id: string;
  email: string;
  createdAt: any;
}

interface TeamLevel {
  count: number;
  totalEarned: number;
  members: TeamMember[];
}

interface TeamData {
  level1: TeamLevel;
  level2: TeamLevel;
  level3: TeamLevel;
}

export function useTeam() {
  const { user } = useAuth();
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    fetchTeamData();
  }, [user]);

  const fetchTeamData = async () => {
    if (!user) return;

    try {
      // Nível 1: Convidados diretos
      const level1Query = query(
        collection(db, 'users'),
        where('invitedBy', '==', user.id)
      );
      const level1Snapshot = await getDocs(level1Query);
      const level1Members: TeamMember[] = [];
      const level1Ids: string[] = [];

      level1Snapshot.forEach((doc) => {
        const data = doc.data();
        level1Members.push({
          id: doc.id,
          email: data.email,
          createdAt: data.createdAt
        });
        level1Ids.push(doc.id);
      });

      // Buscar comissões nível 1
      const level1TransactionsQuery = query(
        collection(db, 'users', user.id, 'transactions'),
        where('type', '==', 'commission'),
        where('level', '==', 1)
      );
      const level1TransactionsSnapshot = await getDocs(level1TransactionsQuery);
      let level1Earnings = 0;
      level1TransactionsSnapshot.forEach((doc) => {
        level1Earnings += Number(doc.data().amount) || 0;
      });

      // Nível 2: Convidados dos convidados
      let level2Members: TeamMember[] = [];
      let level2Ids: string[] = [];

      if (level1Ids.length > 0) {
        for (const id of level1Ids) {
          const level2Query = query(
            collection(db, 'users'),
            where('invitedBy', '==', id)
          );
          const level2Snapshot = await getDocs(level2Query);
          
          level2Snapshot.forEach((doc) => {
            const data = doc.data();
            level2Members.push({
              id: doc.id,
              email: data.email,
              createdAt: data.createdAt
            });
            level2Ids.push(doc.id);
          });
        }
      }

      // Buscar comissões nível 2
      const level2TransactionsQuery = query(
        collection(db, 'users', user.id, 'transactions'),
        where('type', '==', 'commission'),
        where('level', '==', 2)
      );
      const level2TransactionsSnapshot = await getDocs(level2TransactionsQuery);
      let level2Earnings = 0;
      level2TransactionsSnapshot.forEach((doc) => {
        level2Earnings += Number(doc.data().amount) || 0;
      });

      // Nível 3
      let level3Members: TeamMember[] = [];

      if (level2Ids.length > 0) {
        for (const id of level2Ids) {
          const level3Query = query(
            collection(db, 'users'),
            where('invitedBy', '==', id)
          );
          const level3Snapshot = await getDocs(level3Query);
          
          level3Snapshot.forEach((doc) => {
            const data = doc.data();
            level3Members.push({
              id: doc.id,
              email: data.email,
              createdAt: data.createdAt
            });
          });
        }
      }

      // Buscar comissões nível 3
      const level3TransactionsQuery = query(
        collection(db, 'users', user.id, 'transactions'),
        where('type', '==', 'commission'),
        where('level', '==', 3)
      );
      const level3TransactionsSnapshot = await getDocs(level3TransactionsQuery);
      let level3Earnings = 0;
      level3TransactionsSnapshot.forEach((doc) => {
        level3Earnings += Number(doc.data().amount) || 0;
      });

      setTeamData({
        level1: {
          count: level1Members.length,
          totalEarned: level1Earnings,
          members: level1Members
        },
        level2: {
          count: level2Members.length,
          totalEarned: level2Earnings,
          members: level2Members
        },
        level3: {
          count: level3Members.length,
          totalEarned: level3Earnings,
          members: level3Members
        }
      });
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    teamData,
    loading,
    refreshTeam: fetchTeamData
  };
}
