// ========================================
// NETLIFY FUNCTION: Webhook Pagamentos (EvoPay)
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
    
    // Na EvoPay, você enviou o transactionId como 'reference'
    const transactionId = body.reference || body.id || (event.queryStringParameters ? event.queryStringParameters.id : null);

    if (!transactionId) return { statusCode: 400, body: JSON.stringify({ error: 'ID/Reference ausente no webhook' }) };

    const statusCeto = String(body.status).toUpperCase();
    const isPaid = statusCeto === 'PAID' || statusCeto === 'COMPLETED' || body.success === true;

    if (!isPaid) return { statusCode: 200, body: JSON.stringify({ message: 'Aguardando pagamento' }) };

    const depositRef = db.collection('deposits').doc(transactionId);
    const depositDoc = await depositRef.get();

    if (!depositDoc.exists || depositDoc.data().status === 'approved') {
      return { statusCode: 200, body: JSON.stringify({ message: 'Depósito já processado ou não encontrado' }) };
    }

    const { userId, amount } = depositDoc.data();
    const parsedAmount = parseFloat(amount);
    const userRef = db.collection('users').doc(userId);

    await db.runTransaction(async (transaction) => {
      // 1. LEITURAS (READS)
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new Error(`Usuário não existe: ${userId}`);

      const inviteQuery = db.collection('invites').where('invitedId', '==', userId).where('status', '==', 'pending').limit(1);
      const inviteSnap = await transaction.get(inviteQuery);

      let ref1Snap, ref2Snap, ref3Snap;
      let ref1Id = userSnap.data().referredBy;
      
      if (ref1Id) {
        ref1Snap = await transaction.get(db.collection('users').doc(ref1Id));
        let ref2Id = ref1Snap.exists ? ref1Snap.data().referredBy : null;
        
        if (ref2Id) {
          ref2Snap = await transaction.get(db.collection('users').doc(ref2Id));
          let ref3Id = ref2Snap.exists ? ref2Snap.data().referredBy : null;
          
          if (ref3Id) {
            ref3Snap = await transaction.get(db.collection('users').doc(ref3Id));
          }
        }
      }

      // 2. ESCRITAS (WRITES)
      // 1. Atualizar o depósito global
      transaction.update(depositRef, { status: 'approved', paidAt: admin.firestore.FieldValue.serverTimestamp() });
      
      // 2. Atualizar o saldo do usuário
      transaction.update(userRef, { balance: admin.firestore.FieldValue.increment(parsedAmount) });

      // 3. ATUALIZAR O HISTÓRICO (O que aparece na sua tela do print)
      const userTransRef = userRef.collection('transactions').doc(transactionId);
      transaction.set(userTransRef, {
        status: 'completed',
        description: 'Depósito via PIX (Confirmado)',
        paidAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // Atualiza status do convite (se houver)
      if (!inviteSnap.empty) {
        transaction.update(inviteSnap.docs[0].ref, { status: 'completed' });
      }

      // Distribuição de Comissões (Níveis 1 a 3)
      if (ref1Snap?.exists) {
        const bonus1 = parsedAmount * 0.20;
        transaction.update(ref1Snap.ref, {
          balance: admin.firestore.FieldValue.increment(bonus1),
          totalCommissions: admin.firestore.FieldValue.increment(bonus1)
        });
        
        if (ref2Snap?.exists) {
          const bonus2 = parsedAmount * 0.05;
          transaction.update(ref2Snap.ref, {
            balance: admin.firestore.FieldValue.increment(bonus2),
            totalCommissions: admin.firestore.FieldValue.increment(bonus2)
          });

          if (ref3Snap?.exists) {
            const bonus3 = parsedAmount * 0.01;
            transaction.update(ref3Snap.ref, {
              balance: admin.firestore.FieldValue.increment(bonus3),
              totalCommissions: admin.firestore.FieldValue.increment(bonus3)
            });
          }
        }
      }
    });

    return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Processado com sucesso' }) };
  } catch (error) {
    console.error("Erro no webhook:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
