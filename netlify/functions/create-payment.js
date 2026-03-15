// ========================================
// NETLIFY FUNCTION: Criar Pagamento PIX (EvoPay)
// ========================================
const axios = require('axios');
const admin = require('firebase-admin');

// 1. Inicialização segura do Firebase
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
  // Configuração de Headers para CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

  try {
    if (!db) throw new Error("Conexão com Banco de Dados falhou.");

    const body = JSON.parse(event.body);
    const { amount, userId, userName, userDocument } = body;

    console.log('=== INICIANDO CRIAÇÃO DE PAGAMENTO EVOPAY ===', { userId, amount });

    // Validações Básicas
    if (!amount || !userId || !userName || !userDocument) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Campos obrigatórios: amount, userId, userName, userDocument' }) };
    }

    const cleanDocument = userDocument.replace(/\D/g, "");
    if (cleanDocument.length !== 11 && cleanDocument.length !== 14) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Documento inválido.' }) };
    }
    
    // Validar valor mínimo (ajuste conforme sua regra)
    if (parseFloat(amount) < 1) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'O valor mínimo é R$ 1,00' }) };
    }

    let cleanName = (userName || "Cliente").replace(/[^a-zA-Z ]/g, "").trim();
    if (!cleanName) cleanName = "Cliente";

    const evopayToken = process.env.EVOPAY_TOKEN;
    if (!evopayToken) throw new Error("Token EVOPAY_TOKEN não configurado.");

    const SITE_URL = process.env.URL || 'http://localhost:8888';
    const callbackUrl = `${SITE_URL}/.netlify/functions/webhook-payment`;

    // ---------------------------------------------------------
    // 2. GERAR O ID DO DEPÓSITO ANTECIPADAMENTE (O SEGREDO)
    // ---------------------------------------------------------
    const depositRef = db.collection('deposits').doc();
    const transactionId = depositRef.id;

    // 3. Chamada à EvoPay enviando o 'reference'
    const response = await axios.post('https://pix.evopay.cash/v1/pix', {
      amount: parseFloat(amount),
      callbackUrl: callbackUrl,
      payerName: cleanName,
      payerDocument: cleanDocument,
      reference: transactionId // <-- Vincula o PIX ao documento do Firestore
    }, {
      headers: { 
        'API-Key': evopayToken, 
        'Content-Type': 'application/json' 
      }
    });

    // 4. Extração do Código PIX
    const paymentData = response.data;
    const brCode = 
      paymentData?.qrCodeText || 
      paymentData?.qrcode || 
      paymentData?.qrCode || 
      paymentData?.pixCode || 
      paymentData?.data?.qrcode;

    if (!brCode) {
      console.error("Resposta inesperada da EvoPay:", JSON.stringify(paymentData));
      throw new Error("Código PIX não retornado pela EvoPay.");
    }

    // 5. Link da Imagem QR Code
    const qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(brCode)}`;
    
// ... (mantenha o início igual)

    // 6. Salvar no Firestore (Coleção Global de Depósitos)
    await depositRef.set({
      userId: userId,
      userName: userName, 
      amount: parseFloat(amount),
      pixCode: brCode, 
      qrImage: qrImage, 
      transactionId: transactionId,
      status: 'pending',
      gateway: 'evopay',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // --- NOVA PARTE: Criar no Histórico do Usuário ---
    const userTransactionRef = db.collection('users').doc(userId).collection('transactions').doc(transactionId);
    await userTransactionRef.set({
      type: 'deposit',
      amount: parseFloat(amount),
      status: 'pending',
      description: 'Depósito via PIX (Pendente)',
      transactionId: transactionId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    // ------------------------------------------------

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, pixCode: brCode, qrImage: qrImage, transactionId: transactionId })
    };
// ...
    // 7. Retorno para o Frontend
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        pixCode: brCode,
        qrImage: qrImage,
        transactionId: transactionId,
        pix_code: brCode, // compatibilidade
        qr_image: qrImage  // compatibilidade
      })
    };

  } catch (error) {
    console.error("Erro na Function create-payment:", error.response?.data || error.message);
    return {
      statusCode: error.response?.status || 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: error.response?.data?.message || error.message || 'Falha ao processar pagamento' 
      })
    };
  }
};
