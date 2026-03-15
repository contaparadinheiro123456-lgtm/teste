import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useDeposit } from '../hooks/useDeposit';
import { useWithdraw } from '../hooks/useWithdraw';
import { useTransactions } from '../hooks/useTransactions';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  Wallet, ArrowUpCircle, ArrowDownCircle, History, Copy, CheckCircle, 
  AlertCircle, Hash, Clock, MessageCircle
} from 'lucide-react';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { user } = useAuth();
  const { transactions } = useTransactions();
  // CORREÇÃO 1: Adicionado o qrImage aqui
  const { loading: depositLoading, pixCode, qrImage, initiateDeposit, resetDeposit } = useDeposit();
  const { loading: withdrawLoading, canWithdrawNow, initiateWithdraw } = useWithdraw();

  const [activeSection, setActiveSection] = useState<'main' | 'deposit' | 'withdraw'>('main');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [pixType, setPixType] = useState<'email' | 'cpf' | 'phone'>('cpf');
  const [copied, setCopied] = useState(false);

  const handleDeposit = async () => {
    const amount = Number(depositAmount);
    
    if (!amount || amount < 1) {
      toast.error('Depósito mínimo é R$ 30,00');
      return;
    }

    const result = await initiateDeposit(amount);
    
    if (result.success) {
      toast.success('PIX gerado com sucesso!', {
        description: 'Copie o código e faça o pagamento'
      });
    } else {
      toast.error('Erro ao gerar PIX', {
        description: result.error || 'Tente novamente'
      });
    }
  };

  const handleWithdraw = async () => {
    const amount = Number(withdrawAmount);
    
    const result = await initiateWithdraw(amount, pixKey, pixType);
    
    if (result.success) {
      setWithdrawAmount('');
      setPixKey('');
      setActiveSection('main');
      toast.success('Saque solicitado!', {
        description: 'Seu pedido será processado em breve'
      });
    } else {
      toast.error('Erro ao solicitar saque', {
        description: result.error
      });
    }
  };

  const copyPixCode = () => {
    if (pixCode) {
      navigator.clipboard.writeText(pixCode);
      setCopied(true);
      toast.success('Código PIX copiado!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getUserInitial = () => {
    return user?.email?.charAt(0).toUpperCase() || 'M';
  };

  const getUserId = () => {
    return user?.id?.substring(0, 8) || '00000000';
  };

  const getPixPlaceholder = () => {
    switch (pixType) {
      case 'email': return 'seu@email.com';
      case 'cpf': return '000.000.000-00';
      case 'phone': return '(00) 00000-0000';
      default: return '';
    }
  };

  const renderMain = () => (
    <div className="space-y-6 animate-fade-in">
      <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#1a1a1a]">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#22c55e] to-[#16a34a] flex items-center justify-center shadow-lg shadow-[#22c55e]/30">
              <span className="text-2xl font-bold text-white">{getUserInitial()}</span>
            </div>
            <div>
              <h2 className="text-white font-semibold text-lg">{user?.email}</h2>
              <div className="flex items-center gap-1 mt-1">
                <Hash className="w-3 h-3 text-[#22c55e]" />
                <span className="text-[#22c55e] text-xs font-mono">ID: {getUserId()}</span>
              </div>
            </div>
          </div>

          <div className="bg-[#0a0a0a] rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm mb-1">Saldo Disponível</p>
                <p className="text-3xl font-bold text-white">R$ {(Number(user?.balance) || 0).toFixed(2)}</p>
              </div>
              <Wallet className="w-8 h-8 text-[#22c55e]" />
            </div>
          </div>

          <div className="flex gap-3 mb-4">
            <Button
              onClick={() => setActiveSection('deposit')}
              className="flex-1 bg-gradient-to-r from-[#22c55e] to-[#16a34a] hover:from-[#16a34a] hover:to-[#22c55e] text-white font-semibold shadow-lg shadow-[#22c55e]/20"
            >
              <ArrowDownCircle className="w-4 h-4 mr-2" />
              Depositar
            </Button>
            <Button
              onClick={() => setActiveSection('withdraw')}
              className="flex-1 bg-[#1a1a1a] hover:bg-[#252525] text-white border border-[#2a2a2a]"
            >
              <ArrowUpCircle className="w-4 h-4 mr-2" />
              Sacar
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <a
              href="https://t.me/+qasEE92ROa5iOTYx"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-white py-3 rounded-lg font-semibold text-sm shadow-lg shadow-[#22c55e]/20"
            >
              <MessageCircle className="w-4 h-4" />
              Grupo Oficial
            </a>
            <a
              href="https://t.me/+5598981275486"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] text-white py-3 rounded-lg font-semibold text-sm"
            >
              <MessageCircle className="w-4 h-4" />
              Suporte
            </a>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#1a1a1a]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <History className="w-5 h-5 text-[#22c55e]" />
            Histórico Financeiro
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-gray-400 text-center py-4">Nenhuma transação ainda</p>
          ) : (
            <div className="space-y-3">
              {transactions.slice(0, 10).map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 bg-[#0a0a0a] rounded-lg border border-[#1a1a1a]"
                >
                  <div className="flex items-center gap-3">
                    {tx.type === 'withdrawal' ? (
                      <ArrowUpCircle className="w-5 h-5 text-red-400" />
                    ) : (
                      <ArrowDownCircle className="w-5 h-5 text-[#22c55e]" />
                    )}
                    <div>
                      <p className="text-white font-medium">{tx.description}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(tx.createdAt?.toDate?.() || tx.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${
                      tx.type === 'withdrawal' ? 'text-red-400' : 'text-[#22c55e]'
                    }`}>
                      {tx.type === 'withdrawal' ? '-' : '+'}R$ {(Number(tx.amount) || 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">{tx.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderDeposit = () => (
    <div className="space-y-6 animate-slide-up">
      <button
        onClick={() => {
          setActiveSection('main');
          resetDeposit();
          setDepositAmount('');
        }}
        className="text-gray-400 hover:text-white transition-colors"
      >
        ← Voltar
      </button>

      <h2 className="text-2xl font-bold text-white">Depositar via PIX</h2>

      {!pixCode ? (
        <>
          <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#1a1a1a]">
            <CardContent className="pt-6">
              <label className="text-gray-400 text-sm mb-2 block">Valor do depósito</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
                <Input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0,00"
                  className="bg-[#0a0a0a] border-[#1a1a1a] text-white text-lg font-bold pl-12"
                />
              </div>
              <p className="text-gray-500 text-xs mt-2">Mínimo: R$ 30,00</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-4 gap-2">
            {[30, 50, 100, 200].map((amount) => (
              <button
                key={amount}
                onClick={() => setDepositAmount(amount.toString())}
                className="bg-[#1a1a1a] hover:bg-[#252525] text-white py-3 rounded-lg font-semibold border border-[#2a2a2a]"
              >
                R$ {amount}
              </button>
            ))}
          </div>

          <Button
            onClick={handleDeposit}
            disabled={depositLoading}
            className="w-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-white font-bold py-6 text-lg shadow-lg shadow-[#22c55e]/30"
          >
            {depositLoading ? 'GERANDO PIX...' : 'GERAR PIX'}
          </Button>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-200">
                <p className="font-semibold mb-1">Como funciona:</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-300">
                  <li>Clique em "GERAR PIX"</li>
                  <li>Copie o código PIX gerado</li>
                  <li>Abra seu app de banco e pague via PIX</li>
                  <li>Seu saldo será creditado automaticamente</li>
                </ol>
              </div>
            </div>
          </div>
        </>
      ) : (
        <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#1a1a1a]">
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <CheckCircle className="w-16 h-16 text-[#22c55e] mx-auto mb-3" />
              <p className="text-gray-400 mb-2">Valor do depósito</p>
              <p className="text-4xl font-bold text-[#22c55e]">R$ {Number(depositAmount).toFixed(2)}</p>
            </div>

            {/* CORREÇÃO 2: Bloco do QR Code inserido aqui */}
            {qrImage && (
              <div className="flex justify-center mb-6">
                <div className="bg-white p-3 rounded-xl inline-block">
                  <img 
                    src={qrImage} 
                    alt="QR Code PIX" 
                    className="w-48 h-48 object-contain"
                  />
                </div>
              </div>
            )}

            <div className="bg-[#0a0a0a] rounded-xl p-4 mb-4">
              <p className="text-gray-400 text-sm mb-2">Código PIX Copia e Cola</p>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={pixCode}
                  readOnly
                  className="flex-1 bg-[#1a1a1a] border-[#2a2a2a] text-white text-xs font-mono"
                />
                <button
                  onClick={copyPixCode}
                  className={`p-3 rounded-lg transition-all ${
                    copied ? 'bg-[#22c55e] text-white' : 'bg-[#1a1a1a] text-gray-400'
                  }`}
                >
                  {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-4">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-200">
                  <p className="font-semibold mb-1">Aguardando pagamento</p>
                  <p className="text-yellow-300">Seu saldo será creditado automaticamente após a confirmação do pagamento.</p>
                </div>
              </div>
            </div>

            <Button
              onClick={() => {
                resetDeposit();
                setDepositAmount('');
                setActiveSection('main');
              }}
              className="w-full bg-[#1a1a1a] hover:bg-[#252525] border border-[#2a2a2a] text-white"
            >
              Voltar ao Perfil
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderWithdraw = () => {
    const withdrawCheck = canWithdrawNow();
    const amount = Number(withdrawAmount) || 0;
    const fee = amount * 0.10;
    const netAmount = amount - fee;

    return (
      <div className="space-y-6 animate-slide-up">
        <button
          onClick={() => {
            setActiveSection('main');
            setWithdrawAmount('');
            setPixKey('');
          }}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ← Voltar
        </button>

        <h2 className="text-2xl font-bold text-white">Sacar via PIX</h2>

        {!withdrawCheck.allowed && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-400 font-semibold text-sm">Fora do horário de saque</p>
              <p className="text-gray-400 text-xs">{withdrawCheck.message}</p>
            </div>
          </div>
        )}

        <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#1a1a1a]">
          <CardContent className="pt-6">
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-400 text-sm">Saldo disponível</span>
              <span className="text-white font-bold">R$ {(Number(user?.balance) || 0).toFixed(2)}</span>
            </div>

            <label className="text-gray-400 text-sm mb-2 block">Valor do saque</label>
            <div className="relative mb-4">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
              <Input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0,00"
                className="bg-[#0a0a0a] border-[#1a1a1a] text-white text-lg font-bold pl-12"
              />
            </div>
            <p className="text-gray-500 text-xs mb-4">Mínimo: R$ 35,00</p>

            <label className="text-gray-400 text-sm mb-2 block">Tipo de chave PIX</label>
            <Select value={pixType} onValueChange={(value: any) => setPixType(value)}>
              <SelectTrigger className="bg-[#0a0a0a] border-[#1a1a1a] text-white mb-4">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cpf">CPF</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="phone">Telefone</SelectItem>
              </SelectContent>
            </Select>

            <label className="text-gray-400 text-sm mb-2 block">Chave PIX</label>
            <Input
              type="text"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder={getPixPlaceholder()}
              className="bg-[#0a0a0a] border-[#1a1a1a] text-white mb-4"
            />

            {amount >= 35 && (
              <div className="bg-[#0a0a0a] rounded-xl p-4 mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Valor solicitado</span>
                  <span className="text-white font-semibold">R$ {amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Taxa (10%)</span>
                  <span className="text-red-400 font-semibold">- R$ {fee.toFixed(2)}</span>
                </div>
                <div className="border-t border-[#1a1a1a] pt-2 flex justify-between">
                  <span className="text-gray-400 font-semibold">Você receberá</span>
                  <span className="text-[#22c55e] font-bold text-lg">R$ {netAmount.toFixed(2)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Button
          onClick={handleWithdraw}
          disabled={!withdrawCheck.allowed || withdrawLoading}
          className="w-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-white font-bold py-6 text-lg shadow-lg shadow-[#22c55e]/30 disabled:opacity-50"
        >
          {withdrawLoading ? 'PROCESSANDO...' : 'SOLICITAR SAQUE'}
        </Button>

        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-200">
              <p className="font-semibold mb-1">Regras de saque:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-300">
                <li>Horário: 09:00 às 17:00 (Brasília)</li>
                <li>Valor mínimo: R$ 35,00</li>
                <li>Taxa: 10% sobre o valor</li>
                <li>Processamento: até 24h úteis</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-6">
      {activeSection === 'main' && renderMain()}
      {activeSection === 'deposit' && renderDeposit()}
      {activeSection === 'withdraw' && renderWithdraw()}
    </div>
  );
}
