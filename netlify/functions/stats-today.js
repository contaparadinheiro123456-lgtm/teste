const admin = require('firebase-admin');

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey ? privateKey.replace(/\\n/g, '\n') : undefined
    })
  });
}

const db = admin.firestore();

exports.handler = async (event) => {
  try {
    // Pega o userId que agora estamos enviando na URL pelo Frontend
    const { userId } = event.queryStringParameters || {};

    if (!userId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'userId é obrigatório na URL' }) };
    }

    // 1. Definir o início do dia de hoje (00:00:00)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startTimestamp = admin.firestore.Timestamp.fromDate(startOfDay);

    // 2. Buscar Ganhos de Hoje
    const statsQuery = await db.collection('users').doc(userId)
      .collection('transactions')
      .where('createdAt', '>=', startTimestamp)
      .where('status', '==', 'completed')
      .get();

    let todayEarnings = 0;
    statsQuery.forEach(doc => {
      const data = doc.data();
      
      // ADAPTADO: Agora ele aceita mais tipos de transações para somar o saldo do dia
      const validTypes = ['deposit', 'commission', 'indication', 'referral'];
      
      if (validTypes.includes(data.type)) {
        todayEarnings += Number(data.amount || 0);
      }
    });

    // 3. Buscar Novos Convites de Hoje
    const invitesQuery = await db.collection('users')
      .where('referredBy', '==', userId)
      .where('createdAt', '>=', startTimestamp)
      .get();

    const newInvites = invitesQuery.size;

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        todayEarnings: todayEarnings,
        newInvites: newInvites
      })
    };

  } catch (error) {
    console.error("Erro stats-today:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Erro ao buscar estatísticas' })
    };
  }
};
