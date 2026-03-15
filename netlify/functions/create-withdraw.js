// ========================================
// NETLIFY FUNCTION: Criar Solicitação Saque (EvoPay)
// ========================================
const axios = require('axios');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    })
  });
}
const db = admin.firestore();

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

  try {
    const { userId, amount, pixKey, pixType, ownerName, ownerDocument } = JSON.parse(event.body);

    if (!userId || !amount || !pixKey || !pixType) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Dados obrigatórios ausentes.' }) };
    }
    if (amount < 35) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Saque mínimo é R$ 35,00' }) };
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };

    const balance = userDoc.data().balance || 0;
    const totalWithFee = amount * 1.1; // Ajuste sua taxa aqui

    if (balance < totalWithFee) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Saldo insuficiente' }) };
    }

    const evopayToken = process.env.EVOPAY_TOKEN;
    if (!evopayToken) throw new Error("EVOPAY_TOKEN não configurado.");

    // 1. Aciona o saque na EvoPay e captura a resposta
    const evopayResponse = await axios.post('https://pix.evopay.cash/v1/withdraw', {
      amount: parseFloat(amount),
      destinationKey: pixKey,
      description: `Saque App - ${ownerName || userId}`
    }, {
      headers: { 'API-Key': evopayToken, 'Content-Type': 'application/json' }
    });

    const gatewayId = evopayResponse.data?.id || evopayResponse.data?.transactionId || 'N/A';

    // 2. Se a API aprovar a requisição, debita do saldo
    const batch = db.batch();
    
    batch.update(userRef, {
      balance: admin.firestore.FieldValue.increment(-totalWithFee),
      totalWithdrawn: admin.firestore.FieldValue.increment(amount)
    });

    const withdrawalRef = userRef.collection('withdrawals').doc();
    batch.set(withdrawalRef, {
      amount: parseFloat(amount),
      fee: amount * 0.1,
      netAmount: amount * 0.9,
      pixKey,
      pixType,
      ownerName: ownerName || '',
      ownerDocument: ownerDocument || '',
      gatewayTransactionId: gatewayId, // Salva o ID da EvoPay para auditoria
      status: 'completed',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const transactionRef = userRef.collection('transactions').doc();
    batch.set(transactionRef, {
      type: 'withdrawal',
      amount: parseFloat(amount),
      status: 'completed',
      description: `Saque PIX (${pixType})`,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, withdrawalId: withdrawalRef.id, message: 'Saque processado com sucesso.' })
    };

  } catch (error) {
    return { statusCode: error.response?.status || 500, headers, body: JSON.stringify({ error: error.response?.data?.message || 'Falha ao processar saque', details: error.message }) };
  }
};
