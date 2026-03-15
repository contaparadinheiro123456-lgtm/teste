import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import CheckIn from '../components/CheckIn';
import Roulette from '../components/Roulette';
import { TrendingUp, Users, Wallet } from 'lucide-react';

export default function HomePage() {
  const { user, token } = useAuth();
  const [stats, setStats] = useState({ todayEarnings: 0, newInvites: 0 });
  const [currentBalance, setCurrentBalance] = useState(0); // Estado para o saldo vivo
  const [loading, setLoading] = useState(true);

  // Efeito para carregar os dados ao abrir e atualizar periodicamente
  useEffect(() => {
    if (user?.uid) {
      fetchStats(); // Carrega imediatamente

      // Configura a atualização automática a cada 15 segundos
      const interval = setInterval(() => {
        fetchStats();
      }, 15000);

      return () => clearInterval(interval); // Limpa ao sair da tela
    }
  }, [user]);

  const fetchStats = async () => {
    if (!user?.uid) return;

    try {
      // Enviando o userId na URL para corrigir o erro 400 visto no console
      const response = await fetch(`/.netlify/functions/stats-today?userId=${user.uid}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        // Atualiza os ganhos e convidados
        setStats({
          todayEarnings: data.todayEarnings || 0,
          newInvites: data.newInvites || 0
        });

        // Se o seu backend também retornar o saldo atualizado, usamos ele aqui
        if (data.balance !== undefined) {
          setCurrentBalance(data.balance);
        } else {
          // Caso contrário, usamos o saldo do contexto de autenticação
          setCurrentBalance(Number(user?.balance) || 0);
        }
      } else {
        console.error('Falha ao buscar estatísticas. Status:', response.status);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const getUserInitial = () => {
    return user?.email?.charAt(0).toUpperCase() || 'M';
  };

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      {/* Header com Saudação */}
      <div className="flex items-center justify-between animate-slide-down">
        <div>
          <p className="text-gray-400 text-sm">Bem-vindo de volta</p>
          <h1 className="text-xl font-bold text-white">
            {user?.email?.split('@')[0] || 'Usuário'}
          </h1>
        </div>
        <div className="w-12 h-12 bg-gradient-to-br from-[#22c55e] to-[#16a34a] rounded-full flex items-center justify-center shadow-lg shadow-[#22c55e]/30">
          <span className="text-xl font-bold text-white">{getUserInitial()}</span>
        </div>
      </div>

      {/* Cards de Ganhos e Convidados */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#1a1a1a] animate-fade-in">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-[#22c55e]/20 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-[#22c55e]" />
              </div>
              <span className="text-gray-400 text-sm">Ganhos Hoje</span>
            </div>
            <p className="text-2xl font-bold text-[#22c55e]">
              R$ {stats.todayEarnings.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#1a1a1a] animate-fade-in">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-[#22c55e]/20 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-[#22c55e]" />
              </div>
              <span className="text-gray-400 text-sm">Convidados</span>
            </div>
            <p className="text-2xl font-bold text-[#22c55e]">{stats.newInvites}</p>
          </CardContent>
        </Card>
      </div>

      {/* Card de Saldo Atualizado */}
      <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#22c55e]/30 animate-fade-in">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-5 h-5 text-[#22c55e]" />
            <span className="text-gray-400 text-sm">Saldo Disponível</span>
          </div>
          <p className="text-3xl font-extrabold text-white mb-3">
            R$ {currentBalance.toFixed(2)}
          </p>
          <div className="pt-3 border-t border-[#1a1a1a]">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total Ganhos</span>
              <span className="text-[#22c55e] font-semibold">
                R$ {(Number(user?.totalEarned) || 0).toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily Check-in */}
      <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#1a1a1a] animate-fade-in">
        <CardContent className="pt-6">
          <h3 className="text-white font-bold mb-4">Login Diário</h3>
          <CheckIn onCheckInComplete={fetchStats} />
        </CardContent>
      </Card>

      {/* Roleta */}
      <div className="animate-fade-in">
        <Roulette onSpinComplete={fetchStats} />
      </div>
    </div>
  );
}
