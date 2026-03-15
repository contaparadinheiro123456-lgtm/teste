// ========================================
// NETLIFY FUNCTION: Aprovar Saque (Admin) - EvoPay
// ========================================
// POST /.netlify/functions/admin-approve-withdraw

const admin = require('firebase-admin');
const axios = require('axios');

// Inicialização do Firebase
if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey.replace(/\\n/g, '\n')
      })
    });
  }
}

const db = admin.apps.length ? admin.firestore() : null;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Preflight request
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

  try {
    // 1. Verificação de Segurança (Apenas Admin)
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const expectedToken = process.env.ADMIN_SECRET_TOKEN;

    if (!expectedToken) {
      console.warn("⚠️ ADMIN_SECRET_TOKEN não configurado nas variáveis de ambiente!");
    }

    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado. Token de Admin inválido.' }) };
    }

    // 2. Parse do Body
    const { userId, withdrawId } = JSON.parse(event.body);

    if (!userId || !withdrawId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'userId e withdrawId são obrigatórios' }) };
    }

    if (!db) throw new Error("Conexão com Banco de Dados falhou.");

    // 3. Buscar os dados do Saque no Firestore
    const withdrawalRef = db.collection('users').doc(userId).collection('withdrawals').doc(withdrawId);
    const withdrawalDoc = await withdrawalRef.get();

    if (!withdrawalDoc.exists) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Solicitação de saque não encontrada' }) };
    }

    const withdrawalData = withdrawalDoc.data();

    // Verifica se já não foi processado
    if (withdrawalData.status !== 'processing' && withdrawalData.status !== 'pending') {
      return { 
        statusCode: 400, 
        headers, 
        body: JSON.stringify({ error: `Este saque não pode ser aprovado. Status atual: ${withdrawalData.status}` }) 
      };
    }

    // 4. Verificação do Token da EvoPay
    const evopayToken = process.env.EVOPAY_TOKEN;
    if (!evopayToken) throw new Error("Token EVOPAY_TOKEN não configurado.");

    const valorSaque = parseFloat(withdrawalData.netAmount || withdrawalData.amount);

    // 5. Acionar a EvoPay para realizar a transferência
    const evopayResponse = await axios.post('https://pix.evopay.cash/v1/withdraw', {
      amount: valorSaque,
      destinationKey: withdrawalData.pixKey,
      description: `Saque Admin - ${withdrawalData.ownerName || userId}`
    }, {
      headers: { 'API-Key': evopayToken, 'Content-Type': 'application/json' }
    });

    const gatewayId = evopayResponse.data?.id || evopayResponse.data?.transactionId || 'N/A';

    // 6. Atualizar o Firestore indicando que o saque foi concluído
    // Nota: Como a EvoPay faz o PIX instantaneamente via API, já marcamos como 'completed'
    await withdrawalRef.update({
      status: 'completed', 
      gatewayTransactionId: gatewayId,
      approvedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 7. Atualizar o histórico geral de transações
    const transactionRef = db.collection('users').doc(userId).collection('transactions').doc();
    await transactionRef.set({
      type: 'withdrawal',
      amount: valorSaque,
      status: 'completed',
      description: `Saque PIX Aprovado (${withdrawalData.pixType})`,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Saque aprovado e enviado via EvoPay.',
        transactionId: gatewayId
      })
    };

  } catch (error) {
    console.error('❌ Erro ao aprovar saque (Admin):', error.response?.data || error.message);
    
    // Tratamento de erro detalhado para a EvoPay
    const errorMessage = error.response?.data?.message || error.message || 'Falha ao processar aprovação de saque';
    
    return {
      statusCode: error.response?.status || 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: errorMessage,
        details: error.response?.data || {}
      })
    };
  }
};
