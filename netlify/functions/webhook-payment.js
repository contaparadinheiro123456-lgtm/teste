// ========================================
// NETLIFY FUNCTION: Webhook Pagamentos Corrigido
// ========================================
const admin = require('firebase-admin');

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
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Método não permitido' };

  try {
    if (!db) throw new Error("Banco de dados não conectado.");

    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    
    // Identificação da transação vinda do Gateway
    const transactionId = body.reference || body.id || (event.queryStringParameters ? event.queryStringParameters.id : null);

    if (!transactionId) return { statusCode: 400, body: JSON.stringify({ error: 'ID/Reference ausente' }) };

    const statusCeto = String(body.status).toUpperCase();
    // Verifica se o status indica pagamento concluído
    const isPaid = statusCeto === 'PAID' || statusCeto === 'COMPLETED' || body.success === true;

    if (!isPaid) {
      return { statusCode: 200, body: JSON.stringify({ message: 'Pagamento ainda não confirmado' }) };
    }

    // Busca o documento do depósito para saber quem é o usuário e o valor
    const depositDoc = await db.collection('deposits').doc(transactionId).get();
    
    if (!depositDoc.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Depósito não encontrado' }) };
    }

    const { userId, amount, status: currentStatus, userName } = depositDoc.data();

    // Se já estiver pago, não processa novamente (evita duplicar saldo)
    if (currentStatus === 'completed') {
      return { statusCode: 200, body: JSON.stringify({ message: 'Já processado' }) };
    }

    const parsedAmount = parseFloat(amount);
    const userRef = db.collection('users').doc(userId);

    await db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new Error("Usuário não existe");

      // 1. Atualiza o status do depósito principal
      transaction.update(depositDoc.ref, { 
        status: 'completed',
        paidAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 2. Adiciona saldo ao usuário
      transaction.update(userRef, {
        balance: admin.firestore.FieldValue.increment(parsedAmount),
        totalDeposited: admin.firestore.FieldValue.increment(parsedAmount)
      });

      // 3. REGISTRO NA SUBCOLEÇÃO TRANSACTIONS (O que você pediu)
      const userTransRef = userRef.collection('transactions').doc(transactionId);
      transaction.set(userTransRef, {
        amount: parsedAmount, // Essencial para somar nos ganhos
        status: 'completed',
        type: 'deposit',
        description: 'Depósito via PIX (Confirmado)',
        createdAt: admin.firestore.FieldValue.serverTimestamp(), // Essencial para o filtro de "Hoje"
        paidAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // --- LÓGICA DE COMISSÕES DE AFILIADOS ---
      const userData = userSnap.data();
      if (userData.referredBy) {
        const ref1Ref = db.collection('users').doc(userData.referredBy);
        const ref1Snap = await transaction.get(ref1Ref);

        if (ref1Snap.exists) {
          // Nível 1: 10%
          const bonus1 = parsedAmount * 0.10;
          transaction.update(ref1Ref, {
            balance: admin.firestore.FieldValue.increment(bonus1),
            totalCommissions: admin.firestore.FieldValue.increment(bonus1)
          });

          const ref1TransRef = ref1Ref.collection('transactions').doc(`bonus1_${transactionId}`);
          transaction.set(ref1TransRef, {
            amount: bonus1,
            status: 'completed',
            type: 'commission',
            description: `Indicação Nível 1: ${userName || 'Usuário'}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          // Nível 2: 5% (Se existir o avô)
          const ref1Data = ref1Snap.data();
          if (ref1Data.referredBy) {
            const ref2Ref = db.collection('users').doc(ref1Data.referredBy);
            const ref2Snap = await transaction.get(ref2Ref);
            
            if (ref2Snap.exists) {
              const bonus2 = parsedAmount * 0.05;
              transaction.update(ref2Ref, {
                balance: admin.firestore.FieldValue.increment(bonus2),
                totalCommissions: admin.firestore.FieldValue.increment(bonus2)
              });

              const ref2TransRef = ref2Ref.collection('transactions').doc(`bonus2_${transactionId}`);
              transaction.set(ref2TransRef, {
                amount: bonus2,
                status: 'completed',
                type: 'commission',
                description: `Indicação Nível 2: ${userName || 'Usuário'}`,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
              });
            }
          }
        }
      }
    });

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (error) {
    console.error("Erro no webhook:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
