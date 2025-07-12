const functions = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true }); // Habilite o CORS

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

functions.http('requestPasswordReset', (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    try {
      const { email, answers } = req.body;

      // Encontra o usuário pelo email na coleção 'users'
      const usersQuery = query(collection(db, 'users'), where('email', '==', email));
      const userSnapshot = await getDocs(usersQuery);

      if (userSnapshot.empty) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      const userDoc = userSnapshot.docs[0];
      const userData = userDoc.data();

      // **IMPORTANTE**: Aqui assumimos que você salvou as respostas de segurança no documento do usuário.
      // A verificação deve ser segura (ex: comparando hashes), mas para este exemplo, faremos uma comparação simples.
      const storedAnswers = userData.securityAnswers || [];
      const answersMatch = answers.every((ans, index) => ans === storedAnswers[index]);

      if (!answersMatch) {
        return res.status(400).json({ error: 'Respostas de segurança incorretas.' });
      }

      // Se as respostas estiverem corretas, crie uma solicitação de reset
      const resetRequestRef = collection(db, 'password_resets');
      await addDoc(resetRequestRef, {
        userId: userDoc.id,
        userEmail: email,
        status: 'pending', // Status inicial
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({ message: 'Solicitação criada com sucesso.' });

    } catch (error) {
      console.error("Erro ao processar solicitação de reset:", error);
      return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
  });
});