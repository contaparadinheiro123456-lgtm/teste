const admin = require('firebase-admin');

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey.replace(/\\n/g, '\n')
    })
  });
}

const db = admin.firestore();

exports.handler = async () => {
  try {

    const todayEarnings = 0;
    const newInvites = 0;

    return {
      statusCode: 200,
      body: JSON.stringify({
        todayEarnings,
        newInvites
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Erro ao buscar estatísticas'
      })
    };
  }
};
