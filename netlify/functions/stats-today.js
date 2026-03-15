const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
}

const db = admin.firestore();

exports.handler = async (event) => {
  try {
    const { userId } = event.queryStringParameters || {};

    if (!userId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'userId é obrigatório' }) };
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startTimestamp = admin.firestore.Timestamp.fromDate(startOfDay);

    // 1. Ganhos de Hoje (Soma depósitos, comissões e indicações)
    const statsQuery = await db.collection('users').doc(userId)
      .collection('transactions')
      .where('createdAt', '>=', startTimestamp)
      .where('status', '==', 'completed')
      .get();

    let todayEarnings = 0;
    statsQuery.forEach(doc => {
      const data = doc.data();
      // Incluímos 'indication' para pegar os R$ 3,00 que aparecem no seu print
      const tiposValidos = ['deposit', 'commission', 'indication', 'referral'];
      if (tiposValidos.includes(data.type)) {
        todayEarnings += Number(data.amount || 0);
      }
    });

    // 2. Convidados de Hoje
    const invitesQuery = await db.collection('users')
      .where('referredBy', '==', userId)
      .where('createdAt', '>=', startTimestamp)
      .get();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        todayEarnings: todayEarnings,
        newInvites: invitesQuery.size
      })
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
